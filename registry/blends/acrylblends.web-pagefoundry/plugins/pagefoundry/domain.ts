/**
 * Pagefoundry's domain: a site of pages, each a stack of sections built from blocks (hero, feature grid, quote, call to action) with a headline,
 * background, width and visibility; the theme; the block library; the contrast checks; preview mode and simulated publishes. Pure functions and plain
 * data; the {@link Site} in site.ts applies them to the saved state and the builder only reads what it returns.
 *
 * Nothing is deployed: a "publish" records the build a real one would make.
 */

export type BlockKind = 'hero' | 'features' | 'quote' | 'cta'
export type Width = 'wide' | 'medium' | 'compact'
export type Visibility = 'visible' | 'hidden-mobile'

export interface Item {
  readonly title: string
  readonly text: string
}

export interface Section {
  readonly id: string
  readonly kind: BlockKind
  readonly headline: string
  readonly body: string
  readonly button: string
  readonly items: readonly Item[]
  /** `#rrggbb`. */
  readonly bg: string
  readonly width: Width
  readonly visibility: Visibility
}

export interface Page {
  readonly id: string
  readonly name: string
  readonly sections: readonly Section[]
}

export interface Theme {
  readonly accent: string
  readonly serif: boolean
}

export interface Build {
  readonly version: string
  readonly at: string
  readonly pages: number
  readonly sections: number
  readonly warnings: readonly string[]
}

export interface View {
  readonly preview: boolean
  readonly device: 'desktop' | 'mobile'
}

export interface SiteState {
  readonly version: 1
  readonly name: string
  readonly domain: string
  readonly pages: readonly Page[]
  readonly theme: Theme
  readonly builds: readonly Build[]
  readonly view: View
}

export class SiteError extends Error {
  override readonly name = 'SiteError'
  readonly code: 'invalid' | 'not-found' | 'conflict'
  constructor(code: 'invalid' | 'not-found' | 'conflict', message: string) {
    super(message)
    this.code = code
  }
}

export const MAX_PAGES = 8
export const MAX_SECTIONS = 12

export const BLOCKS: readonly { kind: BlockKind; name: string; icon: string }[] = [
  { kind: 'hero', name: 'Hero section', icon: '▤' },
  { kind: 'features', name: 'Feature grid', icon: '▦' },
  { kind: 'quote', name: 'Quote', icon: '❞' },
  { kind: 'cta', name: 'Call to action', icon: '↗' },
]

export const WIDTH_LABEL: Readonly<Record<Width, string>> = { wide: 'Wide / 1200 px', medium: 'Medium / 960 px', compact: 'Compact / 720 px' }
export const WIDTH_PX: Readonly<Record<Width, number>> = { wide: 1200, medium: 960, compact: 720 }
export const VISIBILITY_LABEL: Readonly<Record<Visibility, string>> = { visible: 'Visible', 'hidden-mobile': 'Hidden on mobile' }
export const KIND_NAME: Readonly<Record<BlockKind, string>> = { hero: 'Hero', features: 'Features', quote: 'Quote', cta: 'CTA' }

/** The content a new block starts with. */
export function newSection(kind: BlockKind, id: string): Section {
  const base = { id, kind, button: '', items: [] as Item[], width: 'wide' as Width, visibility: 'visible' as Visibility }
  switch (kind) {
    case 'hero':
      return { ...base, headline: 'A new hero section', body: 'A new editable section. Select it to adjust.', button: 'Learn more ↗', bg: '#e9efe3' }
    case 'features':
      return { ...base, headline: 'Feature grid', body: '', items: [{ title: '01 / First', text: 'Describe the first idea.' }, { title: '02 / Second', text: 'Describe the second idea.' }, { title: '03 / Third', text: 'Describe the third idea.' }], bg: '#fbfaf5' }
    case 'quote':
      return { ...base, headline: '“A short line a customer once said about you.”', body: 'Customer name, role', bg: '#f1ede2' }
    case 'cta':
      return { ...base, headline: 'Have something in mind?', body: 'Let’s make the next thing matter.', button: 'Start a project ↗', bg: '#263f32' }
  }
}

// ---- contrast ---------------------------------------------------------------------------------------------------------------------------------

