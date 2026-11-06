/**
 * Restorepoint's domain as a plugin: it opens the operations state over the app's data home (`<home>/restorepoint.json`) and provides it as `ctx.ops`. Every page
 * plugin injects `site`, so switching this row off takes every page with it.
 *
 * Config (all optional, for tests and for a different home): `store`, `clock`, `newId`, `file`.
 */
import { randomUUID } from 'node:crypto'
import { isAbsolute, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '../instance/index.ts'
import { Ops, type OpsAdapters } from './ops.ts'
import { type OpsStore, jsonFileStore } from './store.ts'

export * from './domain.ts'
export * from './ops.ts'
export { seed } from './seed.ts'
export * from './store.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    ops: Ops
  }
}

export interface OpsConfig {
  readonly store?: OpsStore
  readonly clock?: () => Date
  readonly newId?: OpsAdapters['newId']
  readonly file?: string
}

export const DEFAULT_FILE = 'restorepoint.json'

export const name = 'restorepoint'
export const inject = ['appInstance']

export async function apply(ctx: Context, config: OpsConfig = {}): Promise<void> {
  const file = config.file ?? DEFAULT_FILE
  const ops = await Ops.open({
    store: config.store ?? jsonFileStore(isAbsolute(file) ? file : join(ctx.appInstance.home, file)),
    clock: config.clock ?? (() => new Date()),
    newId: config.newId ?? ((kind) => `${kind}-${randomUUID().slice(0, 8)}`),
  })
  ctx.provide('ops', ops)
}
