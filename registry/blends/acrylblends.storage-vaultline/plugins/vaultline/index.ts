/**
 * Vaultline's domain as a plugin: it opens the vault over the app's data home (`<home>/vaultline.json`) and provides it as `ctx.vault`. Every page
 * plugin injects `vault`, so switching this row off takes every page with it.
 *
 * Config (all optional, for tests and for a different home): `store`, `clock`, `newId`, `file`.
 */
import { randomUUID } from 'node:crypto'
import { isAbsolute, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '../instance/index.ts'
import { Vault, type VaultAdapters } from './vault.ts'
import { type VaultStore, jsonFileStore } from './store.ts'

export * from './domain.ts'
export * from './vault.ts'
export { seed } from './seed.ts'
export * from './store.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    vault: Vault
  }
}

export interface VaultConfig {
  readonly store?: VaultStore
  readonly clock?: () => Date
  readonly newId?: VaultAdapters['newId']
  readonly file?: string
}

export const DEFAULT_FILE = 'vaultline.json'

export const name = 'vaultline'
export const inject = ['appInstance']

export async function apply(ctx: Context, config: VaultConfig = {}): Promise<void> {
  const file = config.file ?? DEFAULT_FILE
  const vault = await Vault.open({
    store: config.store ?? jsonFileStore(isAbsolute(file) ? file : join(ctx.appInstance.home, file)),
    clock: config.clock ?? (() => new Date()),
    newId: config.newId ?? ((kind) => `${kind}-${randomUUID().slice(0, 8)}`),
  })
  ctx.provide('vault', vault)
}
