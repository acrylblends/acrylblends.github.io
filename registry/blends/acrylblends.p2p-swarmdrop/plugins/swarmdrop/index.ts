/**
 * Swarmdrop's domain as a plugin: it opens the swarm over the app's data home (`<home>/swarmdrop.json`) and provides it as `ctx.swarm`. Every page
 * plugin injects `site`, so switching this row off takes every page with it.
 *
 * Config (all optional, for tests and for a different home): `store`, `clock`, `file`.
 */
import { isAbsolute, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '../instance/index.ts'
import { Swarm, type SwarmAdapters } from './swarm.ts'
import { type SwarmStore, jsonFileStore } from './store.ts'

export * from './domain.ts'
export * from './swarm.ts'
export { seed } from './seed.ts'
export * from './store.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    swarm: Swarm
  }
}

export interface SwarmConfig {
  readonly store?: SwarmStore
  readonly clock?: () => Date
  readonly file?: string
}

export const DEFAULT_FILE = 'swarmdrop.json'

export const name = 'swarmdrop'
export const inject = ['appInstance']

export async function apply(ctx: Context, config: SwarmConfig = {}): Promise<void> {
  const file = config.file ?? DEFAULT_FILE
  const swarm = await Swarm.open({
    store: config.store ?? jsonFileStore(isAbsolute(file) ? file : join(ctx.appInstance.home, file)),
    clock: config.clock ?? (() => new Date()),
  })
  ctx.provide('swarm', swarm)
}
