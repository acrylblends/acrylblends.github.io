/**
 * The operations state (`ctx.ops`): the saved workloads, runs and logs, and every change to them. A change checks its input, builds the next state,
 * saves it through the store and only then makes it current, so a failed save leaves it as it was. The open workload, point, scope and destination are
 * the page's query, not saved. Every operation is a simulation: nothing is read, copied or restored.
 */
import {
  type Destination,
  type LogLine,
  type OpsState,
  type Preflight,
  type RecoveryPoint,
  type RestoreRun,
  type Retention,
  type Workload,
  DESTINATIONS,
  MAX_LOG,
  MAX_RUNS,
  OpsError,
  clock,
  newestPoint,
  parseRetention,
  parseRpo,
  pointLabel,
  preflight,
  workloadOf,
} from './domain.ts'
import { seed } from './seed.ts'
import type { OpsStore } from './store.ts'

export interface OpsAdapters {
  readonly store: OpsStore
  readonly clock: () => Date
  readonly newId: (kind: 'run') => string
}

export class Ops {
  #state: OpsState
  readonly #adapters: OpsAdapters

  private constructor(state: OpsState, adapters: OpsAdapters) {
    this.#state = state
    this.#adapters = adapters
  }

  static async open(adapters: OpsAdapters): Promise<Ops> {
    const saved = await adapters.store.load()
    if (saved !== undefined) return new Ops(saved, adapters)
    const state = seed()
    await adapters.store.save(state)
    return new Ops(state, adapters)
  }

  get state(): OpsState {
    return this.#state
  }

  now(): Date {
    return this.#adapters.clock()
  }

  workload(id: string | undefined | null): Workload {
    return workloadOf(this.#state, id)
  }

  point(workloadId: string, pointId: string | undefined | null): RecoveryPoint {
    const p = this.workload(workloadId).points.find((x) => x.id === pointId)
    if (p === undefined) throw new OpsError('not-found', 'There is no such recovery point.')
    return p
  }

  destination(id: string | undefined | null): Destination {
    const d = DESTINATIONS.find((x) => x.id === id)
    if (d === undefined) throw new OpsError('not-found', 'There is no such destination.')
    return d
  }

  async #commit(next: OpsState): Promise<void> {
    await this.#adapters.store.save(next)
    this.#state = next
  }

  #with(w: Workload, extra: Partial<OpsState> = {}): OpsState {
    return { ...this.#state, ...extra, workloads: this.#state.workloads.map((x) => (x.id === w.id ? w : x)) }
  }

