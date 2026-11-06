/** The operations a person sees on the first start: Northstar's four workloads, with the mockup's production database timeline (four verified daily points and a pending one) and three of four workloads ready. */
import type { Job, LogLine, OpsState, RecoveryPoint, Scope, Workload } from './domain.ts'

const at = (day: number, h: number, m = 0): string => new Date(2026, 10, day, h, m).toISOString()
const point = (id: string, when: string, kind: RecoveryPoint['kind'], sizeGb: number, integrity: RecoveryPoint['integrity'], fault?: string): RecoveryPoint => ({ id, at: when, kind, sizeGb, integrity, ...(fault === undefined ? {} : { fault }) })
const job = (j: Job): Job => j
const scopes = (a: string, b: string, c: string): Scope[] => [{ name: a, factor: 1 }, { name: b, factor: 0.3 }, { name: c, factor: 0.01 }]
const lines = (...l: [string, string][]): LogLine[] => l.map(([t, text]) => ({ t, text, kind: 'info' as const }))

const workloads: Workload[] = [
  {
    id: 'prod-db', name: 'Production database', icon: '▣', successRate: 98.7, rpoMin: 15, recoveryHours: 2.4, retention: { daily: 30, weekly: 12, monthly: 12 },
    scopes: scopes('Full database', 'Selected tables only', 'Configuration and metadata'),
    points: [point('db-1', at(2, 2), 'incremental', 36.9, 'verified'), point('db-2', at(3, 2), 'incremental', 37.5, 'verified'), point('db-3', at(4, 2), 'incremental', 38, 'verified'), point('db-4', at(5, 2), 'incremental', 38.4, 'verified'), point('db-5', at(5, 4), 'log', 1.2, 'pending')],
    jobs: [
      job({ id: 'db-snap', name: 'Daily database snapshot', schedule: 'Daily · 02:00', intervalMin: 1440, enabled: true, lastAt: at(5, 2), lastSize: '38.4 GB', status: 'completed' }),
      job({ id: 'db-log', name: 'Transaction log capture', schedule: 'Every 15 minutes', intervalMin: 15, enabled: true, lastAt: at(5, 4, 15), lastSize: '1.2 GB', status: 'completed' }),
      job({ id: 'db-repl', name: 'Cross-region replication', schedule: 'Continuous', intervalMin: 5, enabled: true, lastAt: at(5, 4, 18), lastSize: 'eu-central-1', status: 'lag', note: 'Lag 3 min' }),
    ],
    log: lines(['04:21:07', 'Recovery point selected'], ['04:21:08', 'Waiting for restore plan…']),
  },
  {
    id: 'media', name: 'Media object store', icon: '▤', successRate: 99.4, rpoMin: 60, recoveryHours: 9.5, retention: { daily: 14, weekly: 8, monthly: 6 },
    scopes: scopes('Full bucket set', 'Selected prefixes only', 'Bucket policy and metadata'),
    points: [point('media-1', at(3, 3, 30), 'incremental', 2100, 'verified'), point('media-2', at(4, 3, 30), 'incremental', 2130, 'verified'), point('media-3', at(5, 3, 30), 'incremental', 2150, 'verified')],
    jobs: [job({ id: 'media-inc', name: 'Incremental object sync', schedule: 'Every 30 minutes', intervalMin: 30, enabled: true, lastAt: at(5, 10, 30), lastSize: '4.8 GB', status: 'completed' }), job({ id: 'media-full', name: 'Weekly full inventory', schedule: 'Weekly · Sun 01:00', intervalMin: 10080, enabled: true, lastAt: at(1, 1), lastSize: '2.1 TB', status: 'completed' })],
    log: lines(['03:35:10', 'Latest point verified']),
  },
  {
    id: 'config', name: 'App configuration', icon: '⚙', successRate: 100, rpoMin: 60, recoveryHours: 0.3, retention: { daily: 30, weekly: 12, monthly: 12 },
    scopes: scopes('Full repository', 'Selected files only', 'Metadata only'),
    points: [point('cfg-1', at(4, 6), 'full', 0.2, 'verified'), point('cfg-2', at(5, 6), 'full', 0.2, 'verified')],
    jobs: [job({ id: 'cfg-snap', name: 'Configuration snapshot', schedule: 'Every 30 minutes', intervalMin: 30, enabled: true, lastAt: at(5, 10, 30), lastSize: '0.2 GB', status: 'completed' })],
    log: lines(['06:02:11', 'Latest point verified']),
  },
  {
    id: 'laptops', name: 'Developer laptops', icon: '⌘', successRate: 91.2, rpoMin: 1440, recoveryHours: 3.8, retention: { daily: 7, weekly: 4, monthly: 3 },
    scopes: scopes('Full device image', 'Selected folders only', 'Settings and dotfiles'),
    points: [point('lap-1', at(4, 1), 'incremental', 61, 'pending'), point('lap-2', at(5, 1), 'incremental', 63.2, 'failed', 'checksum mismatch in segment 14')],
    jobs: [job({ id: 'lap-inc', name: 'Nightly device backup', schedule: 'Daily · 01:00', intervalMin: 1440, enabled: true, lastAt: at(5, 1), lastSize: '63.2 GB', status: 'failed', note: 'Integrity check failed' })],
    log: lines(['01:40:03', 'Integrity check failed for Nov 05 · 01:00']),
  },
]

export function seed(): OpsState {
  return { version: 1, org: 'Northstar', workloads, runs: [], readinessAt: new Date(Date.UTC(2026, 10, 5, 7, 10)).toISOString() }
}
