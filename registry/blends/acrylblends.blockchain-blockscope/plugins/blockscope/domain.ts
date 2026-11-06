/**
 * Blockscope's domain: a read-only explorer over a synthetic chain ("Atlas Testnet"). Blocks, transactions, addresses, contracts and event logs are not
 * stored: they are generated from the height by a seeded random generator, so the same height is always the same block. The only saved state is where the
 * chain head is and what the person watches.
 *
 * Every value is synthetic and labelled demo data. Hashes are made by the generator, not by any hash function, and nothing here talks to a network.
 */

export class ChainError extends Error {
  override readonly name = 'ChainError'
  readonly code: 'invalid' | 'not-found' | 'conflict'
  constructor(code: 'invalid' | 'not-found' | 'conflict', message: string) {
    super(message)
    this.code = code
  }
}

export const BLOCK_MS = 2100
export const FINALITY_LAG = 31
export const GAS_PRICE_GWEI = 18.4
export const SAMPLE_TXS = 8
export const GENESIS = 19_000_000
export const SCAN_BLOCKS = 150

/** A small seeded generator: the same seed always gives the same sequence. */
export function rng(seed: string): () => number {
  let h = 2166136261
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  let a = h >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function hex(seed: string, length: number): string {
  const r = rng(seed)
  let out = ''
  while (out.length < length) out += Math.floor(r() * 16).toString(16)
  return out
}

export const short = (hash: string): string => `${hash.slice(0, 6)}…${hash.slice(-4)}`

export type Kind = 'account' | 'contract'

export interface Label {
  readonly name: string
  readonly address: string
  readonly kind: Kind
  readonly note: string
}

const label = (name: string, kind: Kind, note: string): Label => ({ name, kind, note, address: `0x${hex(`addr:${name}`, 40)}` })

export const LABELS: readonly Label[] = [
  label('Northstar Treasury', 'account', 'Demo treasury wallet'),
  label('Northstar Payroll', 'account', 'Demo payroll wallet'),
  label('Atlas Faucet', 'account', 'Testnet faucet'),
  label('Demo Wallet A', 'account', 'Sample account'),
  label('Demo Wallet B', 'account', 'Sample account'),
  label('Atlas Stable (ATLUSD)', 'contract', 'Demo stable token'),
  label('Atlas DEX Router', 'contract', 'Demo swap router'),
  label('Atlas Bridge', 'contract', 'Demo bridge vault'),
  label('Atlas Name Service', 'contract', 'Demo name registry'),
]

export const labelOf = (address: string): Label | undefined => LABELS.find((l) => l.address === address)
const byName = (n: string): Label => LABELS.find((l) => l.name === n) ?? (LABELS[0] as Label)

export interface EventDef {
  readonly contract: string
  readonly name: string
  readonly args: readonly string[]
}

export const EVENT_DEFS: readonly EventDef[] = [
  { contract: 'Atlas Stable (ATLUSD)', name: 'Transfer', args: ['from', 'to', 'value'] },
  { contract: 'Atlas Stable (ATLUSD)', name: 'Approval', args: ['owner', 'spender', 'value'] },
  { contract: 'Atlas DEX Router', name: 'Swap', args: ['sender', 'amountIn', 'amountOut'] },
  { contract: 'Atlas Bridge', name: 'Deposit', args: ['from', 'amount', 'destination'] },
  { contract: 'Atlas Name Service', name: 'NameRegistered', args: ['name', 'owner'] },
]
export const EVENT_NAMES: readonly string[] = [...new Set(EVENT_DEFS.map((e) => e.name))]

export interface EventLog {
  readonly index: number
  readonly contract: Label
  readonly name: string
  /** `Name(arg, arg)`: the demo signature the first topic stands for. */
  readonly signature: string
  readonly topics: readonly string[]
  readonly args: readonly (readonly [string, string])[]
  readonly txHash: string
  readonly height: number
}

export interface Tx {
  readonly hash: string
  readonly height: number
  readonly index: number
  readonly from: string
  readonly to: string
  readonly method: string
  readonly valueAtl: number
  readonly gasUsed: number
  readonly feeAtl: number
  readonly status: 'success' | 'failed'
  readonly error?: string
  readonly events: readonly EventLog[]
}

export interface Block {
  readonly height: number
  readonly hash: string
  readonly parentHash: string
  readonly txCount: number
  readonly producer: string
  /** ISO time. */
  readonly timestamp: string
  /** The first {@link SAMPLE_TXS} transactions, which are the ones the demo generates. */
  readonly txs: readonly Tx[]
}

export interface Anchor {
  readonly height: number
  readonly at: string
}

/** The five blocks the mockup shows, with their hash ends, transaction counts and producers; every other height is generated. */
const FIXED: Readonly<Record<number, { head: string; tail: string; txs: number; producer: string }>> = {
  19_482_771: { head: '8f2a', tail: 'd912', txs: 184, producer: 'Northstar-4' },
  19_482_770: { head: 'c18e', tail: '7a04', txs: 206, producer: 'Atlas-2' },
  19_482_769: { head: '71b0', tail: 'e533', txs: 149, producer: 'Northstar-1' },
  19_482_768: { head: '09de', tail: 'a120', txs: 221, producer: 'Atlas-5' },
  19_482_767: { head: 'a2f4', tail: 'bc81', txs: 177, producer: 'Northstar-3' },
}
export const PRODUCERS = ['Northstar-1', 'Northstar-3', 'Northstar-4', 'Atlas-1', 'Atlas-2', 'Atlas-5']

export function hashOf(height: number): string {
  const f = FIXED[height]
  const middle = hex(`block:${String(height)}`, 60)
  return `0x${f === undefined ? middle.slice(0, 4) : f.head}${middle.slice(4)}${f === undefined ? hex(`tail:${String(height)}`, 4) : f.tail}`
}

const pick = <T>(r: () => number, list: readonly T[]): T => list[Math.floor(r() * list.length)] as T
const EOAS = ['Northstar Treasury', 'Northstar Payroll', 'Atlas Faucet', 'Demo Wallet A', 'Demo Wallet B']

function randomAddress(seed: string): string {
  return `0x${hex(`anon:${seed}`, 40)}`
}

function eventFor(def: EventDef, r: () => number, from: string, index: number, txHash: string, height: number): EventLog {
  const amount = (r() * 5000 + 1).toFixed(2)
  const lookup: Record<string, string> = {
    from,
    to: byName(pick(r, EOAS)).address,
    owner: from,
    spender: byName('Atlas DEX Router').address,
    sender: from,
    value: `${amount} ATLUSD`,
    amountIn: `${amount} ATLUSD`,
    amountOut: `${(Number(amount) / 18.4).toFixed(3)} ATL`,
    amount: `${(r() * 40 + 0.5).toFixed(2)} ATL`,
    destination: pick(r, ['Harbor chain', 'Meridian chain']),
    name: `${pick(r, ['north', 'atlas', 'ledger', 'harbor'])}${String(Math.floor(r() * 900) + 100)}.atl`,
  }
  const signature = `${def.name}(${def.args.join(', ')})`
  return {
    index,
    contract: byName(def.contract),
    name: def.name,
    signature,
    topics: [`0x${hex(`topic:${signature}`, 64)}`, ...def.args.slice(0, 2).map((a) => `0x${'0'.repeat(24)}${(lookup[a] ?? '').replace(/^0x/, '').slice(0, 16).padEnd(16, '0')}`)],
    args: def.args.map((a) => [a, lookup[a] ?? ''] as const),
    txHash,
    height,
  }
}

export function txAt(height: number, index: number): Tx {
  const r = rng(`tx:${String(height)}:${String(index)}`)
  const hash = `0x${hex(`txhash:${String(height)}:${String(index)}`, 64)}`
  const roll = r()
  const from = roll < 0.12 ? randomAddress(`${String(height)}:${String(index)}`) : byName(pick(r, EOAS)).address
  let method = 'transfer'
  let to = byName(pick(r, EOAS)).address
  let defName: string | undefined
  let valueAtl = Math.round((r() * 80 + 0.01) * 100) / 100
  let gasUsed = 21000
  if (roll > 0.45 && roll <= 0.7) { method = 'transfer(address,uint256)'; to = byName('Atlas Stable (ATLUSD)').address; defName = 'Transfer'; valueAtl = 0; gasUsed = 52000 + Math.floor(r() * 18000) }
  else if (roll > 0.7 && roll <= 0.85) { method = 'swapExactTokens(...)'; to = byName('Atlas DEX Router').address; defName = 'Swap'; valueAtl = 0; gasUsed = 140000 + Math.floor(r() * 70000) }
  else if (roll > 0.85 && roll <= 0.93) { method = 'deposit(uint256,string)'; to = byName('Atlas Bridge').address; defName = 'Deposit'; valueAtl = Math.round((r() * 40 + 0.5) * 100) / 100; gasUsed = 90000 + Math.floor(r() * 40000) }
  else if (roll > 0.93 && roll <= 0.96) { method = 'register(string)'; to = byName('Atlas Name Service').address; defName = 'NameRegistered'; valueAtl = 0; gasUsed = 110000 + Math.floor(r() * 30000) }
  else if (roll > 0.96) { method = 'approve(address,uint256)'; to = byName('Atlas Stable (ATLUSD)').address; defName = 'Approval'; valueAtl = 0; gasUsed = 46000 + Math.floor(r() * 6000) }
  const failed = defName !== undefined && r() < 0.12
  const def = EVENT_DEFS.find((e) => e.name === defName)
  return {
    hash,
    height,
    index,
    from,
    to,
    method,
    valueAtl,
    gasUsed,
    feeAtl: Math.round(gasUsed * GAS_PRICE_GWEI) / 1e9,
    status: failed ? 'failed' : 'success',
    ...(failed ? { error: 'execution reverted: insufficient allowance' } : {}),
    events: failed || def === undefined ? [] : [eventFor(def, r, from, 0, hash, height)],
  }
}

export function txCountOf(height: number): number {
  return FIXED[height]?.txs ?? 120 + Math.floor(rng(`count:${String(height)}`)() * 110)
}

export function producerOf(height: number): string {
  return FIXED[height]?.producer ?? PRODUCERS[Math.floor(rng(`prod:${String(height)}`)() * PRODUCERS.length)] ?? 'Atlas-1'
}

export function timestampOf(anchor: Anchor, height: number): string {
  return new Date(new Date(anchor.at).getTime() - (anchor.height - height) * BLOCK_MS).toISOString()
}

export function blockAt(anchor: Anchor, height: number): Block {
  const txCount = txCountOf(height)
  return { height, hash: hashOf(height), parentHash: hashOf(height - 1), txCount, producer: producerOf(height), timestamp: timestampOf(anchor, height), txs: Array.from({ length: Math.min(SAMPLE_TXS, txCount) }, (_, i) => txAt(height, i)) }
}

export const formatHeight = (n: number): string => n.toLocaleString('en-US')

export function ageLabel(iso: string, now: Date): string {
  const s = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000))
  if (s < 60) return `${String(s)} sec`
  if (s < 3600) return `${String(Math.floor(s / 60))} min`
  if (s < 86400) return `${String(Math.floor(s / 3600))} hr`
  return `${String(Math.floor(s / 86400))} d`
}