  /** Log lines one second apart from now, kept to the last {@link MAX_LOG}. */
  #logged(w: Workload, lines: readonly Pick<LogLine, 'text' | 'kind'>[]): Workload {
    const start = this.now().getTime()
    const added = lines.map((l, i) => ({ ...l, t: clock(new Date(start + i * 1000)) }))
    return { ...w, log: [...w.log, ...added].slice(-MAX_LOG) }
  }

  /** The restore plan's preflight for a selection, without running anything. */
  plan(workloadId: string, pointId: string, scopeName: string | undefined, destId: string | undefined): Preflight {
    const w = this.workload(workloadId)
    const scope = w.scopes.find((s) => s.name === scopeName) ?? w.scopes[0]
    if (scope === undefined) throw new OpsError('not-found', 'The workload has no restore scope.')
    return preflight(w, this.point(workloadId, pointId), scope, this.destination(destId ?? 'isolated'))
  }

  /**
   * Verify a recovery point (the newest one when none is named) in the local simulation: the catalog and checksum are checked; a seeded defect fails
   * the check. A pass makes the point verified and records the readiness check.
   */
  async verify(workloadId: string, pointId?: string): Promise<{ point: RecoveryPoint; ok: boolean }> {
    const w = this.workload(workloadId)
    const p = pointId === undefined ? newestPoint(w) : this.point(workloadId, pointId)
    if (p === undefined) throw new OpsError('not-found', 'This workload has no recovery points yet.')
    const label = pointLabel(p.at)
    if (p.fault !== undefined) {
      const failed = this.#logged(w, [{ text: `Verification started · ${label}`, kind: 'info' }, { text: `✗ ${p.fault}`, kind: 'error' }, { text: 'Point stays unverified; take a new backup', kind: 'error' }])
      await this.#commit(this.#with({ ...failed, points: failed.points.map((x) => (x.id === p.id ? { ...x, integrity: 'failed' as const } : x)) }))
      return { point: this.point(workloadId, p.id), ok: false }
    }
    const ok = this.#logged(w, [{ text: `Verification started · ${label}`, kind: 'info' }, { text: '✓ Verification simulation complete', kind: 'ok' }, { text: '✓ Catalog and checksum passed', kind: 'ok' }])
    await this.#commit(this.#with({ ...ok, points: ok.points.map((x) => (x.id === p.id ? { ...x, integrity: 'verified' as const } : x)) }, { readinessAt: this.now().toISOString() }))
    return { point: this.point(workloadId, p.id), ok: true }
  }

  /**
   * Preview a restore: assemble the plan, run the preflight checks and record the run. A failed check blocks the simulation and says which; nothing is
   * ever restored either way.
   */
  async restore(workloadId: string, pointId: string, scopeName: string | undefined, destId: string | undefined): Promise<RestoreRun> {
    const w = this.workload(workloadId)
    const p = this.point(workloadId, pointId)
    const scope = w.scopes.find((s) => s.name === scopeName)
    if (scope === undefined) throw new OpsError('invalid', 'Pick a restore scope from the list.')
    const dest = this.destination(destId)
    const pre = preflight(w, p, scope, dest)
    const failed = pre.checks.find((c) => !c.ok)
    const head: Pick<LogLine, 'text' | 'kind'>[] = [{ text: 'Plan assembled', kind: 'info' }, { text: `Scope: ${scope.name}`, kind: 'info' }, { text: `Target: ${dest.name}`, kind: 'info' }]
    const tail: Pick<LogLine, 'text' | 'kind'>[] = failed === undefined ? [{ text: '✓ Preflight checks passed', kind: 'ok' }, { text: '✓ Restore simulation complete', kind: 'ok' }] : [{ text: `✗ Preflight failed · ${failed.label}: ${failed.detail}`, kind: 'error' }]
    const run: RestoreRun = {
      id: this.#adapters.newId('run'),
      workloadId,
      pointId,
      scope: scope.name,
      destination: dest.id,
      at: this.now().toISOString(),
      result: failed === undefined ? 'simulated' : 'blocked',
      ...(failed === undefined ? {} : { reason: `${failed.label}: ${failed.detail}` }),
    }
    await this.#commit(this.#with(this.#logged(w, [...head, ...tail]), { runs: [...this.#state.runs, run].slice(-MAX_RUNS) }))
    return run
  }

  async setRetention(workloadId: string, raw: { daily?: string | undefined; weekly?: string | undefined; monthly?: string | undefined; rpo?: string | undefined }): Promise<Workload> {
    const w = this.workload(workloadId)
    const retention: Retention = parseRetention(raw)
    const rpoMin = parseRpo(raw.rpo)
    const next = { ...w, retention, rpoMin }
    await this.#commit(this.#with(next))
    return next
  }

  async setJobEnabled(workloadId: string, jobId: string, enabled: boolean): Promise<Workload> {
    const w = this.workload(workloadId)
    const job = w.jobs.find((j) => j.id === jobId)
    if (job === undefined) throw new OpsError('not-found', 'There is no such backup job.')
    if (job.enabled === enabled) return w
    const next = this.#logged({ ...w, jobs: w.jobs.map((j) => (j.id === jobId ? { ...j, enabled } : j)) }, [{ text: `${job.name} ${enabled ? 'resumed' : 'paused'}`, kind: 'info' }])
    await this.#commit(this.#with(next))
    return next
  }
}
