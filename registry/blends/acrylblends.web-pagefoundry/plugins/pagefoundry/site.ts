/**
 * The site (`ctx.site`): the saved state and every change to it. A change checks its input, builds the next state, saves it through the store and only
 * then makes it current, so a failed save leaves the site as it was.
 */
import {
  type BlockKind,
  type Build,
  type Page,
  type Section,
  type SectionEdit,
  type SiteState,
  SiteError,
  MAX_PAGES,
  MAX_SECTIONS,
  BLOCKS,
  editSection,
  newSection,
  nextVersion,
  pageIdOf,
  publishProblems,
  publishWarnings,
} from './domain.ts'
import { seed } from './seed.ts'
import type { SiteStore } from './store.ts'

export interface SiteAdapters {
  readonly store: SiteStore
  readonly clock: () => Date
  readonly newId: (kind: 'section') => string
}

export class Site {
  #state: SiteState
  readonly #adapters: SiteAdapters

  private constructor(state: SiteState, adapters: SiteAdapters) {
    this.#state = state
    this.#adapters = adapters
  }

  static async open(adapters: SiteAdapters): Promise<Site> {
    const saved = await adapters.store.load()
    if (saved !== undefined) return new Site(saved, adapters)
    const state = seed()
    await adapters.store.save(state)
    return new Site(state, adapters)
  }

  get state(): SiteState {
    return this.#state
  }

  now(): Date {
    return this.#adapters.clock()
  }

  page(id: string): Page {
    const page = this.#state.pages.find((p) => p.id === id)
    if (page === undefined) throw new SiteError('not-found', 'There is no such page.')
    return page
  }

  section(pageId: string, sectionId: string): Section {
    const section = this.page(pageId).sections.find((s) => s.id === sectionId)
    if (section === undefined) throw new SiteError('not-found', 'There is no such section.')
    return section
  }

  async #commit(next: SiteState): Promise<void> {
    await this.#adapters.store.save(next)
    this.#state = next
  }

  #withPage(page: Page, extra: Partial<SiteState> = {}): SiteState {
    return { ...this.#state, ...extra, pages: this.#state.pages.map((p) => (p.id === page.id ? page : p)) }
  }

  /** Add a page with a hero section; its id comes from its name. */
  async addPage(rawName: string | undefined): Promise<Page> {
    const name = (rawName ?? '').trim()
    if (name === '') throw new SiteError('invalid', 'Give the page a name.')
    if (name.length > 30) throw new SiteError('invalid', 'A page name is at most 30 characters.')
    if (this.#state.pages.length >= MAX_PAGES) throw new SiteError('conflict', `A site holds at most ${String(MAX_PAGES)} pages.`)
    const id = pageIdOf(name)
    if (id === '' || this.#state.pages.some((p) => p.id === id)) throw new SiteError('conflict', `There is already a page called ${name}.`)
    const page: Page = { id, name, sections: [{ ...newSection('hero', this.#adapters.newId('section')), headline: name }] }
    await this.#commit({ ...this.#state, pages: [...this.#state.pages, page] })
    return page
  }

  async deletePage(id: string): Promise<void> {
    const page = this.page(id)
    if (this.#state.pages[0]?.id === id) throw new SiteError('conflict', 'The first page is the home page and cannot be deleted.')
    await this.#commit({ ...this.#state, pages: this.#state.pages.filter((p) => p.id !== page.id) })
  }

  /** Insert a block at the end of a page. */
  async addSection(pageId: string, kind: string | undefined): Promise<Section> {
    const page = this.page(pageId)
    const block = BLOCKS.find((b) => b.kind === kind)
    if (block === undefined) throw new SiteError('invalid', 'Pick a block from the library.')
    if (page.sections.length >= MAX_SECTIONS) throw new SiteError('conflict', `A page holds at most ${String(MAX_SECTIONS)} sections.`)
    const section = newSection(block.kind as BlockKind, this.#adapters.newId('section'))
    await this.#commit(this.#withPage({ ...page, sections: [...page.sections, section] }))
    return section
  }

  async editSection(pageId: string, sectionId: string, edit: SectionEdit): Promise<Section> {
    const page = this.page(pageId)
    const next = editSection(this.section(pageId, sectionId), edit)
    await this.#commit(this.#withPage({ ...page, sections: page.sections.map((s) => (s.id === sectionId ? next : s)) }))
    return next
  }

  async moveSection(pageId: string, sectionId: string, direction: 'up' | 'down'): Promise<void> {
    const page = this.page(pageId)
    const index = page.sections.findIndex((s) => s.id === sectionId)
    if (index === -1) throw new SiteError('not-found', 'There is no such section.')
    const target = direction === 'up' ? index - 1 : index + 1
    if (target < 0) throw new SiteError('conflict', 'That section is already first.')
    if (target >= page.sections.length) throw new SiteError('conflict', 'That section is already last.')
    const sections = [...page.sections]
    const a = sections[index]
    const b = sections[target]
    if (a === undefined || b === undefined) throw new SiteError('conflict', 'Nothing to swap with.')
    sections[index] = b
    sections[target] = a
    await this.#commit(this.#withPage({ ...page, sections }))
  }

  async deleteSection(pageId: string, sectionId: string): Promise<void> {
    const page = this.page(pageId)
    this.section(pageId, sectionId)
    await this.#commit(this.#withPage({ ...page, sections: page.sections.filter((s) => s.id !== sectionId) }))
  }

  async setTheme(accent: string | undefined, font: string | undefined): Promise<void> {
    if (!/^#[0-9a-fA-F]{6}$/.test(accent ?? '')) throw new SiteError('invalid', 'The accent is a colour like #e16c4c.')
    if (font !== 'serif' && font !== 'sans') throw new SiteError('invalid', 'Pick serif or sans for the headings.')
    await this.#commit({ ...this.#state, theme: { accent: (accent ?? '').toLowerCase(), serif: font === 'serif' } })
  }

  /** Toggle preview mode (the editor's panels fold away). */
  async setPreview(preview: boolean, device?: 'desktop' | 'mobile'): Promise<void> {
    await this.#commit({ ...this.#state, view: { preview, device: device ?? this.#state.view.device } })
  }

  /** Record a simulated build; refused while a page has no sections, with contrast warnings kept on the build. */
  async publish(): Promise<Build> {
    const problems = publishProblems(this.#state.pages)
    if (problems.length > 0) throw new SiteError('conflict', `Cannot publish: ${problems.join(' ')}`)
    const build: Build = {
      version: nextVersion(this.#state.builds),
      at: this.now().toISOString(),
      pages: this.#state.pages.length,
      sections: this.#state.pages.reduce((n, p) => n + p.sections.length, 0),
      warnings: publishWarnings(this.#state.pages),
    }
    await this.#commit({ ...this.#state, builds: [...this.#state.builds, build] })
    return build
  }
}
