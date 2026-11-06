/**
 * Uptime Checker's types and pure rules: monitors, checks, incidents and groups, and the labels a status page needs. No clock, no disk, no network and
 * no ids are made here; the {@link Uptime} class applies these rules to the saved state, and a {@link Checker} port does the outside check.
 */

export type Protocol = 'https' | 'http' | 'tcp'
export type Health = 'up' | 'degraded' | 'down' | 'paused'
export type HistoryState = 'up' | 'degraded' | 'down'

export interface Monitor {
  readonly id: string
  readonly name: string
  /** A host name for all protocols, without a scheme. */
  readonly target: string
  readonly protocol: Protocol
  /** The path an HTTP check asks for; empty for a TCP check. */
  readonly path: string
  readonly intervalSeconds: number
  readonly timeoutMs: number
  /** The status an HTTP check expects; 0 for a TCP check. */
  readonly expectedStatus: number
  readonly groupId: string
  readonly status: Health
  readonly latencyMs: number
  /** The share of the last thirty days the monitor was up, as the mockup reports it. */
  readonly uptime30d: number
  /** One state per day, oldest first: the 90-day bars. */
  readonly history: readonly HistoryDay[]
  /** One latency per hour, oldest first: the 24-hour plot. */
  readonly responseTimes: readonly number[]
  readonly lastCheckedAt: string
}

export interface HistoryDay {
  readonly day: string
  readonly state: HistoryState
}

export interface Check {
  readonly id: string
  readonly monitorId: string
  readonly checkedAt: string
  readonly statusCode: number
  readonly latencyMs: number
  readonly result: HistoryState
  readonly error?: string
}

export interface Incident {
  readonly id: string
  readonly monitorId: string
  readonly startedAt: string
  readonly resolvedAt?: string
  readonly severity: 'high' | 'medium' | 'low'
  readonly summary: string
}

export interface MonitorGroup {
  readonly id: string
  readonly name: string
}

export interface UptimeState {
  readonly version: 1
  groups: MonitorGroup[]
  monitors: Monitor[]
  checks: Check[]
  incidents: Incident[]
}

export type UptimeErrorCode = 'invalid' | 'not-found' | 'conflict'

export class UptimeError extends Error {
  readonly code: UptimeErrorCode

  constructor(code: UptimeErrorCode, message: string) {
    super(message)
    this.code = code
    this.name = 'UptimeError'
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

/** A short day for the chart's axis: `00:00`. */
export function hourLabel(index: number): string {
  return `${String(index).padStart(2, '0')}:00`
}

/** `142 ms` or `1.42 s`. */
export function latencyText(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`
}

/** `99.98%` from a 0-100 value. */
export function uptimeText(value: number): string {
  return `${value.toFixed(2)}%`
}

/** A check's outcome, from what the checker saw and how long it took. */
export function healthOf(result: { ok: boolean; latencyMs: number }): HistoryState {
  if (!result.ok) return 'down'
  return result.latencyMs > 1000 ? 'degraded' : 'up'
}

/** The state label a row shows. */
export function healthLabel(status: Health): string {
  return status === 'up' ? 'Operational' : status === 'degraded' ? 'Degraded' : status === 'down' ? 'Down' : 'Paused'
}

/** `https://api.example.dev/health` or `postgres-primary:5432`. */
export function targetText(monitor: Monitor): string {
  return monitor.protocol === 'tcp' ? `${monitor.target}:${monitor.path}` : `${monitor.protocol}://${monitor.target}${monitor.path === '' ? '/' : monitor.path}`
}

/** The schedule a row shows: `HTTPS · /health · every 60s`. */
export function scheduleText(monitor: Monitor): string {
  return monitor.protocol === 'tcp'
    ? `TCP · ${monitor.path} · every ${String(monitor.intervalSeconds)}s`
    : `${monitor.protocol.toUpperCase()} · ${monitor.path === '' ? '/' : monitor.path} · every ${String(monitor.intervalSeconds)}s`
}

/** The 90-day bars: the states in order, with the number of each. */
export function historyCounts(monitor: Monitor): { up: number; degraded: number; down: number } {
  return {
    up: monitor.history.filter((day) => day.state === 'up').length,
    degraded: monitor.history.filter((day) => day.state === 'degraded').length,
    down: monitor.history.filter((day) => day.state === 'down').length,
  }
}

/** The average of a list of numbers, 0 when it is empty. */
export function average(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length
}

/** The summary above the list. */
export interface UptimeSummary {
  readonly monitors: number
  readonly healthy: number
  readonly degraded: number
  readonly down: number
  readonly openIncidents: number
  readonly averageLatency: number
  readonly uptime: number
}

export function summaryOf(state: UptimeState): UptimeSummary {
  const active = state.monitors.filter((monitor) => monitor.status !== 'paused')
  return {
    monitors: state.monitors.length,
    healthy: state.monitors.filter((monitor) => monitor.status === 'up').length,
    degraded: state.monitors.filter((monitor) => monitor.status === 'degraded').length,
    down: state.monitors.filter((monitor) => monitor.status === 'down').length,
    openIncidents: state.incidents.filter((incident) => incident.resolvedAt === undefined).length,
    averageLatency: Math.round(average(active.map((monitor) => monitor.latencyMs))),
    uptime: active.length === 0 ? 0 : average(active.map((monitor) => monitor.uptime30d)),
  }
}

/** A target as the form accepts it: a host, `host:port` for TCP, without a scheme. @throws with the form's message. */
export function cleanTarget(protocol: Protocol, value: unknown): string {
  if (typeof value !== 'string') throw new UptimeError('invalid', 'The target is required.')
  const target = value.trim().replace(/^https?:\/\//u, '').replace(/\/.*$/u, '')
  if (target === '') throw new UptimeError('invalid', 'The target is required.')
  if (protocol === 'tcp') {
    if (!/^[a-z0-9.-]+:\d{1,5}$/iu.test(target)) throw new UptimeError('invalid', 'A TCP target is host:port, for example postgres-primary:5432.')
    return target
  }
  if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::\d{1,5})?$/iu.test(target))
    throw new UptimeError('invalid', 'Enter a host name, for example api.example.dev.')
  return target
}

/** A path as the form accepts it: empty or starting with `/`. */
export function cleanPath(value: unknown): string {
  if (value === undefined || value === null || value === '') return ''
  if (typeof value !== 'string' || !value.trim().startsWith('/')) throw new UptimeError('invalid', 'The path starts with /.')
  return value.trim().slice(0, 300)
}

/** A sparkline path (`M0 12 L…`) for a list of values in a box. */
export function sparkPath(values: readonly number[], width = 130, height = 30): string {
  if (values.length === 0) return ''
  const max = Math.max(...values, 1)
  const min = Math.min(...values)
  const span = max - min || 1
  return values
    .map((value, index) => {
      const x = (index / Math.max(1, values.length - 1)) * width
      const y = height - ((value - min) / span) * height
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
}
