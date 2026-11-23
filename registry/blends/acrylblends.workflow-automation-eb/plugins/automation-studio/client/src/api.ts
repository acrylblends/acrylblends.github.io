/** The studio's calls to the automation API, under the prefix the page was served at (`/` or the frame's `/app`). */
import type { FlowVersion } from '@aiqadam/shared'

export interface PropertyView {
  readonly name: string
  readonly type: string
  readonly displayName: string
  readonly description?: string
  readonly required: boolean
  readonly defaultValue?: unknown
  readonly options?: ReadonlyArray<{ readonly label: string, readonly value: unknown }>
  readonly dynamic?: boolean
  readonly refreshers?: readonly string[]
}

export interface OperationView {
  readonly integration: string
  readonly name: string
  readonly displayName: string
  readonly description: string
  readonly kind: 'action' | 'trigger'
  readonly strategy?: string
  readonly properties: readonly PropertyView[]
  readonly requiresConnection: boolean
}

export interface IntegrationView {
  readonly name: string
  readonly version: string
  readonly displayName: string
  readonly description: string
  readonly actions: readonly OperationView[]
  readonly triggers: readonly OperationView[]
}

export interface Problem { readonly step: string, readonly field?: string, readonly message: string }

export interface WorkflowView {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly status: 'inactive' | 'active'
  readonly revision: number
  readonly draft: FlowVersion
  readonly published?: FlowVersion
  readonly publishedAt?: string
  readonly versionNumber: number
  readonly webhookPath: string
  readonly updatedAt: string
  readonly createdAt: string
  readonly validation: { readonly valid: boolean, readonly problems: readonly Problem[] }
  readonly changedSincePublish: boolean
}

export interface StepRecord {
  readonly path: string
  readonly name: string
  readonly displayName: string
  readonly type: string
  readonly status: 'running' | 'succeeded' | 'failed' | 'skipped' | 'waiting'
  readonly input?: unknown
  readonly output?: unknown
  readonly error?: string
  readonly startedAt: string
  readonly durationMs?: number
  readonly attempts?: number
}

export interface RunSummary {
  readonly id: string
  readonly workflowId: string
  readonly workflowName: string
  readonly trigger: string
  readonly status: 'running' | 'waiting' | 'succeeded' | 'failed' | 'cancelled'
  readonly version: 'draft' | 'published'
  readonly startedAt: string
  readonly finishedAt?: string
  readonly error?: { readonly step: string, readonly message: string }
}

export interface RunView extends RunSummary {
  readonly steps: Readonly<Record<string, StepRecord>>
  readonly triggerOutput: unknown
  readonly waiting?: { readonly path: string, readonly resumeAt: string }
}

export interface ApprovalView { readonly id: string, readonly workflowId: string, readonly workflowName: string, readonly action: 'publish' | 'activate' | 'test', readonly summary: string, readonly status: string, readonly requestedAt: string }
export interface ConnectionView { readonly id: string, readonly name: string, readonly integration: string, readonly masked: string, readonly createdAt: string }
export interface ScheduleView { readonly workflowId: string, readonly cronExpression: string, readonly timezone: string, readonly next?: string }

export class ApiError extends Error {
  readonly code: string
  readonly status: number
  constructor(message: string, code: string, status: number) {
    super(message)
    this.code = code
    this.status = status
  }
}

