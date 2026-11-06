/**
 * The monitors and their checks: the saved state, and every operation a page may run. The outside check is the {@link Checker} port; a monitor's
 * status, history, latency series and incidents all follow from its checks.
 */
import {
  average,
  type Check,
  cleanPath,
  cleanTarget,
  dayOf,
  healthOf,
  type HistoryState,
  type Incident,
  type Monitor,
  type MonitorGroup,
  type Protocol,
  stampOf,
  summaryOf,
  type UptimeState,
  UptimeError,
  type UptimeSummary,
} from './domain.ts'
import type { Checker } from './checker.ts'
import { seed } from './seed.ts'
import type { Store } from './store.ts'

export interface UptimeAdapters {
  readonly store: Store<UptimeState>
  readonly clock: () => Date
  readonly newId: (kind: string) => string
  readonly checker: Checker
}

export interface MonitorInput {
  readonly name: string
  readonly target: string
  readonly protocol: string
  readonly path: string
  readonly intervalSeconds: number
  readonly timeoutMs: number
  readonly expectedStatus: number
  readonly groupId: string
}

export interface CheckOutcome {
  readonly monitor: Monitor
  readonly check: Check
  readonly incident: Incident | undefined
}

export class Uptime {
  private state: UptimeState
  private readonly adapters: UptimeAdapters

  private constructor(state: UptimeState, adapters: UptimeAdapters) {
    this.state = state
    this.adapters = adapters
  }

  static async open(adapters: UptimeAdapters): Promise<Uptime> {
    const saved = await adapters.store.load()
    return new Uptime(saved ?? seed(adapters.clock(), adapters.newId), adapters)
  }

  get now(): Date {
    return this.adapters.clock()
  }

  groups(): readonly MonitorGroup[] {
    return this.state.groups
  }

  monitors(): readonly Monitor[] {
    return this.state.monitors
  }

  monitor(id: string): Monitor | undefined {
    return this.state.monitors.find((monitor) => monitor.id === id)
  }

  monitorsIn(groupId: string): readonly Monitor[] {
    return this.state.monitors.filter((monitor) => monitor.groupId === groupId)
  }

  group(id: string): MonitorGroup | undefined {
    return this.state.groups.find((group) => group.id === id)
  }

  /** The most recent checks of a monitor, newest first. */
  checks(monitorId: string, limit = 3): readonly Check[] {
    return this.state.checks
      .filter((check) => check.monitorId === monitorId)
      .sort((a, b) => b.checkedAt.localeCompare(a.checkedAt))
      .slice(0, limit)
  }

  incidents(openOnly = false): readonly Incident[] {
    return [...this.state.incidents]
      .filter((incident) => !openOnly || incident.resolvedAt === undefined)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  }

  incident(id: string): Incident | undefined {
    return this.state.incidents.find((incident) => incident.id === id)
  }

  summary(): UptimeSummary {
    return summaryOf(this.state)
  }

  /** Add a monitor; it starts paused and gets its first status from Check now. */
  async createMonitor(input: MonitorInput): Promise<Monitor> {
    const protocol: Protocol = input.protocol === 'tcp' ? 'tcp' : input.protocol === 'http' ? 'http' : 'https'
    const name = input.name.trim()
    if (name === '') throw new UptimeError('invalid', 'The monitor needs a name.')
    if (name.length > 120) throw new UptimeError('invalid', 'The name is longer than 120 characters.')
    const rawTarget = cleanTarget(protocol, input.target)
    const [target, port] = protocol === 'tcp' ? rawTarget.split(':') : [rawTarget, '']
    const path = protocol === 'tcp' ? port ?? '' : cleanPath(input.path)
    if (protocol === 'tcp' && (target === undefined || path === '')) throw new UptimeError('invalid', 'A TCP target is host:port.')
    const group = this.group(input.groupId) ?? this.state.groups[0]
    if (group === undefined) throw new UptimeError('not-found', 'There is no group for this monitor.')
    if (!Number.isFinite(input.intervalSeconds) || input.intervalSeconds < 10) throw new UptimeError('invalid', 'The interval is at least 10 seconds.')
    if (!Number.isFinite(input.timeoutMs) || input.timeoutMs < 500) throw new UptimeError('invalid', 'The timeout is at least 500 ms.')
    if (protocol !== 'tcp' && (!Number.isInteger(input.expectedStatus) || input.expectedStatus < 100 || input.expectedStatus > 599))
      throw new UptimeError('invalid', 'The expected status is an HTTP status, 100 to 599.')
    const monitor: Monitor = {
      id: this.adapters.newId('monitor'),
      name,
      target: target ?? rawTarget,
      protocol,
      path,
      intervalSeconds: Math.round(input.intervalSeconds),
      timeoutMs: Math.round(input.timeoutMs),
      expectedStatus: protocol === 'tcp' ? 0 : Math.round(input.expectedStatus),
      groupId: group.id,
      status: 'paused',
      latencyMs: 0,
      uptime30d: 0,
      history: [],
      responseTimes: [],
      lastCheckedAt: '',
    }
    this.state.monitors.push(monitor)
    await this.save()
    return monitor
  }

