/**
 * The workflow domain, one service for the editor, the HTTP API and the agent tools alike (the spec, 2.3 and 12.4): workflows with a draft and a
 * published version, every change to a draft as one of Qadam Flow's flow operations (`flowOperations.apply` from @aiqadam/shared, validated by its own
 * `FlowOperationRequest` schema) under a revision number, so two writers never overwrite each other silently; validation; publish, activate and
 * deactivate; connections whose secrets stay in the secret store; runs, durable and followed live.
 */
import { randomBytes, randomUUID } from 'node:crypto'
import {
  type FlowAction, FlowActionType, type FlowOperationRequest, FlowOperationRequest as FlowOperationSchema, FlowOperationType, flowOperations, flowStructureUtil, type FlowTrigger,
  FlowTriggerType, type FlowVersion, FlowVersionState, isNil, RouterExecutionType, StepLocationRelativeToParent,
} from '@aiqadam/shared'
import type { Catalog, OperationView } from './catalog.ts'
import { collectNames, execute, type ExecutionResult, type StepRecord } from './engine/executor.ts'
import type { SecretStore, Store } from './store.ts'

export type WorkflowStatus = 'inactive' | 'active'

export interface Workflow {
  readonly id: string
  name: string
  description: string
  status: WorkflowStatus
  /** Moves on every change to the draft; a change that names an older one is refused (no silent overwrite). */
  revision: number
  draft: FlowVersion
  published?: FlowVersion
  publishedAt?: string
  /** 1, 2, ... for each publish. */
  versionNumber: number
  /** The unguessable part of the workflow's webhook address; rotated on request. */
  webhookToken: string
  readonly createdAt: string
  updatedAt: string
}

export interface Connection {
  readonly id: string
  name: string
  readonly integration: string
  /** What may be shown: the value with all but its last 4 characters hidden. */
  masked: string
  readonly createdAt: string
}

export type RunStatus = 'running' | 'waiting' | 'succeeded' | 'failed' | 'cancelled'
export type RunTrigger = 'manual' | 'test' | 'schedule' | 'webhook'

export interface Run {
  readonly id: string
  readonly workflowId: string
  readonly workflowName: string
  readonly version: 'draft' | 'published'
  readonly versionNumber?: number
  readonly trigger: RunTrigger
  status: RunStatus
  steps: Record<string, StepRecord>
  triggerOutput: unknown
  readonly startedAt: string
  finishedAt?: string
  error?: { step: string, message: string }
  waiting?: { path: string, resumeAt: string }
  response?: unknown
}

export interface Problem {
  readonly step: string
  readonly field?: string
  readonly message: string
}

export interface ValidationReport {
  readonly valid: boolean
  readonly problems: readonly Problem[]
}

export type AutomationEvent =
  | { readonly type: 'workflow', readonly id: string, readonly revision: number, readonly change: string }
  | { readonly type: 'run', readonly run: RunSummary, readonly step?: StepRecord }
  | { readonly type: 'approval', readonly approval: Approval }

/** What an agent may only do once the person said yes in the app (the spec, 11.2 and 12.5): checked here, not only asked of the model. */
export type ApprovalAction = 'publish' | 'activate' | 'test'

export interface Approval {
  readonly id: string
  readonly workflowId: string
  readonly workflowName: string
  readonly action: ApprovalAction
  /** What the person approves, in words: the trigger, the steps, what they reach outside this app. */
  readonly summary: string
  status: 'pending' | 'approved' | 'declined' | 'used'
  readonly requestedAt: string
  decidedAt?: string
}

export interface RunSummary {
  readonly id: string
  readonly workflowId: string
  readonly workflowName: string
  readonly trigger: RunTrigger
  readonly status: RunStatus
  readonly version: 'draft' | 'published'
  readonly startedAt: string
  readonly finishedAt?: string
  readonly error?: { step: string, message: string }
}

export interface WorkflowsState {
  readonly version: 1
  workflows: Workflow[]
  connections: Connection[]
  /** Each workflow's key-value store (the Store a Qadam action gets), by workflow id. */
  kv: Record<string, Record<string, unknown>>
}

export interface RunsState {
  readonly version: 1
  runs: Run[]
}

/** A request the domain refuses, in a sentence a person or an agent can act on. Routes answer it as 409 or 400. */
export class Refusal extends Error {
  readonly code: 'not_found' | 'conflict' | 'invalid' | 'refused'
  constructor(code: 'not_found' | 'conflict' | 'invalid' | 'refused', message: string) {
    super(message)
    this.code = code
  }
}

export interface AutomationPorts {
  readonly catalog: Catalog
  readonly workflows: Store<WorkflowsState>
  readonly runs: Store<RunsState>
  readonly secrets: SecretStore
  readonly clock: () => Date
  /** The app's own address (for an integration that builds URLs, and the webhook address shown). */
  readonly publicUrl: () => string
  readonly stepTimeoutMs?: number
  /** How many runs are kept (oldest go first). */
  readonly keepRuns?: number
}

const TRIGGER_NAME = 'trigger'
const KEEP_RUNS = 300

