/** The plant as a plugin: machines, work orders and service history in the app's data home, provided as `ctx.plant`. */
import { randomUUID } from 'node:crypto'
import { isAbsolute, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { PlantState } from './domain.ts'
import { Plant, type PlantAdapters } from './plant.ts'
import { jsonFileStore, type Store } from './store.ts'
export * from './domain.ts'
export * from './plant.ts'
export * from './store.ts'
export { seed } from './seed.ts'
declare module '@deepseek-ai/cordis' { interface Context { plant: Plant } }
export interface PlantConfig { readonly store?: Store<PlantState>; readonly clock?: () => Date; readonly newId?: PlantAdapters['newId']; readonly file?: string }
export const name = 'plant'
export const inject = ['appInstance']
export async function apply(ctx: Context, config: PlantConfig = {}): Promise<void> {
  const file = config.file ?? 'maintenance-log.json'
  const plant = await Plant.open({ store: config.store ?? jsonFileStore<PlantState>(isAbsolute(file) ? file : join(ctx.appInstance.home, file), 'Maintenance Log'), clock: config.clock ?? (() => new Date()), newId: config.newId ?? ((kind) => `${kind}-${randomUUID().slice(0, 8)}`) })
  ctx.provide('plant', plant)
}
