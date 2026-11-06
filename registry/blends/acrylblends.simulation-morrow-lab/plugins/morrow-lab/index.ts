/**
 * Morrow Lab's domain as a plugin: it opens the lab over the app's data home (`<home>/morrow-lab.json`) and provides it as `ctx.lab`. Every page
 * plugin (setup, field, traces, archive) injects `lab`, so switching this row off takes every page with it.
 *
 * Config (all optional, for tests and for a different home): `store` (a {@link LabStore}), `clock` (what time it is), `newId` (how ids are made),
 * `file` (the JSON file, relative to the app's home).
 */
import { randomUUID } from 'node:crypto'
import { isAbsolute, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '../instance/index.ts'
import { Lab, type LabAdapters } from './lab.ts'
import { jsonFileStore, type LabStore } from './store.ts'

export * from './domain.ts'
export * from './lab.ts'
export { seed } from './seed.ts'
export * from './store.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    lab: Lab
  }
}

export interface LabConfig {
  readonly store?: LabStore
  readonly clock?: () => Date
  readonly newId?: LabAdapters['newId']
  readonly file?: string
}

export const DEFAULT_FILE = 'morrow-lab.json'

export const name = 'morrow-lab'
export const inject = ['appInstance']

export async function apply(ctx: Context, config: LabConfig = {}): Promise<void> {
  const file = config.file ?? DEFAULT_FILE
  const lab = await Lab.open({
    store: config.store ?? jsonFileStore(isAbsolute(file) ? file : join(ctx.appInstance.home, file)),
    clock: config.clock ?? (() => new Date()),
    newId: config.newId ?? ((kind) => `${kind}-${randomUUID().slice(0, 8)}`),
  })
  ctx.provide('lab', lab)
}
