/**
 * Pagefoundry's domain as a plugin: it opens the site over the app's data home (`<home>/pagefoundry.json`) and provides it as `ctx.site`. Every page
 * plugin injects `site`, so switching this row off takes every page with it.
 *
 * Config (all optional, for tests and for a different home): `store`, `clock`, `newId`, `file`.
 */
import { randomUUID } from 'node:crypto'
import { isAbsolute, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '../instance/index.ts'
import { Site, type SiteAdapters } from './site.ts'
import { type SiteStore, jsonFileStore } from './store.ts'

export * from './domain.ts'
export * from './site.ts'
export { seed } from './seed.ts'
export * from './store.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    site: Site
  }
}

export interface SiteConfig {
  readonly store?: SiteStore
  readonly clock?: () => Date
  readonly newId?: SiteAdapters['newId']
  readonly file?: string
}

export const DEFAULT_FILE = 'pagefoundry.json'

export const name = 'pagefoundry'
export const inject = ['appInstance']

export async function apply(ctx: Context, config: SiteConfig = {}): Promise<void> {
  const file = config.file ?? DEFAULT_FILE
  const site = await Site.open({
    store: config.store ?? jsonFileStore(isAbsolute(file) ? file : join(ctx.appInstance.home, file)),
    clock: config.clock ?? (() => new Date()),
    newId: config.newId ?? ((kind) => `${kind}-${randomUUID().slice(0, 8)}`),
  })
  ctx.provide('site', site)
}
