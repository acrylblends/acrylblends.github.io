/**
 * The journal (`ctx.journal`): the saved state and every change to it. A change checks its input, builds the next state, saves it through the store and
 * only then makes it current, so a failed save leaves the journal as it was.
 */
import {
  type Entry,
  type EntryKind,
  type JournalState,
  JournalError,
  MAX_ENTRIES,
  type WidgetId,
  WIDGETS,
  parseKind,
  parseTime,
  parseTitle,
} from './domain.ts'
import { seed } from './seed.ts'
import type { JournalStore } from './store.ts'

export interface JournalAdapters {
  readonly store: JournalStore
  readonly clock: () => Date
  readonly newId: (kind: 'entry') => string
}

export class Journal {
  #state: JournalState
  readonly #adapters: JournalAdapters

  private constructor(state: JournalState, adapters: JournalAdapters) {
    this.#state = state
    this.#adapters = adapters
  }

  static async open(adapters: JournalAdapters): Promise<Journal> {
    const saved = await adapters.store.load()
    if (saved !== undefined) return new Journal(saved, adapters)
    const state = seed(adapters.clock())
    await adapters.store.save(state)
    return new Journal(state, adapters)
  }

  get state(): JournalState {
    return this.#state
  }

  now(): Date {
    return this.#adapters.clock()
  }

  /** Newest first, optionally of one kind. */
  entries(kind?: EntryKind): readonly Entry[] {
    return [...this.#state.entries].filter((e) => kind === undefined || e.kind === kind).sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id))
  }

  async #commit(next: JournalState): Promise<void> {
    await this.#adapters.store.save(next)
    this.#state = next
  }

  /** Save a moment: a note, or a placeholder for a voice memo or a photo, with a short description. */
  async capture(rawKind: string | undefined, rawTitle: string | undefined): Promise<Entry> {
    const kind = parseKind(rawKind)
    const title = parseTitle(rawTitle)
    if (this.#state.entries.length >= MAX_ENTRIES) throw new JournalError('conflict', `The journal holds at most ${String(MAX_ENTRIES)} moments; delete one first.`)
    const entry: Entry = { id: this.#adapters.newId('entry'), title, kind, at: this.now().toISOString() }
    await this.#commit({ ...this.#state, entries: [...this.#state.entries, entry] })
    return entry
  }

  async deleteEntry(id: string): Promise<void> {
    if (!this.#state.entries.some((e) => e.id === id)) throw new JournalError('not-found', 'There is no such moment.')
    await this.#commit({ ...this.#state, entries: this.#state.entries.filter((e) => e.id !== id) })
  }

  async setWidget(id: string, on: boolean): Promise<void> {
    if (!WIDGETS.some((w) => w.id === id)) throw new JournalError('not-found', 'There is no such home module.')
    const widgets = { ...this.#state.widgets, [id as WidgetId]: on }
    if (!Object.values(widgets).some(Boolean)) throw new JournalError('conflict', 'Keep at least one module on the home screen.')
    await this.#commit({ ...this.#state, widgets })
  }

  async setPreference(name: 'compact' | 'quiet', on: boolean): Promise<void> {
    await this.#commit({ ...this.#state, preferences: { ...this.#state.preferences, [name]: on } })
  }

  async setQuietHours(from: string | undefined, to: string | undefined): Promise<void> {
    const quietFrom = parseTime(from, 'Quiet hours start')
    const quietTo = parseTime(to, 'Quiet hours end')
    if (quietFrom === quietTo) throw new JournalError('invalid', 'Quiet hours must start and end at different times.')
    await this.#commit({ ...this.#state, preferences: { ...this.#state.preferences, quietFrom, quietTo } })
  }

  /** Change today's focus and the goals under it (one per line, up to five). */
  async setFocus(rawFocus: string | undefined, rawGoals: string | undefined): Promise<void> {
    const focus = (rawFocus ?? '').trim()
    if (focus === '') throw new JournalError('invalid', 'Write today’s focus first.')
    if (focus.length > 60) throw new JournalError('invalid', 'A focus is at most 60 characters.')
    const lines = (rawGoals ?? '').split('\n').map((l) => l.trim()).filter((l) => l !== '')
    if (lines.length > 5) throw new JournalError('invalid', 'Keep to five small goals.')
    if (lines.some((l) => l.length > 50)) throw new JournalError('invalid', 'A goal is at most 50 characters.')
    const goals = lines.map((text, i) => ({ id: `g${String(i + 1)}`, text, done: this.#state.goals.find((g) => g.text === text)?.done ?? false }))
    await this.#commit({ ...this.#state, focus, goals })
  }

  async toggleGoal(id: string): Promise<void> {
    const goal = this.#state.goals.find((g) => g.id === id)
    if (goal === undefined) throw new JournalError('not-found', 'There is no such goal.')
    await this.#commit({ ...this.#state, goals: this.#state.goals.map((g) => (g.id === id ? { ...g, done: !g.done } : g)) })
  }
}
