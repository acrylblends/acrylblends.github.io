// Types for lib/store.js, which stays exactly as the earlier ACRYL-app starter had it.
import type { OrganizerState } from './domain.js'
export interface OrganizerStore { file: string; load(): OrganizerState; save(state: OrganizerState): void }
export function fileStore(file: string): OrganizerStore
