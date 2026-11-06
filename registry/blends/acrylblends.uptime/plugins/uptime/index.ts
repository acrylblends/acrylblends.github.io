/**
 * The monitors as a plugin: it opens the monitors, checks and incidents over the app's data home (`<home>/uptime.json`) and provides them as
 * `ctx.uptime`. The checker is a port on config: the server builds the real one, tests pass a fake and need no network.
 */
import { randomUUID } from 'node:crypto'
import { isAbsolute, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { defaultChecker, type Checker } from './checker.ts'
import type { UptimeState } from './domain.ts'
import { Uptime, type UptimeAdapters } from './uptime.ts'
import { jsonFileStore, type Store } from './store.ts'

export * from './checker.ts'
export * from './domain.ts'
export * from './store.ts'
export * from './uptime.ts'
export { seed } from './seed.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    uptime: Uptime
  }
}

export interface UptimeConfig {
  readonly store?: Store<UptimeState>
  readonly clock?: () => Date
  readonly newId?: UptimeAdapters['newId']
  readonly checker?: Checker
  readonly file?: string
}

export const DEFAULT_FILE = 'uptime.json'

export const name = 'uptime'
export const inject = ['appInstance']

export async function apply(ctx: Context, config: UptimeConfig = {}): Promise<void> {
  const file = config.file ?? DEFAULT_FILE
  const uptime = await Uptime.open({
    store:
      config.store ??
      jsonFileStore<UptimeState>(isAbsolute(file) ? file : join(ctx.appInstance.home, file), 'Uptime Checker'),
    clock: config.clock ?? (() => new Date()),
    newId: config.newId ?? ((kind) => `${kind}-${randomUUID().slice(0, 8)}`),
    checker: config.checker ?? defaultChecker(),
  })
  ctx.provide('uptime', uptime)
}
