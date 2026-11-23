/**
 * Runs one version of a workflow: the trigger's output first, then each step in order, a Router's matching branches, a Loop's body once per item.
 * Every step's input is resolved against the run so far (`resolve.ts`), converted and validated against the action's properties (`props-processor.ts`,
 * ported), and the action of the Qadam integration runs with the context the Qadam framework defines (`ActionContext`). Each step's record (input,
 * output, error, timing) is reported as it changes, so the editor and the agent follow a run live, and kept with the run.
 *
 * The execution semantics follow Qadam Flow's engine (handler/flow-executor.ts, router-executor.ts, loop-executor.ts @ 51bb340b, MIT, from
 * Activepieces): skip, continue on failure with its success/failure branches, retry on failure, first-match / all-match routers with a fallback, a loop
 * item and index under the loop's name. The engine itself is rebuilt here because Qadam's is bound to its server (API tokens, a worker socket, remote
 * files and stores); the parts free of that are ported (conditions.ts, props-processor.ts, processors/, resolve.ts). See NOTICE and docs/upstream-audit.md.
 *
 * A step that asks to wait (Delay for more than 10 s, Delay until) gets a durable waitpoint: the run is saved as `waiting` with the time to resume, and
 * {@link execute} is called again then (also after a restart) with the records so far; steps that already succeeded are not run again.
 */
import { AUTHENTICATION_PROPERTY_NAME, ExecutionType, type FlowAction, FlowActionType, type FlowTrigger, FlowTriggerType, RouterExecutionType, isNil, type BranchCondition } from '@aiqadam/shared'
import type { InputPropertyMap } from '@aiqadam/qadams-framework'
import type { Catalog } from '../catalog.ts'
import { evaluateConditions } from './conditions.ts'
import { propsProcessor } from './props-processor.ts'
import { resolveInput, type RunState } from './resolve.ts'

export type StepStatus = 'running' | 'succeeded' | 'failed' | 'skipped' | 'waiting'

export interface StepRecord {
  /** The step's name, with the loop iteration when it ran in one: `step_3`, `loop_1[2].step_3`. */
  readonly path: string
  readonly name: string
  readonly displayName: string
  readonly type: string
  status: StepStatus
  input?: unknown
  output?: unknown
  error?: string
  readonly startedAt: string
  durationMs?: number
  attempts?: number
}

export interface Waiting {
  readonly path: string
  readonly resumeAt: string
}

export interface ExecutionResult {
  readonly status: 'succeeded' | 'failed' | 'waiting' | 'cancelled'
  readonly steps: Readonly<Record<string, StepRecord>>
  readonly error?: { readonly step: string, readonly message: string }
  readonly waiting?: Waiting
  /** What a Webhook trigger's run answers its caller with (Return Response). */
  readonly response?: unknown
}

export interface ExecutionPorts {
  readonly catalog: Catalog
  /** A connection's value by its name, for `auth` and `{{connections['name']}}`; censored is what a record keeps. */
  readonly connection: (name: string, censored: boolean) => unknown
  /** The integration's key-value store (the Store a Qadam action gets), kept per workflow. */
  readonly store: { get(key: string): Promise<unknown>, put(key: string, value: unknown): Promise<unknown>, delete(key: string): Promise<void> }
  readonly onStep: (record: StepRecord) => void
  readonly signal: AbortSignal
  readonly ids: { readonly workflowId: string, readonly versionId: string, readonly runId: string }
  /** The app's own address, for an integration that builds URLs (Qadam's `server.publicUrl`). */
  readonly publicUrl: string
  /** How long one step may run. */
  readonly stepTimeoutMs: number
  readonly test: boolean
}

class Stop extends Error {
  readonly result: 'failed' | 'waiting' | 'cancelled'
  readonly step: string
  readonly waiting: Waiting | undefined
  constructor(result: 'failed' | 'waiting' | 'cancelled', step: string, message: string, waiting?: Waiting) {
    super(message)
    this.result = result
    this.step = step
    this.waiting = waiting
  }
}

const MAX_RETRIES = 3
const MAX_FILE_BYTES = 5_000_000

