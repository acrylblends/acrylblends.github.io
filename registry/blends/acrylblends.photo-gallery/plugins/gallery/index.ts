/** The archive as a plugin: albums and photographs in the app's data home, provided as `ctx.gallery`. */
import { randomUUID } from 'node:crypto'
import { isAbsolute, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { GalleryState } from './domain.ts'
import { Gallery, type GalleryAdapters } from './gallery.ts'
import { jsonFileStore, type Store } from './store.ts'
export * from './art.ts'
export * from './domain.ts'
export * from './gallery.ts'
export * from './store.ts'
export { seed, SEED_FACTS } from './seed.ts'
declare module '@deepseek-ai/cordis' {
  interface Context {
    gallery: Gallery
  }
}
export interface GalleryConfig {
  readonly store?: Store<GalleryState>
  readonly clock?: () => Date
  readonly newId?: GalleryAdapters['newId']
  readonly file?: string
}
export const name = 'gallery'
export const inject = ['appInstance']
export async function apply(ctx: Context, config: GalleryConfig = {}): Promise<void> {
  const file = config.file ?? 'photo-gallery.json'
  const gallery = await Gallery.open({
    store: config.store ?? jsonFileStore<GalleryState>(isAbsolute(file) ? file : join(ctx.appInstance.home, file), 'Photo Gallery'),
    clock: config.clock ?? (() => new Date()),
    newId: config.newId ?? ((kind) => `${kind}-${randomUUID().slice(0, 8)}`),
  })
  ctx.provide('gallery', gallery)
}
