// Types for lib/store.js, which stays exactly as the earlier ACRYL-app starter had it.
import type { MusicState } from './domain.js'
export interface MusicStore { file: string; load(): MusicState; save(state: MusicState): void }
export function fileStore(file: string): MusicStore
