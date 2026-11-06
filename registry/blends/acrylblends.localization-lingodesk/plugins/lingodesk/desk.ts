/**
 * The desk (`ctx.desk`): the saved project and every change to it. A change checks its input, builds the next state, saves it through the store and only
 * then makes it current, so a failed save leaves the project as it was. What is open (locale, content type, filter, selected key) is the page's query.
 */
import {
  type Check,
  type DeskState,
  type Locale,
  type MessageKey,
  type QaRun,
  type Segment,
  type Suggestion,
  DeskError,
  MAX_TARGET,
  ME,
  qaChecks,
  suggestionFor,
} from './domain.ts'
import { seed } from './seed.ts'
import type { DeskStore } from './store.ts'

export interface DeskAdapters {
  readonly store: DeskStore
  readonly clock: () => Date
}

export class Desk {
  #state: DeskState
  readonly #adapters: DeskAdapters

  private constructor(state: DeskState, adapters: DeskAdapters) {
    this.#state = state
    this.#adapters = adapters
  }

  static async open(adapters: DeskAdapters): Promise<Desk> {
    const saved = await adapters.store.load()
    if (saved !== undefined) return new Desk(saved, adapters)
    const state = seed(adapters.clock())
    await adapters.store.save(state)
    return new Desk(state, adapters)
  }

  get state(): DeskState {
    return this.#state
  }

  now(): Date {
    return this.#adapters.clock()
  }

  locale(id: string | undefined | null): Locale {
    const locale = this.#state.locales.find((l) => l.id === id)
    if (locale === undefined) throw new DeskError('not-found', 'There is no such locale.')
    return locale
  }

  message(key: string): MessageKey {
    const message = this.#state.keys.find((k) => k.key === key)
    if (message === undefined) throw new DeskError('not-found', 'There is no such message key.')
    return message
  }

  segment(key: string, locale: string): Segment {
    const segment = this.#state.segments.find((s) => s.key === key && s.locale === locale)
    if (segment === undefined) throw new DeskError('not-found', 'There is no such segment.')
    return segment
  }

  /** The QA checks as they stand now; {@link qaRun} is what the last "Run QA" recorded. */
  liveChecks(locale: string): Check[] {
    return qaChecks(this.#state, locale)
  }

  qaRun(locale: string): QaRun | undefined {
    return this.#state.qa[locale]
  }

  /** True when a segment of the locale changed after the last QA run. */
  qaStale(locale: string): boolean {
    const run = this.qaRun(locale)
    return run === undefined || this.#state.segments.some((s) => s.locale === locale && s.updatedAt > run.at)
  }

  suggestion(key: string, locale: string): Suggestion | undefined {
    return suggestionFor(this.#state.memory, locale, this.message(key).source)
  }

  async #commit(next: DeskState): Promise<void> {
    await this.#adapters.store.save(next)
    this.#state = next
  }

  async #replace(segment: Segment): Promise<void> {
    await this.#commit({ ...this.#state, segments: this.#state.segments.map((s) => (s.key === segment.key && s.locale === segment.locale ? segment : s)) })
  }

  #touch(old: Segment, target: string): Segment {
    const text = target.trim()
    return { ...old, target: text, state: text === '' ? 'empty' : 'review', updatedAt: this.now().toISOString(), by: ME }
  }

  #editable(segment: Segment): void {
    if (segment.state === 'approved') throw new DeskError('conflict', `${segment.key} is approved. Reopen it before changing the translation.`)
  }

  /** Save a draft translation. An unchanged text saves nothing; an approved segment is refused until it is reopened. */
  async edit(key: string, locale: string, text: string | undefined): Promise<Segment> {
    this.locale(locale)
    const old = this.segment(key, locale)
    const next = (text ?? '').replace(/\r\n/g, '\n')
    if (next.length > MAX_TARGET) throw new DeskError('invalid', `A translation is at most ${String(MAX_TARGET)} characters.`)
    if (next.trim() === old.target) return old
    this.#editable(old)
    const segment = this.#touch(old, next)
    await this.#replace(segment)
    return segment
  }

  async approve(key: string, locale: string): Promise<Segment> {
    const old = this.segment(key, locale)
    if (old.state === 'empty') throw new DeskError('conflict', `${key} has no translation to approve.`)
    if (old.state === 'approved') return old
    const segment: Segment = { ...old, state: 'approved', updatedAt: this.now().toISOString(), by: ME }
    await this.#replace(segment)
    return segment
  }

  async reopen(key: string, locale: string): Promise<Segment> {
    const old = this.segment(key, locale)
    if (old.state !== 'approved') throw new DeskError('conflict', `${key} is not approved.`)
    const segment: Segment = { ...old, state: 'review', updatedAt: this.now().toISOString(), by: ME }
    await this.#replace(segment)
    return segment
  }

  /** Append the glossary term's approved translation to the target (or set it when the target is empty). */
  async insertTerm(key: string, locale: string, termId: string): Promise<Segment> {
    const old = this.segment(key, locale)
    this.#editable(old)
    const term = this.#state.glossary.find((g) => g.id === termId)
    const translation = term?.translations[locale]
    if (term === undefined || translation === undefined) throw new DeskError('not-found', 'That term has no approved translation in this locale.')
    const segment = this.#touch(old, old.target === '' ? translation : `${old.target} ${translation}`)
    await this.#replace(segment)
    return segment
  }

  /** Replace the target with the translation-memory suggestion for this segment. */
  async insertSuggestion(key: string, locale: string): Promise<{ segment: Segment; percent: number }> {
    const old = this.segment(key, locale)
    this.#editable(old)
    const s = this.suggestion(key, locale)
    if (s === undefined) throw new DeskError('not-found', 'There is no translation-memory suggestion for this string.')
    const segment = this.#touch(old, s.entry.target)
    await this.#replace(segment)
    return { segment, percent: s.percent }
  }

  /** Run the QA checks for a locale and record the result. */
  async runQa(locale: string): Promise<QaRun> {
    this.locale(locale)
    const run: QaRun = { at: this.now().toISOString(), checks: this.liveChecks(locale) }
    await this.#commit({ ...this.#state, qa: { ...this.#state.qa, [locale]: run } })
    return run
  }

  /**
   * Approve a locale: refused while QA has any error or warning (untranslated strings count), otherwise every segment that needs review becomes
   * approved. Nothing is rewritten.
   */
  async approveLocale(locale: string): Promise<number> {
    const l = this.locale(locale)
    const problems = this.liveChecks(locale).flatMap((c) => (c.level === 'error' || c.level === 'warning' ? c.issues : []))
    if (problems.length > 0) throw new DeskError('conflict', `QA must pass before ${l.name} can be approved: ${String(problems.length)} ${problems.length === 1 ? 'issue' : 'issues'} open (${problems[0] ?? ''}${problems.length > 1 ? ', …' : ''}).`)
    const at = this.now().toISOString()
    let approved = 0
    const segments = this.#state.segments.map((s) => {
      if (s.locale !== locale || s.state !== 'review') return s
      approved += 1
      return { ...s, state: 'approved' as const, updatedAt: at, by: ME }
    })
    if (approved === 0) throw new DeskError('conflict', `${l.name} is already fully approved.`)
    await this.#commit({ ...this.#state, segments, qa: { ...this.#state.qa, [locale]: { at, checks: this.liveChecks(locale) } } })
    return approved
  }
}
