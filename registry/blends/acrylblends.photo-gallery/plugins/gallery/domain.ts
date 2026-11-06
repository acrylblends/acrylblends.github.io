/**
 * The archive's types and pure rules: albums, photographs, favourites, sharing, search and the lightbox order. Nothing here touches the disk, the
 * clock or the router; the store, the clock and the id maker are passed in by the plugin, so every rule is tested on its own.
 */

/** How a photograph's offline artwork is drawn: no network, no stock imagery, one generated SVG per picture. */
export type ArtStyle = 'landscape' | 'architecture' | 'portrait' | 'travel'

export type PhotoOrigin = 'archive' | 'upload'

export interface Photo {
  readonly id: string
  readonly filename: string
  /** The editorial title the grid and the lightbox show. */
  readonly title: string
  /** The album's id, or `''` for an import that is not filed yet. */
  readonly albumId: string
  readonly art: ArtStyle
  /** Which palette the generated artwork uses (0 to 7). */
  readonly tone: number
  readonly width: number
  readonly height: number
  /** The height the masonry tile renders at (the mockup pins each frame's display height). */
  readonly tile: number
  readonly sizeBytes: number
  /** ISO 8601, UTC. */
  readonly capturedAt: string
  /** ISO 8601, UTC. */
  readonly addedAt: string
  /** ISO 8601, UTC. */
  readonly editedAt: string
  readonly tags: readonly string[]
  readonly favourite: boolean
  readonly shared: boolean
  readonly origin: PhotoOrigin
  readonly description: string
}

export interface Album {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly coverPhotoId?: string
}

export interface GalleryState {
  readonly version: 1
  albums: Album[]
  photos: Photo[]
}

export type GalleryErrorCode = 'invalid' | 'not-found' | 'conflict' | 'storage'

export class GalleryError extends Error {
  readonly code: GalleryErrorCode
  constructor(code: GalleryErrorCode, message: string) {
    super(message)
    this.code = code
    this.name = 'GalleryError'
  }
}

export const STORAGE_LIMIT_BYTES = 50_000_000_000

/** ISO 8601 in UTC: the archive stores one time zone, so a stamp means the same moment on every machine. */
export function stampOf(date: Date): string {
  return date.toISOString()
}

