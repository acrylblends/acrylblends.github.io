/**
 * Canvasmith's domain: a project of documents, each a page of layers (an artboard, text, images, buttons, shapes) with geometry, fill, opacity and
 * radius; the checks on every property edit, z-order, zoom, simulated exports and the activity log. Pure functions and plain data; the {@link Project}
 * in project.ts applies them to the saved state and the window only reads what it returns.
 *
 * Nothing is written to disk but the project's own JSON: an "export" is a record of what would be produced.
 */

export type LayerKind = 'artboard' | 'text' | 'image' | 'button' | 'shape' | 'frame'

export interface Layer {
  readonly id: string
  readonly name: string
  readonly kind: LayerKind
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
  /** 0 to 100. */
  readonly opacity: number
  /** `#rrggbb`: the background, or the text colour of a text layer. */
  readonly fill: string
  readonly radius: number
  readonly visible: boolean
  readonly text?: string
  readonly fontSize?: number
  readonly serif?: boolean
}

export interface Doc {
  readonly id: string
  readonly name: string
  /** `hero-poster.canvas`. */
  readonly file: string
  /** Back to front: the artboard first. */
  readonly layers: readonly Layer[]
}

export type ExportFormat = 'PNG' | 'JPG' | 'SVG'

export interface ExportRecord {
  readonly id: string
  readonly docId: string
  readonly fileName: string
  readonly format: ExportFormat
  readonly scale: number
  readonly width: number
  readonly height: number
  readonly kb: number
  readonly at: string
}

export interface ActivityEvent {
  readonly id: string
  readonly at: string
  readonly text: string
}

export type Tool = 'select' | 'frame' | 'text' | 'shape'

export interface View {
  readonly zoom: number
  readonly showLayers: boolean
  readonly tool: Tool
}

export interface ProjectState {
  readonly version: 1
  readonly name: string
  readonly docs: readonly Doc[]
  readonly exports: readonly ExportRecord[]
  readonly activity: readonly ActivityEvent[]
  readonly view: View
}

export class ProjectError extends Error {
  override readonly name = 'ProjectError'
  readonly code: 'invalid' | 'not-found' | 'conflict'
  constructor(code: 'invalid' | 'not-found' | 'conflict', message: string) {
    super(message)
    this.code = code
  }
}

export const ZOOM_MIN = 70
export const ZOOM_MAX = 130
export const ZOOM_STEP = 10
export const MAX_LAYERS = 40
export const MAX_DOCS = 12

export const KIND_ICON: Readonly<Record<LayerKind, string>> = { artboard: '▣', text: 'T', image: '◩', button: '▰', shape: '◩', frame: '▱' }

// ---- geometry ---------------------------------------------------------------------------------------------------------------------------------

export const artboardOf = (doc: Doc): Layer => {
  const first = doc.layers[0]
  if (first === undefined || first.kind !== 'artboard') throw new ProjectError('invalid', `${doc.name} has no artboard.`)
  return first
}

/** The page size of a document: its artboard's width and height. */
export const pageOf = (doc: Doc): { width: number; height: number } => {
  const a = artboardOf(doc)
  return { width: a.w, height: a.h }
}

// ---- property edits ---------------------------------------------------------------------------------------------------------------------------

export interface LayerEdit {
  readonly x?: string | undefined
  readonly y?: string | undefined
  readonly w?: string | undefined
  readonly h?: string | undefined
  readonly opacity?: string | undefined
  readonly fill?: string | undefined
  readonly radius?: string | undefined
  readonly visible?: string | undefined
  readonly text?: string | undefined
  readonly name?: string | undefined
}

const int = (raw: string | undefined, label: string, min: number, max: number): number => {
  const n = raw === undefined || raw.trim() === '' ? Number.NaN : Number(raw)
  if (!Number.isInteger(n) || n < min || n > max) throw new ProjectError('invalid', `${label} must be a whole number from ${String(min)} to ${String(max)}.`)
  return n
}

/** Apply a form's values to a layer, checking each; the artboard stays at the origin. */
export function editLayer(layer: Layer, edit: LayerEdit): Layer {
  const isArtboard = layer.kind === 'artboard'
  const next: Layer = {
    ...layer,
    x: isArtboard ? 0 : int(edit.x ?? String(layer.x), 'X', -5000, 5000),
    y: isArtboard ? 0 : int(edit.y ?? String(layer.y), 'Y', -5000, 5000),
    w: int(edit.w ?? String(layer.w), 'Width', 1, 10_000),
    h: int(edit.h ?? String(layer.h), 'Height', 1, 10_000),
    opacity: int(edit.opacity ?? String(layer.opacity), 'Opacity', 0, 100),
    radius: int(edit.radius ?? String(layer.radius), 'Corner radius', 0, 1000),
    visible: edit.visible === undefined ? layer.visible : edit.visible === 'on',
    fill: layer.fill,
  }
  if (edit.fill !== undefined) {
    if (!/^#[0-9a-fA-F]{6}$/.test(edit.fill)) throw new ProjectError('invalid', 'Fill is a colour like #e8dfd3.')
    return finishText({ ...next, fill: edit.fill.toLowerCase() }, edit)
  }
  return finishText(next, edit)
}

function finishText(layer: Layer, edit: LayerEdit): Layer {
  let out = layer
  if (edit.name !== undefined) {
    const name = edit.name.trim()
    if (name === '' || name.length > 40) throw new ProjectError('invalid', 'A layer name is 1 to 40 characters.')
    out = { ...out, name }
  }
  if (edit.text !== undefined && (layer.kind === 'text' || layer.kind === 'button' || layer.kind === 'image')) {
    if (edit.text.length > 300) throw new ProjectError('invalid', 'Text is at most 300 characters.')
    out = { ...out, text: edit.text.replaceAll('\r', '') }
  }
  return out
}

export const clampZoom = (zoom: number): number => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom))

// ---- exports ----------------------------------------------------------------------------------------------------------------------------------

export const FORMATS: readonly ExportFormat[] = ['PNG', 'JPG', 'SVG']
export const SCALES: readonly number[] = [1, 2]

/** A document's pretty export file name: `hero-poster@2x.png`. */
export const exportName = (doc: Doc, scale: number, format: ExportFormat): string => `${doc.file.replace(/\.canvas$/, '')}${scale === 1 ? '' : `@${String(scale)}x`}.${format.toLowerCase()}`

/** A made-up but stable size estimate: pixels times a per-format factor, plus a little per visible layer. */
export function estimateKb(doc: Doc, scale: number, format: ExportFormat): number {
  const { width, height } = pageOf(doc)
  const pixels = width * scale * height * scale
  const factor = format === 'PNG' ? 0.00032 : format === 'JPG' ? 0.00011 : 0
  const layers = doc.layers.filter((l) => l.visible).length
  return format === 'SVG' ? Math.round(2 + layers * 1.4) : Math.max(1, Math.round(pixels * factor + layers))
}

/** `10:42:08`-style times are not shown; the activity reads `Hero poster opened`. */
export const countLayers = (doc: Doc): number => doc.layers.filter((l) => l.kind !== 'artboard').length
