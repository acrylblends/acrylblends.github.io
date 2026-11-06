/**
 * The atlas (`ctx.atlas`): the saved state and every change to it. A change checks its input, builds the next state, saves it through the store and
 * only then makes it current, so a failed save leaves the atlas as it was.
 */
import {
  type AtlasState,
  AtlasError,
  type Filter,
  type Pkg,
  type StackEntry,
  MAX_STACK,
  filterPackages,
  parseVersion,
} from './domain.ts'
import { seed } from './seed.ts'
import type { AtlasStore } from './store.ts'

export interface AtlasAdapters {
  readonly store: AtlasStore
  readonly clock: () => Date
}

export class Atlas {
  #state: AtlasState
  readonly #adapters: AtlasAdapters

  private constructor(state: AtlasState, adapters: AtlasAdapters) {
    this.#state = state
    this.#adapters = adapters
  }

  static async open(adapters: AtlasAdapters): Promise<Atlas> {
    const saved = await adapters.store.load()
    if (saved !== undefined) return new Atlas(saved, adapters)
    const state = seed()
    await adapters.store.save(state)
    return new Atlas(state, adapters)
  }

  get state(): AtlasState {
    return this.#state
  }

  now(): Date {
    return this.#adapters.clock()
  }

  package(id: string): Pkg {
    const pkg = this.#state.packages.find((p) => p.id === id)
    if (pkg === undefined) throw new AtlasError('not-found', 'There is no such package.')
    return pkg
  }

  search(filter: Filter): Pkg[] {
    return filterPackages(this.#state.packages, filter)
  }

  inStack(id: string): StackEntry | undefined {
    return this.#state.stack.find((e) => e.packageId === id)
  }

  async #commit(next: AtlasState): Promise<void> {
    await this.#adapters.store.save(next)
    this.#state = next
  }

  /** Add a package at a version (the latest when none is named) to the local stack. */
  async addToStack(id: string, version?: string): Promise<StackEntry> {
    const pkg = this.package(id)
    const v = parseVersion(pkg, version)
    if (this.inStack(id) !== undefined) throw new AtlasError('conflict', `${pkg.name} is already in the stack.`)
    if (this.#state.stack.length >= MAX_STACK) throw new AtlasError('conflict', `A stack holds at most ${String(MAX_STACK)} packages.`)
    const entry: StackEntry = { packageId: id, version: v, addedAt: this.now().toISOString() }
    await this.#commit({ ...this.#state, stack: [...this.#state.stack, entry] })
    return entry
  }

  /** Pin a stack entry to another of the package's versions. */
  async pin(id: string, version: string | undefined): Promise<StackEntry> {
    const pkg = this.package(id)
    const entry = this.inStack(id)
    if (entry === undefined) throw new AtlasError('not-found', `${pkg.name} is not in the stack.`)
    const next = { ...entry, version: parseVersion(pkg, version) }
    await this.#commit({ ...this.#state, stack: this.#state.stack.map((e) => (e.packageId === id ? next : e)) })
    return next
  }

  async removeFromStack(id: string): Promise<void> {
    const pkg = this.package(id)
    if (this.inStack(id) === undefined) throw new AtlasError('not-found', `${pkg.name} is not in the stack.`)
    await this.#commit({ ...this.#state, stack: this.#state.stack.filter((e) => e.packageId !== id) })
  }

  async clearStack(): Promise<void> {
    if (this.#state.stack.length === 0) throw new AtlasError('conflict', 'The stack is already empty.')
    await this.#commit({ ...this.#state, stack: [] })
  }
}
