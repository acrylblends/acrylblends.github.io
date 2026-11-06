/** The garage as a plugin: the vehicle, service records, fuel entries and reminders in the app's data home, provided as `ctx.garage`. */
import { randomUUID } from 'node:crypto'
import { isAbsolute, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { GarageState } from './domain.ts'
import { Garage, type GarageAdapters } from './garage.ts'
import { jsonFileStore, type Store } from './store.ts'
export * from './domain.ts'
export * from './garage.ts'
export * from './store.ts'
export { seed } from './seed.ts'
declare module '@deepseek-ai/cordis' { interface Context { garage: Garage } }
export interface GarageConfig { readonly store?: Store<GarageState>; readonly clock?: () => Date; readonly newId?: GarageAdapters['newId']; readonly file?: string }
export const name = 'garage'
export const inject = ['appInstance']
export async function apply(ctx: Context, config: GarageConfig = {}): Promise<void> {
  const file = config.file ?? 'vehicle-log.json'
  const garage = await Garage.open({ store: config.store ?? jsonFileStore<GarageState>(isAbsolute(file) ? file : join(ctx.appInstance.home, file), 'Vehicle Log'), clock: config.clock ?? (() => new Date()), newId: config.newId ?? ((kind) => `${kind}-${randomUUID().slice(0, 8)}`) })
  ctx.provide('garage', garage)
}
