/** The logbook as a plugin: the pilot, aircraft, flights and endorsements in the app's data home, provided as `ctx.logbook`. */
import { randomUUID } from 'node:crypto'
import { isAbsolute, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { LogbookState } from './domain.ts'
import { Logbook, type LogbookAdapters } from './logbook.ts'
import { jsonFileStore, type Store } from './store.ts'
export * from './domain.ts'
export * from './logbook.ts'
export * from './store.ts'
export { seed } from './seed.ts'
declare module '@deepseek-ai/cordis' { interface Context { logbook: Logbook } }
export interface LogbookConfig { readonly store?: Store<LogbookState>; readonly clock?: () => Date; readonly newId?: LogbookAdapters['newId']; readonly file?: string }
export const name = 'logbook'
export const inject = ['appInstance']
export async function apply(ctx: Context, config: LogbookConfig = {}): Promise<void> {
  const file = config.file ?? 'flight-logbook.json'
  const logbook = await Logbook.open({ store: config.store ?? jsonFileStore<LogbookState>(isAbsolute(file) ? file : join(ctx.appInstance.home, file), 'Flight Logbook'), clock: config.clock ?? (() => new Date()), newId: config.newId ?? ((kind) => `${kind}-${randomUUID().slice(0, 8)}`) })
  ctx.provide('logbook', logbook)
}
