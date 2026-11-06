/**
 * Blockscope Explorer's domain as a plugin: it opens the explorer over the app's data home (`<home>/blockscope.json`) and provides it as `ctx.chain`. Every page
 * plugin injects `site`, so switching this row off takes every page with it.
 *
 * Config (all optional, for tests and for a different home): `store`, `clock`, `file`.
 */
import { isAbsolute, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '../instance/index.ts'
import { Chain, type ChainAdapters } from './chain.ts'
import { type ChainStore, jsonFileStore } from './store.ts'

export * from './domain.ts'
export * from './chain.ts'
export { seed } from './seed.ts'
export * from './store.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    chain: Chain
  }
}

export interface ChainConfig {
  readonly store?: ChainStore
  readonly clock?: () => Date
  readonly file?: string
}

export const DEFAULT_FILE = 'blockscope.json'

export const name = 'blockscope'
export const inject = ['appInstance']

export async function apply(ctx: Context, config: ChainConfig = {}): Promise<void> {
  const file = config.file ?? DEFAULT_FILE
  const chain = await Chain.open({
    store: config.store ?? jsonFileStore(isAbsolute(file) ? file : join(ctx.appInstance.home, file)),
    clock: config.clock ?? (() => new Date()),
  })
  ctx.provide('chain', chain)
}
