/**
 * The audit (`ctx.audit`): the saved findings, view settings and runs, and every change to them. A change checks its input, builds the next state, saves
 * it through the store and only then makes it current, so a failed save leaves the audit as it was. The open finding and the filter are the page's query.
 */
import {
  type AuditState,
  type Issue,
  type Run,
  type Setting,
  AuditError,
  MAX_RUNS,
  SETTINGS,
  runSummary,
  scoreOf,
  summarize,
} from './domain.ts'
import { seed } from './seed.ts'
import type { AuditStore } from './store.ts'

export interface AuditAdapters {
  readonly store: AuditStore
  readonly clock: () => Date
  readonly newId: (kind: 'run') => string
}

export class Audit {
  #state: AuditState
  readonly #adapters: AuditAdapters

  private constructor(state: AuditState, adapters: AuditAdapters) {
    this.#state = state
    this.#adapters = adapters
  }

  static async open(adapters: AuditAdapters): Promise<Audit> {
    const saved = await adapters.store.load()
    if (saved !== undefined) return new Audit(saved, adapters)
    const state = seed(adapters.clock())
    await adapters.store.save(state)
    return new Audit(state, adapters)
  }

  get state(): AuditState {
    return this.#state
  }

  now(): Date {
    return this.#adapters.clock()
  }

  issue(id: string): Issue {
    const issue = this.#state.issues.find((i) => i.id === id)
    if (issue === undefined) throw new AuditError('not-found', 'There is no such finding.')
    return issue
  }

  /** The most recent run: the score the summary shows until the next re-run. */
  lastRun(): Run | undefined {
    return this.#state.runs.at(-1)
  }

  async #commit(next: AuditState): Promise<void> {
    await this.#adapters.store.save(next)
    this.#state = next
  }

  async #replace(issue: Issue): Promise<void> {
    await this.#commit({ ...this.#state, issues: this.#state.issues.map((i) => (i.id === issue.id ? issue : i)) })
  }

  /** Mark a finding resolved (the fix is applied to the sample page) or reopen it. */
  async setResolved(id: string, resolved: boolean): Promise<Issue> {
    const old = this.issue(id)
    if (old.resolved === resolved) return old
    const { resolvedAt: _drop, ...rest } = old
    const next: Issue = resolved ? { ...rest, resolved, resolvedAt: this.now().toISOString() } : { ...rest, resolved }
    await this.#replace(next)
    return next
  }

  async setQueued(id: string, queued: boolean): Promise<Issue> {
    const old = this.issue(id)
    if (old.queued === queued) return old
    const next: Issue = { ...old, queued }
    await this.#replace(next)
    return next
  }

  async togglePreview(raw: string | undefined): Promise<{ setting: Setting; on: boolean }> {
    const setting = (Object.keys(SETTINGS) as Setting[]).find((s) => s === raw)
    if (setting === undefined) throw new AuditError('invalid', 'Pick a preview setting from the list.')
    const on = !this.#state.preview[setting]
    await this.#commit({ ...this.#state, preview: { ...this.#state.preview, [setting]: on } })
    return { setting, on }
  }

  /** Re-run the local checklist: record the heuristic score of the findings as they stand now. */
  async rerun(): Promise<Run> {
    const score = scoreOf(this.#state.issues)
    const s = summarize(this.#state.issues)
    const run: Run = { id: this.#adapters.newId('run'), at: this.now().toISOString(), score, open: s.open, resolved: s.resolved, summary: runSummary(score, this.lastRun()?.score, s) }
    await this.#commit({ ...this.#state, runs: [...this.#state.runs, run].slice(-MAX_RUNS) })
    return run
  }
}
