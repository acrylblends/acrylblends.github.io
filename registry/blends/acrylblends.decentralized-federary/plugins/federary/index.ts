/**
 * Federary Network's domain as a plugin: it opens the network over the app's data home (`<home>/federary-network.json`) and provides it as `ctx.fed`. Every page
 * plugin injects `site`, so switching this row off takes every page with it.
 *
 * Config (all optional, for tests and for a different home): `store`, `clock`, `newId`, `file`.
 */
import { randomUUID } from 'node:crypto'
import { isAbsolute, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '../instance/index.ts'
import { Fed, type FedAdapters } from './fed.ts'
import { type FedStore, jsonFileStore } from './store.ts'

export * from './domain.ts'
export * from './fed.ts'
export { seed } from './seed.ts'
export * from './store.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    fed: Fed
  }
}

export interface FedConfig {
  readonly store?: FedStore
  readonly clock?: () => Date
  readonly newId?: FedAdapters['newId']
  readonly file?: string
}

export const DEFAULT_FILE = 'federary-network.json'

export const name = 'federary'
export const inject = ['appInstance']

export async function apply(ctx: Context, config: FedConfig = {}): Promise<void> {
  const file = config.file ?? DEFAULT_FILE
  const fed = await Fed.open({
    store: config.store ?? jsonFileStore(isAbsolute(file) ? file : join(ctx.appInstance.home, file)),
    clock: config.clock ?? (() => new Date()),
    newId: config.newId ?? ((kind) => `${kind}-${randomUUID().slice(0, 8)}`),
  })
  ctx.provide('fed', fed)
}
