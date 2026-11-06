/** The link workspace as a plugin: links, domains, referrers and clicks in the app's data home, provided as `ctx.shortly`. */
import { randomUUID } from 'node:crypto'
import { isAbsolute, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { ShortlyState } from './domain.ts'
import { Shortly, type ShortlyAdapters } from './shortly.ts'
import { jsonFileStore, type Store } from './store.ts'

export * from './domain.ts'
export * from './shortly.ts'
export * from './store.ts'
export { seed } from './seed.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    shortly: Shortly
  }
}

export interface ShortlyConfig {
  readonly store?: Store<ShortlyState>
  readonly clock?: () => Date
  readonly newId?: ShortlyAdapters['newId']
  readonly file?: string
}

export const name = 'shortly'
export const inject = ['appInstance']

export async function apply(ctx: Context, config: ShortlyConfig = {}): Promise<void> {
  const file = config.file ?? 'link-shortener.json'
  const shortly = await Shortly.open({
    store: config.store ?? jsonFileStore<ShortlyState>(isAbsolute(file) ? file : join(ctx.appInstance.home, file), 'Link Shortener'),
    clock: config.clock ?? (() => new Date()),
    newId: config.newId ?? ((kind) => `${kind}-${randomUUID().slice(0, 8)}`),
  })
  ctx.provide('shortly', shortly)
}