export async function execute(trigger: FlowTrigger, triggerOutput: unknown, ports: ExecutionPorts, previous: Readonly<Record<string, StepRecord>> = {}): Promise<ExecutionResult> {
  const steps: Record<string, StepRecord> = { ...previous }
  const state: Record<string, unknown> = { [trigger.name]: triggerOutput }
  const stepNames = collectNames(trigger)
  let response: unknown
  const record = (r: StepRecord): void => { steps[r.path] = r; ports.onStep(r) }
  if (previous[trigger.name] === undefined) record({ path: trigger.name, name: trigger.name, displayName: trigger.displayName, type: trigger.type, status: 'succeeded', output: triggerOutput, startedAt: new Date().toISOString(), durationMs: 0 })

  const runChain = async (first: FlowAction | null | undefined, scope: Record<string, unknown>, prefix: string): Promise<void> => {
    for (let action = first; !isNil(action); action = action.nextAction) {
      if (ports.signal.aborted) throw new Stop('cancelled', action.name, 'The run was cancelled.')
      const path = `${prefix}${action.name}`
      if (action.skip === true) {
        record({ path, name: action.name, displayName: action.displayName, type: action.type, status: 'skipped', startedAt: new Date().toISOString() })
        continue
      }
      const done = previous[path]
      if (done?.status === 'succeeded') { scope[action.name] = done.output; continue }
      await runStep(action, scope, path, prefix, done)
    }
  }

  const runStep = async (action: FlowAction, scope: Record<string, unknown>, path: string, prefix: string, earlier: StepRecord | undefined): Promise<void> => {
    const started = Date.now()
    const base = { path, name: action.name, displayName: action.displayName, type: action.type, startedAt: new Date(started).toISOString() }
    const resolveOptions = { state: scope, stepNames, connection: ports.connection }
    switch (action.type) {
      case FlowActionType.PIECE: {
        const settings = action.settings
        const definition = settings.actionName === undefined ? undefined : ports.catalog.action(settings.qadamName, settings.actionName)
        if (definition === undefined) throw fail(base, started, `${settings.qadamName} has no action ${settings.actionName ?? '(none chosen)'}: choose an action for this step`)
        const { resolvedInput, censoredInput } = await resolveInput<Record<string, unknown>>(settings.input, resolveOptions)
        const integration = ports.catalog.integration(settings.qadamName)
        const { processedInput, errors } = await propsProcessor.applyProcessorsAndValidators({
          resolvedInput, props: definition.props as InputPropertyMap, auth: integration?.auth as never, requireAuth: definition.requireAuth, propertySettings: settings.propertySettings,
        })
        if (Object.keys(errors).length > 0) throw fail(base, started, `Its settings are not valid: ${JSON.stringify(errors)}`, censoredInput)
        const retries = settings.errorHandlingOptions?.retryOnFailure?.value === true ? MAX_RETRIES : 0
        const record0: StepRecord = { ...base, status: 'running', input: censoredInput }
        record(record0)
        let attempt = 0
        for (;;) {
          attempt += 1
          let waitpoint: { id: string, resumeAt: string } | undefined
          let stopped: unknown
          try {
            const output = await withTimeout(definition.run(actionContext({
              propsValue: processedInput, auth: processedInput[AUTHENTICATION_PROPERTY_NAME], stepName: action.name, resuming: earlier?.status === 'waiting',
              onWaitpoint: (w) => { waitpoint = w }, onStop: (value) => { stopped = value }, onRespond: (value) => { response = value },
            }) as never), ports.stepTimeoutMs, ports.signal)
            if (waitpoint !== undefined) {
              record({ ...record0, status: 'waiting', attempts: attempt, durationMs: Date.now() - started })
              throw new Stop('waiting', path, `Waiting until ${waitpoint.resumeAt}`, { path, resumeAt: waitpoint.resumeAt })
            }
            scope[action.name] = output
            record({ ...record0, status: 'succeeded', output, attempts: attempt, durationMs: Date.now() - started })
            if (stopped !== undefined) { response = stopped; throw new Stop('cancelled', path, 'The step stopped the run (Stop flow).') }
            break
          } catch (cause) {
            if (cause instanceof Stop) throw cause
            const message = cause instanceof Error ? cause.message : String(cause)
            if (attempt <= retries && !ports.signal.aborted) { await sleep(2000 * 2 ** (attempt - 1), ports.signal); continue }
            record({ ...record0, status: 'failed', error: message, attempts: attempt, durationMs: Date.now() - started })
            if (settings.errorHandlingOptions?.continueOnFailure?.value === true) {
              scope[action.name] = { error: message }
              const branch = action.continueOnFailureBranches?.onFailure
              if (!isNil(branch)) await runChain(branch, scope, prefix)
              return
            }
            throw new Stop('failed', path, message)
          }
        }
        const branch = action.continueOnFailureBranches?.onSuccess
        if (settings.errorHandlingOptions?.continueOnFailure?.value === true && !isNil(branch)) await runChain(branch, scope, prefix)
        return
      }
      case FlowActionType.ROUTER: {
        const { resolvedInput } = await resolveInput<{ branches: Array<{ branchType: string, branchName: string, conditions?: BranchCondition[][] }> }>(action.settings, resolveOptions)
        const evaluations = resolvedInput.branches.map((branch, index) => ({ index, name: branch.branchName, fallback: branch.branchType === 'FALLBACK', matched: branch.branchType === 'CONDITION' && evaluateConditions(branch.conditions ?? []) }))
        let chosen = evaluations.filter((b) => b.matched)
        if (action.settings.executionType === RouterExecutionType.EXECUTE_FIRST_MATCH) chosen = chosen.slice(0, 1)
        if (chosen.length === 0) chosen = evaluations.filter((b) => b.fallback)
        const output = { branches: evaluations.map(({ index, name, matched, fallback }) => ({ branchIndex: index, branchName: name, evaluation: matched || (fallback && chosen.some((c) => c.index === index)) })) }
        scope[action.name] = output
        record({ ...base, status: 'succeeded', output, durationMs: Date.now() - started })
        const children = (action as FlowAction & { children?: Array<FlowAction | null> }).children ?? []
        for (const branch of chosen) await runChain(children[branch.index], scope, prefix)
        return
      }
      case FlowActionType.LOOP_ON_ITEMS: {
        const { resolvedInput, censoredInput } = await resolveInput<{ items: unknown }>({ items: action.settings.items }, resolveOptions)
        const items = Array.isArray(resolvedInput.items) ? resolvedInput.items : isNil(resolvedInput.items) || resolvedInput.items === '' ? [] : [resolvedInput.items]
        record({ ...base, status: 'running', input: censoredInput })
        const first = (action as FlowAction & { firstLoopAction?: FlowAction }).firstLoopAction
        for (const [index, item] of items.entries()) {
          scope[action.name] = { item, index: index + 1 }
          await runChain(first, scope, `${prefix}${action.name}[${index}].`)
        }
        const output = { items: items.length, item: items.at(-1), index: items.length }
        scope[action.name] = output
        record({ ...base, status: 'succeeded', input: censoredInput, output, durationMs: Date.now() - started })
        return
      }
      case FlowActionType.CODE:
        throw fail(base, started, 'Code steps do not run in this app: it has no isolated sandbox for code (the spec, 11.3). Use a Data Mapper, JSON or HTTP step.')
    }
  }

  const fail = (base: Omit<StepRecord, 'status'>, started: number, message: string, input?: unknown): Stop => {
    record({ ...base, status: 'failed', error: message, ...(input === undefined ? {} : { input }), durationMs: Date.now() - started })
    return new Stop('failed', base.path, message)
  }

  // createWaitpoint and waitForWaitpoint are two calls: the time is remembered between them.
  const waitpointTimes = new Map<string, string>()

  /** The context a Qadam action's run() gets (the framework's ActionContext), with what this app can give; the rest says so when used. */
  const actionContext = (step: { propsValue: Record<string, unknown>, auth: unknown, stepName: string, resuming: boolean, onWaitpoint: (w: { id: string, resumeAt: string }) => void, onStop: (value: unknown) => void, onRespond: (value: unknown) => void }) => ({
    executionType: step.resuming ? ExecutionType.RESUME : ExecutionType.BEGIN,
    ...(step.resuming ? { resumePayload: { body: {}, headers: {}, queryParams: {} } } : {}),
    auth: step.auth,
    propsValue: step.propsValue,
    store: ports.store,
    project: { id: 'local', externalId: async () => undefined },
    connections: { get: async (name: string) => ports.connection(name, false) },
    flows: { current: { id: ports.ids.workflowId, version: { id: ports.ids.versionId } }, list: async () => ({ data: [], next: null, previous: null }) },
    step: { name: step.stepName },
    server: { apiUrl: ports.publicUrl, publicUrl: ports.publicUrl, token: '' },
    files: {
      write: async ({ fileName, data }: { fileName: string, data: Buffer }) => {
        if (data.byteLength > MAX_FILE_BYTES) throw new Error(`${fileName} is larger than ${MAX_FILE_BYTES / 1e6} MB, the most a step may produce here`)
        return `data:application/octet-stream;name=${encodeURIComponent(fileName)};base64,${data.toString('base64')}`
      },
    },
    tags: { add: async () => undefined },
    output: { update: async () => undefined },
    agent: { tools: async () => { throw new Error('AI agent tools of an integration are not available here: the ACRYL agent operates this app') } },
    run: {
      id: ports.ids.runId,
      isTest: ports.test,
      stop: (params?: { response?: unknown }) => { step.onStop(params?.response ?? {}) },
      respond: (params?: { response?: unknown }) => { step.onRespond(params?.response) },
      createWaitpoint: async (params: { type: string, resumeDateTime?: string }) => {
        if (params.type !== 'DELAY' || params.resumeDateTime === undefined) throw new Error('Only a timed wait (Delay) can pause a run here; waiting for a webhook is not supported yet')
        const id = `wp_${ports.ids.runId}_${step.stepName}`
        waitpointTimes.set(id, params.resumeDateTime)
        return { id, resumeUrl: '', buildResumeUrl: () => '' }
      },
      waitForWaitpoint: (id: string) => { step.onWaitpoint({ id, resumeAt: waitpointTimes.get(id) ?? new Date().toISOString() }) },
      callFlowInline: async () => { throw new Error('Calling another flow is not supported yet') },
      locale: async () => null,
    },
  })
  try {
    await runChain(trigger.nextAction, state, '')
    return { status: 'succeeded', steps, ...(response === undefined ? {} : { response }) }
  } catch (cause) {
    if (cause instanceof Stop) {
      if (cause.result === 'cancelled' && response !== undefined) return { status: 'succeeded', steps, response }
      return { status: cause.result, steps, error: { step: cause.step, message: cause.message }, ...(cause.waiting === undefined ? {} : { waiting: cause.waiting }), ...(response === undefined ? {} : { response }) }
    }
    throw cause
  }
}

