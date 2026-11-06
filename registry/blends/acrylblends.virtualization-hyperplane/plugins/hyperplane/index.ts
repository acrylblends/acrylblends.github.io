/**
 * Hyperplane's domain as a plugin: it opens the fleet over the app's data home (`<home>/hyperplane.json`) and provides it as `ctx.fleet`. Every page
 * plugin injects `fleet`, so switching this row off takes every page with it.
 *
 * Config (all optional, for tests and for a different home): `store`, `clock`, `newId`, `file`.
 */
import { randomUUID } from 'node:crypto'
import { isAbsolute, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '../instance/index.ts'
import { Fleet, type FleetAdapters } from './fleet.ts'
import { type FleetStore, jsonFileStore } from './store.ts'

export * from './domain.ts'
export * from './fleet.ts'
export { seed } from './seed.ts'
export * from './store.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    fleet: Fleet
  }
}

export interface FleetConfig {
  readonly store?: FleetStore
  readonly clock?: () => Date
  readonly newId?: FleetAdapters['newId']
  readonly file?: string
}

export const DEFAULT_FILE = 'hyperplane.json'

export const name = 'hyperplane'
export const inject = ['appInstance']

export async function apply(ctx: Context, config: FleetConfig = {}): Promise<void> {
  const file = config.file ?? DEFAULT_FILE
  const fleet = await Fleet.open({
    store: config.store ?? jsonFileStore(isAbsolute(file) ? file : join(ctx.appInstance.home, file)),
    clock: config.clock ?? (() => new Date()),
    newId: config.newId ?? ((kind) => `${kind}-${randomUUID().slice(0, 8)}`),
  })
  ctx.provide('fleet', fleet)
}
