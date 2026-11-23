/**
 * Workflow automation's domain as a plugin: it opens the workflows, connections and runs over the app's data home (`<home>/automation.json`,
 * `<home>/automation-runs.json`, secrets in `<home>/automation-secrets.bin` with its key, both 0600) and provides them as `ctx.automation`. The editor,
 * the API and the agent tools inject `automation`, so switching this row off takes them all with it.
 *
 * Owned while active (released in order when the plugin unloads): the scheduler's timers (schedules of active workflows, waiting runs), its
 * subscription to workflow changes, and every run in progress (aborted).
 *
 * Config (all optional, for tests and another home): `dir` (where the files go, relative to the app's home), `stepTimeoutMs`.
 */
import { isAbsolute, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { Automation } from './automation.ts'
import { Catalog } from './catalog.ts'
import { Scheduler } from './scheduler.ts'
import { encryptedSecretStore, jsonFileStore, type Store } from './store.ts'
import type { RunsState, WorkflowsState } from './automation.ts'

export * from './automation.ts'
export * from './catalog.ts'
export { Scheduler, scheduleOf } from './scheduler.ts'
export type { StepRecord } from './engine/executor.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    automation: Automation
    automationScheduler: Scheduler
  }
}

export interface AutomationConfig {
  readonly dir?: string
  readonly stepTimeoutMs?: number
  readonly workflows?: Store<WorkflowsState>
  readonly runs?: Store<RunsState>
}

export const name = 'automation'
export const inject = ['appInstance']

export async function apply(ctx: Context, config: AutomationConfig = {}): Promise<void> {
  const dir = config.dir === undefined ? ctx.appInstance.home : isAbsolute(config.dir) ? config.dir : join(ctx.appInstance.home, config.dir)
  const automation = await Automation.open({
    catalog: new Catalog(),
    workflows: config.workflows ?? jsonFileStore<WorkflowsState>(join(dir, 'automation.json'), 'Workflow Automation', 1),
    runs: config.runs ?? jsonFileStore<RunsState>(join(dir, 'automation-runs.json'), 'Workflow Automation runs', 1),
    secrets: encryptedSecretStore(join(dir, 'automation-secrets.bin'), join(dir, 'automation-secrets.key')),
    clock: () => new Date(),
    publicUrl: () => '',
    ...(config.stepTimeoutMs === undefined ? {} : { stepTimeoutMs: config.stepTimeoutMs }),
  })
  const scheduler = new Scheduler(automation, (message) => { ctx.logger.warn(message) })
  ctx.effect(() => {
    const unsubscribe = automation.on((event) => {
      if (event.type === 'workflow' || (event.type === 'run' && event.run.status === 'waiting')) void scheduler.sync()
    })
    void scheduler.sync()
    return () => {
      unsubscribe()
      scheduler.stop()
      automation.stopAll()
    }
  }, 'automation: schedules, waiting runs and runs in progress')
  ctx.provide('automation', automation)
  ctx.provide('automationScheduler', scheduler)
}
