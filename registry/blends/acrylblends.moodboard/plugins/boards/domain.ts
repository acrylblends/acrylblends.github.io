/**
 * The board's types and pure rules: a spatial canvas of typed objects with explicit positions and layers. Nothing here touches the disk, the clock or
 * the router; positions are stored as percentages of the board so the canvas keeps its composition at any window size.
 */
export type ObjectType = 'image' | 'note' | 'palette' | 'reference' | 'quote' | 'caption' | 'link'

export type AssetKind = 'image' | 'color'

export type ArtStyle = 'material' | 'architecture' | 'light' | 'fabric'

export interface Asset {
  readonly id: string
  readonly kind: AssetKind
  readonly name: string
  readonly filename: string
  /** For a colour asset: `#263f35`. */
  readonly colorValue: string
  readonly tags: readonly string[]
  /** For an image asset: how its offline artwork is drawn. */
  readonly art: ArtStyle
  readonly tone: number
}

export interface BoardObject {
  readonly id: string
  readonly boardId: string
  readonly type: ObjectType
  /** The name the layers panel shows. */
  readonly name: string
  /** Left edge, as a percentage of the board width (0 to 100). */
  readonly x: number
  /** Top edge, as a percentage of the board height (0 to 100). */
  readonly y: number
  /** The rendered width in pixels; heights follow the object type. */
  readonly width: number
  readonly zIndex: number
  /** The body: a caption, note text, quote, link URL or palette title. */
  readonly content: string
  /** The small monospace label above a note or quote. */
  readonly label: string
  readonly assetId?: string
  /** A palette object's swatches. */
  readonly colors: readonly string[]
  readonly rotation: number
}

export interface Board {
  readonly id: string
  readonly title: string
  readonly project: string
  readonly width: number
  readonly height: number
  readonly background: string
  readonly collaborators: readonly string[]
  readonly selectedColor: string
  readonly updatedAt: string
}

export interface BoardState {
  readonly version: 1
  board: Board
  objects: BoardObject[]
  assets: Asset[]
}

export type BoardErrorCode = 'invalid' | 'not-found' | 'storage'

export class BoardError extends Error {
  readonly code: BoardErrorCode
  constructor(code: BoardErrorCode, message: string) {
    super(message)
    this.code = code
    this.name = 'BoardError'
  }
}

export const OBJECT_TYPES: readonly { readonly value: ObjectType; readonly label: string; readonly tool: string }[] = [
  { value: 'image', label: 'Image', tool: '▧' },
  { value: 'note', label: 'Text note', tool: 'T' },
  { value: 'palette', label: 'Colour palette', tool: '◉' },
  { value: 'reference', label: 'Reference card', tool: '▱' },
  { value: 'quote', label: 'Quote', tool: '❝' },
  { value: 'caption', label: 'Caption', tool: '≡' },
  { value: 'link', label: 'Link', tool: '↗' },
]

export const DEFAULT_COLORS: readonly string[] = ['#263f35', '#b9aa8b', '#d5d5c8', '#b96e4c', '#e7edcd']

/** ISO 8601 in UTC: one stamp means the same moment on every machine. */
export function stampOf(date: Date): string {
  return date.toISOString()
}

export function slugOf(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function isObjectType(value: unknown): value is ObjectType {
  return OBJECT_TYPES.some((type) => type.value === value)
}

export function cleanTitle(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') throw new BoardError('invalid', 'The board title is required.')
  const text = value.trim()
  if (text.length > 80) throw new BoardError('invalid', 'The board title is longer than 80 characters.')
  return text
}

export function cleanProject(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') throw new BoardError('invalid', 'The project name is required.')
  return value.trim().slice(0, 60)
}

export function cleanDimension(value: unknown, name: 'width' | 'height'): number {
  const number = Number.parseInt(String(value ?? ''), 10)
  const min = name === 'width' ? 600 : 480
  const max = name === 'width' ? 2_400 : 1_600
  if (!Number.isInteger(number) || number < min || number > max)
    throw new BoardError('invalid', `The board ${name} must be between ${String(min)} and ${String(max)} pixels.`)
  return number
}

export function cleanCollaborators(value: unknown): string[] {
  if (typeof value !== 'string') return []
  const people = value
    .split(',')
    .map((person) => person.trim())
    .filter((person) => person !== '')
    .map((person) => person.slice(0, 40))
  return [...new Set(people)].slice(0, 6)
}

export function cleanContent(value: unknown, min = 1): string {
  if (typeof value !== 'string' || value.trim().length < min) throw new BoardError('invalid', 'The object needs some content.')
  const text = value.trim()
  if (text.length > 280) throw new BoardError('invalid', 'The content is longer than 280 characters.')
  return text
}

export function cleanLabel(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, 40) : ''
}

export function cleanLink(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!/^https?:\/\/[^\s]+$/i.test(text)) throw new BoardError('invalid', 'A link needs a full http or https address.')
  if (text.length > 300) throw new BoardError('invalid', 'The link is longer than 300 characters.')
  return text
}

export function cleanColor(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!/^#[0-9a-f]{6}$/i.test(text)) throw new BoardError('invalid', 'A colour must be a six-digit hex value such as #263f35.')
  return text.toLowerCase()
}

export function cleanColors(value: unknown): string[] {
  if (!Array.isArray(value)) throw new BoardError('invalid', 'A palette needs between two and six colours.')
  if (value.length < 2 || value.length > 6) throw new BoardError('invalid', 'A palette needs between two and six colours.')
  return value.map((color) => cleanColor(color))
}

export function cleanRotation(value: unknown): number {
  const number = Number(value ?? 0)
  if (!Number.isFinite(number) || Math.abs(number) > 15) throw new BoardError('invalid', 'The rotation must be between -15 and 15 degrees.')
  return Math.round(number * 10) / 10
}

export function cleanPosition(value: unknown, axis: 'x' | 'y'): number {
  const number = Number(value)
  if (!Number.isFinite(number)) throw new BoardError('invalid', `The ${axis} position must be a number.`)
  return Math.round(Math.max(0, Math.min(100, number)) * 100) / 100
}

export function cleanWidth(value: unknown): number {
  const number = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isInteger(number) || number < 120 || number > 420) throw new BoardError('invalid', 'The object width must be between 120 and 420 pixels.')
  return number
}

/** Where a new object lands: a deterministic cascade, so adding three notes never stacks them on one another. */
export function nextSpot(objects: readonly BoardObject[]): { x: number; y: number } {
  const step = 6
  const index = objects.length
  return { x: Math.min(72, 8 + (index % 8) * step), y: Math.min(76, 12 + (index % 6) * step) }
}

export function nextZIndex(objects: readonly BoardObject[]): number {
  return objects.reduce((max, object) => Math.max(max, object.zIndex), 0) + 1
}

export function typeLabel(type: ObjectType): string {
  return OBJECT_TYPES.find((entry) => entry.value === type)?.label ?? type
}
