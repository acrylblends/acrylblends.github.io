/**
 * The library itself: the saved state, and every operation a page may run on it. Its outside effects (where the state lives, what time it is, how
 * ids are made) come in as adapters, so tests hand in fakes and a person's library lives behind the store port.
 */
import {
  byteSize,
  cleanText,
  filterSnippets,
  languageCounts,
  languageOf,
  type Collection,
  type Language,
  type Snippet,
  type SnippetFilter,
  type SnippetInput,
  SnippetsError,
  type SnippetsState,
  stampOf,
  tagCounts,
  tagsOf,
  variablesOf,
} from './domain.ts'
import { seed } from './seed.ts'
import type { Store } from './store.ts'

export interface SnippetsAdapters {
  readonly store: Store<SnippetsState>
  readonly clock: () => Date
  readonly newId: (kind: string) => string
}

export interface LibraryStats {
  readonly total: number
  readonly languages: number
  readonly tags: number
  readonly starred: number
  readonly bytes: number
  readonly updatedAt: string | undefined
}

/** A snippet title as a file name: `retry-with-backoff.ts`, the tab above the code. */
export function fileNameOf(snippet: Snippet): string {
  const extension: Readonly<Record<Language, string>> = {
    TypeScript: 'ts',
    JavaScript: 'js',
    Python: 'py',
    SQL: 'sql',
    Shell: 'sh',
  }
  return `${snippet.title}.${extension[snippet.language]}`
}

export class Snippets {
  private state: SnippetsState
  private readonly adapters: SnippetsAdapters

  private constructor(state: SnippetsState, adapters: SnippetsAdapters) {
    this.state = state
    this.adapters = adapters
  }

  /** The saved library, or the seed on the first start (not saved until the first change). */
  static async open(adapters: SnippetsAdapters): Promise<Snippets> {
    const saved = await adapters.store.load()
    return new Snippets(saved ?? seed(adapters.clock(), adapters.newId), adapters)
  }

  get today(): string {
    return stampOf(this.adapters.clock())
  }

  all(): readonly Snippet[] {
    return this.state.snippets
  }

  /** One snippet, or undefined; the pages turn that into a 404. */
  get(id: string): Snippet | undefined {
    return this.state.snippets.find((snippet) => snippet.id === id)
  }

  collections(): readonly Collection[] {
    return this.state.collections
  }

  collection(id: string): Collection | undefined {
    return this.state.collections.find((collection) => collection.id === id)
  }

  languages(): readonly { language: Language; count: number }[] {
    return languageCounts(this.state)
  }

  tags(): readonly { tag: string; count: number }[] {
    return tagCounts(this.state)
  }

  /** The snippets a list shows: the filter, newest first, at most `limit`. */
  search(filter: SnippetFilter = {}): Snippet[] {
    return filterSnippets(this.state, filter)
  }

  stats(): LibraryStats {
    const snippets = this.state.snippets
    const updated = [...snippets].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
    return {
      total: snippets.length,
      languages: languageCounts(this.state).length,
      tags: tagCounts(this.state).length,
      starred: snippets.filter((snippet) => snippet.starred).length,
      bytes: byteSize(snippets),
      updatedAt: updated?.updatedAt,
    }
  }

  /** Make a snippet from what the editor sent; the variables are read from its code. */
  async create(input: SnippetInput): Promise<Snippet> {
    const now = stampOf(this.adapters.clock())
    const snippet: Snippet = {
      id: this.adapters.newId('snippet'),
      ...this.clean(input),
      createdAt: now,
      updatedAt: now,
      starred: input.starred === true,
    }
    this.state.snippets.push(snippet)
    await this.save()
    return snippet
  }

  /** Change a snippet; its title, code, language, tags and variables all follow the input. */
  async update(id: string, input: SnippetInput): Promise<Snippet> {
    const snippet = this.get(id)
    if (snippet === undefined) throw new SnippetsError('not-found', 'That snippet no longer exists.')
    const next: Snippet = {
      ...snippet,
      ...this.clean(input),
      updatedAt: stampOf(this.adapters.clock()),
    }
    this.state.snippets = this.state.snippets.map((item) => (item.id === id ? next : item))
    await this.save()
    return next
  }

  async toggleStar(id: string): Promise<Snippet> {
    const snippet = this.get(id)
    if (snippet === undefined) throw new SnippetsError('not-found', 'That snippet no longer exists.')
    const next = { ...snippet, starred: !snippet.starred }
    this.state.snippets = this.state.snippets.map((item) => (item.id === id ? next : item))
    await this.save()
    return next
  }

  /** Remove a snippet, and take it out of every collection that held it. */
  async remove(id: string): Promise<void> {
    if (this.get(id) === undefined) throw new SnippetsError('not-found', 'That snippet no longer exists.')
    this.state.snippets = this.state.snippets.filter((snippet) => snippet.id !== id)
    this.state.collections = this.state.collections.map((collection) => ({
      ...collection,
      snippetIds: collection.snippetIds.filter((snippetId) => snippetId !== id),
    }))
    await this.save()
  }

  /** A new collection from snippet ids; unknown ids are left out rather than refused. */
  async createCollection(name: string, snippetIds: readonly string[]): Promise<Collection> {
    const clean = cleanText(name, 'Collection name', 60)
    if (this.state.collections.some((collection) => collection.name.toLowerCase() === clean.toLowerCase()))
      throw new SnippetsError('conflict', `A collection named “${clean}” already exists.`)
    const known = new Set(this.state.snippets.map((snippet) => snippet.id))
    const collection: Collection = {
      id: this.adapters.newId('collection'),
      name: clean,
      snippetIds: [...new Set(snippetIds)].filter((id) => known.has(id)),
    }
    this.state.collections.push(collection)
    await this.save()
    return collection
  }

  /** Put a snippet in a collection, once. */
  async addToCollection(collectionId: string, snippetId: string): Promise<Collection> {
    const collection = this.collection(collectionId)
    if (collection === undefined) throw new SnippetsError('not-found', 'That collection no longer exists.')
    if (this.get(snippetId) === undefined) throw new SnippetsError('not-found', 'That snippet no longer exists.')
    if (collection.snippetIds.includes(snippetId)) return collection
    const next = { ...collection, snippetIds: [...collection.snippetIds, snippetId] }
    this.state.collections = this.state.collections.map((item) => (item.id === collectionId ? next : item))
    await this.save()
    return next
  }

  private clean(input: SnippetInput): Pick<Snippet, 'title' | 'description' | 'language' | 'code' | 'tags' | 'variables'> {
    const title = cleanText(input.title, 'Title', 120).replace(/\s+/gu, ' ')
    const description = cleanText(input.description, 'Description', 300)
    const code = typeof input.code === 'string' ? input.code.trim() : ''
    if (code === '') throw new SnippetsError('invalid', 'The code is required.')
    if (code.length > 20_000) throw new SnippetsError('invalid', 'The code is longer than 20,000 characters.')
    const tags = tagsOf(input.tags)
    if (tags.length > 8) throw new SnippetsError('invalid', 'Use at most 8 tags.')
    if (tags.some((tag) => tag.length > 30)) throw new SnippetsError('invalid', 'A tag is longer than 30 characters.')
    return {
      title,
      description,
      language: languageOf(input.language),
      code,
      tags,
      variables: variablesOf(code),
    }
  }

  private async save(): Promise<void> {
    this.state = { ...this.state, snippets: [...this.state.snippets], collections: [...this.state.collections] }
    await this.adapters.store.save(this.state)
  }
}
