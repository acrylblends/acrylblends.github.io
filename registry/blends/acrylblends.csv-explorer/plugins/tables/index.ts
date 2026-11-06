/**
 * The datasets as a plugin: it opens the datasets and saved views over the app's data home (`<home>/csv-explorer.json`) and provides them as
 * `ctx.tables`. Every page plugin injects `tables`, so switching this row off takes the pages with it.
 */
import { randomUUID } from 'node:crypto'
import { isAbsolute, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { TablesState } from './domain.ts'
import { Tables, type TablesAdapters } from './tables.ts'
import { jsonFileStore, type Store } from './store.ts'

export * from './domain.ts'
export * from './tables.ts'
export * from './store.ts'
export { seed } from './seed.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    tables: Tables
  }
}

export interface TablesConfig {
  readonly store?: Store<TablesState>
  readonly clock?: () => Date
  readonly newId?: TablesAdapters['newId']
  readonly file?: string
}

export const DEFAULT_FILE = 'csv-explorer.json'

export const name = 'tables'
export const inject = ['appInstance']

export async function apply(ctx: Context, config: TablesConfig = {}): Promise<void> {
  const file = config.file ?? DEFAULT_FILE
  const tables = await Tables.open({
    store:
      config.store ??
      jsonFileStore<TablesState>(isAbsolute(file) ? file : join(ctx.appInstance.home, file), 'CSV Explorer'),
    clock: config.clock ?? (() => new Date()),
    newId: config.newId ?? ((kind) => `${kind}-${randomUUID().slice(0, 8)}`),
  })
  ctx.provide('tables', tables)
}