const channel = (c: number): number => {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

/** WCAG relative luminance of a `#rrggbb` colour. */
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 10) / 10
}

/** The text colour a section's kind uses: white on a call to action, near-black elsewhere. */
export const textColorOf = (kind: BlockKind): string => (kind === 'cta' ? '#ffffff' : '#272e2b')

export const MIN_CONTRAST = 4.5

export const contrastOf = (s: Section): number => contrast(textColorOf(s.kind), s.bg)

// ---- input checks -----------------------------------------------------------------------------------------------------------------------------

export interface SectionEdit {
  readonly headline?: string | undefined
  readonly body?: string | undefined
  readonly button?: string | undefined
  readonly items?: string | undefined
  readonly bg?: string | undefined
  readonly width?: string | undefined
  readonly visibility?: string | undefined
}

/** `Title | text` per line, up to six items. */
export function parseItems(text: string): Item[] {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l !== '')
  if (lines.length > 6) throw new SiteError('invalid', 'A feature grid holds at most six items.')
  return lines.map((line) => {
    const [title = '', ...rest] = line.split('|')
    if (title.trim() === '') throw new SiteError('invalid', 'Each item starts with a title, then “|” and its text.')
    return { title: title.trim().slice(0, 40), text: rest.join('|').trim().slice(0, 140) }
  })
}

export function editSection(s: Section, e: SectionEdit): Section {
  let out = s
  if (e.headline !== undefined) {
    const headline = e.headline.replaceAll('\r', '').trim()
    if (headline === '') throw new SiteError('invalid', 'A section needs a headline.')
    if (headline.length > 120) throw new SiteError('invalid', 'A headline is at most 120 characters.')
    out = { ...out, headline }
  }
  if (e.body !== undefined) {
    if (e.body.length > 300) throw new SiteError('invalid', 'The body text is at most 300 characters.')
    out = { ...out, body: e.body.replaceAll('\r', '').trim() }
  }
  if (e.button !== undefined) {
    if (e.button.length > 40) throw new SiteError('invalid', 'A button label is at most 40 characters.')
    out = { ...out, button: e.button.trim() }
  }
  if (e.items !== undefined && s.kind === 'features') out = { ...out, items: parseItems(e.items) }
  if (e.bg !== undefined) {
    if (!/^#[0-9a-fA-F]{6}$/.test(e.bg)) throw new SiteError('invalid', 'The background is a colour like #e9efe3.')
    out = { ...out, bg: e.bg.toLowerCase() }
  }
  if (e.width !== undefined) {
    if (!(e.width in WIDTH_LABEL)) throw new SiteError('invalid', 'Pick wide, medium or compact.')
    out = { ...out, width: e.width as Width }
  }
  if (e.visibility !== undefined) {
    if (e.visibility !== 'visible' && e.visibility !== 'hidden-mobile') throw new SiteError('invalid', 'Pick visible or hidden on mobile.')
    out = { ...out, visibility: e.visibility }
  }
  return out
}

export function pageIdOf(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

/** Problems that stop a publish: a page with nothing visible on it. */
export function publishProblems(pages: readonly Page[]): string[] {
  return pages.filter((p) => !p.sections.some((s) => s.visibility === 'visible' || s.visibility === 'hidden-mobile')).map((p) => `${p.name} has no sections yet.`)
}

/** Warnings a publish records but does not stop for: sections whose text would be hard to read. */
export function publishWarnings(pages: readonly Page[]): string[] {
  return pages.flatMap((p) => p.sections.filter((s) => contrastOf(s) < MIN_CONTRAST).map((s) => `${p.name}: ${KIND_NAME[s.kind]} section contrast is ${contrastOf(s).toFixed(1)}:1 (below ${String(MIN_CONTRAST)}:1)`))
}

/** `1.0`, `1.1`, `1.2`. */
export const nextVersion = (builds: readonly Build[]): string => `1.${String(builds.length)}`

/** `Today 10:42`, `Yesterday`, `Nov 2`. */
export function whenLabel(iso: string, now: Date): string {
  const at = new Date(iso)
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((day(now) - day(at)) / 86_400_000)
  const hm = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
  if (days === 0) return `today ${hm}`
  if (days === 1) return 'yesterday'
  return at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
