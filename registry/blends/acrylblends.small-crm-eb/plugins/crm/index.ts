/**
 * Small CRM's domain as a plugin: it opens the CRM over the app's data home (`<home>/small-crm.json`) and provides it as `ctx.crm`. Every page plugin
 * (pipeline, deals, contacts, companies, activities, reports) injects `crm`, so switching this row off takes every page with it.
 *
 * Config (all optional, for tests and for a different home): `store` (a {@link Store}), `clock` (what time it is), `newId` (how ids are made),
 * `file` (the JSON file, relative to the app's home).
 */
import { randomUUID } from 'node:crypto'
import { isAbsolute, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { Crm, type CrmAdapters } from './crm.ts'
import type { CrmState } from './domain.ts'
import { jsonFileStore, type Store } from './store.ts'

export * from './crm.ts'
export * from './domain.ts'
export { seed } from './seed.ts'
export * from './store.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    crm: Crm
  }
}

export interface CrmConfig {
  readonly store?: Store<CrmState>
  readonly clock?: () => Date
  readonly newId?: CrmAdapters['newId']
  readonly file?: string
}

export const DEFAULT_FILE = 'small-crm.json'

export const name = 'crm'
export const inject = ['appInstance']

export async function apply(ctx: Context, config: CrmConfig = {}): Promise<void> {
  const file = config.file ?? DEFAULT_FILE
  const crm = await Crm.open({
    store: config.store ?? jsonFileStore<CrmState>(isAbsolute(file) ? file : join(ctx.appInstance.home, file), 'Small CRM'),
    clock: config.clock ?? (() => new Date()),
    newId: config.newId ?? ((kind) => `${kind}-${randomUUID().slice(0, 8)}`),
  })
  ctx.provide('crm', crm)
}
