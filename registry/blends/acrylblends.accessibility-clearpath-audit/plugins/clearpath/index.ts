/**
 * Clearpath Audit's domain as a plugin: it opens the audit over the app's data home (`<home>/clearpath-audit.json`) and provides it as `ctx.audit`. Every page
 * plugin injects `site`, so switching this row off takes every page with it.
 *
 * Config (all optional, for tests and for a different home): `store`, `clock`, `newId`, `file`.
 */
import { randomUUID } from 'node:crypto'
import { isAbsolute, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '../instance/index.ts'
import { Audit, type AuditAdapters } from './audit.ts'
import { type AuditStore, jsonFileStore } from './store.ts'

export * from './domain.ts'
export * from './audit.ts'
export { seed } from './seed.ts'
export * from './store.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    audit: Audit
  }
}

export interface AuditConfig {
  readonly store?: AuditStore
  readonly clock?: () => Date
  readonly newId?: AuditAdapters['newId']
  readonly file?: string
}

export const DEFAULT_FILE = 'clearpath-audit.json'

export const name = 'clearpath'
export const inject = ['appInstance']

export async function apply(ctx: Context, config: AuditConfig = {}): Promise<void> {
  const file = config.file ?? DEFAULT_FILE
  const audit = await Audit.open({
    store: config.store ?? jsonFileStore(isAbsolute(file) ? file : join(ctx.appInstance.home, file)),
    clock: config.clock ?? (() => new Date()),
    newId: config.newId ?? ((kind) => `${kind}-${randomUUID().slice(0, 8)}`),
  })
  ctx.provide('audit', audit)
}
