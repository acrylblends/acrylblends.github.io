/**
 * LingoDesk's domain: a localization project with message keys (stable ids, a source string, a content type, an optional length limit), target locales, one
 * translation segment per key and locale (a target text and a state: untranslated, needs review, approved), a glossary, a translation memory and the QA
 * checks (placeholders, missing translations, terminology, length). Pure functions and plain data; the {@link Desk} in desk.ts applies them to the saved
 * state and the pages only read what they return.
 *
 * Everything is a seeded example: no machine-translation provider or localization service is contacted, and an approved translation is never rewritten
 * by an edit, an inserted term or a suggestion: it has to be reopened first.
 */

export class DeskError extends Error {
  override readonly name = 'DeskError'
  readonly code: 'invalid' | 'not-found' | 'conflict'
  constructor(code: 'invalid' | 'not-found' | 'conflict', message: string) {
    super(message)
    this.code = code
  }
}

export type SegmentState = 'empty' | 'review' | 'approved'
export type TypeId = 'ui' | 'help' | 'email'
export type Filter = 'all' | 'review' | 'empty' | 'approved'

export const TYPES: readonly { readonly id: TypeId; readonly name: string; readonly flow: string }[] = [
  { id: 'ui', name: 'UI strings', flow: 'Onboarding flow' },
  { id: 'help', name: 'Help articles', flow: 'Help articles' },
  { id: 'email', name: 'Email templates', flow: 'Email templates' },
]

export const FILTERS: Readonly<Record<Filter, string>> = { all: 'All strings', review: 'Needs review', empty: 'Untranslated', approved: 'Approved' }

export interface Locale {
  readonly id: string
  readonly name: string
  /** The language's own name for the column header, e.g. `DEUTSCH (AUSTRIA)`. */
  readonly header: string
}

export interface MessageKey {
  /** Stable: never renamed, so translations and code keep pointing at it. */
  readonly key: string
  readonly type: TypeId
  readonly source: string
  readonly maxLength?: number
}

export interface Segment {
  readonly key: string
  readonly locale: string
  readonly target: string
  readonly state: SegmentState
  readonly updatedAt: string
  readonly by: string
}

export interface GlossaryTerm {
  readonly id: string
  readonly term: string
  readonly pos: string
  /** The approved translation per locale id. */
  readonly translations: Readonly<Record<string, string>>
}

export interface MemoryEntry {
  readonly id: string
  readonly locale: string
  readonly source: string
  readonly target: string
  readonly context: string
}

export type Level = 'pass' | 'warning' | 'error' | 'na'

export interface Check {
  readonly id: 'placeholders' | 'missing' | 'terms' | 'length'
  readonly label: string
  readonly level: Level
  readonly issues: readonly string[]
}

export interface QaRun {
  readonly at: string
  readonly checks: readonly Check[]
}

export interface DeskState {
  readonly version: 1
  readonly project: string
  readonly syncedAt: string
  readonly locales: readonly Locale[]
  readonly keys: readonly MessageKey[]
  readonly segments: readonly Segment[]
  readonly glossary: readonly GlossaryTerm[]
  readonly memory: readonly MemoryEntry[]
  readonly qa: Readonly<Record<string, QaRun>>
}

export const ME = 'Mira'
export const MAX_TARGET = 500
export const MIN_MATCH = 60

export const placeholdersOf = (text: string): string[] => [...new Set(text.match(/\{[A-Za-z0-9_.]+\}/g) ?? [])]

const tokens = (text: string): string[] => text.toLowerCase().split(/[\s,.;:!?]+/).filter((t) => t !== '')

/** Dice similarity of two strings' word sets, 0 to 100. */
export function matchPercent(a: string, b: string): number {
  const x = tokens(a)
  const y = tokens(b)
  if (x.length === 0 || y.length === 0) return 0
  const pool = [...y]
  let shared = 0
  for (const t of x) {
    const i = pool.indexOf(t)
    if (i !== -1) {
      shared += 1
      pool.splice(i, 1)
    }
  }
  return Math.round(((2 * shared) / (x.length + y.length)) * 100)
}

