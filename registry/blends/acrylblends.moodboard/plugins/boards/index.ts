/** The boards as a plugin: boards, objects and reference assets in the app's data home, provided as `ctx.boards`. */
import { randomUUID } from 'node:crypto'
import { isAbsolute, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { BoardState } from './domain.ts'
import { Boards, type BoardsAdapters } from './boards.ts'
import { jsonFileStore, type Store } from './store.ts'
export * from './art.ts'
export * from './boards.ts'
export * from './domain.ts'
export * from './store.ts'
export { seed, SEED_FACTS } from './seed.ts'
declare module '@deepseek-ai/cordis' { interface Context { boards: Boards } }
export interface BoardsConfig { readonly store?: Store<BoardState>; readonly clock?: () => Date; readonly newId?: BoardsAdapters['newId']; readonly file?: string }
export const name = 'boards'
export const inject = ['appInstance']
export async function apply(ctx: Context, config: BoardsConfig = {}): Promise<void> {
  const file = config.file ?? 'moodboard.json'
  const boards = await Boards.open({ store: config.store ?? jsonFileStore<BoardState>(isAbsolute(file) ? file : join(ctx.appInstance.home, file), 'Moodboard'), clock: config.clock ?? (() => new Date()), newId: config.newId ?? ((kind) => `${kind}-${randomUUID().slice(0, 8)}`) })
  ctx.provide('boards', boards)
}
