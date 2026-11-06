/**
 * The forge (`ctx.forge`): the saved workspaces and every change to them. A change checks its input, builds the next state, saves it through the store
 * and only then makes it current, so a failed save leaves the state as it was. Nothing it does runs a process.
 */
import {
  type Command,
  type Entry,
  type ForgeState,
  type Snippet,
  type Tab,
  type Task,
  type Workspace,
  COMMANDS,
  ForgeError,
  MAX_ENTRIES,
  MAX_SNIPPETS,
  MAX_TABS,
  TASKS,
  execute,
  parseCommand,
} from './domain.ts'
import { seed } from './seed.ts'
import type { ForgeStore } from './store.ts'

export interface ForgeAdapters {
  readonly store: ForgeStore
  readonly clock: () => Date
  readonly newId: (kind: 'entry' | 'tab' | 'snippet') => string
}

export class Forge {
  #state: ForgeState
  readonly #adapters: ForgeAdapters

  private constructor(state: ForgeState, adapters: ForgeAdapters) {
    this.#state = state
    this.#adapters = adapters
  }

  static async open(adapters: ForgeAdapters): Promise<Forge> {
    const saved = await adapters.store.load()
    if (saved !== undefined) return new Forge(saved, adapters)
    const state = seed()
    await adapters.store.save(state)
    return new Forge(state, adapters)
  }

  get state(): ForgeState {
    return this.#state
  }

  now(): Date {
    return this.#adapters.clock()
  }

  workspace(id: string): Workspace {
    const ws = this.#state.workspaces.find((w) => w.id === id)
    if (ws === undefined) throw new ForgeError('not-found', 'There is no such workspace.')
    return ws
  }

  tab(workspaceId: string, tabId: string): Tab {
    const tab = this.workspace(workspaceId).tabs.find((t) => t.id === tabId)
    if (tab === undefined) throw new ForgeError('not-found', 'There is no such tab.')
    return tab
  }

  task(id: string): Task {
    const task = TASKS.find((t) => t.id === id)
    if (task === undefined) throw new ForgeError('not-found', 'There is no such task.')
    return task
  }

