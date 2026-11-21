// Types for lib/store.js, which stays exactly as the earlier ACRYL-app starter had it.
import type { AccountingState } from './domain.js'
export interface AccountingStore { file: string; load(): AccountingState; save(state: AccountingState): void }
export function fileStore(file: string): AccountingStore
