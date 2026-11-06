/**
 * The studio (`ctx.studio`): the saved state and every change to it. A change checks its input, builds the next state, saves it through the store and
 * only then makes it current, so a failed save leaves the studio as it was.
 */
import {
  type Connector,
  type Mapping,
  type Pipeline,
  type RunLine,
  type StudioState,
  StudioError,
  type SyncRun,
  type TransformId,
  TRANSFORMS,
  missingRequired,
  simulate,
  suggestMappings,
} from './domain.ts'
import { seed } from './seed.ts'
import type { StudioStore } from './store.ts'

export interface StudioAdapters {
  readonly store: StudioStore
  readonly clock: () => Date
  readonly newId: (kind: 'run' | 'pipeline') => string
}

export class Studio {
  #state: StudioState
  readonly #adapters: StudioAdapters

  private constructor(state: StudioState, adapters: StudioAdapters) {
    this.#state = state
    this.#adapters = adapters
  }

  static async open(adapters: StudioAdapters): Promise<Studio> {
    const saved = await adapters.store.load()
    if (saved !== undefined) return new Studio(saved, adapters)
    const state = seed(adapters.clock())
    await adapters.store.save(state)
    return new Studio(state, adapters)
  }

  get state(): StudioState {
    return this.#state
  }

  now(): Date {
    return this.#adapters.clock()
  }

  connector(id: string): Connector {
    const c = this.#state.connectors.find((x) => x.id === id)
    if (c === undefined) throw new StudioError('not-found', 'There is no such connector.')
    return c
  }

  pipeline(id: string): Pipeline {
    const p = this.#state.pipelines.find((x) => x.id === id)
    if (p === undefined) throw new StudioError('not-found', 'There is no such pipeline.')
    return p
  }

  /** Newest first. */
  runs(pipelineId?: string): readonly SyncRun[] {
    return this.#state.runs.filter((r) => pipelineId === undefined || r.pipelineId === pipelineId).sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id))
  }

  latestRun(pipelineId: string): SyncRun | undefined {
    return this.runs(pipelineId)[0]
  }