/** The prefix the page was served at, from the root element (`data-base`): '' on the app's own server, '/app' in the frame. */
export const base = (): string => document.getElementById('automation-studio')?.dataset.base ?? ''

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${base()}/automation/api${path}`, {
    method,
    headers: method === 'POST' ? { 'content-type': 'application/json' } : {},
    ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}),
  })
  const data = (await response.json().catch(() => ({}))) as { error?: string, code?: string }
  if (!response.ok) throw new ApiError(data.error ?? `HTTP ${response.status}`, data.code ?? 'error', response.status)
  return data as T
}

export const api = {
  catalog: () => call<{ integrations: IntegrationView[] }>('GET', '/catalog'),
  refresh: (body: { integration: string, kind: 'action' | 'trigger', operation: string, property: string, input: Record<string, unknown> }) => call<{ properties?: PropertyView[], options?: Array<{ label: string, value: unknown }> }>('POST', '/catalog/refresh', body),
  schedules: () => call<{ schedules: ScheduleView[] }>('GET', '/schedules'),
  workflows: () => call<{ workflows: WorkflowView[] }>('GET', '/workflows'),
  workflow: (id: string) => call<WorkflowView>('GET', `/workflows/${id}`),
  create: (name: string) => call<WorkflowView>('POST', '/workflows', { name }),
  importFile: (file: unknown) => call<{ workflow: WorkflowView }>('POST', '/workflows/import', { file }),
  exportFile: (id: string) => call<unknown>('GET', `/workflows/${id}/export`),
  rename: (id: string, name: string) => call<WorkflowView>('POST', `/workflows/${id}/rename`, { name }),
  duplicate: (id: string) => call<WorkflowView>('POST', `/workflows/${id}/duplicate`),
  remove: (id: string) => call<{ ok: true }>('POST', `/workflows/${id}/delete`),
  setTrigger: (id: string, body: { integration: string, trigger: string, input?: Record<string, unknown>, revision: number }) => call<WorkflowView>('POST', `/workflows/${id}/trigger`, body),
  addStep: (id: string, body: { step: unknown, placement: unknown, revision: number }) => call<{ step: string, workflow: WorkflowView }>('POST', `/workflows/${id}/steps`, body),
  updateStep: (id: string, step: string, change: unknown, revision: number) => call<WorkflowView>('POST', `/workflows/${id}/steps/${step}/update`, { change, revision }),
  removeStep: (id: string, step: string, revision: number) => call<WorkflowView>('POST', `/workflows/${id}/steps/${step}/delete`, { revision }),
  operate: (id: string, operation: unknown, revision: number) => call<WorkflowView>('POST', `/workflows/${id}/operations`, { operation, revision }),
  publish: (id: string) => call<WorkflowView>('POST', `/workflows/${id}/publish`),
  activate: (id: string) => call<WorkflowView>('POST', `/workflows/${id}/activate`),
  deactivate: (id: string) => call<WorkflowView>('POST', `/workflows/${id}/deactivate`),
  rotateWebhook: (id: string) => call<WorkflowView>('POST', `/workflows/${id}/webhook/rotate`),
  test: (id: string, payload: unknown) => call<RunView>('POST', `/workflows/${id}/test`, { payload }),
  runNow: (id: string, payload: unknown) => call<RunView>('POST', `/workflows/${id}/run`, { payload }),
  runs: (workflowId?: string) => call<{ runs: RunSummary[] }>('GET', `/runs${workflowId === undefined ? '' : `?workflowId=${encodeURIComponent(workflowId)}`}`),
  run: (id: string) => call<RunView>('GET', `/runs/${id}`),
  cancel: (id: string) => call<RunView>('POST', `/runs/${id}/cancel`),
  retry: (id: string) => call<RunView>('POST', `/runs/${id}/retry`),
  approvals: () => call<{ approvals: ApprovalView[] }>('GET', '/approvals'),
  approve: (id: string) => call<ApprovalView>('POST', `/approvals/${id}/approve`),
  decline: (id: string) => call<ApprovalView>('POST', `/approvals/${id}/decline`),
  connections: () => call<{ connections: ConnectionView[] }>('GET', '/connections'),
  saveConnection: (body: { name: string, integration: string, value: unknown }) => call<ConnectionView>('POST', '/connections', body),
  removeConnection: (name: string) => call<{ ok: true }>('POST', `/connections/${encodeURIComponent(name)}/delete`),
}

/** Live changes: a workflow changed (by this page, another tab or the agent), a run moved. Reconnects by itself (EventSource). */
export function events(onWorkflow: (id: string, revision: number) => void, onRun: (run: RunSummary, step?: StepRecord) => void, onApproval?: () => void): () => void {
  const source = new EventSource(`${base()}/automation/api/events`)
  if (onApproval !== undefined) source.addEventListener('approval', () => { onApproval() })
  source.addEventListener('workflow', (event) => { const data = JSON.parse((event as MessageEvent<string>).data) as { id: string, revision: number }; onWorkflow(data.id, data.revision) })
  source.addEventListener('run', (event) => { const data = JSON.parse((event as MessageEvent<string>).data) as { run: RunSummary, step?: StepRecord }; onRun(data.run, data.step) })
  return () => { source.close() }
}
