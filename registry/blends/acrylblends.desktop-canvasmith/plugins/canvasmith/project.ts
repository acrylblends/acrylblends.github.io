/**
 * The project (`ctx.project`): the saved state and every change to it. A change checks its input, builds the next state, saves it through the store and
 * only then makes it current, so a failed save leaves the project as it was.
 */
import {
  type ActivityEvent,
  type Doc,
  type ExportFormat,
  type ExportRecord,
  FORMATS,
  type Layer,
  type LayerEdit,
  type LayerKind,
  MAX_DOCS,
  MAX_LAYERS,
  type ProjectState,
  ProjectError,
  SCALES,
  type Tool,
  ZOOM_STEP,
  artboardOf,
  clampZoom,
  editLayer,
  estimateKb,
  exportName,
  pageOf,
} from './domain.ts'
import { seed } from './seed.ts'
import type { ProjectStore } from './store.ts'

export interface ProjectAdapters {
  readonly store: ProjectStore
  readonly clock: () => Date
  readonly newId: (kind: 'layer' | 'doc' | 'export' | 'event') => string
}

const DEFAULTS: Readonly<Record<'frame' | 'text' | 'shape', Omit<Layer, 'id' | 'name'>>> = {
  frame: { kind: 'frame', x: 100, y: 100, w: 400, h: 300, opacity: 100, fill: '#ffffff', radius: 0, visible: true },
  text: { kind: 'text', x: 100, y: 100, w: 500, h: 80, opacity: 100, fill: '#1d292c', radius: 0, visible: true, text: 'New text', fontSize: 48 },
  shape: { kind: 'shape', x: 100, y: 100, w: 240, h: 240, opacity: 100, fill: '#c08a4e', radius: 0, visible: true },
}

export class Project {
  #state: ProjectState
  readonly #adapters: ProjectAdapters

  private constructor(state: ProjectState, adapters: ProjectAdapters) {
    this.#state = state
    this.#adapters = adapters
  }

  static async open(adapters: ProjectAdapters): Promise<Project> {
    const saved = await adapters.store.load()
    if (saved !== undefined) return new Project(saved, adapters)
    const state = seed()
    await adapters.store.save(state)
    return new Project(state, adapters)
  }

  get state(): ProjectState {
    return this.#state
  }

  now(): Date {
    return this.#adapters.clock()
  }

  doc(id: string): Doc {
    const doc = this.#state.docs.find((d) => d.id === id)
    if (doc === undefined) throw new ProjectError('not-found', 'There is no such file.')
    return doc
  }

  layer(docId: string, layerId: string): Layer {
    const layer = this.doc(docId).layers.find((l) => l.id === layerId)
    if (layer === undefined) throw new ProjectError('not-found', 'There is no such layer.')
    return layer
  }

