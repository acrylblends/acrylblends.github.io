/**
 * The monitors a new install starts with: ten targets in two groups, nine healthy and one degraded, each with a 90-day history, a 24-hour latency
 * series and three recent checks; one open incident for the degraded endpoint.
 */
import type { Check, HistoryDay, Incident, Monitor, MonitorGroup, UptimeState } from './domain.ts'
import { dayOf, stampOf } from './domain.ts'

const GROUPS: readonly string[] = ['Web Services', 'Infrastructure']

interface MonitorSeed {
  readonly name: string
  readonly target: string
  readonly protocol: 'https' | 'tcp'
  readonly path: string
  readonly latency: number
  readonly status: 'up' | 'degraded'
  readonly uptime: number
  readonly group: number
  readonly degradedDays?: readonly number[]
}

const MONITORS: readonly MonitorSeed[] = [
  { name: 'api.webboxes.dev', target: 'api.webboxes.dev', protocol: 'https', path: '/health', latency: 142, status: 'up', uptime: 100, group: 0 },
  { name: 'app.webboxes.dev', target: 'app.webboxes.dev', protocol: 'https', path: '/', latency: 218, status: 'up', uptime: 99.99, group: 0 },
  { name: 'docs.webboxes.dev', target: 'docs.webboxes.dev', protocol: 'https', path: '/', latency: 306, status: 'up', uptime: 99.97, group: 0 },
  { name: 'status.webboxes.dev', target: 'status.webboxes.dev', protocol: 'https', path: '/api/status', latency: 1420, status: 'degraded', uptime: 99.82, group: 0, degradedDays: [16, 51] },
  { name: 'postgres-primary', target: 'postgres-primary:5432', protocol: 'tcp', path: '5432', latency: 22, status: 'up', uptime: 100, group: 1 },
  { name: 'redis-cache', target: 'redis-cache:6379', protocol: 'tcp', path: '6379', latency: 8, status: 'up', uptime: 100, group: 1 },
  { name: 'livekit-eu', target: 'livekit-eu.webboxes.dev', protocol: 'https', path: '/health', latency: 71, status: 'up', uptime: 99.99, group: 1 },
  { name: 'analytics-db', target: 'analytics-db:5432', protocol: 'tcp', path: '5432', latency: 31, status: 'up', uptime: 100, group: 1 },
  { name: 'mail-relay', target: 'mail-relay:25', protocol: 'tcp', path: '25', latency: 45, status: 'up', uptime: 99.98, group: 1 },
  { name: 'backup-node', target: 'backup-node:22', protocol: 'tcp', path: '22', latency: 88, status: 'up', uptime: 99.95, group: 1 },
]

export function seed(now: Date, newId: (kind: string) => string): UptimeState {
  const at = (minutesAgo: number): string => stampOf(new Date(now.getTime() - minutesAgo * 60_000))
  const groups: MonitorGroup[] = GROUPS.map((name) => ({ id: newId('group'), name }))
  const monitors: Monitor[] = MONITORS.map((item) => {
    const history: HistoryDay[] = Array.from({ length: 90 }, (_, index) => {
      const date = new Date(now.getTime() - (89 - index) * 86_400_000)
      const degraded = item.degradedDays?.includes(index) === true
      return { day: dayOf(date), state: degraded ? 'degraded' : 'up' }
    })
    const responseTimes = Array.from({ length: 24 }, (_, index) =>
      Math.max(1, Math.round(item.latency * (1 + Math.sin(index / 3 + item.latency) * 0.08 + Math.cos(index / 5) * 0.04))),
    )
    return {
      id: newId('monitor'),
      name: item.name,
      target: item.protocol === 'tcp' ? item.target.split(':')[0] ?? item.target : item.target,
      protocol: item.protocol,
      path: item.protocol === 'tcp' ? item.target.split(':')[1] ?? item.path : item.path,
      intervalSeconds: 60,
      timeoutMs: 5000,
      expectedStatus: item.protocol === 'tcp' ? 0 : 200,
      groupId: groups[item.group]?.id ?? '',
      status: item.status,
      latencyMs: item.latency,
      uptime30d: item.uptime,
      history,
      responseTimes,
      lastCheckedAt: at(0.3),
    }
  })
  const checks: Check[] = []
  for (const monitor of monitors) {
    for (let index = 0; index < 3; index++) {
      checks.push({
        id: newId('check'),
        monitorId: monitor.id,
        checkedAt: at(0.3 + index),
        statusCode: monitor.protocol === 'tcp' ? 0 : 200,
        latencyMs: monitor.responseTimes[monitor.responseTimes.length - 1 - index] ?? monitor.latencyMs,
        result: monitor.status === 'degraded' ? 'degraded' : 'up',
      })
    }
  }
  const degraded = monitors[3] as Monitor
  const incidents: Incident[] = [
    {
      id: newId('incident'),
      monitorId: degraded.id,
      startedAt: at(120),
      severity: 'medium',
      summary: 'Response time above the 1 s threshold for status.webboxes.dev.',
    },
  ]
  const resolvedMonitor = monitors[0] as Monitor
  incidents.push({
    id: newId('incident'),
    monitorId: resolvedMonitor.id,
    startedAt: at(60 * 30),
    resolvedAt: at(60 * 29),
    severity: 'low',
    summary: 'A short outage on api.webboxes.dev; resolved when the endpoint answered again.',
  })
  return { version: 1, groups, monitors, checks, incidents }
}
