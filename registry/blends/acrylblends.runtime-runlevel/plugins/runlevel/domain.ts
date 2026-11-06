/**
 * Runlevel's domain: runtime hosts, managed processes with a restart state machine, runtime families and versions, the compatibility rules between
 * them, rollouts prepared as drafts, and the lifecycle log. Pure functions and plain data; the {@link Desk} in desk.ts applies them to the saved state
 * and the pages only read what it returns.
 *
 * Everything is simulated: no process is touched and no runtime is installed.
 */

export interface Host {
  readonly id: string
  readonly city: string
  readonly kind: 'process' | 'module'
  readonly cpuPercent: number
  readonly memoryGb: number
  readonly availability: number
}

export type ProcessStatus = 'running' | 'degraded' | 'restarting' | 'stopped'

export interface ManagedProcess {
  readonly id: string
  readonly name: string
  readonly hostId: string
  readonly family: string
  readonly version: string
  readonly status: ProcessStatus
  readonly restarts: number
}

/** Whether moving a workload from one runtime version to another is known to work. */
export type Verdict = 'verified' | 'review' | 'blocked'

export interface CompatibilityRule {
  readonly id: string
  readonly workload: string
  readonly family: string
  readonly current: string
  readonly target: string
  /** The runtime major version the rule is about: a rollout to this major is judged by it. */
  readonly toMajor: number
  readonly verdict: Verdict
  readonly note: string
}

export type RolloutState = 'draft' | 'succeeded' | 'rolled-back'

export interface Rollout {
  readonly id: string
  readonly processId: string
  readonly hostId: string
  readonly family: string
  readonly version: string
  readonly from: string
  readonly at: string
  readonly state: RolloutState
}

export interface LifecycleEvent {
  readonly id: string
  readonly at: string
  readonly text: string
  readonly processId?: string
}

export interface RunState {
  readonly version: 1
  readonly hosts: readonly Host[]
  readonly processes: readonly ManagedProcess[]
  readonly rules: readonly CompatibilityRule[]
  readonly rollouts: readonly Rollout[]
  readonly events: readonly LifecycleEvent[]
}

export class RunError extends Error {
  override readonly name = 'RunError'
  readonly code: 'invalid' | 'not-found' | 'conflict'
  constructor(code: 'invalid' | 'not-found' | 'conflict', message: string) {
    super(message)
    this.code = code
  }
}

export const STATUS_LABEL: Readonly<Record<ProcessStatus, string>> = { running: 'Running', degraded: 'Degraded', restarting: 'Restarting', stopped: 'Stopped' }
export const VERDICT_LABEL: Readonly<Record<Verdict, string>> = { verified: 'Verified', review: 'Review', blocked: 'Blocked' }
export const ROLLOUT_LABEL: Readonly<Record<RolloutState, string>> = { draft: 'Draft', succeeded: 'Succeeded', 'rolled-back': 'Rolled back' }

/** The families a runtime desk manages, with the label of their long-term-support line. */
export const FAMILY_LABEL: Readonly<Record<string, string>> = { 'Node.js': 'Node.js 22 LTS', JVM: 'JVM 21', '.NET': '.NET 9', Wasmtime: 'Wasmtime 28' }

/** A host's workloads are "processes", or "modules" on a WebAssembly host. */
export const unitWord = (host: Host, n: number): string => (host.kind === 'module' ? (n === 1 ? 'module' : 'modules') : n === 1 ? 'process' : 'processes')

// ---- versions ---------------------------------------------------------------------------------------------------------------------------------

/** Compare two dotted versions numerically: negative when a is older. */
export function compareVersions(a: string, b: string): number {
  const x = a.split('.').map(Number)
  const y = b.split('.').map(Number)
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    const d = (x[i] ?? 0) - (y[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

export const isVersion = (v: string): boolean => /^\d+(\.\d+){0,2}$/.test(v)

/** Which rule covers a process moving to a version: the rule for its family whose target major is the version's major. */
export function ruleFor(rules: readonly CompatibilityRule[], process: Pick<ManagedProcess, 'family'>, version: string): CompatibilityRule | undefined {
  const major = Number(version.split('.')[0])
  return rules.find((r) => r.family === process.family && r.toMajor === major)
}

/** What a rollout of a process to a version needs: refused when blocked or not newer; flagged for review when the rule says so. */
export function rolloutCheck(rules: readonly CompatibilityRule[], process: ManagedProcess, version: string): { ok: boolean; message: string; rule?: CompatibilityRule } {
  if (!isVersion(version)) return { ok: false, message: 'A version is numbers and dots, like 22.12.0.' }
  if (compareVersions(version, process.version) <= 0) return { ok: false, message: `${version} is not newer than ${process.name}'s ${process.version}.` }
  const rule = ruleFor(rules, process, version)
  if (rule?.verdict === 'blocked') return { ok: false, message: `${rule.workload} is blocked from ${rule.target}: ${rule.note}`, rule }
  return { ok: true, message: rule?.verdict === 'review' ? `${rule.workload} to ${rule.target} needs a review: ${rule.note}` : 'Compatible.', ...(rule === undefined ? {} : { rule }) }
}

// ---- display ----------------------------------------------------------------------------------------------------------------------------------

export const gb = (n: number): string => `${n.toFixed(1)} GB`

/** The process counts per family across all hosts, for the runtime-families list. */
export function familyCounts(processes: readonly ManagedProcess[]): { family: string; count: number; unit: string }[] {
  return Object.keys(FAMILY_LABEL).map((family) => ({ family, count: processes.filter((p) => p.family === family).length, unit: family === 'Wasmtime' ? 'modules' : 'processes' }))
}

export function whenLabel(iso: string, now: Date): string {
  const at = new Date(iso)
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((day(now) - day(at)) / 86_400_000)
  const hm = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
  if (days === 0) return `Today · ${hm}`
  if (days === 1) return 'Yesterday'
  return at.toLocaleDateString('en-US', { month: 'short', day: '2-digit' })
}