  /** Newest first. */
  activity(limit = 5): readonly ActivityEvent[] {
    return [...this.#state.activity].reverse().slice(0, limit)
  }

  /** Newest first. */
  exports(limit = 5): readonly ExportRecord[] {
    return [...this.#state.exports].reverse().slice(0, limit)
  }

  async #commit(next: ProjectState): Promise<void> {
    await this.#adapters.store.save(next)
    this.#state = next
  }

  #event(text: string): ActivityEvent {
    return { id: this.#adapters.newId('event'), at: this.now().toISOString(), text }
  }

  #withDoc(doc: Doc, text: string, extra: Partial<ProjectState> = {}): ProjectState {
    return { ...this.#state, ...extra, docs: this.#state.docs.map((d) => (d.id === doc.id ? doc : d)), activity: [...this.#state.activity, this.#event(text)].slice(-50) }
  }

  /** Record that a file was opened. */
  async open(docId: string): Promise<Doc> {
    const doc = this.doc(docId)
    await this.#commit({ ...this.#state, activity: [...this.#state.activity, this.#event(`${doc.name} opened`)].slice(-50) })
    return doc
  }

  /** Create an empty document (an artboard only) and return it. */
  async newDoc(): Promise<Doc> {
    if (this.#state.docs.length >= MAX_DOCS) throw new ProjectError('conflict', `A project holds at most ${String(MAX_DOCS)} files.`)
    let n = 1
    while (this.#state.docs.some((d) => d.id === `untitled-${String(n)}`)) n += 1
    const doc: Doc = {
      id: `untitled-${String(n)}`,
      name: `Untitled ${String(n)}`,
      file: `untitled-${String(n)}.canvas`,
      layers: [{ id: 'artboard', name: 'Artboard', kind: 'artboard', x: 0, y: 0, w: 1200, h: 800, opacity: 100, fill: '#ffffff', radius: 0, visible: true }],
    }
    await this.#commit({ ...this.#state, docs: [...this.#state.docs, doc], activity: [...this.#state.activity, this.#event(`New artboard ${doc.name} created (demo)`)].slice(-50) })
    return doc
  }

  /** Edit a layer's properties from the inspector's form. */
  async edit(docId: string, layerId: string, edit: LayerEdit): Promise<Layer> {
    const doc = this.doc(docId)
    const layer = this.layer(docId, layerId)
    const next = editLayer(layer, edit)
    await this.#commit(this.#withDoc({ ...doc, layers: doc.layers.map((l) => (l.id === layerId ? next : l)) }, `${next.name} edited`))
    return next
  }

  async setVisible(docId: string, layerId: string, visible: boolean): Promise<Layer> {
    return this.edit(docId, layerId, { visible: visible ? 'on' : 'off' })
  }

  /** Add a frame, text or shape layer with default geometry, on top. */
  async addLayer(docId: string, kind: LayerKind): Promise<Layer> {
    const doc = this.doc(docId)
    if (kind !== 'frame' && kind !== 'text' && kind !== 'shape') throw new ProjectError('invalid', 'Pick the Frame, Text or Shape tool.')
    if (doc.layers.length >= MAX_LAYERS) throw new ProjectError('conflict', `A file holds at most ${String(MAX_LAYERS)} layers.`)
    const count = doc.layers.filter((l) => l.kind === kind).length + 1
    const label = kind === 'frame' ? 'Frame' : kind === 'text' ? 'Text' : 'Shape'
    const layer: Layer = { id: this.#adapters.newId('layer'), name: `${label} ${String(count)}`, ...DEFAULTS[kind] }
    await this.#commit(this.#withDoc({ ...doc, layers: [...doc.layers, layer] }, `${layer.name} added`))
    return layer
  }

  async deleteLayer(docId: string, layerId: string): Promise<void> {
    const doc = this.doc(docId)
    const layer = this.layer(docId, layerId)
    if (layer.kind === 'artboard') throw new ProjectError('conflict', 'The artboard cannot be deleted.')
    await this.#commit(this.#withDoc({ ...doc, layers: doc.layers.filter((l) => l.id !== layerId) }, `${layer.name} deleted`))
  }

  /** Move a layer one step towards the front (`forward`) or the back; the artboard always stays at the back. */
  async arrange(docId: string, layerId: string, direction: 'forward' | 'backward'): Promise<void> {
    const doc = this.doc(docId)
    const index = doc.layers.findIndex((l) => l.id === layerId)
    const layer = doc.layers[index]
    if (layer === undefined) throw new ProjectError('not-found', 'There is no such layer.')
    if (layer.kind === 'artboard') throw new ProjectError('conflict', 'The artboard stays at the back.')
    const target = direction === 'forward' ? index + 1 : index - 1
    if (target >= doc.layers.length) throw new ProjectError('conflict', `${layer.name} is already in front.`)
    if (target < 1) throw new ProjectError('conflict', `${layer.name} is already at the back.`)
    const layers = [...doc.layers]
    const other = layers[target]
    if (other === undefined) throw new ProjectError('conflict', 'Nothing to swap with.')
    layers[index] = other
    layers[target] = layer
    await this.#commit(this.#withDoc({ ...doc, layers }, `${layer.name} moved ${direction === 'forward' ? 'forward' : 'backward'}`))
  }

  async zoom(change: 'in' | 'out' | 'reset'): Promise<number> {
    const current = this.#state.view.zoom
    const next = change === 'reset' ? 100 : clampZoom(current + (change === 'in' ? ZOOM_STEP : -ZOOM_STEP))
    if (next === current) throw new ProjectError('conflict', change === 'reset' ? 'Zoom is already 100%.' : `Zoom stays between 70% and 130%.`)
    await this.#commit({ ...this.#state, view: { ...this.#state.view, zoom: next } })
    return next
  }

  async toggleLayers(): Promise<boolean> {
    const showLayers = !this.#state.view.showLayers
    await this.#commit({ ...this.#state, view: { ...this.#state.view, showLayers } })
    return showLayers
  }

  async setTool(tool: Tool): Promise<void> {
    await this.#commit({ ...this.#state, view: { ...this.#state.view, tool } })
  }

  /** Prepare a simulated export of a file at a scale and format; refused when nothing visible would be drawn. */
  async exportDoc(docId: string, rawFormat: string | undefined, rawScale: string | undefined): Promise<ExportRecord> {
    const doc = this.doc(docId)
    const format = FORMATS.find((f) => f === rawFormat)
    if (format === undefined) throw new ProjectError('invalid', `Pick ${FORMATS.join(', ')}.`)
    const scale = Number(rawScale ?? '1')
    if (!SCALES.includes(scale)) throw new ProjectError('invalid', 'Pick 1x or 2x.')
    if (!artboardOf(doc).visible || doc.layers.filter((l) => l.kind !== 'artboard' && l.visible).length === 0) throw new ProjectError('conflict', `${doc.name} has nothing visible to export.`)
    const { width, height } = pageOf(doc)
    const record: ExportRecord = { id: this.#adapters.newId('export'), docId, fileName: exportName(doc, scale, format), format, scale, width: width * scale, height: height * scale, kb: estimateKb(doc, scale, format as ExportFormat), at: this.now().toISOString() }
    await this.#commit({ ...this.#state, exports: [...this.#state.exports, record].slice(-20), activity: [...this.#state.activity, this.#event(`Preview export prepared · ${record.fileName} · simulated`)].slice(-50) })
    return record
  }
}
