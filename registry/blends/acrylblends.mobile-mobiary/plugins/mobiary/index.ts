/**
 * Mobiary's domain as a plugin: it opens the journal over the app's data home (`<home>/mobiary.json`) and provides it as `ctx.journal`. Every page
 * plugin injects `journal`, so switching this row off takes every page with it.
 *
 * Config (all optional, for tests and for a different home): `store`, `clock`, `newId`, `file`.
 */
import { randomUUID } from 'node:crypto'
import { isAbsolute, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '../instance/index.ts'
import { Journal, type JournalAdapters } from './journal.ts'
import { type JournalStore, jsonFileStore } from './store.ts'

export * from './domain.ts'
export * from './journal.ts'
export { seed } from './seed.ts'
export * from './store.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    journal: Journal
  }
}

export interface JournalConfig {
  readonly store?: JournalStore
  readonly clock?: () => Date
  readonly newId?: JournalAdapters['newId']
  readonly file?: string
}

export const DEFAULT_FILE = 'mobiary.json'

export const name = 'mobiary'
export const inject = ['appInstance']

export async function apply(ctx: Context, config: JournalConfig = {}): Promise<void> {
  const file = config.file ?? DEFAULT_FILE
  const journal = await Journal.open({
    store: config.store ?? jsonFileStore(isAbsolute(file) ? file : join(ctx.appInstance.home, file)),
    clock: config.clock ?? (() => new Date()),
    newId: config.newId ?? ((kind) => `${kind}-${randomUUID().slice(0, 8)}`),
  })
  ctx.provide('journal', journal)
}
