/**
 * The Productivity Hub's domain as a plugin: it opens the hub over the app's data home (`<home>/productivity-hub.json`) and provides it as
 * `ctx.hub`. Every page plugin (my-day, inbox, tasks, notes, calendar) injects `hub`, so switching this row off takes every page with it.
 *
 * Config (all optional, for tests and for a different home): `store` (a {@link HubStore}), `clock` (what time it is), `newId` (how ids are made),
 * `file` (the JSON file, relative to the app's home).
 */
import { randomUUID } from 'node:crypto'
import { isAbsolute, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { Hub, type HubAdapters } from './hub.ts'
import { type HubStore, jsonFileStore } from './store.ts'

export * from './domain.ts'
export * from './hub.ts'
export * from './store.ts'
export { seed } from './seed.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    hub: Hub
  }
}

export interface HubConfig {
  readonly store?: HubStore
  readonly clock?: () => Date
  readonly newId?: HubAdapters['newId']
  readonly file?: string
}

export const DEFAULT_FILE = 'productivity-hub.json'

export const name = 'productivity-hub'
export const inject = ['appInstance']

export async function apply(ctx: Context, config: HubConfig = {}): Promise<void> {
  const file = config.file ?? DEFAULT_FILE
  const hub = await Hub.open({
    store: config.store ?? jsonFileStore(isAbsolute(file) ? file : join(ctx.appInstance.home, file)),
    clock: config.clock ?? (() => new Date()),
    newId: config.newId ?? ((kind) => `${kind}-${randomUUID().slice(0, 8)}`),
  })
  ctx.provide('hub', hub)
}
