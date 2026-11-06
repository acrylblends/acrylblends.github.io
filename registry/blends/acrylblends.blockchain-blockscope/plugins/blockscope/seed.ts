/** The explorer a person sees on the first start: Atlas Testnet with its head at block 19,482,771, twelve seconds old, and an empty watchlist. */
import { type ChainState } from './domain.ts'

export function seed(now: Date): ChainState {
  return { version: 1, network: 'Atlas Testnet', anchor: { height: 19_482_771, at: new Date(now.getTime() - 12_000).toISOString() }, produced: 0, watch: [] }
}
