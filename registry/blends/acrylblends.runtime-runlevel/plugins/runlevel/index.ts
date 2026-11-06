/**
 * Runlevel's domain as a plugin: it opens the desk over the app's data home (`<home>/runlevel.json`) and provides it as `ctx.desk`. Every page
 * plugin injects `desk`, so switching this row off takes every page with it.
 *
 * Config (all optional, for tests and for a different home): `store`, `clock`, `newId`, `file`.
 */
import { randomUUID } from 'node:crypto'
import { isAbsolute, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '../instance/index.ts'
import { Desk, type DeskAdapters } from './desk.ts'
import { type RunStore, jsonFileStore } from './store.ts'

export * from './domain.ts'
export * from './desk.ts'
export { seed } from './seed.ts'
export * from './store.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    desk: Desk
  }
}

export interface DeskConfig {
  readonly store?: RunStore
  readonly clock?: () => Date
  readonly newId?: DeskAdapters['newId']
  readonly file?: string
}

export const DEFAULT_FILE = 'runlevel.json'

export const name = 'runlevel'
export const inject = ['appInstance']

export async function apply(ctx: Context, config: DeskConfig = {}): Promise<void> {
  const file = config.file ?? DEFAULT_FILE
  const desk = await Desk.open({
    store: config.store ?? jsonFileStore(isAbsolute(file) ? file : join(ctx.appInstance.home, file)),
    clock: config.clock ?? (() => new Date()),
    newId: config.newId ?? ((kind) => `${kind}-${randomUUID().slice(0, 8)}`),
  })
  ctx.provide('desk', desk)
}
