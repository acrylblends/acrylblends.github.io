/**
 * Foundry's domain as a plugin: it opens the atlas over the app's data home (`<home>/foundry.json`) and provides it as `ctx.atlas`. Every page
 * plugin injects `atlas`, so switching this row off takes every page with it.
 *
 */
import { isAbsolute, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '../instance/index.ts'
import { Atlas, type AtlasAdapters } from './atlas.ts'
import { type AtlasStore, jsonFileStore } from './store.ts'

export * from './domain.ts'
export * from './atlas.ts'
export { seed } from './seed.ts'
export * from './store.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    atlas: Atlas
  }
}

export interface AtlasConfig {
  readonly store?: AtlasStore
  readonly clock?: () => Date
  readonly file?: string
}

export const DEFAULT_FILE = 'foundry.json'

export const name = 'foundry'
export const inject = ['appInstance']

export async function apply(ctx: Context, config: AtlasConfig = {}): Promise<void> {
  const file = config.file ?? DEFAULT_FILE
  const atlas = await Atlas.open({
    store: config.store ?? jsonFileStore(isAbsolute(file) ? file : join(ctx.appInstance.home, file)),
    clock: config.clock ?? (() => new Date()),
  })
  ctx.provide('atlas', atlas)
}
