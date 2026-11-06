/**
 * The lab (`ctx.lab`): the saved state and every change to it. Each change checks its input, builds the next state, saves it through the store and
 * only then makes it current, so a failed save leaves the lab as it was.
 */
import {
  BASELINE,
  checkName,
  type LabState,
  LabError,
  type Model,
  type ParameterSet,
  parseParams,
  type SimulationRun,
  type Snapshot,
  sameParams,
  simulate,
} from './domain.ts'
import { seed } from './seed.ts'
import type { LabStore } from './store.ts'

export interface LabAdapters {
  readonly store: LabStore
  readonly clock: () => Date
  readonly newId: (kind: 'run' | 'snapshot' | 'model') => string
}

export class Lab {
  #state: LabState
  readonly #adapters: LabAdapters

  private constructor(state: LabState, adapters: LabAdapters) {
    this.#state = state
    this.#adapters = adapters
  }

  /** Open the lab over its store; the first start saves the seed at once. */
  static async open(adapters: LabAdapters): Promise<Lab> {
    const saved = await adapters.store.load()
    if (saved !== undefined) return new Lab(saved, adapters)
    const state = seed(adapters.clock())
    await adapters.store.save(state)
    return new Lab(state, adapters)
  }

  get state(): LabState {
    return this.#state
  }

  now(): Date {
    return this.#adapters.clock()
  }

  models(): readonly Model[] {
    return this.#state.models
  }

  activeModel(): Model {
    const model = this.#state.models.find((m) => m.id === this.#state.activeModelId)
    if (model === undefined) throw new LabError('not-found', 'The active model is missing.')
    return model
  }

  model(id: string): Model {
    const model = this.#state.models.find((m) => m.id === id)
    if (model === undefined) throw new LabError('not-found', 'There is no such model.')
    return model
  }

  /** Runs, newest first; only the active model's when `scope` is `active`. */
  runs(scope: 'all' | 'active' = 'all'): readonly SimulationRun[] {
    const runs = [...this.#state.runs].sort((a, b) => b.number - a.number)
    return scope === 'all' ? runs : runs.filter((run) => run.modelId === this.#state.activeModelId)
  }

  run(id: string): SimulationRun {
    const run = this.#state.runs.find((r) => r.id === id)
    if (run === undefined) throw new LabError('not-found', 'There is no such run.')
    return run
  }

  /** The newest run of the active model, if it has one. */
  latestRun(): SimulationRun | undefined {
    return this.runs('active')[0]
  }

  snapshots(): readonly Snapshot[] {
    return [...this.#state.snapshots].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async #commit(next: LabState): Promise<void> {
    await this.#adapters.store.save(next)
    this.#state = next
  }

  /** Change the setup's parameters without running. */
  async setDraft(fields: Readonly<Record<string, string | undefined>>): Promise<ParameterSet> {
    const draft = parseParams(fields)
    await this.#commit({ ...this.#state, draft, dirty: !this.#matchesLatest(draft) })
    return draft
  }

  #matchesLatest(params: ParameterSet): boolean {
    const latest = this.latestRun()
    return latest !== undefined && sameParams(latest.params, params)
  }

  /** Put the baseline back in the setup. */
  async resetDraft(): Promise<void> {
    await this.#commit({ ...this.#state, draft: BASELINE, dirty: !this.#matchesLatest(BASELINE) })
  }

  /** Run the model with these parameters (they become the draft), and keep the run. */
  async runSimulation(fields: Readonly<Record<string, string | undefined>>, rawName?: string): Promise<SimulationRun> {
    const params = parseParams(fields)
    const number = Math.max(0, ...this.#state.runs.map((r) => r.number)) + 1
    const name = rawName === undefined || rawName.trim() === '' ? `Run` : checkName(rawName, 'run')
    const { summary, trace } = simulate(params)
    const run: SimulationRun = {
      id: this.#adapters.newId('run'),
      modelId: this.#state.activeModelId,
      number,
      name,
      createdAt: this.now().toISOString(),
      params,
      summary,
      trace,
    }
    await this.#commit({ ...this.#state, draft: params, dirty: false, runs: [...this.#state.runs, run] })
    return run
  }

  /** Make another model the one the setup runs. */
  async selectModel(id: string): Promise<Model> {
    const model = this.model(id)
    await this.#commit({ ...this.#state, activeModelId: model.id, dirty: !this.#matchesLatestOf(model.id, this.#state.draft) })
    return model
  }

  #matchesLatestOf(modelId: string, params: ParameterSet): boolean {
    const latest = this.runs('all').find((run) => run.modelId === modelId)
    return latest !== undefined && sameParams(latest.params, params)
  }

  /** Add a model to the library and select it. */
  async createModel(rawName: string | undefined, rawKind: string | undefined): Promise<Model> {
    const name = checkName(rawName, 'model')
    if (this.#state.models.some((m) => m.name.toLowerCase() === name.toLowerCase()))
      throw new LabError('invalid', `There is already a model called “${name}”.`)
    const kind = rawKind === 'airflow' ? 'Airflow chamber · 2D' : 'Thermal enclosure · 2D'
    const model: Model = { id: this.#adapters.newId('model'), name, kind }
    await this.#commit({ ...this.#state, models: [...this.#state.models, model], activeModelId: model.id, dirty: true })
    return model
  }

  /** Save the setup's current parameters as a named snapshot. */
  async saveSnapshot(rawName: string | undefined): Promise<Snapshot> {
    const name = checkName(rawName, 'snapshot')
    const snapshot: Snapshot = {
      id: this.#adapters.newId('snapshot'),
      modelId: this.#state.activeModelId,
      name,
      createdAt: this.now().toISOString(),
      params: this.#state.draft,
    }
    await this.#commit({ ...this.#state, snapshots: [...this.#state.snapshots, snapshot] })
    return snapshot
  }

  /** Put a snapshot's parameters (and its model) back in the setup. */
  async loadSnapshot(id: string): Promise<Snapshot> {
    const snapshot = this.#state.snapshots.find((s) => s.id === id)
    if (snapshot === undefined) throw new LabError('not-found', 'There is no such snapshot.')
    const modelId = this.#state.models.some((m) => m.id === snapshot.modelId) ? snapshot.modelId : this.#state.activeModelId
    await this.#commit({
      ...this.#state,
      activeModelId: modelId,
      draft: snapshot.params,
      dirty: !this.#matchesLatestOf(modelId, snapshot.params),
    })
    return snapshot
  }

  async deleteSnapshot(id: string): Promise<void> {
    if (!this.#state.snapshots.some((s) => s.id === id)) throw new LabError('not-found', 'There is no such snapshot.')
    await this.#commit({ ...this.#state, snapshots: this.#state.snapshots.filter((s) => s.id !== id) })
  }
}
