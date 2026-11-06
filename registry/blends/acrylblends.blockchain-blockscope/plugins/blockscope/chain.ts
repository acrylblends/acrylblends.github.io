/**
 * The chain (`ctx.chain`): the saved head and watchlist. Everything else is generated from the height by the domain functions. A change saves through the
 * store and only then becomes current, so a failed save leaves the explorer as it was.
 */
import { type Anchor, type Block, type ChainState, type Hit, ChainError, GENESIS, MAX_WATCH, blockAt, search } from './domain.ts'
import { seed } from './seed.ts'
import type { ChainStore } from './store.ts'

export interface ChainAdapters {
  readonly store: ChainStore
  readonly clock: () => Date
}

export class Chain {
  #state: ChainState
  readonly #adapters: ChainAdapters

  private constructor(state: ChainState, adapters: ChainAdapters) {
    this.#state = state
    this.#adapters = adapters
  }

  static async open(adapters: ChainAdapters): Promise<Chain> {
    const saved = await adapters.store.load()
    if (saved !== undefined) return new Chain(saved, adapters)
    const state = seed(adapters.clock())
    await adapters.store.save(state)
    return new Chain(state, adapters)
  }

  get state(): ChainState {
    return this.#state
  }

  now(): Date {
    return this.#adapters.clock()
  }

  get anchor(): Anchor {
    return this.#state.anchor
  }

  get head(): number {
    return this.#state.anchor.height
  }

  block(height: number): Block {
    if (!Number.isInteger(height) || height < GENESIS || height > this.head) throw new ChainError('not-found', `There is no block ${String(height)} on this chain.`)
    return blockAt(this.#state.anchor, height)
  }

  search(query: string): Hit[] {
    return search(this.#state.anchor, query)
  }

  async #commit(next: ChainState): Promise<void> {
    await this.#adapters.store.save(next)
    this.#state = next
  }

  /** Produce the next demo block: the head moves up one and is stamped now. Older blocks keep their heights, hashes and transactions. */
  async advance(): Promise<Block> {
    const height = this.head + 1
    await this.#commit({ ...this.#state, anchor: { height, at: this.now().toISOString() }, produced: this.#state.produced + 1 })
    return this.block(height)
  }

  isWatched(key: string): boolean {
    return this.#state.watch.includes(key)
  }

  /** Watch or unwatch a block, a transaction or an address. */
  async toggleWatch(kind: string | undefined, id: string | undefined): Promise<{ key: string; watching: boolean }> {
    if (kind !== 'block' && kind !== 'tx' && kind !== 'address') throw new ChainError('invalid', 'Watch a block, a transaction or an address.')
    const clean = (id ?? '').trim().toLowerCase()
    if (kind === 'block' ? !/^\d+$/.test(clean) || Number(clean) > this.head || Number(clean) < GENESIS : kind === 'tx' ? !/^0x[0-9a-f]{64}$/.test(clean) : !/^0x[0-9a-f]{40}$/.test(clean)) throw new ChainError('invalid', `That is not a ${kind} on this chain.`)
    const key = `${kind}:${clean}`
    if (this.isWatched(key)) {
      await this.#commit({ ...this.#state, watch: this.#state.watch.filter((k) => k !== key) })
      return { key, watching: false }
    }
    if (this.#state.watch.length >= MAX_WATCH) throw new ChainError('conflict', `At most ${String(MAX_WATCH)} items can be watched.`)
    await this.#commit({ ...this.#state, watch: [...this.#state.watch, key] })
    return { key, watching: true }
  }
}