/** Every step's name in the workflow: what a `{{step}}` may name. */
export function collectNames(trigger: FlowTrigger): string[] {
  const names: string[] = [trigger.name]
  const walk = (action: FlowAction | null | undefined): void => {
    for (let a = action; !isNil(a); a = a.nextAction) {
      names.push(a.name)
      const extra = a as FlowAction & { firstLoopAction?: FlowAction, children?: Array<FlowAction | null>, continueOnFailureBranches?: { onSuccess?: FlowAction, onFailure?: FlowAction } }
      walk(extra.firstLoopAction)
      for (const child of extra.children ?? []) walk(child)
      walk(extra.continueOnFailureBranches?.onSuccess)
      walk(extra.continueOnFailureBranches?.onFailure)
    }
  }
  walk(trigger.nextAction)
  return names
}

export const isEmptyTrigger = (trigger: FlowTrigger): boolean => trigger.type === FlowTriggerType.EMPTY

async function withTimeout<T>(work: Promise<T> | T, ms: number, signal: AbortSignal): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const onAbort = { remove: (): void => {} }
  try {
    return await Promise.race([
      Promise.resolve(work),
      new Promise<never>((_, reject) => { timer = setTimeout(() => { reject(new Error(`The step ran longer than ${Math.round(ms / 1000)} s and was stopped`)) }, ms) }),
      new Promise<never>((_, reject) => {
        const listener = (): void => { reject(new Error('The run was cancelled')) }
        signal.addEventListener('abort', listener, { once: true })
        onAbort.remove = () => { signal.removeEventListener('abort', listener) }
      }),
    ])
  } finally {
    clearTimeout(timer)
    onAbort.remove()
  }
}

const sleep = (ms: number, signal: AbortSignal): Promise<void> => new Promise((done) => {
  const timer = setTimeout(done, ms)
  signal.addEventListener('abort', () => { clearTimeout(timer); done() }, { once: true })
})

/** What a trigger hands the run (its `run()`), for a manual start or a test: what the trigger gives with no outside event. */
export type { RunState }
