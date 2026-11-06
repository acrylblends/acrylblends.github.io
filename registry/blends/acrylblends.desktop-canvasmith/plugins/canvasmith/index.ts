/**
 * Canvasmith's domain as a plugin: it opens the project over the app's data home (`<home>/canvasmith.json`) and provides it as `ctx.project`. Every page
 * plugin injects `project`, so switching this row off takes every page with it.
 *
 * Config (all optional, for tests and for a different home): `store`, `clock`, `newId`, `file`.
 */
import { randomUUID } from 'node:crypto'
import { isAbsolute, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '../instance/index.ts'
import { Project, type ProjectAdapters } from './project.ts'
import { type ProjectStore, jsonFileStore } from './store.ts'

export * from './domain.ts'
export * from './project.ts'
export { seed } from './seed.ts'
export * from './store.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    project: Project
  }
}

export interface ProjectConfig {
  readonly store?: ProjectStore
  readonly clock?: () => Date
  readonly newId?: ProjectAdapters['newId']
  readonly file?: string
}

export const DEFAULT_FILE = 'canvasmith.json'

export const name = 'canvasmith'
export const inject = ['appInstance']

export async function apply(ctx: Context, config: ProjectConfig = {}): Promise<void> {
  const file = config.file ?? DEFAULT_FILE
  const project = await Project.open({
    store: config.store ?? jsonFileStore(isAbsolute(file) ? file : join(ctx.appInstance.home, file)),
    clock: config.clock ?? (() => new Date()),
    newId: config.newId ?? ((kind) => `${kind}-${randomUUID().slice(0, 8)}`),
  })
  ctx.provide('project', project)
}
