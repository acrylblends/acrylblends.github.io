/**
 * Pulsebus's domain as a plugin: it opens the bus over the app's data home (`<home>/pulsebus.json`) and provides it as `ctx.bus`. Every page
 * plugin injects `bus`, so switching this row off takes every page with it.
 *
 */
import { isAbsolute, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '../instance/index.ts'
import { Bus, type BusAdapters } from './bus.ts'
import { type BusStore, jsonFileStore } from './store.ts'

export * from './domain.ts'
export * from './bus.ts'
export { seed } from './seed.ts'
export * from './store.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    bus: Bus
  }
}

export interface BusConfig {
  readonly store?: BusStore
  readonly clock?: () => Date
  readonly file?: string
}

export const DEFAULT_FILE = 'pulsebus.json'

export const name = 'pulsebus'
export const inject = ['appInstance']

export async function apply(ctx: Context, config: BusConfig = {}): Promise<void> {
  const file = config.file ?? DEFAULT_FILE
  const bus = await Bus.open({
    store: config.store ?? jsonFileStore(isAbsolute(file) ? file : join(ctx.appInstance.home, file)),
    clock: config.clock ?? (() => new Date()),
  })
  ctx.provide('bus', bus)
}
