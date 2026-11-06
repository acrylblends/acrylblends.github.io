/** The notebooks as a plugin: notebooks, experiments, measurements and observations in the app's data home, provided as `ctx.lab`. */
import { randomUUID } from 'node:crypto'
import { isAbsolute, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { LabState } from './domain.ts'
import { Lab, type LabAdapters } from './lab.ts'
import { jsonFileStore, type Store } from './store.ts'
export * from './domain.ts'
export * from './lab.ts'
export * from './store.ts'
export { seed, SEED_FACTS } from './seed.ts'
declare module '@deepseek-ai/cordis' { interface Context { lab: Lab } }
export interface LabConfig { readonly store?: Store<LabState>; readonly clock?: () => Date; readonly newId?: LabAdapters['newId']; readonly file?: string }
export const name = 'lab'
export const inject = ['appInstance']
export async function apply(ctx: Context, config: LabConfig = {}): Promise<void> {
  const file = config.file ?? 'lab-notebook.json'
  const lab = await Lab.open({ store: config.store ?? jsonFileStore<LabState>(isAbsolute(file) ? file : join(ctx.appInstance.home, file), 'Lab Notebook'), clock: config.clock ?? (() => new Date()), newId: config.newId ?? ((kind) => `${kind}-${randomUUID().slice(0, 8)}`) })
  ctx.provide('lab', lab)
}
