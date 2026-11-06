/**
 * LingoDesk's domain as a plugin: it opens the project over the app's data home (`<home>/lingodesk.json`) and provides it as `ctx.desk`. Every page
 * plugin injects `site`, so switching this row off takes every page with it.
 *
 * Config (all optional, for tests and for a different home): `store`, `clock`, `file`.
 */
import { isAbsolute, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '../instance/index.ts'
import { Desk, type DeskAdapters } from './desk.ts'
import { type DeskStore, jsonFileStore } from './store.ts'

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
  readonly store?: DeskStore
  readonly clock?: () => Date
  readonly file?: string
}

export const DEFAULT_FILE = 'lingodesk.json'

export const name = 'lingodesk'
export const inject = ['appInstance']

export async function apply(ctx: Context, config: DeskConfig = {}): Promise<void> {
  const file = config.file ?? DEFAULT_FILE
  const desk = await Desk.open({
    store: config.store ?? jsonFileStore(isAbsolute(file) ? file : join(ctx.appInstance.home, file)),
    clock: config.clock ?? (() => new Date()),
  })
  ctx.provide('desk', desk)
}
