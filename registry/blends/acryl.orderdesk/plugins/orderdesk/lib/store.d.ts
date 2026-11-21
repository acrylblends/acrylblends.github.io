// Types for lib/store.js, which stays exactly as the earlier ACRYL-app starter had it.
import type { OrderDeskState } from './domain.js'
export interface OrderDeskStore { file: string; load(): OrderDeskState; save(state: OrderDeskState): void }
export function fileStore(file: string): OrderDeskStore
