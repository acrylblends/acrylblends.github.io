/**
 * The release board as a plugin: it opens the services, deployments, incidents and events over the app's data home (`<home>/deploy-board.json`) and
 * provides them as `ctx.release`. Every page injects `release`.
 */
import { randomUUID } from 'node:crypto'
import { isAbsolute, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { ReleaseState } from './domain.ts'
import { Release, type ReleaseAdapters } from './release.ts'
import { jsonFileStore, type Store } from './store.ts'

export * from './domain.ts'
export * from './release.ts'
export * from './store.ts'
export { seed } from './seed.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    release: Release
  }
}

export interface ReleaseConfig {
  readonly store?: Store<ReleaseState>
  readonly clock?: () => Date
  readonly newId?: ReleaseAdapters['newId']
  readonly file?: string
}

export const DEFAULT_FILE = 'deploy-board.json'

export const name = 'release'
export const inject = ['appInstance']

export async function apply(ctx: Context, config: ReleaseConfig = {}): Promise<void> {
  const file = config.file ?? DEFAULT_FILE
  const release = await Release.open({
    store:
      config.store ??
      jsonFileStore<ReleaseState>(isAbsolute(file) ? file : join(ctx.appInstance.home, file), 'Deploy Board'),
    clock: config.clock ?? (() => new Date()),
    newId: config.newId ?? ((kind) => `${kind}-${randomUUID().slice(0, 8)}`),
  })
  ctx.provide('release', release)
}
