/**
 * Meshwatch's domain as a plugin: it opens the mesh over the app's data home (`<home>/meshwatch.json`) and provides it as `ctx.mesh`. Every page
 * plugin injects `mesh`, so switching this row off takes every page with it.
 *
 * Config (all optional, for tests and for a different home): `store`, `clock`, `newId`, `file`.
 */
import { randomUUID } from 'node:crypto'
import { isAbsolute, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '../instance/index.ts'
import { Mesh, type MeshAdapters } from './mesh.ts'
import { type MeshStore, jsonFileStore } from './store.ts'

export * from './domain.ts'
export * from './mesh.ts'
export { seed } from './seed.ts'
export * from './store.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    mesh: Mesh
  }
}

export interface MeshConfig {
  readonly store?: MeshStore
  readonly clock?: () => Date
  readonly newId?: MeshAdapters['newId']
  readonly file?: string
}

export const DEFAULT_FILE = 'meshwatch.json'

export const name = 'meshwatch'
export const inject = ['appInstance']

export async function apply(ctx: Context, config: MeshConfig = {}): Promise<void> {
  const file = config.file ?? DEFAULT_FILE
  const mesh = await Mesh.open({
    store: config.store ?? jsonFileStore(isAbsolute(file) ? file : join(ctx.appInstance.home, file)),
    clock: config.clock ?? (() => new Date()),
    newId: config.newId ?? ((kind) => `${kind}-${randomUUID().slice(0, 8)}`),
  })
  ctx.provide('mesh', mesh)
}