/** What a step is, in the words the editor and the agent use. */
export type StepSpec =
  | { readonly kind: 'action', readonly integration: string, readonly action: string, readonly input?: Record<string, unknown>, readonly displayName?: string, readonly connection?: string }
  | { readonly kind: 'router', readonly displayName?: string, readonly branches?: ReadonlyArray<{ readonly name: string, readonly conditions?: unknown[][] }>, readonly firstMatchOnly?: boolean }
  | { readonly kind: 'loop', readonly items: string, readonly displayName?: string }

/** Where a new step goes: after a step (default: the last), first inside a loop, or first in a router's branch. */
export interface Placement {
  readonly after?: string
  readonly inside?: 'loop' | 'branch' | 'on_success' | 'on_failure'
  readonly branchIndex?: number
}

export class Automation {
  readonly catalog: Catalog
  readonly #ports: AutomationPorts
  #state: WorkflowsState
  #runs: RunsState
  readonly #listeners = new Set<(event: AutomationEvent) => void>()
  readonly #running = new Map<string, AbortController>()
  readonly #approvals = new Map<string, Approval>()
  #saving: Promise<void> = Promise.resolve()

  private constructor(ports: AutomationPorts, state: WorkflowsState, runs: RunsState) {
    this.#ports = ports
    this.catalog = ports.catalog
    this.#state = state
    this.#runs = runs
  }

  /** Open the stores; a run left `running` by a stop of the app is marked failed (it cannot be continued mid-step), a waiting one keeps waiting. */
  static async open(ports: AutomationPorts): Promise<Automation> {
    const state = (await ports.workflows.load()) ?? { version: 1, workflows: [], connections: [], kv: {} }
    const runs = (await ports.runs.load()) ?? { version: 1, runs: [] }
    const automation = new Automation(ports, state, runs)
    let changed = false
    for (const run of runs.runs) {
      if (run.status !== 'running') continue
      run.status = 'failed'
      run.finishedAt = ports.clock().toISOString()
      run.error = { step: Object.values(run.steps).find((s) => s.status === 'running')?.path ?? TRIGGER_NAME, message: 'The app stopped while this run was going; it was not finished.' }
      changed = true
    }
    if (changed) await ports.runs.save(runs)
    return automation
  }