export interface Suggestion {
  readonly entry: MemoryEntry
  readonly percent: number
}

/** The best translation-memory entry for a source in a locale at or above {@link MIN_MATCH}%, if any. */
export function suggestionFor(memory: readonly MemoryEntry[], locale: string, source: string): Suggestion | undefined {
  return memory
    .filter((m) => m.locale === locale)
    .map((entry) => ({ entry, percent: matchPercent(source, entry.source) }))
    .filter((s) => s.percent >= MIN_MATCH)
    .sort((p, q) => q.percent - p.percent)[0]
}

const strip = (text: string): string => text.replace(/\{[A-Za-z0-9_.]+\}/g, ' ')
const escapeRe = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The four QA checks of one locale over its segments. */
export function qaChecks(state: Pick<DeskState, 'keys' | 'segments' | 'glossary'>, locale: string): Check[] {
  const rows = state.keys.map((k) => ({ k, s: state.segments.find((s) => s.key === k.key && s.locale === locale) })).filter((r): r is { k: MessageKey; s: Segment } => r.s !== undefined)
  const placeholders: string[] = []
  const missing: string[] = []
  const terms: string[] = []
  const length: string[] = []
  for (const { k, s } of rows) {
    if (s.target.trim() === '') {
      missing.push(`${k.key} has no translation.`)
      continue
    }
    const want = placeholdersOf(k.source)
    const have = placeholdersOf(s.target)
    for (const p of want) if (!have.includes(p)) placeholders.push(`${k.key} is missing ${p}.`)
    for (const p of have) if (!want.includes(p)) placeholders.push(`${k.key} has ${p}, which is not in the source.`)
    for (const g of state.glossary) {
      const expected = g.translations[locale]
      if (expected !== undefined && new RegExp(`\\b${escapeRe(g.term)}\\b`, 'i').test(strip(k.source)) && !strip(s.target).toLowerCase().includes(expected.toLowerCase()))
        terms.push(`${k.key}: “${g.term}” should be “${expected}”.`)
    }
    if (k.maxLength !== undefined && s.target.length > k.maxLength) length.push(`${k.key} is ${String(s.target.length)} characters; the limit is ${String(k.maxLength)}.`)
  }
  const level = (issues: readonly string[], bad: 'warning' | 'error'): Level => (issues.length === 0 ? 'pass' : bad)
  const limited = state.keys.some((k) => k.maxLength !== undefined)
  return [
    { id: 'placeholders', label: 'Placeholder tokens', level: level(placeholders, 'error'), issues: placeholders },
    { id: 'missing', label: 'Missing translations', level: level(missing, 'warning'), issues: missing },
    { id: 'terms', label: 'Term consistency', level: level(terms, 'warning'), issues: terms },
    { id: 'length', label: 'Length constraints', level: limited ? level(length, 'error') : 'na', issues: length },
  ]
}

export interface Counts {
  readonly total: number
  readonly translated: number
  readonly review: number
  readonly empty: number
  readonly approved: number
}

/** The segment counts of a locale, over one content type or all of them. */
export function countsFor(state: Pick<DeskState, 'keys' | 'segments'>, locale: string, type?: TypeId): Counts {
  const keys = new Set(state.keys.filter((k) => type === undefined || k.type === type).map((k) => k.key))
  const rows = state.segments.filter((s) => s.locale === locale && keys.has(s.key))
  const n = (st: SegmentState) => rows.filter((r) => r.state === st).length
  return { total: rows.length, translated: rows.length - n('empty'), review: n('review'), empty: n('empty'), approved: n('approved') }
}

/** `4 minutes ago`. */
export function ago(iso: string, now: Date): string {
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${String(minutes)} ${minutes === 1 ? 'minute' : 'minutes'} ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${String(hours)} ${hours === 1 ? 'hour' : 'hours'} ago`
  const days = Math.round(hours / 24)
  return `${String(days)} ${days === 1 ? 'day' : 'days'} ago`
}

export const filterMatches = (filter: Filter, s: Segment): boolean => filter === 'all' || s.state === filter
