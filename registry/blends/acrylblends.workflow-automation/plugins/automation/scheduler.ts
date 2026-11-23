/**
 * What starts runs by time: each active workflow whose published trigger is a schedule (Qadam's schedule integration: every N minutes, every day,
 * a cron expression...) gets a timer from the trigger's own `onEnable` (it calls `setSchedule({ cronExpression, timezone })`), and each run waiting on a
 * Delay resumes at its time. Rebuilt from the workflows on start and on every change, so nothing depends on a timer surviving a restart (the spec, 9.3).
 * Times come from `croner` (MIT), which follows the timezone, daylight saving included.
 */
import { Cron } from 'croner'
import { FlowTriggerType } from '@aiqadam/shared'
import type { Automation, Workflow } from './automation.ts'

export interface Scheduled {
  readonly workflowId: string
  readonly cronExpression: string
  readonly timezone: string
  readonly next?: string
}

export class Scheduler {
  readonly #automation: Automation
  readonly #log: (message: string) => void
  readonly #jobs = new Map<string, { cron: Cron, cronExpression: string, timezone: string }>()
  readonly #resumes = new Map<string, NodeJS.Timeout>()
  #stopped = false

  constructor(automation: Automation, log: (message: string) => void) {
    this.#automation = automation
    this.#log = log
  }

  /** Make the timers match the workflows and the waiting runs. */
  async sync(): Promise<void> {
    if (this.#stopped) return
    const wanted = new Map<string, { cronExpression: string, timezone: string }>()
    for (const workflow of this.#automation.list()) {
      if (workflow.status !== 'active') continue
      const schedule = await scheduleOf(this.#automation, workflow).catch((cause: unknown) => { this.#log(`${workflow.name}: its schedule could not be read: ${String(cause)}`); return undefined })
      if (schedule !== undefined) wanted.set(workflow.id, schedule)
    }
    for (const [id, job] of this.#jobs) {
      const want = wanted.get(id)
      if (want === undefined || want.cronExpression !== job.cronExpression || want.timezone !== job.timezone) { job.cron.stop(); this.#jobs.delete(id) }
    }
    for (const [id, want] of wanted) {
      if (this.#jobs.has(id)) continue
      const cron = new Cron(want.cronExpression, { timezone: want.timezone, protect: true }, () => {
        void this.#automation.start(id, { trigger: 'schedule' }).catch((cause: unknown) => { this.#log(`scheduled run of ${id} did not start: ${String(cause)}`) })
      })
      this.#jobs.set(id, { cron, ...want })
    }
    const waiting = new Set<string>()
    for (const run of this.#automation.waitingRuns()) {
      waiting.add(run.id)
      if (this.#resumes.has(run.id) || run.waiting === undefined) continue
      const delay = Math.max(0, Date.parse(run.waiting.resumeAt) - Date.now())
      // setTimeout takes at most ~24.8 days; a longer wait is re-armed by the next sync.
      const timer = setTimeout(() => {
        this.#resumes.delete(run.id)
        void this.#automation.resume(run.id).catch((cause: unknown) => { this.#log(`run ${run.id} could not resume: ${String(cause)}`) })
      }, Math.min(delay, 2_000_000_000))
      this.#resumes.set(run.id, timer)
    }
    for (const [id, timer] of this.#resumes) if (!waiting.has(id)) { clearTimeout(timer); this.#resumes.delete(id) }
  }

  scheduled(): Scheduled[] {
    return [...this.#jobs].map(([workflowId, job]) => ({ workflowId, cronExpression: job.cronExpression, timezone: job.timezone, ...(job.cron.nextRun() === null ? {} : { next: job.cron.nextRun()!.toISOString() }) }))
  }

  stop(): void {
    this.#stopped = true
    for (const job of this.#jobs.values()) job.cron.stop()
    this.#jobs.clear()
    for (const timer of this.#resumes.values()) clearTimeout(timer)
    this.#resumes.clear()
  }
}

/** The schedule a workflow's published trigger asks for, from the trigger's own onEnable, or undefined when it is not a timed trigger. */
export async function scheduleOf(automation: Automation, workflow: Workflow): Promise<{ cronExpression: string, timezone: string } | undefined> {
  const trigger = workflow.published?.trigger
  if (trigger === undefined || trigger.type !== FlowTriggerType.PIECE) return undefined
  const definition = automation.catalog.trigger(trigger.settings.qadamName, trigger.settings.triggerName ?? '')
  if (definition === undefined || String(definition.type) !== 'POLLING') return undefined
  let schedule: { cronExpression: string, timezone: string } | undefined
  await (definition as unknown as { onEnable(ctx: unknown): Promise<void> }).onEnable({
    propsValue: trigger.settings.input,
    setSchedule: (s: { cronExpression: string, timezone?: string }) => { schedule = { cronExpression: s.cronExpression, timezone: s.timezone ?? 'UTC' } },
    store: { get: async () => null, put: async () => undefined, delete: async () => undefined },
    app: { createListeners: () => undefined },
    webhookUrl: '',
  })
  return schedule
}