  on(listener: (event: AutomationEvent) => void): () => void {
    this.#listeners.add(listener)
    return () => { this.#listeners.delete(listener) }
  }

  #emit(event: AutomationEvent): void {
    for (const listener of this.#listeners) { try { listener(event) } catch { /* a listener's failure is its own */ } }
  }

  // ---- workflows ----------------------------------------------------------------------------------------------------------------------------------

  list(): Workflow[] {
    return [...this.#state.workflows].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  get(id: string): Workflow {
    const workflow = this.#state.workflows.find((w) => w.id === id)
    if (workflow === undefined) throw new Refusal('not_found', `There is no workflow ${id}`)
    return workflow
  }

  async create(input: { readonly name: string, readonly description?: string }): Promise<Workflow> {
    const name = cleanName(input.name)
    const now = this.#ports.clock().toISOString()
    const id = `wf_${randomUUID().slice(0, 8)}`
    const workflow: Workflow = {
      id, name, description: (input.description ?? '').slice(0, 2000), status: 'inactive', revision: 1, versionNumber: 0,
      draft: emptyVersion(id, name, now), webhookToken: randomBytes(18).toString('base64url'), createdAt: now, updatedAt: now,
    }
    this.#state.workflows.push(workflow)
    await this.#save()
    this.#emit({ type: 'workflow', id, revision: workflow.revision, change: 'created' })
    return workflow
  }

  async rename(id: string, name: string, description?: string): Promise<Workflow> {
    const workflow = this.get(id)
    workflow.name = cleanName(name)
    workflow.draft = flowOperations.apply(workflow.draft, { type: FlowOperationType.CHANGE_NAME, request: { displayName: workflow.name } })
    if (description !== undefined) workflow.description = description.slice(0, 2000)
    return this.#changed(workflow, 'renamed')
  }

  async duplicate(id: string): Promise<Workflow> {
    const source = this.get(id)
    const copy = await this.create({ name: `${source.name} (copy)`, description: source.description })
    copy.draft = { ...structuredClone(source.draft), id: copy.draft.id, flowId: copy.id, displayName: copy.name, state: FlowVersionState.DRAFT }
    return this.#changed(copy, 'duplicated')
  }

  async remove(id: string): Promise<void> {
    const workflow = this.get(id)
    if (workflow.status === 'active') throw new Refusal('refused', `${workflow.name} is active: deactivate it first`)
    this.#state.workflows = this.#state.workflows.filter((w) => w.id !== id)
    delete this.#state.kv[id]
    await this.#save()
    this.#emit({ type: 'workflow', id, revision: workflow.revision, change: 'deleted' })
  }

  /**
   * One of Qadam's flow operations on the draft, checked by Qadam's own schema. `revision` is the revision the caller saw: a change made since is not
   * overwritten, the call is refused and says the current revision.
   */
  async operate(id: string, operation: unknown, revision?: number): Promise<Workflow> {
    const workflow = this.get(id)
    if (revision !== undefined && revision !== workflow.revision) throw new Refusal('conflict', `${workflow.name} changed since revision ${revision} (now ${workflow.revision}): read it again and redo the change`)
    const parsed = FlowOperationSchema.safeParse(operation)
    if (!parsed.success) throw new Refusal('invalid', `Not a valid change: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`)
    const op = parsed.data as FlowOperationRequest
    const allowed = new Set<string>([
      FlowOperationType.ADD_ACTION, FlowOperationType.UPDATE_ACTION, FlowOperationType.DELETE_ACTION, FlowOperationType.MOVE_ACTION, FlowOperationType.DUPLICATE_ACTION,
      FlowOperationType.UPDATE_TRIGGER, FlowOperationType.ADD_BRANCH, FlowOperationType.DELETE_BRANCH, FlowOperationType.DUPLICATE_BRANCH, FlowOperationType.MOVE_BRANCH,
      FlowOperationType.SET_SKIP_ACTION, FlowOperationType.CHANGE_NAME, FlowOperationType.ADD_NOTE, FlowOperationType.UPDATE_NOTE, FlowOperationType.DELETE_NOTE,
    ])
    if (!allowed.has(op.type)) throw new Refusal('refused', `${op.type} is not a change of a draft here (publish and activate have their own calls)`)
    try {
      workflow.draft = flowOperations.apply(workflow.draft, op)
    } catch (cause) {
      throw new Refusal('invalid', cause instanceof Error ? cause.message : String(cause))
    }
    if (op.type === FlowOperationType.CHANGE_NAME) workflow.name = cleanName(workflow.draft.displayName)
    return this.#changed(workflow, op.type)
  }

  /** Set the trigger from the catalog (`@aiqadam/qadam-schedule` / `every_day`, a webhook, a manual start). */
  async setTrigger(id: string, spec: { readonly integration: string, readonly trigger: string, readonly input?: Record<string, unknown>, readonly displayName?: string }, revision?: number): Promise<Workflow> {
    const view = this.catalog.operation(spec.integration, 'trigger', spec.trigger)
    if (view === undefined) throw new Refusal('invalid', `${spec.integration} has no trigger ${spec.trigger}: search the catalog for one`)
    return this.operate(id, {
      type: FlowOperationType.UPDATE_TRIGGER,
      request: {
        name: TRIGGER_NAME, valid: true, displayName: spec.displayName ?? view.displayName, type: FlowTriggerType.PIECE,
        settings: { qadamName: spec.integration, qadamVersion: this.catalog.version(spec.integration)!, triggerName: spec.trigger, input: withDefaults(view, spec.input ?? {}), propertySettings: {} },
      },
    }, revision)
  }

  /** Add a step after `placement.after` (default: the last step), first inside a loop, or first in a router's branch. @returns the workflow and the new step's name. */
  async addStep(id: string, spec: StepSpec, placement: Placement = {}, revision?: number): Promise<{ workflow: Workflow, step: string }> {
    const workflow = this.get(id)
    const name = flowStructureUtil.findUnusedName(workflow.draft.trigger)
    const parentStep = placement.after ?? lastStepName(workflow.draft.trigger)
    if (flowStructureUtil.getStep(parentStep, workflow.draft.trigger) === undefined) throw new Refusal('invalid', `There is no step ${parentStep} in ${workflow.name}`)
    const location = placement.inside === 'loop' ? StepLocationRelativeToParent.INSIDE_LOOP : placement.inside === 'branch' ? StepLocationRelativeToParent.INSIDE_BRANCH
      : placement.inside === 'on_success' ? StepLocationRelativeToParent.INSIDE_ON_SUCCESS_BRANCH : placement.inside === 'on_failure' ? StepLocationRelativeToParent.INSIDE_ON_FAILURE_BRANCH : StepLocationRelativeToParent.AFTER
    const updated = await this.operate(id, {
      type: FlowOperationType.ADD_ACTION,
      request: { parentStep, stepLocationRelativeToParent: location, ...(placement.branchIndex === undefined ? {} : { branchIndex: placement.branchIndex }), action: this.#actionOf(name, spec) },
    }, revision)
    return { workflow: updated, step: name }
  }

  /** Change a step's input (merged into what it has), its name on the canvas, or whether it is skipped, retried or allowed to fail. */
  async updateStep(id: string, step: string, change: { readonly input?: Record<string, unknown>, readonly displayName?: string, readonly skip?: boolean, readonly retryOnFailure?: boolean, readonly continueOnFailure?: boolean, readonly action?: string, readonly items?: string }, revision?: number): Promise<Workflow> {
    const workflow = this.get(id)
    if (step === TRIGGER_NAME) {
      const trigger = workflow.draft.trigger
      if (trigger.type !== FlowTriggerType.PIECE) throw new Refusal('invalid', 'The workflow has no trigger yet: set one first')
      return this.operate(id, {
        type: FlowOperationType.UPDATE_TRIGGER,
        request: { name: trigger.name, valid: true, displayName: change.displayName ?? trigger.displayName, type: trigger.type, settings: { ...trigger.settings, input: { ...trigger.settings.input, ...change.input } } },
      }, revision)
    }
    const current = flowStructureUtil.getStep(step, workflow.draft.trigger) as FlowAction | undefined
    if (current === undefined) throw new Refusal('not_found', `There is no step ${step} in ${workflow.name}`)
    const { nextAction: _next, lastUpdatedDate: _date, ...rest } = current as FlowAction & { lastUpdatedDate?: string }
    void _next; void _date
    const next = structuredClone(rest) as Record<string, unknown> & { settings: Record<string, unknown>, displayName: string, skip?: boolean }
    if (change.displayName !== undefined) next.displayName = change.displayName
    if (change.skip !== undefined) next.skip = change.skip
    if (current.type === FlowActionType.PIECE) {
      if (change.action !== undefined) next.settings.actionName = change.action
      if (change.input !== undefined) next.settings.input = { ...(next.settings.input as Record<string, unknown>), ...change.input }
      if (change.retryOnFailure !== undefined || change.continueOnFailure !== undefined) {
        const options = (next.settings.errorHandlingOptions ?? {}) as { retryOnFailure?: { value?: boolean }, continueOnFailure?: { value?: boolean } }
        next.settings.errorHandlingOptions = {
          retryOnFailure: { value: change.retryOnFailure ?? options.retryOnFailure?.value ?? false },
          continueOnFailure: { value: change.continueOnFailure ?? options.continueOnFailure?.value ?? false },
        }
      }
    }
    if (current.type === FlowActionType.LOOP_ON_ITEMS && change.items !== undefined) next.settings.items = change.items
    if (current.type === FlowActionType.ROUTER && change.input !== undefined) Object.assign(next.settings, change.input)
    for (const key of ['children', 'firstLoopAction', 'continueOnFailureBranches']) delete next[key]
    return this.operate(id, { type: FlowOperationType.UPDATE_ACTION, request: { ...next, valid: true } }, revision)
  }

  async removeStep(id: string, step: string, revision?: number): Promise<Workflow> {
    if (step === TRIGGER_NAME) throw new Refusal('refused', 'The trigger cannot be removed; set another one instead')
    return this.operate(id, { type: FlowOperationType.DELETE_ACTION, request: { names: [step] } }, revision)
  }

  #actionOf(name: string, spec: StepSpec): Record<string, unknown> {
    const now = this.#ports.clock().toISOString()
    void now
    if (spec.kind === 'action') {
      const view = this.catalog.operation(spec.integration, 'action', spec.action)
      if (view === undefined) throw new Refusal('invalid', `${spec.integration} has no action ${spec.action}: search the catalog for one`)
      const input = withDefaults(view, spec.input ?? {})
      if (spec.connection !== undefined) input.auth = `{{connections['${spec.connection}']}}`
      return {
        name, type: FlowActionType.PIECE, valid: true, displayName: spec.displayName ?? view.displayName,
        settings: { qadamName: spec.integration, qadamVersion: this.catalog.version(spec.integration)!, actionName: spec.action, input, propertySettings: {}, errorHandlingOptions: { continueOnFailure: { value: false }, retryOnFailure: { value: false } } },
      }
    }
    if (spec.kind === 'loop') return { name, type: FlowActionType.LOOP_ON_ITEMS, valid: true, displayName: spec.displayName ?? 'Loop on items', settings: { items: spec.items } }
    const branches = spec.branches ?? [{ name: 'Branch 1' }]
    return {
      name, type: FlowActionType.ROUTER, valid: true, displayName: spec.displayName ?? 'Router',
      settings: {
        executionType: spec.firstMatchOnly === false ? RouterExecutionType.EXECUTE_ALL_MATCH : RouterExecutionType.EXECUTE_FIRST_MATCH,
        branches: [
          ...branches.map((b) => ({ branchType: 'CONDITION', branchName: b.name, conditions: b.conditions ?? [[{ operator: 'TEXT_EXACTLY_MATCHES', firstValue: '', secondValue: '', caseSensitive: false }]] })),
          { branchType: 'FALLBACK', branchName: 'Otherwise' },
        ],
      },
    }
  }

  /** What would stop the draft (or the published version) from running: each problem with its step and field. */
  validate(id: string, which: 'draft' | 'published' = 'draft'): ValidationReport {
    const workflow = this.get(id)
    const version = which === 'draft' ? workflow.draft : workflow.published
    if (version === undefined) return { valid: false, problems: [{ step: TRIGGER_NAME, message: 'It has not been published yet' }] }
    const problems: Problem[] = []
    const trigger = version.trigger
    if (trigger.type === FlowTriggerType.EMPTY) problems.push({ step: TRIGGER_NAME, message: 'Choose a trigger: what starts this workflow (a manual start, a schedule, a webhook)' })
    else {
      const view = this.catalog.operation(trigger.settings.qadamName, 'trigger', trigger.settings.triggerName ?? '')
      if (view === undefined) problems.push({ step: TRIGGER_NAME, message: `${trigger.settings.qadamName} has no trigger ${trigger.settings.triggerName ?? ''}` })
      else problems.push(...missingFields(TRIGGER_NAME, view, trigger.settings.input))
    }
    for (const step of flowStructureUtil.getAllSteps(trigger)) {
      if (flowStructureUtil.isTrigger(step.type)) continue
      const action = step as FlowAction
      if (action.type === FlowActionType.PIECE) {
        const view = this.catalog.operation(action.settings.qadamName, 'action', action.settings.actionName ?? '')
        if (view === undefined) { problems.push({ step: action.name, message: `${action.settings.qadamName} has no action ${action.settings.actionName ?? '(none)'}` }); continue }
        problems.push(...missingFields(action.name, view, action.settings.input))
        const auth = action.settings.input.auth
        if (view.requiresConnection && (typeof auth !== 'string' || auth === '')) problems.push({ step: action.name, field: 'auth', message: 'Choose a connection for this step' })
        const named = typeof auth === 'string' ? /connections\[['"]([^'"]+)['"]\]/u.exec(auth)?.[1] : undefined
        if (named !== undefined && !this.#state.connections.some((c) => c.name === named)) problems.push({ step: action.name, field: 'auth', message: `There is no connection named ${named}` })
      }
      if (action.type === FlowActionType.LOOP_ON_ITEMS && (action.settings.items ?? '') === '') problems.push({ step: action.name, field: 'items', message: 'Say which items to loop on, e.g. {{trigger.body.items}}' })
      if (action.type === FlowActionType.CODE) problems.push({ step: action.name, message: 'Code steps do not run in this app' })
    }
    const names = collectNames(trigger)
    for (const step of flowStructureUtil.getAllSteps(trigger)) {
      const input = JSON.stringify((step as { settings?: { input?: unknown } }).settings?.input ?? {})
      for (const match of input.matchAll(/\{\{\s*([A-Za-z_$][\w$]*)/gu)) {
        const root = match[1]!
        if (!names.includes(root) && !['connections', 'flattenNestedKeys'].includes(root)) problems.push({ step: step.name, message: `It reads {{${root}...}}, but there is no step ${root}` })
      }
    }
    return { valid: problems.length === 0, problems }
  }

  /** The draft becomes the published version (a copy, never changed again); an active workflow switches to it at once. */
  async publish(id: string): Promise<Workflow> {
    const workflow = this.get(id)
    const report = this.validate(id)
    if (!report.valid) throw new Refusal('invalid', `${workflow.name} cannot be published yet: ${report.problems.map((p) => `${p.step}${p.field === undefined ? '' : `.${p.field}`}: ${p.message}`).join('; ')}`)
    workflow.versionNumber += 1
    workflow.published = { ...structuredClone(workflow.draft), id: `${workflow.id}_v${workflow.versionNumber}`, state: FlowVersionState.LOCKED }
    workflow.publishedAt = this.#ports.clock().toISOString()
    return this.#changed(workflow, 'published', false)
  }

  async setStatus(id: string, status: WorkflowStatus): Promise<Workflow> {
    const workflow = this.get(id)
    if (status === 'active' && workflow.published === undefined) throw new Refusal('refused', `${workflow.name} has no published version: publish it first`)
    workflow.status = status
    return this.#changed(workflow, status === 'active' ? 'activated' : 'deactivated', false)
  }

  async rotateWebhook(id: string): Promise<Workflow> {
    const workflow = this.get(id)
    workflow.webhookToken = randomBytes(18).toString('base64url')
    return this.#changed(workflow, 'webhook-rotated', false)
  }

  byWebhookToken(token: string): Workflow | undefined {
    return this.#state.workflows.find((w) => w.webhookToken === token)
  }

  /** A workflow as a file to keep or share: no secrets (connections are named, never carried), with the format's version. */
  exportWorkflow(id: string): { format: 'acryl-workflow', formatVersion: 1, name: string, description: string, flow: FlowVersion['trigger'] } {
    const workflow = this.get(id)
    return { format: 'acryl-workflow', formatVersion: 1, name: workflow.name, description: workflow.description, flow: structuredClone(workflow.draft.trigger) }
  }

  async importWorkflow(file: unknown): Promise<{ workflow: Workflow, report: ValidationReport }> {
    const data = file as { format?: unknown, formatVersion?: unknown, name?: unknown, description?: unknown, flow?: unknown }
    if (data?.format !== 'acryl-workflow' || data.formatVersion !== 1 || typeof data.name !== 'string' || typeof data.flow !== 'object' || data.flow === null)
      throw new Refusal('invalid', 'Not an ACRYL workflow file (format acryl-workflow, formatVersion 1)')
    const workflow = await this.create({ name: data.name, description: typeof data.description === 'string' ? data.description : '' })
    workflow.draft = { ...workflow.draft, trigger: data.flow as FlowTrigger }
    await this.#changed(workflow, 'imported')
    return { workflow, report: this.validate(workflow.id) }
  }

  async #changed(workflow: Workflow, change: string, bumpRevision = true): Promise<Workflow> {
    if (bumpRevision) workflow.revision += 1
    workflow.updatedAt = this.#ports.clock().toISOString()
    workflow.draft.valid = this.validate(workflow.id).valid
    await this.#save()
    this.#emit({ type: 'workflow', id: workflow.id, revision: workflow.revision, change })
    return workflow
  }

  // ---- approvals ----------------------------------------------------------------------------------------------------------------------------------

  approvals(): Approval[] {
    return [...this.#approvals.values()].filter((a) => a.status === 'pending' || a.status === 'approved')
  }

  /** The agent asks; the app shows the request with Approve and Decline. Approvals live in memory: a restart asks again. */
  requestApproval(workflowId: string, action: ApprovalAction): Approval {
    const workflow = this.get(workflowId)
    for (const existing of this.#approvals.values()) if (existing.workflowId === workflowId && existing.action === action && existing.status === 'pending') return existing
    const approval: Approval = { id: `appr_${randomUUID().slice(0, 8)}`, workflowId, workflowName: workflow.name, action, summary: this.describeEffects(workflowId, action), status: 'pending', requestedAt: this.#ports.clock().toISOString() }
    this.#approvals.set(approval.id, approval)
    this.#emit({ type: 'approval', approval })
    return approval
  }

  /** The person's answer, from the app's screen. */
  decide(id: string, approved: boolean): Approval {
    const approval = this.#approvals.get(id)
    if (approval === undefined || approval.status !== 'pending') throw new Refusal('not_found', `There is no pending approval ${id}`)
    approval.status = approved ? 'approved' : 'declined'
    approval.decidedAt = this.#ports.clock().toISOString()
    this.#emit({ type: 'approval', approval })
    return approval
  }

  /** Use an approval once, for exactly what it was given for. */
  consumeApproval(id: string, workflowId: string, action: ApprovalAction): void {
    const approval = this.#approvals.get(id)
    if (approval === undefined || approval.workflowId !== workflowId || approval.action !== action) throw new Refusal('refused', `Approval ${id} is not for ${action} of this workflow`)
    if (approval.status === 'pending') throw new Refusal('refused', 'The person has not answered yet: ask them to press Approve in the app')
    if (approval.status !== 'approved') throw new Refusal('refused', `The person ${approval.status === 'declined' ? 'declined' : 'already used'} this approval`)
    approval.status = 'used'
    this.#emit({ type: 'approval', approval })
  }

  /** What running this workflow does outside the app, for an approval and for the agent's summary. */
  describeEffects(workflowId: string, action: ApprovalAction): string {
    const workflow = this.get(workflowId)
    const version = action === 'activate' ? workflow.published ?? workflow.draft : workflow.draft
    const trigger = version.trigger
    const lines: string[] = []
    const verb = action === 'publish' ? 'Publish the draft as' : action === 'activate' ? 'Activate (it then runs by itself)' : 'Run a test of'
    lines.push(`${verb} "${workflow.name}"${action === 'activate' ? ` v${workflow.versionNumber}` : ''}.`)
    lines.push(`Started by: ${trigger.type === FlowTriggerType.PIECE ? `${trigger.displayName} (${trigger.settings.qadamName.replace('@aiqadam/qadam-', '')})` : 'no trigger yet'}.`)
    for (const step of flowStructureUtil.getAllSteps(trigger)) {
      if (flowStructureUtil.isTrigger(step.type)) continue
      const action0 = step as FlowAction
      if (action0.type !== FlowActionType.PIECE) { lines.push(`- ${action0.displayName} (${action0.type === FlowActionType.ROUTER ? 'router' : 'loop'})`); continue }
      const input = action0.settings.input
      const reach = action0.settings.qadamName === '@aiqadam/qadam-http' ? ` - sends ${String(input.method ?? 'a')} request to ${String(input.url ?? '?')}` : ''
      lines.push(`- ${action0.displayName} (${action0.settings.qadamName.replace('@aiqadam/qadam-', '')})${reach}`)
    }
    return lines.join('\n')
  }

  /** Whether a test of the draft would reach outside this app (an HTTP request, a webhook answer...), so an agent needs the person's yes first. */
  testHasEffects(workflowId: string): boolean {
    const pure = new Set(['@aiqadam/qadam-math-helper', '@aiqadam/qadam-date-helper', '@aiqadam/qadam-json', '@aiqadam/qadam-data-mapper', '@aiqadam/qadam-delay'])
    return flowStructureUtil.getAllSteps(this.get(workflowId).draft.trigger).some((s) => s.type === FlowActionType.PIECE && !pure.has((s as FlowAction & { settings: { qadamName: string } }).settings.qadamName))
  }

  // ---- connections --------------------------------------------------------------------------------------------------------------------------------

  connections(): Connection[] {
    return [...this.#state.connections]
  }

  /** Save a connection's secret (an API key, a token) under a name steps refer to (`{{connections['github']}}`). The value is never shown again. */
  async saveConnection(input: { readonly name: string, readonly integration: string, readonly value: unknown }): Promise<Connection> {
    const name = input.name.trim()
    if (!/^[A-Za-z0-9][\w-]{0,62}$/u.test(name)) throw new Refusal('invalid', 'A connection name is letters, digits, - and _, starting with a letter or digit')
    if (this.catalog.integration(input.integration) === undefined) throw new Refusal('invalid', `There is no integration ${input.integration}`)
    const existing = this.#state.connections.find((c) => c.name === name)
    const connection: Connection = existing ?? { id: `conn_${randomUUID().slice(0, 8)}`, name, integration: input.integration, masked: '', createdAt: this.#ports.clock().toISOString() }
    connection.masked = mask(input.value)
    await this.#ports.secrets.set(connection.id, input.value)
    if (existing === undefined) this.#state.connections.push(connection)
    await this.#save()
    return connection
  }

  async removeConnection(name: string): Promise<void> {
    const connection = this.#state.connections.find((c) => c.name === name)
    if (connection === undefined) throw new Refusal('not_found', `There is no connection ${name}`)
    await this.#ports.secrets.delete(connection.id)
    this.#state.connections = this.#state.connections.filter((c) => c.id !== connection.id)
    await this.#save()
  }

  // ---- runs ---------------------------------------------------------------------------------------------------------------------------------------

  runs(filter: { readonly workflowId?: string, readonly status?: RunStatus, readonly limit?: number } = {}): RunSummary[] {
    return this.#runs.runs.filter((r) => (filter.workflowId === undefined || r.workflowId === filter.workflowId) && (filter.status === undefined || r.status === filter.status))
      .slice(-(filter.limit ?? 50)).reverse().map(summary)
  }

  run(runId: string): Run {
    const run = this.#runs.runs.find((r) => r.id === runId)
    if (run === undefined) throw new Refusal('not_found', `There is no run ${runId}`)
    return run
  }

  /**
   * Start a run. `test` runs the draft (Test in the editor, `automation_test_workflow`); otherwise the published version. The trigger's own run() gives
   * the trigger's output from `payload` (a webhook's body and headers), and the steps follow. Resolves when the run ends or starts waiting.
   */
  async start(id: string, how: { readonly trigger: RunTrigger, readonly payload?: unknown }): Promise<Run> {
    const workflow = this.get(id)
    const version = how.trigger === 'test' ? workflow.draft : workflow.published
    if (version === undefined) throw new Refusal('refused', `${workflow.name} has no published version: publish it, or test the draft`)
    if (how.trigger === 'test') {
      const report = this.validate(id)
      if (!report.valid) throw new Refusal('invalid', `Fix these first: ${report.problems.map((p) => `${p.step}${p.field === undefined ? '' : `.${p.field}`}: ${p.message}`).join('; ')}`)
    }
    const outputs = await this.#triggerOutputs(version.trigger, how.payload)
    if (outputs.length === 0) throw new Refusal('refused', 'The trigger did not accept this event (for a webhook: its authentication did not match)')
    let last: Run | undefined
    for (const output of outputs) last = await this.#execute(workflow, version, how.trigger, output)
    return last!
  }

  async #triggerOutputs(trigger: FlowTrigger, payload: unknown): Promise<unknown[]> {
    if (trigger.type !== FlowTriggerType.PIECE) return [payload ?? {}]
    const definition = this.catalog.trigger(trigger.settings.qadamName, trigger.settings.triggerName ?? '')
    if (definition === undefined) throw new Refusal('invalid', `${trigger.settings.qadamName} has no trigger ${trigger.settings.triggerName}`)
    // A manual start hands its input to the run (Qadam's manual trigger returns nothing of its own).
    if (String(definition.type) === 'MANUAL') return [payload ?? {}]
    const event = (payload ?? {}) as Record<string, unknown>
    const context = {
      propsValue: trigger.settings.input, auth: undefined, store: this.#kvFor(trigger.settings.qadamName),
      payload: { body: event.body ?? event, headers: event.headers ?? {}, queryParams: event.queryParams ?? {}, rawBody: event.rawBody, method: event.method ?? 'POST' },
      app: { createListeners: () => undefined }, webhookUrl: '', setSchedule: () => undefined, project: { id: 'local', externalId: async () => undefined },
      connections: { get: async () => undefined }, files: { write: async () => '' }, server: { apiUrl: this.#ports.publicUrl(), publicUrl: this.#ports.publicUrl(), token: '' },
    }
    const result = await (definition as unknown as { run(ctx: unknown): Promise<unknown[]> }).run(context)
    return Array.isArray(result) ? result : [result]
  }

  async #execute(workflow: Workflow, version: FlowVersion, trigger: RunTrigger, triggerOutput: unknown, resume?: Run): Promise<Run> {
    const now = this.#ports.clock().toISOString()
    const run: Run = resume ?? {
      id: `run_${randomUUID().slice(0, 12)}`, workflowId: workflow.id, workflowName: workflow.name, version: trigger === 'test' ? 'draft' : 'published',
      ...(trigger === 'test' ? {} : { versionNumber: workflow.versionNumber }), trigger, status: 'running', steps: {}, triggerOutput, startedAt: now,
    }
    run.status = 'running'
    delete run.waiting
    if (resume === undefined) this.#runs.runs.push(run)
    this.#runs.runs = this.#runs.runs.slice(-(this.#ports.keepRuns ?? KEEP_RUNS))
    await this.#saveRuns()
    this.#emit({ type: 'run', run: summary(run) })
    const controller = new AbortController()
    this.#running.set(run.id, controller)
    let result: ExecutionResult
    try {
      result = await execute(version.trigger, triggerOutput, {
        catalog: this.catalog,
        connection: (name, censored) => this.#connectionValue(name, censored),
        store: this.#kvFor(workflow.id),
        onStep: (record) => {
          run.steps[record.path] = record
          void this.#saveRuns()
          this.#emit({ type: 'run', run: summary(run), step: record })
        },
        signal: controller.signal,
        ids: { workflowId: workflow.id, versionId: version.id, runId: run.id },
        publicUrl: this.#ports.publicUrl(),
        stepTimeoutMs: this.#ports.stepTimeoutMs ?? 120_000,
        test: trigger === 'test',
      }, resume?.steps)
    } catch (cause) {
      result = { status: 'failed', steps: run.steps, error: { step: TRIGGER_NAME, message: cause instanceof Error ? cause.message : String(cause) } }
    } finally {
      this.#running.delete(run.id)
    }
    run.status = result.status
    run.steps = { ...result.steps }
    if (result.error !== undefined) run.error = { ...result.error }
    if (result.response !== undefined) run.response = result.response
    if (result.waiting !== undefined) run.waiting = { ...result.waiting }
    else run.finishedAt = this.#ports.clock().toISOString()
    await this.#saveRuns()
    this.#emit({ type: 'run', run: summary(run) })
    return run
  }

  /** Continue a run whose step asked to wait (the scheduler calls this when its time comes, also after a restart). */
  async resume(runId: string): Promise<Run> {
    const run = this.run(runId)
    if (run.status !== 'waiting') throw new Refusal('refused', `Run ${runId} is ${run.status}, not waiting`)
    const workflow = this.get(run.workflowId)
    const version = run.version === 'draft' ? workflow.draft : workflow.published
    if (version === undefined) throw new Refusal('refused', `${workflow.name} has no published version any more`)
    return this.#execute(workflow, version, run.trigger, run.triggerOutput, run)
  }

  waitingRuns(): Run[] {
    return this.#runs.runs.filter((r) => r.status === 'waiting')
  }

  async cancel(runId: string): Promise<Run> {
    const run = this.run(runId)
    const controller = this.#running.get(runId)
    if (controller !== undefined) { controller.abort(); return run }
    if (run.status !== 'waiting') throw new Refusal('refused', `Run ${runId} has already ended (${run.status})`)
    run.status = 'cancelled'
    run.finishedAt = this.#ports.clock().toISOString()
    delete run.waiting
    await this.#saveRuns()
    this.#emit({ type: 'run', run: summary(run) })
    return run
  }

  /** Stop every run in progress (the plugin unloads). */
  stopAll(): void {
    for (const controller of this.#running.values()) controller.abort()
  }

  async #connectionValue(name: string, censored: boolean): Promise<unknown> {
    const connection = this.#state.connections.find((c) => c.name === name)
    if (connection === undefined) throw new Error(`There is no connection named ${name}`)
    return censored ? connection.masked : this.#ports.secrets.get(connection.id)
  }

  #kvFor(scope: string): { get(key: string): Promise<unknown>, put(key: string, value: unknown): Promise<unknown>, delete(key: string): Promise<void> } {
    const bag = (this.#state.kv[scope] ??= {})
    return {
      get: async (key) => bag[key] ?? null,
      put: async (key, value) => { bag[key] = value; await this.#save(); return value },
      delete: async (key) => { delete bag[key]; await this.#save() },
    }
  }

  #save(): Promise<void> {
    const state = this.#state
    this.#saving = this.#saving.then(() => this.#ports.workflows.save(state))
    return this.#saving
  }

  #runsSaving: Promise<void> = Promise.resolve()
  #saveRuns(): Promise<void> {
    const runs = this.#runs
    this.#runsSaving = this.#runsSaving.then(() => this.#ports.runs.save(runs)).catch(() => undefined)
    return this.#runsSaving
  }
}

const summary = (run: Run): RunSummary => ({
  id: run.id, workflowId: run.workflowId, workflowName: run.workflowName, trigger: run.trigger, status: run.status, version: run.version, startedAt: run.startedAt,
  ...(run.finishedAt === undefined ? {} : { finishedAt: run.finishedAt }), ...(run.error === undefined ? {} : { error: run.error }),
})

function emptyVersion(flowId: string, name: string, now: string): FlowVersion {
  return {
    id: `${flowId}_draft`, created: now, updated: now, flowId, displayName: name, valid: false, schemaVersion: '32', agentIds: [], state: FlowVersionState.DRAFT, connectionIds: [],
    backupFiles: null, notes: [], localeSource: null, updatedBy: null,
    trigger: { name: TRIGGER_NAME, valid: false, displayName: 'Select a trigger', type: FlowTriggerType.EMPTY, settings: {}, lastUpdatedDate: now },
  } as FlowVersion
}

function cleanName(name: string): string {
  const clean = name.replaceAll(/\s+/gu, ' ').trim().slice(0, 120)
  if (clean === '') throw new Refusal('invalid', 'A workflow needs a name')
  return clean
}

function lastStepName(trigger: FlowTrigger): string {
  let name = trigger.name
  for (let a = trigger.nextAction as FlowAction | undefined; !isNil(a); a = a.nextAction) name = a.name
  return name
}

function withDefaults(view: OperationView, input: Record<string, unknown>): Record<string, unknown> {
  const filled: Record<string, unknown> = {}
  for (const property of view.properties) if (property.defaultValue !== undefined) filled[property.name] = property.defaultValue
  return { ...filled, ...input }
}

function missingFields(step: string, view: OperationView, input: Record<string, unknown>): Problem[] {
  return view.properties.filter((p) => p.required && !p.dynamic && p.type !== 'CHECKBOX' && (input[p.name] === undefined || input[p.name] === '' || input[p.name] === null))
    .map((p) => ({ step, field: p.name, message: `${p.displayName} is required` }))
}

function mask(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value) ?? ''
  return text.length <= 4 ? '••••' : `••••${text.slice(-4)}`
}
