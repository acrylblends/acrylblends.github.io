/**
 * Relay's domain as a plugin: it opens the relay over the app's data home (`<home>/relay.json`) and provides it as `ctx.relay`. Every page
 * plugin injects `relay`, so switching this row off takes every page with it.
 *
 * Config (all optional, for tests and for a different home): `store`, `clock`, `newId`, `file`.
 */
import { randomUUID } from 'node:crypto'
import { isAbsolute, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '../instance/index.ts'
import { Relay, type RelayAdapters } from './relay.ts'
import { type RelayStore, jsonFileStore } from './store.ts'

export * from './domain.ts'
export * from './relay.ts'
export { seed } from './seed.ts'
export * from './store.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    relay: Relay
  }
}

export interface RelayConfig {
  readonly store?: RelayStore
  readonly clock?: () => Date
  readonly newId?: RelayAdapters['newId']
  readonly file?: string
}

export const DEFAULT_FILE = 'relay.json'

export const name = 'relay'
export const inject = ['appInstance']

export async function apply(ctx: Context, config: RelayConfig = {}): Promise<void> {
  const file = config.file ?? DEFAULT_FILE
  const relay = await Relay.open({
    store: config.store ?? jsonFileStore(isAbsolute(file) ? file : join(ctx.appInstance.home, file)),
    clock: config.clock ?? (() => new Date()),
    newId: config.newId ?? ((kind) => `${kind}-${randomUUID().slice(0, 8)}`),
  })
  ctx.provide('relay', relay)
}
