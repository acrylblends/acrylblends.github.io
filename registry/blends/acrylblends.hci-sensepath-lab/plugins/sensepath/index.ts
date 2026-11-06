/**
 * Sensepath Lab's domain as a plugin: it opens the lab over the app's data home (`<home>/sensepath-lab.json`) and provides it as `ctx.lab`. Every page
 * plugin injects `site`, so switching this row off takes every page with it.
 *
 * Config (all optional, for tests and for a different home): `store`, `clock`, `newId`, `file`.
 */
import { randomUUID } from 'node:crypto'
import { isAbsolute, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '../instance/index.ts'
import { Lab, type LabAdapters } from './lab.ts'
import { type LabStore, jsonFileStore } from './store.ts'

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

export const DEFAULT_FILE = 'sensepath-lab.json'

export const name = 'sensepath'
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
