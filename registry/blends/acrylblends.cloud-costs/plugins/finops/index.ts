/**
 * The FinOps workspace as a plugin: it opens the providers, cost lines, budgets, alerts and rules over the app's data home (`<home>/cloud-costs.json`)
 * and provides them as `ctx.finops`. Every page injects `finops`.
 */
import { randomUUID } from 'node:crypto'
import { isAbsolute, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { FinopsState } from './domain.ts'
import { Finops, type FinopsAdapters } from './finops.ts'
import { jsonFileStore, type Store } from './store.ts'

export * from './domain.ts'
export * from './finops.ts'
export * from './store.ts'
export { seed } from './seed.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    finops: Finops
  }
}

export interface FinopsConfig {
  readonly store?: Store<FinopsState>
  readonly clock?: () => Date
  readonly newId?: FinopsAdapters['newId']
  readonly file?: string
}

export const DEFAULT_FILE = 'cloud-costs.json'

export const name = 'finops'
export const inject = ['appInstance']

export async function apply(ctx: Context, config: FinopsConfig = {}): Promise<void> {
  const file = config.file ?? DEFAULT_FILE
  const finops = await Finops.open({
    store:
      config.store ??
      jsonFileStore<FinopsState>(isAbsolute(file) ? file : join(ctx.appInstance.home, file), 'Cloud Costs'),
    clock: config.clock ?? (() => new Date()),
    newId: config.newId ?? ((kind) => `${kind}-${randomUUID().slice(0, 8)}`),
  })
  ctx.provide('finops', finops)
}
