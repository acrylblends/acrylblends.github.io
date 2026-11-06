/**
 * The lab (`ctx.lab`): the saved calibrations, runs and observations, and every change to them. A change checks its input, builds the next state, saves
 * it through the store and only then makes it current, so a failed save leaves the lab as it was. Which modality is open is the page's `?modality=`.
 */
import {
  type Comparison,
  type LabState,
  type Modality,
  type ModalityId,
  type Observation,
  type Run,
  type Settings,
  LabError,
  MAX_OBSERVATIONS,
  MAX_RUNS,
  compareObservations,
  defaultSettings,
  modalityOf,
  parseSettings,
  runEvents,
  runSummary,
  simulate,
} from './domain.ts'
import { seed } from './seed.ts'
import type { LabStore } from './store.ts'

export interface LabAdapters {
  readonly store: LabStore
  readonly clock: () => Date
  readonly newId: (kind: 'run' | 'observation') => string
}

export interface RawSettings {
  readonly variant?: string | undefined
  readonly sensitivity?: string | undefined
  readonly feedback?: string | undefined
}

export class Lab {
  #state: LabState
  readonly #adapters: LabAdapters

  private constructor(state: LabState, adapters: LabAdapters) {
    this.#state = state
    this.#adapters = adapters
  }

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

  modality(id: string | undefined): Modality {
    return modalityOf(id)
  }

  settings(id: ModalityId): Settings {
    return this.#state.settings[id]
  }

  /** The most recent run of a modality, if any. */
  latestRun(id: ModalityId): Run | undefined {
    return [...this.#state.runs].reverse().find((r) => r.modality === id)
  }

  async #commit(next: LabState): Promise<void> {
    await this.#adapters.store.save(next)
    this.#state = next
  }

  #withSettings(id: ModalityId, s: Settings): LabState {
    return { ...this.#state, settings: { ...this.#state.settings, [id]: s } }
  }

  /** Save a calibration (any of variant, sensitivity, feedback). */
  async calibrate(id: string, raw: RawSettings): Promise<Settings> {
    const m = modalityOf(id)
    const next = parseSettings(raw, this.settings(m.id))
    await this.#commit(this.#withSettings(m.id, next))
    return next
  }

  /** Put a modality's calibration back to the default. */
  async reset(id: string): Promise<void> {
    const m = modalityOf(id)
    await this.#commit(this.#withSettings(m.id, defaultSettings()))
  }

  /** Apply any settings the form carries, then run the task simulation once; the calibration and the run are saved together. */
  async run(id: string, raw: RawSettings = {}): Promise<Run> {
    const m = modalityOf(id)
    const settings = parseSettings(raw, this.settings(m.id))
    const result = simulate(m, settings)
    const run: Run = {
      id: this.#adapters.newId('run'),
      modality: m.id,
      settings,
      completion: result.completion,
      latency: result.latency,
      outcome: result.outcome,
      summary: runSummary(m, settings, result.outcome),
      events: runEvents(result.latency, result.outcome),
      at: this.now().toISOString(),
    }
    await this.#commit({ ...this.#withSettings(m.id, settings), runs: [...this.#state.runs, run].slice(-MAX_RUNS) })
    return run
  }

  /** Save the modality's latest run as an observation with a note (the run's summary when the note is empty). */
  async saveObservation(id: string, rawNote: string | undefined): Promise<Observation> {
    const m = modalityOf(id)
    const run = this.latestRun(m.id)
    if (run === undefined) throw new LabError('conflict', `Run the ${m.name} task simulation first; there is nothing to observe yet.`)
    const note = (rawNote ?? '').trim()
    if (note.length > 200) throw new LabError('invalid', 'An observation note is at most 200 characters.')
    if (this.#state.observations.some((o) => o.runId === run.id)) throw new LabError('conflict', 'That run is already saved as an observation. Run the task again for a new one.')
    if (this.#state.observations.length >= MAX_OBSERVATIONS) throw new LabError('conflict', `At most ${String(MAX_OBSERVATIONS)} observations can be kept; delete one first.`)
    const observation: Observation = {
      id: this.#adapters.newId('observation'),
      modality: m.id,
      runId: run.id,
      note: note === '' ? run.summary : note,
      settings: run.settings,
      completion: run.completion,
      latency: run.latency,
      at: this.now().toISOString(),
    }
    await this.#commit({ ...this.#state, observations: [...this.#state.observations, observation] })
    return observation
  }

  async deleteObservation(id: string): Promise<void> {
    if (!this.#state.observations.some((o) => o.id === id)) throw new LabError('not-found', 'There is no such observation.')
    await this.#commit({ ...this.#state, observations: this.#state.observations.filter((o) => o.id !== id) })
  }

  compare(aId: string | undefined, bId: string | undefined): Comparison {
    const find = (id: string | undefined): Observation => {
      const o = this.#state.observations.find((x) => x.id === id)
      if (o === undefined) throw new LabError('not-found', 'Pick two saved observations to compare.')
      return o
    }
    const a = find(aId)
    const b = find(bId)
    if (a.id === b.id) throw new LabError('invalid', 'Pick two different observations to compare.')
    return compareObservations(a, b)
  }
}
