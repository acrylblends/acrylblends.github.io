/**
 * The release board: services, environments, deployments, incidents and events, and every operation a page may run. Its outside effects (where the
 * state lives, what time it is, how ids are made) come in as adapters.
 */
import {
  cleanCommit,
  dayOf,
  type Deployment,
  type Environment,
  type Incident,
  latestOf,
  nextEnvironment,
  previousOf,
  type ReleaseEvent,
  ReleaseError,
  type ReleaseState,
  type Service,
  stampOf,
  statsOf,
  type BoardStats,
} from './domain.ts'
import { seed } from './seed.ts'
import type { Store } from './store.ts'

export interface ReleaseAdapters {
  readonly store: Store<ReleaseState>
  readonly clock: () => Date
  readonly newId: (kind: string) => string
}

export interface BoardColumn {
  readonly environment: Environment
  readonly cards: readonly { service: Service; deployment: Deployment | undefined }[]
}

export interface QueueInput {
  readonly serviceId: string
  readonly environmentId: string
  readonly version: string
  readonly commit: string
  readonly actor?: string
}

export class Release {
  private state: ReleaseState
  private readonly adapters: ReleaseAdapters

  private constructor(state: ReleaseState, adapters: ReleaseAdapters) {
    this.state = state
    this.adapters = adapters
  }

  static async open(adapters: ReleaseAdapters): Promise<Release> {
    const saved = await adapters.store.load()
    return new Release(saved ?? seed(adapters.clock(), adapters.newId), adapters)
  }

  get now(): Date {
    return this.adapters.clock()
  }

  get today(): string {
    return dayOf(this.adapters.clock())
  }

  services(): readonly Service[] {
    return this.state.services
  }

  service(id: string): Service | undefined {
    return this.state.services.find((service) => service.id === id)
  }

  environments(): readonly Environment[] {
    return this.state.environments
  }

  environment(id: string): Environment | undefined {
    return this.state.environments.find((environment) => environment.id === id)
  }

  deployments(filter: { serviceId?: string; environmentId?: string; today?: boolean } = {}): readonly Deployment[] {
    return this.state.deployments
      .filter((deployment) => filter.serviceId === undefined || deployment.serviceId === filter.serviceId)
      .filter((deployment) => filter.environmentId === undefined || deployment.environmentId === filter.environmentId)
      .filter((deployment) => filter.today !== true || deployment.startedAt.startsWith(this.today))
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  }

  latest(serviceId: string, environmentId: string): Deployment | undefined {
    return latestOf(this.state, serviceId, environmentId)
  }

  /** The version before this deployment in its service and environment, for a rollback. */
  previousOf(deployment: Deployment): Deployment | undefined {
    return previousOf(this.state, deployment)
  }

  deployment(id: string): Deployment | undefined {
    return this.state.deployments.find((deployment) => deployment.id === id)
  }

  incidents(status?: string): readonly Incident[] {
    return [...this.state.incidents]
      .filter((incident) => status === undefined || incident.status === status)
      .sort((a, b) => b.openedAt.localeCompare(a.openedAt))
  }

  incident(id: string): Incident | undefined {
    return this.state.incidents.find((incident) => incident.id === id)
  }

