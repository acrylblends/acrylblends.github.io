/**
 * Gatehouse's domain as a plugin: it opens the gate over the app's data home (`<home>/gatehouse.json`) and provides it as `ctx.gate`. Every page
 * plugin injects `gate`, so switching this row off takes every page with it.
 *
 */
import { isAbsolute, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '../instance/index.ts'
import { Gate, type GateAdapters } from './gate.ts'
import { type GateStore, jsonFileStore } from './store.ts'

export * from './domain.ts'
export * from './gate.ts'
export { seed } from './seed.ts'
export * from './store.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    gate: Gate
  }
}

export interface GateConfig {
  readonly store?: GateStore
  readonly clock?: () => Date
  readonly file?: string
}

export const DEFAULT_FILE = 'gatehouse.json'

export const name = 'gatehouse'
export const inject = ['appInstance']

export async function apply(ctx: Context, config: GateConfig = {}): Promise<void> {
  const file = config.file ?? DEFAULT_FILE
  const gate = await Gate.open({
    store: config.store ?? jsonFileStore(isAbsolute(file) ? file : join(ctx.appInstance.home, file)),
    clock: config.clock ?? (() => new Date()),
  })
  ctx.provide('gate', gate)
}