  async createGroup(name: string): Promise<MonitorGroup> {
    const clean = name.trim()
    if (clean === '') throw new UptimeError('invalid', 'The group needs a name.')
    if (this.state.groups.some((group) => group.name.toLowerCase() === clean.toLowerCase()))
      throw new UptimeError('conflict', `A group named “${clean}” already exists.`)
    const group: MonitorGroup = { id: this.adapters.newId('group'), name: clean }
    this.state.groups.push(group)
    await this.save()
    return group
  }

  /** Run the check now: the check is recorded, the monitor's status follows it, and an incident opens or closes. */
  async checkNow(id: string): Promise<CheckOutcome> {
    const monitor = this.monitor(id)
    if (monitor === undefined) throw new UptimeError('not-found', 'That monitor no longer exists.')
    const result = await this.adapters.checker.check(monitor)
    const state = healthOf(result)
    const at = stampOf(this.adapters.clock())
    const check: Check = {
      id: this.adapters.newId('check'),
      monitorId: monitor.id,
      checkedAt: at,
      statusCode: result.statusCode,
      latencyMs: result.latencyMs,
      result: state,
      ...(result.error === undefined ? {} : { error: result.error }),
    }
    this.state.checks.push(check)
    let incident = this.state.incidents.find((item) => item.monitorId === monitor.id && item.resolvedAt === undefined)
    if (state === 'up' && incident !== undefined) {
      const resolved: Incident = { ...incident, resolvedAt: at }
      this.state.incidents = this.state.incidents.map((item) => (item.id === resolved.id ? resolved : item))
      incident = resolved
    }
    if (state !== 'up' && incident === undefined) {
      incident = {
        id: this.adapters.newId('incident'),
        monitorId: monitor.id,
        startedAt: at,
        severity: state === 'down' ? 'high' : 'medium',
        summary: state === 'down' ? `${monitor.name} is not answering.` : `${monitor.name} answered slower than 1 s.`,
      }
      this.state.incidents.push(incident)
    }
    const history = this.upsertDay(monitor.history, dayOf(this.adapters.clock()), state)
    const responseTimes = [...monitor.responseTimes, result.latencyMs].slice(-24)
    const next: Monitor = {
      ...monitor,
      status: state,
      latencyMs: result.latencyMs,
      uptime30d: monitor.status === 'paused' || monitor.uptime30d === 0 ? (state === 'up' ? 100 : state === 'degraded' ? 99.9 : 0) : monitor.uptime30d,
      history,
      responseTimes,
      lastCheckedAt: at,
    }
    this.state.monitors = this.state.monitors.map((item) => (item.id === next.id ? next : item))
    await this.save()
    return { monitor: next, check, incident }
  }

  /** Pause a monitor, or resume one that is paused. */
  async togglePause(id: string): Promise<Monitor> {
    const monitor = this.monitor(id)
    if (monitor === undefined) throw new UptimeError('not-found', 'That monitor no longer exists.')
    const next: Monitor = { ...monitor, status: monitor.status === 'paused' ? 'up' : 'paused' }
    this.state.monitors = this.state.monitors.map((item) => (item.id === id ? next : item))
    await this.save()
    return next
  }

  /** The public status page: the groups with their monitors, paused ones left out. */
  statusPage(): { group: MonitorGroup; monitors: readonly Monitor[] }[] {
    return this.state.groups.map((group) => ({
      group,
      monitors: this.state.monitors.filter((monitor) => monitor.groupId === group.id && monitor.status !== 'paused'),
    }))
  }

  /** The average of the last 24 hours for a monitor, as the detail shows it. */
  averageLatency(monitor: Monitor): number {
    return Math.round(average(monitor.responseTimes))
  }

  private upsertDay(history: readonly { day: string; state: HistoryState }[], day: string, state: HistoryState): { day: string; state: HistoryState }[] {
    const rest = history.filter((item) => item.day !== day)
    return [...rest, { day, state }].sort((a, b) => a.day.localeCompare(b.day)).slice(-90)
  }

  private async save(): Promise<void> {
    this.state = {
      ...this.state,
      groups: [...this.state.groups],
      monitors: [...this.state.monitors],
      checks: [...this.state.checks],
      incidents: [...this.state.incidents],
    }
    await this.adapters.store.save(this.state)
  }
}
