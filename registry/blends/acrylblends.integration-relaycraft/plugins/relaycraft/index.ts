/**
 * Relaycraft's domain as a plugin: it opens the studio over the app's data home (`<home>/relaycraft.json`) and provides it as `ctx.studio`. Every page
 * plugin injects `studio`, so switching this row off takes every page with it.
 *
 * Config (all optional, for tests and for a different home): `store`, `clock`, `newId`, `file`.
 */
import { randomUUID } from 'node:crypto'
import { isAbsolute, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '../instance/index.ts'
import { Studio, type StudioAdapters } from './studio.ts'
import { type StudioStore, jsonFileStore } from './store.ts'

export * from './domain.ts'
export * from './studio.ts'
export { seed } from './seed.ts'
export * from './store.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    studio: Studio
  }
}

export interface StudioConfig {
  readonly store?: StudioStore
  readonly clock?: () => Date
  readonly newId?: StudioAdapters['newId']
  readonly file?: string
}

export const DEFAULT_FILE = 'relaycraft.json'

export const name = 'relaycraft'
export const inject = ['appInstance']

export async function apply(ctx: Context, config: StudioConfig = {}): Promise<void> {
  const file = config.file ?? DEFAULT_FILE
  const studio = await Studio.open({
    store: config.store ?? jsonFileStore(isAbsolute(file) ? file : join(ctx.appInstance.home, file)),
    clock: config.clock ?? (() => new Date()),
    newId: config.newId ?? ((kind) => `${kind}-${randomUUID().slice(0, 8)}`),
  })
  ctx.provide('studio', studio)
}
