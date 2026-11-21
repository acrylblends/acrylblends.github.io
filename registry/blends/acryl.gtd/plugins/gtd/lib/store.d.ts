// Types for lib/store.js, which stays exactly as the earlier ACRYL-app starter had it.
import type { GtdState } from './domain.js'
export interface GtdStore { file: string; load(): GtdState; save(state: GtdState): void }
export function fileStore(file: string): GtdStore
