/**
 * Luma Space's domain as a plugin: it opens the scene over the app's data home (`<home>/luma-space.json`) and provides it as `ctx.scene`. Every page
 * plugin injects `site`, so switching this row off takes every page with it.
 *
 * Config (all optional, for tests and for a different home): `store`, `clock`, `newId`, `file`.
 */
import { randomUUID } from 'node:crypto'
import { isAbsolute, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '../instance/index.ts'
import { Scene, type SceneAdapters } from './scene.ts'
import { type SceneStore, jsonFileStore } from './store.ts'

export * from './domain.ts'
export * from './scene.ts'
export { seed } from './seed.ts'
export * from './store.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    scene: Scene
  }
}

export interface SceneConfig {
  readonly store?: SceneStore
  readonly clock?: () => Date
  readonly newId?: SceneAdapters['newId']
  readonly file?: string
}

export const DEFAULT_FILE = 'luma-space.json'

export const name = 'luma'
export const inject = ['appInstance']

export async function apply(ctx: Context, config: SceneConfig = {}): Promise<void> {
  const file = config.file ?? DEFAULT_FILE
  const scene = await Scene.open({
    store: config.store ?? jsonFileStore(isAbsolute(file) ? file : join(ctx.appInstance.home, file)),
    clock: config.clock ?? (() => new Date()),
    newId: config.newId ?? ((kind) => `${kind}-${randomUUID().slice(0, 8)}`),
  })
  ctx.provide('scene', scene)
}
