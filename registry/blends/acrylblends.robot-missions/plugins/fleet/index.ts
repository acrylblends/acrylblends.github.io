/** The fleet as a plugin: robots, missions, waypoints, the facility map and events in the app's data home, provided as `ctx.fleet`. */
import { randomUUID } from 'node:crypto'
import { isAbsolute, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { FleetState } from './domain.ts'
import { Fleet, type FleetAdapters } from './fleet.ts'
import { jsonFileStore, type Store } from './store.ts'
export * from './domain.ts'
export * from './fleet.ts'
export * from './store.ts'
export { seed } from './seed.ts'
declare module '@deepseek-ai/cordis' { interface Context { fleet: Fleet } }
export interface FleetConfig { readonly store?: Store<FleetState>; readonly clock?: () => Date; readonly newId?: FleetAdapters['newId']; readonly file?: string }
export const name = 'fleet'
export const inject = ['appInstance']
export async function apply(ctx: Context, config: FleetConfig = {}): Promise<void> {
  const file = config.file ?? 'robot-missions.json'
  const fleet = await Fleet.open({ store: config.store ?? jsonFileStore<FleetState>(isAbsolute(file) ? file : join(ctx.appInstance.home, file), 'Robot Missions'), clock: config.clock ?? (() => new Date()), newId: config.newId ?? ((kind) => `${kind}-${randomUUID().slice(0, 8)}`) })
  ctx.provide('fleet', fleet)
}
