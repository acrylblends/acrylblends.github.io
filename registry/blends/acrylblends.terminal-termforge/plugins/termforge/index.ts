/**
 * Termforge's domain as a plugin: it opens the workspace over the app's data home (`<home>/termforge.json`) and provides it as `ctx.forge`. Every page
 * plugin injects `site`, so switching this row off takes every page with it.
 *
 * Config (all optional, for tests and for a different home): `store`, `clock`, `newId`, `file`.
 */
import { randomUUID } from 'node:crypto'
import { isAbsolute, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '../instance/index.ts'
import { Forge, type ForgeAdapters } from './forge.ts'
import { type ForgeStore, jsonFileStore } from './store.ts'

export * from './domain.ts'
export * from './forge.ts'
export { seed } from './seed.ts'
export * from './store.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    forge: Forge
  }
}

export interface ForgeConfig {
  readonly store?: ForgeStore
  readonly clock?: () => Date
  readonly newId?: ForgeAdapters['newId']
  readonly file?: string
}

export const DEFAULT_FILE = 'termforge.json'

export const name = 'termforge'
export const inject = ['appInstance']

export async function apply(ctx: Context, config: ForgeConfig = {}): Promise<void> {
  const file = config.file ?? DEFAULT_FILE
  const forge = await Forge.open({
    store: config.store ?? jsonFileStore(isAbsolute(file) ? file : join(ctx.appInstance.home, file)),
    clock: config.clock ?? (() => new Date()),
    newId: config.newId ?? ((kind) => `${kind}-${randomUUID().slice(0, 8)}`),
  })
  ctx.provide('forge', forge)
}