  async #commit(next: StudioState): Promise<void> {
    await this.#adapters.store.save(next)
    this.#state = next
  }

  #edit(pipeline: Pipeline, change: Partial<Pipeline>): Pipeline {
    return { ...pipeline, ...change, dirty: true, editedBy: 'You', editedAt: this.now().toISOString() }
  }

  #replace(pipeline: Pipeline): readonly Pipeline[] {
    return this.#state.pipelines.map((p) => (p.id === pipeline.id ? pipeline : p))
  }

  async connect(id: string, connected: boolean): Promise<Connector> {
    const c = this.connector(id)
    if (c.connected === connected) throw new StudioError('conflict', `${c.name} is already ${connected ? 'connected' : 'disconnected'}.`)
    if (!connected && this.#state.pipelines.some((p) => p.sourceId === id || p.destinationId === id)) throw new StudioError('conflict', `${c.name} is used by a pipeline; change the pipeline first.`)
    const next = { ...c, connected }
    await this.#commit({ ...this.#state, connectors: this.#state.connectors.map((x) => (x.id === id ? next : x)) })
    return next
  }

  /** Make a new, empty pipeline between two connected connectors; the plan limits how many a workspace can have. */
  async createPipeline(fields: Readonly<Record<string, string | undefined>>): Promise<Pipeline> {
    const name = (fields.name ?? '').trim()
    if (name === '') throw new StudioError('invalid', 'Give the pipeline a name.')
    if (name.length > 40) throw new StudioError('invalid', 'A pipeline name is at most 40 characters.')
    if (this.#state.pipelines.length >= this.#state.planLimit) throw new StudioError('conflict', `The Team plan allows ${String(this.#state.planLimit)} flows.`)
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    if (id === '' || this.#state.pipelines.some((p) => p.id === id)) throw new StudioError('conflict', `There is already a pipeline called ${name}.`)
    const { source, destination } = this.#ends(fields.sourceId, fields.destinationId)
    const pipeline: Pipeline = { id, name, sourceId: source.id, destinationId: destination.id, mappings: [], version: 1, dirty: true, editedBy: 'You', editedAt: this.now().toISOString() }
    await this.#commit({ ...this.#state, pipelines: [...this.#state.pipelines, pipeline] })
    return pipeline
  }

  #ends(sourceId: string | undefined, destinationId: string | undefined): { source: Connector; destination: Connector } {
    const source = this.connector(sourceId ?? '')
    const destination = this.connector(destinationId ?? '')
    if (source.role !== 'source') throw new StudioError('invalid', `${source.name} is a destination; pick a source.`)
    if (destination.role !== 'destination') throw new StudioError('invalid', `${destination.name} is a source; pick a destination.`)
    if (!source.connected) throw new StudioError('conflict', `${source.name} is not connected; connect it first.`)
    if (!destination.connected) throw new StudioError('conflict', `${destination.name} is not connected; connect it first.`)
    return { source, destination }
  }

  /** Change a pipeline's source and destination. Its mappings no longer apply, so they are replaced by the suggested ones. */
  async setEnds(id: string, sourceId: string | undefined, destinationId: string | undefined): Promise<Pipeline> {
    const pipeline = this.pipeline(id)
    const { source, destination } = this.#ends(sourceId, destinationId)
    const next = this.#edit(pipeline, { sourceId: source.id, destinationId: destination.id, mappings: suggestMappings(source, destination) })
    await this.#commit({ ...this.#state, pipelines: this.#replace(next) })
    return next
  }

  /** Add a field mapping; the fields must exist, the transform must suit the destination's type and a destination is filled once. */
  async addMapping(id: string, fields: Readonly<Record<string, string | undefined>>): Promise<Pipeline> {
    const pipeline = this.pipeline(id)
    const source = this.connector(pipeline.sourceId)
    const destination = this.connector(pipeline.destinationId)
    const s = source.fields.find((x) => x.name === fields.source)
    const d = destination.fields.find((x) => x.name === fields.destination)
    if (s === undefined) throw new StudioError('invalid', 'Pick a source field from the list.')
    if (d === undefined) throw new StudioError('invalid', 'Pick a destination field from the list.')
    const transform = (fields.transform ?? 'none') as TransformId
    if (!(transform in TRANSFORMS)) throw new StudioError('invalid', 'Pick a transform from the list.')
    if (!TRANSFORMS[transform].types.includes(d.type)) throw new StudioError('invalid', `${TRANSFORMS[transform].label} does not apply to ${d.name} (${d.type}).`)
    if (pipeline.mappings.some((m) => m.destination === d.name)) throw new StudioError('conflict', `${d.name} is already mapped.`)
    const mapping: Mapping = { source: s.name, transform, destination: d.name }
    const next = this.#edit(pipeline, { mappings: [...pipeline.mappings, mapping] })
    await this.#commit({ ...this.#state, pipelines: this.#replace(next) })
    return next
  }

  async removeMapping(id: string, destination: string | undefined): Promise<Pipeline> {
    const pipeline = this.pipeline(id)
    if (!pipeline.mappings.some((m) => m.destination === destination)) throw new StudioError('not-found', `${destination ?? ''} is not mapped.`)
    const next = this.#edit(pipeline, { mappings: pipeline.mappings.filter((m) => m.destination !== destination) })
    await this.#commit({ ...this.#state, pipelines: this.#replace(next) })
    return next
  }

  /** Fill in the mappings the connectors' field names suggest, keeping the ones already there. */
  async suggest(id: string): Promise<Pipeline> {
    const pipeline = this.pipeline(id)
    const suggested = suggestMappings(this.connector(pipeline.sourceId), this.connector(pipeline.destinationId)).filter((m) => !pipeline.mappings.some((x) => x.destination === m.destination))
    if (suggested.length === 0) throw new StudioError('conflict', 'There is nothing new to suggest.')
    const next = this.#edit(pipeline, { mappings: [...pipeline.mappings, ...suggested] })
    await this.#commit({ ...this.#state, pipelines: this.#replace(next) })
    return next
  }

  /** Save the draft: the version goes up and the pipeline is no longer dirty. */
  async saveDraft(id: string): Promise<Pipeline> {
    const pipeline = this.pipeline(id)
    if (!pipeline.dirty) throw new StudioError('conflict', `${pipeline.name} has no unsaved changes.`)
    const next: Pipeline = { ...pipeline, version: pipeline.version + 1, dirty: false, editedBy: 'You', editedAt: this.now().toISOString() }
    await this.#commit({ ...this.#state, pipelines: this.#replace(next) })
    return next
  }

  /** Run the pipeline over the source's sample rows: refused when the destination's required fields are not all mapped. */
  async run(id: string): Promise<SyncRun> {
    const pipeline = this.pipeline(id)
    const source = this.connector(pipeline.sourceId)
    const destination = this.connector(pipeline.destinationId)
    if (!source.connected || !destination.connected) throw new StudioError('conflict', `${source.connected ? destination.name : source.name} is not connected.`)
    if (pipeline.mappings.length === 0) throw new StudioError('conflict', `${pipeline.name} has no field mappings yet.`)
    const missing = missingRequired(pipeline, destination)
    if (missing.length > 0) throw new StudioError('conflict', `${destination.name} requires ${missing.join(', ')}; map ${missing.length === 1 ? 'it' : 'them'} before running.`)
    const sim = simulate(pipeline, source, destination)
    const start = this.now().getTime()
    const at = (s: number) => new Date(start + s * 1000).toISOString()
    const lines: RunLine[] = [
      { at: at(0), level: 'ok', text: 'Validating pipeline' },
      { at: at(1), level: 'ok', text: `${String(sim.fetched)} records fetched` },
      { at: at(2), level: 'ok', text: `Applying ${String(pipeline.mappings.length)} field mappings` },
      ...(sim.skipped > 0 ? [{ at: at(2), level: 'warn' as const, text: `${String(sim.skipped)} rows skipped: invalid e-mail` }] : []),
      ...(sim.failed > 0 ? [{ at: at(2), level: 'err' as const, text: `${String(sim.failed)} rows failed: cannot format` }] : []),
      { at: at(3), level: sim.failed > 0 ? ('warn' as const) : ('ok' as const), text: `${String(sim.synced)} rows synced` },
    ]
    const run: SyncRun = { id: this.#adapters.newId('run'), pipelineId: id, at: this.now().toISOString(), fetched: sim.fetched, synced: sim.synced, skipped: sim.skipped, failed: sim.failed, durationSec: sim.durationSec, lines, issues: sim.issues }
    await this.#commit({ ...this.#state, runs: [...this.#state.runs, run] })
    return run
  }
}
