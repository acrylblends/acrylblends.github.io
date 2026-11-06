/**
 * The analytics workspace as a plugin: it opens the properties and their metrics over the app's data home (`<home>/web-analytics.json`) and provides
 * them as `ctx.analytics`. Every report injects `analytics`; the tracking endpoint writes through the same service.
 */
import { randomUUID } from 'node:crypto'
import { isAbsolute, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { AnalyticsState } from './domain.ts'
import { Analytics, type AnalyticsAdapters } from './analytics.ts'
import { jsonFileStore, type Store } from './store.ts'

export * from './analytics.ts'
export * from './domain.ts'
export * from './store.ts'
export { seed } from './seed.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    analytics: Analytics
  }
}

export interface AnalyticsConfig {
  readonly store?: Store<AnalyticsState>
  readonly clock?: () => Date
  readonly newId?: AnalyticsAdapters['newId']
  readonly file?: string
}

export const DEFAULT_FILE = 'web-analytics.json'

export const name = 'analytics'
export const inject = ['appInstance']

export async function apply(ctx: Context, config: AnalyticsConfig = {}): Promise<void> {
  const file = config.file ?? DEFAULT_FILE
  const analytics = await Analytics.open({
    store:
      config.store ??
      jsonFileStore<AnalyticsState>(isAbsolute(file) ? file : join(ctx.appInstance.home, file), 'Web Analytics'),
    clock: config.clock ?? (() => new Date()),
    newId: config.newId ?? ((kind) => `${kind}-${randomUUID().slice(0, 8)}`),
  })
  ctx.provide('analytics', analytics)
}