  async #commit(next: ForgeState): Promise<void> {
    await this.#adapters.store.save(next)
    this.#state = next
  }

  #withTab(ws: Workspace, tab: Tab): ForgeState {
    const workspace: Workspace = { ...ws, tabs: ws.tabs.map((t) => (t.id === tab.id ? tab : t)) }
    return { ...this.#state, workspaces: this.#state.workspaces.map((w) => (w.id === ws.id ? workspace : w)) }
  }

  #run(ws: Workspace, tab: Tab, command: Command, refusal?: { status: number; message: string }): Tab {
    if (command === 'clear') return { ...tab, entries: [], cleared: true }
    const result = refusal ?? execute(command, ws, tab, this.now())
    const entry: Entry = {
      id: this.#adapters.newId('entry'),
      command,
      output: 'message' in result ? result.message : result.output,
      status: result.status,
      at: this.now().toISOString(),
    }
    return { ...tab, cleared: false, entries: [...tab.entries, entry].slice(-MAX_ENTRIES) }
  }

  /**
   * Run what was typed in a tab. An allowed command is answered from the fixtures; anything else is recorded as refused (status 126 or 127) and never
   * interpreted; the refusal is kept in the tab so the terminal shows it, and recall skips it.
   */
  async run(workspaceId: string, tabId: string, raw: string | undefined): Promise<Entry | undefined> {
    const ws = this.workspace(workspaceId)
    const tab = this.tab(workspaceId, tabId)
    const parsed = parseCommand(raw)
    if (!parsed.ok) {
      const typed = (raw ?? '').trim().replace(/\s+/g, ' ')
      const entry: Entry = { id: this.#adapters.newId('entry'), command: typed, output: parsed.message, status: parsed.status, at: this.now().toISOString() }
      await this.#commit(this.#withTab(ws, { ...tab, cleared: false, entries: [...tab.entries, entry].slice(-MAX_ENTRIES) }))
      return entry
    }
    const next = this.#run(ws, tab, parsed.command)
    await this.#commit(this.#withTab(ws, next))
    return next.entries.at(-1)
  }

  /** Empty a tab's terminal. */
  async clear(workspaceId: string, tabId: string): Promise<void> {
    const ws = this.workspace(workspaceId)
    await this.#commit(this.#withTab(ws, this.#run(ws, this.tab(workspaceId, tabId), 'clear')))
  }

  /** Run a task's commands in order in a tab; one save for the whole routine. A failing step stops it. */
  async runTask(workspaceId: string, tabId: string, taskId: string): Promise<Entry[]> {
    const ws = this.workspace(workspaceId)
    const task = this.task(taskId)
    let tab = this.tab(workspaceId, tabId)
    const ran: Entry[] = []
    for (const step of task.steps) {
      tab = this.#run(ws, { ...tab }, step)
      const entry = tab.entries.at(-1)
      if (entry === undefined) break
      ran.push(entry)
      if (entry.status !== 0) break
    }
    await this.#commit(this.#withTab(ws, tab))
    return ran
  }

  async addTab(workspaceId: string): Promise<Tab> {
    const ws = this.workspace(workspaceId)
    if (ws.tabs.length >= MAX_TABS) throw new ForgeError('conflict', `A workspace holds at most ${String(MAX_TABS)} tabs.`)
    const tab: Tab = { id: this.#adapters.newId('tab'), name: 'zsh', entries: [], cleared: false }
    const workspace: Workspace = { ...ws, tabs: [...ws.tabs, tab] }
    await this.#commit({ ...this.#state, workspaces: this.#state.workspaces.map((w) => (w.id === ws.id ? workspace : w)) })
    return tab
  }

  async closeTab(workspaceId: string, tabId: string): Promise<void> {
    const ws = this.workspace(workspaceId)
    this.tab(workspaceId, tabId)
    if (ws.tabs.length === 1) throw new ForgeError('conflict', 'A workspace keeps at least one tab.')
    const workspace: Workspace = { ...ws, tabs: ws.tabs.filter((t) => t.id !== tabId) }
    await this.#commit({ ...this.#state, workspaces: this.#state.workspaces.map((w) => (w.id === ws.id ? workspace : w)) })
  }

  async addSnippet(rawLabel: string | undefined, rawCommand: string | undefined): Promise<Snippet> {
    const label = (rawLabel ?? '').trim()
    if (label === '') throw new ForgeError('invalid', 'Give the snippet a name.')
    if (label.length > 30) throw new ForgeError('invalid', 'A snippet name is at most 30 characters.')
    const command = COMMANDS.find((c) => c === (rawCommand ?? '').trim().replace(/\s+/g, ' '))
    if (command === undefined) throw new ForgeError('invalid', 'A snippet holds one command from the allowlist.')
    if (this.#state.snippets.length >= MAX_SNIPPETS) throw new ForgeError('conflict', `At most ${String(MAX_SNIPPETS)} snippets can be kept.`)
    if (this.#state.snippets.some((s) => s.label.toLowerCase() === label.toLowerCase())) throw new ForgeError('conflict', `There is already a snippet called ${label}.`)
    const snippet: Snippet = { id: this.#adapters.newId('snippet'), label, command }
    await this.#commit({ ...this.#state, snippets: [...this.#state.snippets, snippet] })
    return snippet
  }

  async deleteSnippet(id: string): Promise<void> {
    const snippet = this.#state.snippets.find((s) => s.id === id)
    if (snippet === undefined) throw new ForgeError('not-found', 'There is no such snippet.')
    await this.#commit({ ...this.#state, snippets: this.#state.snippets.filter((s) => s.id !== id) })
  }
}
