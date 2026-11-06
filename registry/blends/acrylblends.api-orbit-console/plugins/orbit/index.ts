/**
 * Orbit's domain as a plugin: it opens the orbit over the app's data home (`<home>/orbit.json`) and provides it as `ctx.orbit`. Every page
 * plugin injects `orbit`, so switching this row off takes every page with it.
 *
 */
import { isAbsolute, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '../instance/index.ts'
import { Orbit, type OrbitAdapters } from './console.ts'
import { type OrbitStore, jsonFileStore } from './store.ts'

export * from './domain.ts'
export * from './console.ts'
export { seed } from './seed.ts'
export * from './store.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    orbit: Orbit
  }
}

export interface OrbitConfig {
  readonly store?: OrbitStore
  readonly clock?: () => Date
  readonly file?: string
}

export const DEFAULT_FILE = 'orbit.json'

export const name = 'orbit'
export const inject = ['appInstance']

export async function apply(ctx: Context, config: OrbitConfig = {}): Promise<void> {
  const file = config.file ?? DEFAULT_FILE
  const orbit = await Orbit.open({
    store: config.store ?? jsonFileStore(isAbsolute(file) ? file : join(ctx.appInstance.home, file)),
    clock: config.clock ?? (() => new Date()),
  })
  ctx.provide('orbit', orbit)
}
