/**
 * Deploy Board's types and pure rules: services, environments, deployments, incidents and the event log, and the few calculations the board needs.
 * No clock, no disk and no ids are made here; the {@link Release} class applies these rules to the saved state.
 */

export type DeployStatus = 'queued' | 'building' | 'succeeded' | 'failed' | 'cancelled'
export type EnvKind = 'dev' | 'stg' | 'prod'
export type IncidentStatus = 'open' | 'acknowledged' | 'resolved'
export type Severity = 'high' | 'medium' | 'low'
export type EventType = 'deploy' | 'promote' | 'rollback' | 'incident' | 'health'

export interface Service {
  readonly id: string
  readonly name: string
  readonly repository: string
  readonly owner: string
}

export interface Environment {
  readonly id: string
  readonly name: string
  readonly region: string
  readonly kind: EnvKind
}

export interface Deployment {
  readonly id: string
  readonly serviceId: string
  readonly environmentId: string
  readonly version: string
  readonly commit: string
  readonly status: DeployStatus
  readonly actor: string
  /** ISO date-time, local time without a zone. */
  readonly startedAt: string
  /** The run time in seconds; 0 while it has not finished. */
  readonly durationSeconds: number
  readonly logs: string
}

export interface IncidentEvent {
  readonly at: string
  readonly text: string
}

export interface Incident {
  readonly id: string
  /** `INC-024`, the number people say in a channel. */
  readonly number: string
  readonly serviceId: string
  readonly environmentId: string
  readonly severity: Severity
  readonly status: IncidentStatus
  readonly summary: string
  readonly assignee: string
  readonly openedAt: string
  readonly timeline: readonly IncidentEvent[]
}

export interface ReleaseEvent {
  readonly id: string
  readonly type: EventType
  readonly entityId: string
  readonly message: string
  readonly at: string
}

export interface ReleaseState {
  readonly version: 1
  services: Service[]
  environments: Environment[]
  deployments: Deployment[]
  incidents: Incident[]
  events: ReleaseEvent[]
}

export type ReleaseErrorCode = 'invalid' | 'not-found' | 'conflict'

export class ReleaseError extends Error {
  readonly code: ReleaseErrorCode

  constructor(code: ReleaseErrorCode, message: string) {
    super(message)
    this.code = code
    this.name = 'ReleaseError'
  }
}

const pad = (n: number): string => String(n).padStart(2, '0')

export function dayOf(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function stampOf(date: Date): string {
  return `${dayOf(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** `2h ago`, `Yesterday`, `31 Oct`. */
export function whenText(stamp: string, now: Date): string {
  const then = new Date(stamp)
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  if (hours < 48) return 'Yesterday'
  if (then.getFullYear() === now.getFullYear())
    return then.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })
  return then.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' })
}

/** `4m 12s` for a run time in seconds. */
export function durationText(seconds: number): string {
  if (seconds < 60) return `${String(seconds)}s`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return `${String(minutes)}m ${String(rest).padStart(2, '0')}s`
}

/** The short label a card shows for a deployment in an environment. */
export function stateLabel(status: DeployStatus, kind: EnvKind): string {
  if (kind === 'prod' && status === 'succeeded') return 'Healthy'
  if (kind !== 'prod' && status === 'succeeded') return 'Deployed'
  if (status === 'building') return 'Building'
  if (status === 'failed') return 'Failed'
  if (status === 'queued') return 'Queued'
  return 'Cancelled'
}

/** The colour class of a deployment's state. */
export function stateClass(status: DeployStatus): string {
  return status === 'succeeded' ? 'ok' : status === 'building' ? 'build' : status === 'failed' ? 'failed' : status === 'queued' ? 'ok' : 'failed'
}

/** The statuses that count as a result. */
export const FINISHED: readonly DeployStatus[] = ['succeeded', 'failed', 'cancelled']

export interface BoardStats {
  readonly today: number
  readonly succeeded: number
  readonly failed: number
  readonly successRate: number
  readonly activeIncidents: number
  readonly averageSeconds: number
}

/** The numbers above the board. */
export function statsOf(state: ReleaseState, today: string): BoardStats {
  const deployments = state.deployments.filter((deployment) => deployment.startedAt.startsWith(today))
  const succeeded = deployments.filter((deployment) => deployment.status === 'succeeded').length
  const failed = deployments.filter((deployment) => deployment.status === 'failed').length
  const finished = deployments.filter((deployment) => FINISHED.includes(deployment.status))
  const activeIncidents = state.incidents.filter((incident) => incident.status !== 'resolved').length
  return {
    today: deployments.length,
    succeeded,
    failed,
    successRate: finished.length === 0 ? 0 : (succeeded / finished.length) * 100,
    activeIncidents,
    averageSeconds: finished.length === 0 ? 0 : Math.round(finished.reduce((sum, deployment) => sum + deployment.durationSeconds, 0) / finished.length),
  }
}

/** The latest deployment of a service in an environment. */
export function latestOf(state: ReleaseState, serviceId: string, environmentId: string): Deployment | undefined {
  return state.deployments
    .filter((deployment) => deployment.serviceId === serviceId && deployment.environmentId === environmentId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]
}

/** The environment after this one in the promotion path, or undefined on production. */
export function nextEnvironment(state: ReleaseState, environmentId: string): Environment | undefined {
  const order: EnvKind[] = ['dev', 'stg', 'prod']
  const current = state.environments.find((environment) => environment.id === environmentId)
  if (current === undefined) return undefined
  const index = order.indexOf(current.kind)
  const next = order[index + 1]
  return next === undefined ? undefined : state.environments.find((environment) => environment.kind === next)
}

/** The version before this one in the same service and environment, for a rollback. */
export function previousOf(state: ReleaseState, deployment: Deployment): Deployment | undefined {
  return state.deployments
    .filter((item) => item.serviceId === deployment.serviceId && item.environmentId === deployment.environmentId && item.id !== deployment.id && item.version !== deployment.version)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]
}

/** A commit as a person reads it: `8a31fc2`. */
export function cleanCommit(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{7,40}$/iu.test(value.trim()))
    throw new ReleaseError('invalid', 'The commit is 7 to 40 hexadecimal characters.')
  return value.trim().slice(0, 7)
}
