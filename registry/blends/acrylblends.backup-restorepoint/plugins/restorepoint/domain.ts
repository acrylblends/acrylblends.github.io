/**
 * Restorepoint's domain: protected workloads with their backup jobs and schedules, recovery points (each with a backup state and a separate integrity
 * state), retention policies, restore plans and the log of what was simulated. Backup completion, integrity verification and restore readiness are
 * three different facts: a point can be backed up and still unverified, and a verified point can still be refused a restore (capacity, destination).
 *
 * Nothing real is read, copied, deleted or restored: every operation is a simulation over seeded metadata, and a "verified" point here says nothing
 * about a real recovery point, which needs independent verification.
 */

export class OpsError extends Error {
  override readonly name = 'OpsError'
  readonly code: 'invalid' | 'not-found' | 'conflict'
  constructor(code: 'invalid' | 'not-found' | 'conflict', message: string) {
    super(message)
    this.code = code
  }
}

export type Integrity = 'verified' | 'pending' | 'failed'
export type PointKind = 'full' | 'incremental' | 'log'

export interface RecoveryPoint {
  readonly id: string
  readonly at: string
  readonly kind: PointKind
  readonly sizeGb: number
  readonly integrity: Integrity
  /** A seeded defect: verifying this point fails, as a corrupt snapshot would. */
  readonly fault?: string
}

export type JobStatus = 'completed' | 'lag' | 'failed'

export interface Job {
  readonly id: string
  readonly name: string
  readonly schedule: string
  /** Minutes between runs; the shortest enabled one decides whether the RPO is met. */
  readonly intervalMin: number
  readonly enabled: boolean
  readonly lastAt: string
  readonly lastSize: string
  readonly status: JobStatus
  readonly note?: string
}

export interface Retention {
  readonly daily: number
  readonly weekly: number
  readonly monthly: number
}

export interface Scope {
  readonly name: string
  /** The share of the point's size that would be restored. */
  readonly factor: number
}

export interface LogLine {
  readonly t: string
  readonly text: string
  readonly kind: 'info' | 'ok' | 'error'
}

export interface Workload {
  readonly id: string
  readonly name: string
  readonly icon: string
  readonly successRate: number
  readonly rpoMin: number
  readonly recoveryHours: number
  readonly retention: Retention
  readonly scopes: readonly Scope[]
  readonly points: readonly RecoveryPoint[]
  readonly jobs: readonly Job[]
  readonly log: readonly LogLine[]
}

export interface Destination {
  readonly id: 'isolated' | 'staging' | 'production'
  readonly name: string
  readonly capacityGb: number
  readonly needsApproval: boolean
}

export const DESTINATIONS: readonly Destination[] = [
  { id: 'isolated', name: 'Isolated recovery environment', capacityGb: 4000, needsApproval: false },
  { id: 'staging', name: 'New staging cluster', capacityGb: 500, needsApproval: false },
  { id: 'production', name: 'Production (requires approval)', capacityGb: 8000, needsApproval: true },
]

export interface RestoreRun {
  readonly id: string
  readonly workloadId: string
  readonly pointId: string
  readonly scope: string
  readonly destination: Destination['id']
  readonly at: string
  readonly result: 'simulated' | 'blocked'
  readonly reason?: string
}

export interface OpsState {
  readonly version: 1
  readonly org: string
  readonly workloads: readonly Workload[]
  readonly runs: readonly RestoreRun[]
  /** The last time readiness was checked (a verification), ISO. */
  readonly readinessAt: string
}

export const MAX_RUNS = 30
export const MAX_LOG = 12