export const congestion = (gwei: number): string => (gwei < 25 ? 'Low congestion' : gwei < 60 ? 'Moderate congestion' : 'High congestion')

export type Hit = { readonly kind: 'block'; readonly block: Block } | { readonly kind: 'tx'; readonly tx: Tx } | { readonly kind: 'address'; readonly address: string; readonly label?: Label }

/**
 * Search the synthetic chain. A number (commas allowed) is a block height; `0x…` text is matched as a block-hash or transaction-hash prefix (also the
 * short `0x8f2a…d912` form) or an address; anything else is matched against the address labels. Only the blocks up to the head are searched, and only
 * each block's generated sample transactions.
 */
export function search(anchor: Anchor, rawQuery: string): Hit[] {
  const q = rawQuery.trim()
  if (q === '') throw new ChainError('invalid', 'Search by block height, hash or address label.')
  if (q.length > 80) throw new ChainError('invalid', 'A search is at most 80 characters.')
  const hits: Hit[] = []
  const digits = q.replace(/[,\s_]/g, '')
  if (/^\d+$/.test(digits)) {
    const h = Number(digits)
    if (h >= GENESIS && h <= anchor.height) hits.push({ kind: 'block', block: blockAt(anchor, h) })
    return hits
  }
  const lower = q.toLowerCase()
  if (/^0x[0-9a-f…]+$/.test(lower)) {
    const [pre, post = ''] = lower.split('…')
    const matches = (full: string): boolean => full.startsWith(pre ?? '') && full.endsWith(post)
    if (lower.length === 42 && !lower.includes('…')) {
      const lbl = labelOf(lower)
      hits.push({ kind: 'address', address: lower, ...(lbl === undefined ? {} : { label: lbl }) })
      return hits
    }
    for (let h = anchor.height; h > anchor.height - SCAN_BLOCKS && h >= GENESIS; h -= 1) {
      if (matches(hashOf(h))) hits.push({ kind: 'block', block: blockAt(anchor, h) })
      for (let i = 0; i < Math.min(SAMPLE_TXS, txCountOf(h)); i += 1) {
        const hash = `0x${hex(`txhash:${String(h)}:${String(i)}`, 64)}`
        if (matches(hash)) hits.push({ kind: 'tx', tx: txAt(h, i) })
      }
      if (hits.length >= 10) break
    }
    for (const l of LABELS) if (matches(l.address)) hits.push({ kind: 'address', address: l.address, label: l })
    return hits
  }
  for (const l of LABELS) if (l.name.toLowerCase().includes(lower) || l.note.toLowerCase().includes(lower)) hits.push({ kind: 'address', address: l.address, label: l })
  return hits
}

