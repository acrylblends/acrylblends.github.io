/**
 * The snippet library's types and pure rules: what a snippet is, how its variables are read from its code, and how a search ranks it. No clock,
 * no disk and no ids are made here; the {@link Snippets} class applies these rules to the saved state.
 */

export const LANGUAGES = ['TypeScript', 'JavaScript', 'Python', 'SQL', 'Shell'] as const
export type Language = (typeof LANGUAGES)[number]

/** The short label the list and the file tab show. */
export const LANGUAGE_SHORT: Readonly<Record<Language, string>> = {
  TypeScript: 'TS',
  JavaScript: 'JS',
  Python: 'PY',
  SQL: 'SQL',
  Shell: 'SH',
}

/** The class name the language badge gets (see the shell's styles). */
export const LANGUAGE_CLASS: Readonly<Record<Language, string>> = {
  TypeScript: 'ts',
  JavaScript: 'js',
  Python: 'py',
  SQL: 'sql',
  Shell: 'sh',
}

export interface Snippet {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly language: Language
  readonly code: string
  readonly tags: readonly string[]
  /** The `{{name}}` placeholders in the code, in the order they first appear. Empty when the snippet has none. */
  readonly variables: readonly string[]
  /** ISO date-time, local time without a zone: `2026-11-06T09:41`. */
  readonly createdAt: string
  readonly updatedAt: string
  readonly starred: boolean
}

export interface Collection {
  readonly id: string
  readonly name: string
  readonly snippetIds: readonly string[]
}

export interface SnippetsState {
  readonly version: 1
  snippets: Snippet[]
  collections: Collection[]
}

/** What the user typed to make or change a snippet. */
export interface SnippetInput {
  readonly title: string
  readonly description: string
  readonly language: string
  readonly code: string
  readonly tags: string | readonly string[]
  readonly starred?: boolean
}

export type SnippetsErrorCode = 'invalid' | 'not-found' | 'conflict'

/** A refusal written for the person who typed it: the page shows it beside the form. */
export class SnippetsError extends Error {
  readonly code: SnippetsErrorCode

  constructor(code: SnippetsErrorCode, message: string) {
    super(message)
    this.code = code
    this.name = 'SnippetsError'
  }
}

const pad = (n: number): string => String(n).padStart(2, '0')

/** `2026-11-06` for a local date. */
export function dayOf(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** `2026-11-06T09:41` for a local date-time. */
export function stampOf(date: Date): string {
  return `${dayOf(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** A stamp the person can read: `2h ago`, `Yesterday`, `Oct 31`, or the date when a year has passed. */
export function whenText(stamp: string, now: Date): string {
  const then = new Date(stamp)
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  if (hours < 48) return 'Yesterday'
  if (then.getFullYear() === now.getFullYear())
    return then.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })
  return then.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' })
}

/** The text as typed, without its surrounding spaces; refuses an empty value with the message the form shows. */
export function cleanText(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string') throw new SnippetsError('invalid', `${field} is missing.`)
  const text = value.trim()
  if (text === '') throw new SnippetsError('invalid', `${field} is required.`)
  if (text.length > max) throw new SnippetsError('invalid', `${field} is longer than ${String(max)} characters.`)
  return text
}

/** A language name or its short label (`TS`, `ts`, `TypeScript`) as one of {@link LANGUAGES}; refuses anything else. */
export function languageOf(value: unknown): Language {
  if (typeof value !== 'string') throw new SnippetsError('invalid', 'Pick a language.')
  const wanted = value.trim().toLowerCase()
  const found = LANGUAGES.find(
    (language) => language.toLowerCase() === wanted || LANGUAGE_SHORT[language].toLowerCase() === wanted,
  )
  if (found === undefined) throw new SnippetsError('invalid', `Pick one of the languages: ${LANGUAGES.join(', ')}.`)
  return found
}

/** `{{product name}}` or `{{attempts}}` become their trimmed names, each once, in first-appearance order. */
export function variablesOf(code: string): string[] {
  const names: string[] = []
  for (const match of code.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/gu)) {
    const name = match[1]?.trim() ?? ''
    if (name !== '' && !names.includes(name)) names.push(name)
  }
  return names
}

/** Tags as typed (`async, network` or one string per item), trimmed, lower-cased, without duplicates. */
export function tagsOf(value: string | readonly string[]): string[] {
  const parts: readonly string[] = typeof value === 'string' ? value.split(',') : value
  const tags: string[] = []
  for (const part of parts) {
    const tag = part.trim().toLowerCase()
    if (tag !== '' && !tags.includes(tag)) tags.push(tag)
  }
  return tags
}

/** The variables in a snippet's code, with the values the user typed: every placeholder must have a value. */
export function missingVariables(code: string, values: Readonly<Record<string, string>>): string[] {
  return variablesOf(code).filter((name) => (values[name] ?? '').trim() === '')
}

/** The code with every `{{name}}` replaced by its value; both sides of the replacement are treated as plain text. */
export function fillVariables(code: string, values: Readonly<Record<string, string>>): string {
  return code.replace(/\{\{\s*([^{}]+?)\s*\}\}/gu, (whole, name: string) => values[name]?.trim() ?? whole)
}

export interface SnippetFilter {
  /** Matches the title, the description, the code and the tags, ignoring case. */
  readonly q?: string
  readonly language?: Language
  readonly tag?: string
  readonly starred?: boolean
  readonly collectionId?: string
  /** How many to return; the list asks for 50 at a time. */
  readonly limit?: number
}

/** The snippets matching the filter, most recently changed first; a collection keeps its own order. */
export function filterSnippets(
  state: SnippetsState,
  filter: SnippetFilter,
): Snippet[] {
  const q = (filter.q ?? '').trim().toLowerCase()
  const collection =
    filter.collectionId === undefined
      ? undefined
      : state.collections.find((item) => item.id === filter.collectionId)
  if (filter.collectionId !== undefined && collection === undefined) return []
  const matched = state.snippets.filter((snippet) => {
    if (filter.language !== undefined && snippet.language !== filter.language) return false
    if (filter.tag !== undefined && !snippet.tags.includes(filter.tag)) return false
    if (filter.starred === true && !snippet.starred) return false
    if (collection !== undefined && !collection.snippetIds.includes(snippet.id)) return false
    if (q !== '') {
      const haystack = [snippet.title, snippet.description, snippet.code, ...snippet.tags].join('\n').toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  })
  if (collection !== undefined) {
    const order = new Map(collection.snippetIds.map((id, index) => [id, index]))
    matched.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
  } else {
    matched.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.title.localeCompare(b.title))
  }
  return filter.limit === undefined ? matched : matched.slice(0, filter.limit)
}

/** How many snippets each language has, in {@link LANGUAGES} order, with the languages that have none left out. */
export function languageCounts(state: SnippetsState): { language: Language; count: number }[] {
  return LANGUAGES.map((language) => ({
    language,
    count: state.snippets.filter((snippet) => snippet.language === language).length,
  })).filter((item) => item.count > 0)
}

/** The tags in use, most used first, then by name. */
export function tagCounts(state: SnippetsState): { tag: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const snippet of state.snippets) {
    for (const tag of snippet.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}

/** The total size of the library in bytes, as the library footer shows it. */
export function byteSize(snippets: readonly Snippet[]): number {
  return snippets.reduce((total, snippet) => total + Buffer.byteLength(snippet.code, 'utf8'), 0)
}
