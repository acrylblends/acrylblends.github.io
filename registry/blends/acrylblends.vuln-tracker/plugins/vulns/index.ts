/** The console as a plugin: assets, findings and remediation events in the app's data home, provided as `ctx.vulns`. */
import { randomUUID } from 'node:crypto'
import { isAbsolute, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { VulnState } from './domain.ts'
import { Vulns, type VulnsAdapters } from './vulns.ts'
import { jsonFileStore, type Store } from './store.ts'

export * from './domain.ts'
export * from './store.ts'
export * from './vulns.ts'
export { seed } from './seed.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    vulns: Vulns
  }
}

export interface VulnsConfig {
  readonly store?: Store<VulnState>
  readonly clock?: () => Date
  readonly newId?: VulnsAdapters['newId']
  readonly file?: string
}

export const name = 'vulns'
export const inject = ['appInstance']

export async function apply(ctx: Context, config: VulnsConfig = {}): Promise<void> {
  const file = config.file ?? 'vulnerability-tracker.json'
  const vulns = await Vulns.open({
    store: config.store ?? jsonFileStore<VulnState>(isAbsolute(file) ? file : join(ctx.appInstance.home, file), 'Vulnerability Tracker'),
    clock: config.clock ?? (() => new Date()),
    newId: config.newId ?? ((kind) => `${kind}-${randomUUID().slice(0, 8)}`),
  })
  ctx.provide('vulns', vulns)
}