export interface RangeDef {
  readonly id: string
  readonly label: string
  readonly blocks: number
}

export const RANGES: readonly RangeDef[] = [
  { id: '1m', label: 'Last minute', blocks: 29 },
  { id: '5m', label: 'Last 5 minutes', blocks: 143 },
  { id: '15m', label: 'Last 15 minutes', blocks: 428 },
]

/** The generated sample transactions' events in the last `blocks` blocks, newest first, optionally of one event name. */
export function eventsIn(anchor: Anchor, blocks: number, name?: string): { log: EventLog; tx: Tx }[] {
  const out: { log: EventLog; tx: Tx }[] = []
  for (let h = anchor.height; h > anchor.height - blocks && h >= GENESIS; h -= 1)
    for (let i = 0; i < Math.min(SAMPLE_TXS, txCountOf(h)); i += 1) {
      const tx = txAt(h, i)
      for (const log of tx.events) if (name === undefined || log.name === name) out.push({ log, tx })
    }
  return out
}

/** Transactions among the recent blocks' samples that involve an address, newest first. */
export function txsOf(anchor: Anchor, address: string, limit = 15): Tx[] {
  const out: Tx[] = []
  for (let h = anchor.height; h > anchor.height - SCAN_BLOCKS && h >= GENESIS && out.length < limit; h -= 1)
    for (let i = 0; i < Math.min(SAMPLE_TXS, txCountOf(h)); i += 1) {
      const tx = txAt(h, i)
      if (tx.from === address || tx.to === address) out.push(tx)
    }
  return out.slice(0, limit)
}

export function findTx(anchor: Anchor, hash: string): Tx | undefined {
  const h = hash.toLowerCase()
  if (!/^0x[0-9a-f]{64}$/.test(h)) return undefined
  for (let height = anchor.height; height > anchor.height - SCAN_BLOCKS * 4 && height >= GENESIS; height -= 1)
    for (let i = 0; i < Math.min(SAMPLE_TXS, txCountOf(height)); i += 1) if (`0x${hex(`txhash:${String(height)}:${String(i)}`, 64)}` === h) return txAt(height, i)
  return undefined
}

export const atl = (n: number): string => (n === 0 ? '0 ATL' : `${n < 0.001 ? n.toFixed(6) : n.toFixed(n < 1 ? 4 : 2)} ATL`)

export type WatchKind = 'block' | 'tx' | 'address'
export interface ChainState {
  readonly version: 1
  readonly network: string
  readonly anchor: Anchor
  readonly produced: number
  /** `block:19482771`, `tx:0x…`, `address:0x…`. */
  readonly watch: readonly string[]
}

export const MAX_WATCH = 20
