/**
 * Northstar GRC's domain as a plugin: it opens the workspace over the app's data home (`<home>/northstar-grc.json`) and provides it as `ctx.grc`. Every page
 * plugin injects `site`, so switching this row off takes every page with it.
 *
 * Config (all optional, for tests and for a different home): `store`, `clock`, `newId`, `file`.
 */
import { randomUUID } from 'node:crypto'
import { isAbsolute, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '../instance/index.ts'
import { Grc, type GrcAdapters } from './grc.ts'
import { type GrcStore, jsonFileStore } from './store.ts'

export * from './domain.ts'
export * from './grc.ts'
export { seed } from './seed.ts'
export * from './store.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    grc: Grc
  }
}

export interface GrcConfig {
  readonly store?: GrcStore
  readonly clock?: () => Date
  readonly newId?: GrcAdapters['newId']
  readonly file?: string
}

export const DEFAULT_FILE = 'northstar-grc.json'

export const name = 'grc'
export const inject = ['appInstance']

export async function apply(ctx: Context, config: GrcConfig = {}): Promise<void> {
  const file = config.file ?? DEFAULT_FILE
  const grc = await Grc.open({
    store: config.store ?? jsonFileStore(isAbsolute(file) ? file : join(ctx.appInstance.home, file)),
    clock: config.clock ?? (() => new Date()),
    newId: config.newId ?? ((kind) => `${kind}-${randomUUID().slice(0, 8)}`),
  })
  ctx.provide('grc', grc)
}
