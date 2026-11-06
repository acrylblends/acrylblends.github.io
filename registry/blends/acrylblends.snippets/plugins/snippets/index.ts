/**
 * The snippet library as a plugin: it opens the library over the app's data home (`<home>/snippets.json`) and provides it as `ctx.snippets`. Every
 * page plugin injects `snippets`, so switching this row off takes the pages that need it with it.
 *
 * Config (all optional, for tests and for a different home): `store` (a {@link Store}), `clock` (what time it is), `newId` (how ids are made),
 * `file` (the JSON file, relative to the app's home).
 */
import { randomUUID } from 'node:crypto'
import { isAbsolute, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { Snippets, type SnippetsAdapters } from './snippets.ts'
import type { SnippetsState } from './domain.ts'
import { jsonFileStore, type Store } from './store.ts'

export * from './domain.ts'
export * from './snippets.ts'
export * from './store.ts'
export { seed } from './seed.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    snippets: Snippets
  }
}

export interface SnippetsConfig {
  readonly store?: Store<SnippetsState>
  readonly clock?: () => Date
  readonly newId?: SnippetsAdapters['newId']
  readonly file?: string
}

export const DEFAULT_FILE = 'snippets.json'

export const name = 'snippets'
export const inject = ['appInstance']

export async function apply(ctx: Context, config: SnippetsConfig = {}): Promise<void> {
  const file = config.file ?? DEFAULT_FILE
  const snippets = await Snippets.open({
    store:
      config.store ??
      jsonFileStore<SnippetsState>(isAbsolute(file) ? file : join(ctx.appInstance.home, file), 'Snippet library'),
    clock: config.clock ?? (() => new Date()),
    newId: config.newId ?? ((kind) => `${kind}-${randomUUID().slice(0, 8)}`),
  })
  ctx.provide('snippets', snippets)
}