export const workloadOf = (state: Pick<OpsState, 'workloads'>, id: string | undefined | null): Workload => {
  const w = state.workloads.find((x) => x.id === id)
  if (w === undefined) throw new OpsError('not-found', 'There is no such workload.')
  return w
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const two = (n: number): string => String(n).padStart(2, '0')

/** `Nov 05 · 02:00`. */
export function pointLabel(iso: string): string {
  const d = new Date(iso)
  return `${MONTHS[d.getMonth()]} ${two(d.getDate())} · ${two(d.getHours())}:${two(d.getMinutes())}`
}

/** `Today · 02:00`, `Yesterday · 02:00`, else `Nov 03 · 02:00`. */
export function whenLabel(iso: string, now: Date): string {
  const d = new Date(iso)
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((day(now) - day(d)) / 86_400_000)
  const hm = `${two(d.getHours())}:${two(d.getMinutes())}`
  return days === 0 ? `Today · ${hm}` : days === 1 ? `Yesterday · ${hm}` : pointLabel(iso)
}

export const clock = (d: Date): string => `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`

/** `07:10 UTC`. */
export const utcLabel = (iso: string): string => {
  const d = new Date(iso)
  return `${two(d.getUTCHours())}:${two(d.getUTCMinutes())} UTC`
}

export const sizeLabel = (gb: number): string => (gb >= 1000 ? `${(gb / 1000).toFixed(1)} TB` : `${gb.toFixed(1)} GB`)

/** The newest recovery point that is verified, if any: what "latest" means in the timeline. */
export const latestVerified = (w: Workload): RecoveryPoint | undefined => [...w.points].reverse().find((p) => p.integrity === 'verified')

export const newestPoint = (w: Workload): RecoveryPoint | undefined => w.points.at(-1)

/** Whether the shortest enabled job interval meets the RPO target. */
export function rpoMet(w: Workload): boolean {
  const intervals = w.jobs.filter((j) => j.enabled).map((j) => j.intervalMin)
  return intervals.length > 0 && Math.min(...intervals) <= w.rpoMin
}

/** How many days back the retention policy reaches: the daily window, then the weekly and monthly ones. */
export const horizonDays = (r: Retention): number => r.daily + r.weekly * 7 + r.monthly * 30

export interface Readiness {
  readonly ready: number
  readonly total: number
}

/** Workloads with at least one verified recovery point. */
export function readiness(state: Pick<OpsState, 'workloads'>): Readiness {
  return { ready: state.workloads.filter((w) => latestVerified(w) !== undefined).length, total: state.workloads.length }
}

export interface Preflight {
  readonly ok: boolean
  readonly checks: readonly { readonly label: string; readonly ok: boolean; readonly detail: string }[]
}

/**
 * The checks before a restore: the snapshot catalog (the point exists and its backup finished), the integrity check (verified), and the target (capacity
 * for the scope, and no approval needed). Each is reported, so a refusal names what failed.
 */
export function preflight(w: Workload, point: RecoveryPoint, scope: Scope, dest: Destination): Preflight {
  const need = Math.round(point.sizeGb * scope.factor * 10) / 10
  const checks = [
    { label: 'Snapshot catalog', ok: true, detail: `${pointLabel(point.at)} is in the catalog` },
    { label: 'Checksum', ok: point.integrity === 'verified', detail: point.integrity === 'verified' ? 'integrity verified' : point.integrity === 'failed' ? `integrity check failed${point.fault === undefined ? '' : `: ${point.fault}`}` : 'integrity not verified yet; verify the point first' },
    { label: 'Target capacity', ok: need <= dest.capacityGb, detail: need <= dest.capacityGb ? `${sizeLabel(need)} needed, ${sizeLabel(dest.capacityGb)} available` : `${sizeLabel(need)} needed, only ${sizeLabel(dest.capacityGb)} available at ${dest.name}` },
    { label: 'Approval', ok: !dest.needsApproval, detail: dest.needsApproval ? 'production restores need an approved change; not available in this simulation' : 'not required' },
  ]
  return { ok: checks.every((c) => c.ok), checks }
}

export function parseRetention(raw: { daily?: string | undefined; weekly?: string | undefined; monthly?: string | undefined }): Retention {
  const num = (text: string | undefined, label: string, max: number): number => {
    const n = Number((text ?? '').trim())
    if (!Number.isInteger(n) || n < 0 || n > max) throw new OpsError('invalid', `${label} must be a whole number from 0 to ${String(max)}.`)
    return n
  }
  const r = { daily: num(raw.daily, 'Daily points', 90), weekly: num(raw.weekly, 'Weekly points', 52), monthly: num(raw.monthly, 'Monthly points', 36) }
  if (r.daily < 1) throw new OpsError('invalid', 'Keep at least one daily point.')
  return r
}

export function parseRpo(raw: string | undefined): number {
  const n = Number((raw ?? '').trim())
  if (!Number.isInteger(n) || n < 5 || n > 1440) throw new OpsError('invalid', 'The RPO target must be a whole number of minutes from 5 to 1440.')
  return n
}