  events(limit = 20): readonly ReleaseEvent[] {
    return [...this.state.events].sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit)
  }

  stats(): BoardStats {
    return statsOf(this.state, this.today)
  }

  /** The three environment columns, each with every service's latest deployment. */
  board(): BoardColumn[] {
    return this.state.environments.map((environment) => ({
      environment,
      cards: this.state.services.map((service) => ({ service, deployment: this.latest(service.id, environment.id) })),
    }))
  }

  /** Queue a deployment; it waits as `queued` until a runner picks it up. */
  async queue(input: QueueInput): Promise<Deployment> {
    const service = this.service(input.serviceId)
    if (service === undefined) throw new ReleaseError('not-found', 'That service no longer exists.')
    const environment = this.environment(input.environmentId)
    if (environment === undefined) throw new ReleaseError('not-found', 'That environment no longer exists.')
    const version = input.version.trim()
    if (version === '') throw new ReleaseError('invalid', 'The version is required.')
    if (version.length > 60) throw new ReleaseError('invalid', 'The version is longer than 60 characters.')
    const commit = cleanCommit(input.commit)
    const deployment: Deployment = {
      id: this.adapters.newId('deployment'),
      serviceId: service.id,
      environmentId: environment.id,
      version,
      commit,
      status: 'queued',
      actor: (input.actor ?? 'Alex M.').trim() || 'Alex M.',
      startedAt: stampOf(this.adapters.clock()),
      durationSeconds: 0,
      logs: 'queued',
    }
    this.state.deployments.push(deployment)
    this.addEvent('deploy', deployment.id, `${service.name} ${version} queued for ${environment.name}`)
    await this.save()
    return deployment
  }

  async acknowledge(id: string): Promise<Incident> {
    const incident = this.incident(id)
    if (incident === undefined) throw new ReleaseError('not-found', 'That incident no longer exists.')
    if (incident.status !== 'open') return incident
    return this.changeIncident(incident, 'acknowledged', 'Acknowledged.')
  }

  async resolve(id: string): Promise<Incident> {
    const incident = this.incident(id)
    if (incident === undefined) throw new ReleaseError('not-found', 'That incident no longer exists.')
    return this.changeIncident(incident, 'resolved', 'Resolved.')
  }

  /** Promote a deployment to the next environment: it is queued there with the same version. */
  async promote(deploymentId: string): Promise<Deployment> {
    const deployment = this.deployment(deploymentId)
    if (deployment === undefined) throw new ReleaseError('not-found', 'That deployment no longer exists.')
    const target = nextEnvironment(this.state, deployment.environmentId)
    if (target === undefined) throw new ReleaseError('conflict', 'Production has no next environment; promote the release from staging.')
    const service = this.service(deployment.serviceId)
    const next: Deployment = {
      id: this.adapters.newId('deployment'),
      serviceId: deployment.serviceId,
      environmentId: target.id,
      version: deployment.version,
      commit: deployment.commit,
      status: 'queued',
      actor: 'Alex M.',
      startedAt: stampOf(this.adapters.clock()),
      durationSeconds: 0,
      logs: 'queued by a promotion',
    }
    this.state.deployments.push(next)
    this.addEvent('promote', next.id, `${service?.name ?? 'Service'} ${deployment.version} promoted to ${target.name}`)
    await this.save()
    return next
  }

  /** Roll a deployment back to the version before it in the same environment; it is queued for approval. */
  async rollback(deploymentId: string): Promise<Deployment> {
    const deployment = this.deployment(deploymentId)
    if (deployment === undefined) throw new ReleaseError('not-found', 'That deployment no longer exists.')
    const previous = previousOf(this.state, deployment)
    if (previous === undefined) throw new ReleaseError('conflict', 'There is no earlier version to roll back to.')
    const service = this.service(deployment.serviceId)
    const environment = this.environment(deployment.environmentId)
    const next: Deployment = {
      id: this.adapters.newId('deployment'),
      serviceId: deployment.serviceId,
      environmentId: deployment.environmentId,
      version: previous.version,
      commit: previous.commit,
      status: 'queued',
      actor: 'Alex M.',
      startedAt: stampOf(this.adapters.clock()),
      durationSeconds: 0,
      logs: `queued rollback from ${deployment.version}`,
    }
    this.state.deployments.push(next)
    this.addEvent('rollback', next.id, `${service?.name ?? 'Service'} rolled back to ${previous.version} in ${environment?.name ?? 'an environment'}`)
    await this.save()
    return next
  }

  private async changeIncident(incident: Incident, status: Incident['status'], text: string): Promise<Incident> {
    const next: Incident = {
      ...incident,
      status,
      timeline: [...incident.timeline, { at: stampOf(this.adapters.clock()), text }],
    }
    this.state.incidents = this.state.incidents.map((item) => (item.id === incident.id ? next : item))
    this.addEvent('incident', incident.id, `${incident.number}: ${text}`)
    await this.save()
    return next
  }

  private addEvent(type: ReleaseEvent['type'], entityId: string, message: string): void {
    this.state.events.push({ id: this.adapters.newId('event'), type, entityId, message, at: stampOf(this.adapters.clock()) })
  }

  private async save(): Promise<void> {
    this.state = {
      ...this.state,
      services: [...this.state.services],
      environments: [...this.state.environments],
      deployments: [...this.state.deployments],
      incidents: [...this.state.incidents],
      events: [...this.state.events],
    }
    await this.adapters.store.save(this.state)
  }
}