export function parseStamp(stamp: string): Date {
  return new Date(stamp)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** `2 Nov 2026`, in UTC. */
export function dateText(stamp: string): string {
  const date = parseStamp(stamp)
  return `${String(date.getUTCDate())} ${MONTHS[date.getUTCMonth()] ?? ''} ${String(date.getUTCFullYear())}`
}

/** `2 Nov 2026, 09:41`, in UTC. */
export function dateTimeText(stamp: string): string {
  const date = parseStamp(stamp)
  return `${dateText(stamp)}, ${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`
}

/** `4h ago`, `Yesterday`, then the date. */
export function whenText(stamp: string, now: Date): string {
  const minutes = Math.floor((now.getTime() - parseStamp(stamp).getTime()) / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${String(minutes)}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${String(hours)}h ago`
  if (hours < 48) return 'Yesterday'
  return dateText(stamp)
}

/** Thousands grouped by a comma, without the platform's locale deciding the shape. */
export function groupDigits(value: number): string {
  return String(Math.trunc(Math.abs(value))).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** `7.4 MB`, `512 KB`. */
export function sizeText(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(2)} GB`
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`
  return `${String(Math.max(1, Math.round(bytes / 1_000)))} KB`
}

/** `32.1 GB`. */
export function storageText(bytes: number): string {
  return `${(bytes / 1_000_000_000).toFixed(1)} GB`
}

export function storagePercent(bytes: number): number {
  return Math.min(100, Math.round((bytes / STORAGE_LIMIT_BYTES) * 100))
}

export function dimensionText(photo: Pick<Photo, 'width' | 'height'>): string {
  return `${groupDigits(photo.width)} × ${groupDigits(photo.height)}`
}

export function aspectText(photo: Pick<Photo, 'width' | 'height'>): string {
  const ratio = photo.width / photo.height
  if (Math.abs(ratio - 1) < 0.02) return 'Square'
  return ratio > 1 ? 'Landscape' : 'Portrait'
}

export function slugOf(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export interface PhotoFilter {
  readonly albumId?: string
  readonly q?: string
  readonly tag?: string
  readonly favourites?: boolean
  readonly shared?: boolean
  readonly origin?: PhotoOrigin
  /** Only photographs added at or after this ISO stamp. */
  readonly addedSince?: string
  /** Only photographs edited at or after this ISO stamp. */
  readonly editedSince?: string
  readonly sort?: 'captured' | 'added' | 'edited'
}

const haystack = (photo: Photo): string => [photo.filename, photo.title, photo.description, ...photo.tags].join(' ').toLowerCase()

/** The archive's one filter: album, tag, favourite, shared, origin, search text and time windows, newest first. */
export function filterPhotos(photos: readonly Photo[], filter: PhotoFilter = {}): Photo[] {
  const q = (filter.q ?? '').trim().toLowerCase()
  const rows = photos
    .filter((photo) => filter.albumId === undefined || photo.albumId === filter.albumId)
    .filter((photo) => filter.favourites !== true || photo.favourite)
    .filter((photo) => filter.shared !== true || photo.shared)
    .filter((photo) => filter.origin === undefined || photo.origin === filter.origin)
    .filter((photo) => filter.tag === undefined || photo.tags.includes(filter.tag.toLowerCase()))
    .filter((photo) => filter.addedSince === undefined || photo.addedAt >= filter.addedSince)
    .filter((photo) => filter.editedSince === undefined || photo.editedAt >= filter.editedSince)
    .filter((photo) => q === '' || haystack(photo).includes(q))
  const key = filter.sort === 'added' ? 'addedAt' : filter.sort === 'edited' ? 'editedAt' : 'capturedAt'
  return rows.sort((a, b) => b[key].localeCompare(a[key]))
}

export function albumCounts(photos: readonly Photo[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const photo of photos) {
    if (photo.albumId === '') continue
    counts.set(photo.albumId, (counts.get(photo.albumId) ?? 0) + 1)
  }
  return counts
}

export function tagCounts(photos: readonly Photo[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const photo of photos) for (const tag of photo.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  return counts
}

/** The previous and next photograph in the given order, wrapping at both ends as the mockup's lightbox does. */
export function neighbours(photos: readonly Photo[], photo: Photo): { prev?: Photo; next?: Photo } {
  const index = photos.findIndex((item) => item.id === photo.id)
  if (index === -1 || photos.length < 2) return {}
  return {
    prev: photos[(index - 1 + photos.length) % photos.length],
    next: photos[(index + 1) % photos.length],
  }
}

export function cleanFilename(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') throw new GalleryError('invalid', 'The file name is required.')
  const text = value.trim()
  if (text.length > 120) throw new GalleryError('invalid', 'The file name is longer than 120 characters.')
  if (!/\.(jpe?g|png|webp|heic|gif)$/i.test(text)) throw new GalleryError('invalid', 'Use a JPEG, PNG, WebP, HEIC or GIF file name.')
  if (text.includes('/') || text.includes('\\')) throw new GalleryError('invalid', 'A file name cannot contain a folder.')
  return text
}

export function cleanTitle(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') throw new GalleryError('invalid', 'A title is required.')
  const text = value.trim()
  if (text.length > 80) throw new GalleryError('invalid', 'The title is longer than 80 characters.')
  return text
}

export function cleanDescription(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') throw new GalleryError('invalid', 'A short description is required.')
  return value.trim().slice(0, 300)
}

/** `coast, dusk` becomes `['coast', 'dusk']`: lower case, trimmed, no duplicates, six at most. */
export function cleanTags(value: unknown): string[] {
  if (typeof value !== 'string') return []
  const tags = value
    .split(/[,;]/)
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => tag !== '')
    .map((tag) => tag.slice(0, 24))
  return [...new Set(tags)].slice(0, 6)
}

/** Which artwork styles the upload form offers. */
export const ART_STYLES: readonly { readonly value: ArtStyle; readonly label: string }[] = [
  { value: 'landscape', label: 'Landscape' },
  { value: 'architecture', label: 'Architecture' },
  { value: 'portrait', label: 'Portrait' },
  { value: 'travel', label: 'Travel' },
]

export function cleanArt(value: unknown): ArtStyle {
  return ART_STYLES.some((style) => style.value === value) ? (value as ArtStyle) : 'landscape'
}

export function cleanTone(value: unknown): number {
  const tone = Number.parseInt(String(value ?? ''), 10)
  return Number.isInteger(tone) && tone >= 0 && tone <= 7 ? tone : 0
}
