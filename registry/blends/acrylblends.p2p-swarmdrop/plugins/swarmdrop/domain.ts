/**
 * Swarmdrop's domain: transfer rooms over synthetic peers. A room has a file manifest cut into {@link RANGES} chunk ranges; each range is verified,
 * in flight or missing; peers hold deterministic subsets of the ranges and offer a rate and a latency; a simulation step verifies what is in flight and
 * starts the rarest available ranges; an integrity check compares the verified ranges with the manifest fixture; a finished, checked transfer has a receipt.
 * Pure functions and plain data; the {@link Swarm} in swarm.ts applies them to the saved state.
 *
 * Nothing is transferred: no socket is opened, no file is read and every peer, rate and hash is a fixture made by a seeded generator.
 */

export class SwarmError extends Error {
  override readonly name = 'SwarmError'
  readonly code: 'invalid' | 'not-found' | 'conflict'
  constructor(code: 'invalid' | 'not-found' | 'conflict', message: string) {
    super(message)
    this.code = code
  }
}

export const RANGES = 70
export const CHUNKS = 1024
export const MAX_PEERS = 12
export const MAX_ROOMS = 6
export const MAX_EVENTS = 30
export const SLOW_LATENCY_MS = 150

/** `v` verified, `f` in flight, `m` not received: one letter per range. */
export type RangeState = 'v' | 'f' | 'm'

export interface Peer {
  readonly id: string
  /** KB per second this peer sends us. */
  readonly rate: number
  readonly latency: number
  /** The share of the ranges this peer holds, 0 to 1. */
  readonly coverage: number
}

export interface EventLine {
  readonly t: string
  readonly text: string
  readonly kind: 'info' | 'good' | 'warn'
}

export interface IntegrityCheck {
  readonly at: string
  readonly checked: number
  readonly of: number
  readonly result: 'passed' | 'partial' | 'failed'
  readonly detail: string
}

export interface Receipt {
  readonly completedAt: string
  readonly file: string
  readonly sizeMb: number
  readonly chunks: number
  readonly digest: string
  readonly contributors: readonly { readonly peer: string; readonly share: number }[]
}

export interface Room {
  readonly id: string
  readonly code: string
  readonly name: string
  readonly sizeMb: number
  readonly direction: 'incoming' | 'outgoing'
  readonly ranges: string
  /** Range numbers whose first verification fails (a bad copy), so the swarm has to ask again. */
  readonly corrupt: readonly number[]
  readonly peers: readonly Peer[]
  readonly paused: boolean
  readonly events: readonly EventLine[]
  readonly checks: readonly IntegrityCheck[]
  readonly completedAt?: string
  readonly demoPeers: number
}

export interface SwarmState {
  readonly version: 1
  readonly rooms: readonly Room[]
}

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

export const stateAt = (room: Room, i: number): RangeState => (room.ranges[i] as RangeState | undefined) ?? 'm'

export function setRanges(room: Room, changes: ReadonlyMap<number, RangeState>): string {
  return [...room.ranges].map((c, i) => changes.get(i) ?? c).join('')
}

export const count = (room: Room, s: RangeState): number => [...room.ranges].filter((c) => c === s).length

/** Whole percent of the ranges verified (rounded down). */
export const percentOf = (room: Room): number => Math.floor((count(room, 'v') / RANGES) * 100)

export const holds = (room: Room, peer: Peer, i: number): boolean => rng(`hold:${room.id}:${peer.id}:${String(i)}`)() < peer.coverage

/** The peers that could send us range `i` now: connected, sending, and holding it. */
export const sources = (room: Room, i: number): Peer[] => room.peers.filter((p) => p.rate > 0 && holds(room, p, i))

export const availability = (room: Room, i: number): number => sources(room, i).length

/** The chunk numbers a range covers, first and last. */
export const span = (i: number): [number, number] => [Math.floor((i * CHUNKS) / RANGES), Math.floor(((i + 1) * CHUNKS) / RANGES) - 1]

export const rangeHash = (room: Room, i: number): string => hex(`sha:${room.id}:${String(i)}`, 64)
export const digestOf = (room: Room): string => hex(`manifest:${room.id}`, 64)

export const rateOf = (room: Room): number => (room.paused || room.completedAt !== undefined ? 0 : room.peers.reduce((n, p) => n + p.rate, 0))

export const rateLabel = (kbps: number): string => (kbps >= 1000 ? `${(kbps / 1000).toFixed(1)} MB/s` : `${String(kbps)} KB/s`)

export function sizeLabel(mb: number): string {
  return mb >= 1000 ? `${(mb / 1000).toFixed(1)} GB` : `${String(mb)} MB`
}

/** Time left at the current rate: the unverified share of the file over the sum of the peers' rates. */
export function etaLabel(room: Room): string {
  if (room.completedAt !== undefined) return 'complete'
  const rate = room.peers.reduce((n, p) => n + p.rate, 0)
  if (room.paused) return 'paused'
  if (rate === 0) return 'no peer is sending'
  const remainingKb = (RANGES - count(room, 'v')) * ((room.sizeMb * 1024) / RANGES)
  const s = Math.ceil(remainingKb / rate)
  return `${String(Math.floor(s / 60))}m ${String(s % 60).padStart(2, '0')}s remaining`
}

export const quality = (p: Peer): 'good' | 'fair' | 'poor' => (p.latency < 50 ? 'good' : p.latency < SLOW_LATENCY_MS ? 'fair' : 'poor')

export const clock = (d: Date): string => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`

export const codeOf = (id: string): string => {
  const r = rng(`code:${id}`)
  const pick = (n: number) => Array.from({ length: n }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(r() * 32)]).join('')
  return `SWM-${pick(4)}-${pick(2)}`
}

export const rangeLabel = (i: number): string => String(i).padStart(2, '0')

/** `048–052` runs from a list of range numbers. */
export function runs(list: readonly number[]): string {
  const sorted = [...list].sort((a, b) => a - b)
  const out: string[] = []
  for (let i = 0; i < sorted.length; i += 1) {
    const start = sorted[i] as number
    let end = start
    while (sorted[i + 1] === end + 1) {
      end += 1
      i += 1
    }
    out.push(start === end ? rangeLabel(start) : `${rangeLabel(start)}–${rangeLabel(end)}`)
  }
  return out.join(', ')
}

export interface StepResult {
  readonly verified: number[]
  readonly failed: number[]
  readonly started: number[]
  readonly complete: boolean
  readonly stalled: boolean
  readonly ranges: string
  readonly corrupt: number[]
}

/**
 * One simulation step. In-flight ranges are verified (a corrupt one fails once and goes back to "not received"); then up to peers+2 missing ranges
 * are started, the ones fewest connected peers hold first (rarest first), ties by number; a range nobody holds is not started. With nothing
 * missing or in flight the transfer is complete.
 */
export function step(room: Room): StepResult {
  const changes = new Map<number, RangeState>()
  const verified: number[] = []
  const failed: number[] = []
  const corrupt = [...room.corrupt]
  for (let i = 0; i < RANGES; i += 1)
    if (stateAt(room, i) === 'f') {
      if (corrupt.includes(i)) {
        corrupt.splice(corrupt.indexOf(i), 1)
        changes.set(i, 'm')
        failed.push(i)
      } else {
        changes.set(i, 'v')
        verified.push(i)
      }
    }
  const after = setRanges(room, changes)
  const probe = { ...room, ranges: after }
  const slots = room.peers.filter((p) => p.rate > 0).length + 2
  const missing = [...Array(RANGES).keys()].filter((i) => stateAt(probe, i) === 'm' && !failed.includes(i)).map((i) => ({ i, n: availability(probe, i) })).filter((r) => r.n > 0).sort((a, b) => a.n - b.n || a.i - b.i)
  const started = missing.slice(0, slots).map((r) => r.i)
  for (const i of started) changes.set(i, 'f')
  const ranges = setRanges(room, changes)
  const done = ![...ranges].some((c) => c !== 'v')
  const stalled = !done && started.length === 0 && ![...ranges].some((c) => c === 'f') && failed.length === 0
  return { verified, failed, started, complete: done, stalled, ranges, corrupt }
}

/** Compare the verified ranges with the manifest fixture. A range is a bad copy only if the room still lists it as corrupt. */
export function integrity(room: Room, at: string): IntegrityCheck {
  const checked = count(room, 'v')
  const bad = room.corrupt.filter((i) => stateAt(room, i) === 'v')
  if (bad.length > 0) return { at, checked, of: RANGES, result: 'failed', detail: `${String(bad.length)} verified ${bad.length === 1 ? 'range does' : 'ranges do'} not match the manifest (${runs(bad)}).` }
  if (checked < RANGES) return { at, checked, of: RANGES, result: 'partial', detail: `${String(checked)} of ${String(RANGES)} ranges verified so far match the manifest; the rest have not arrived.` }
  return { at, checked, of: RANGES, result: 'passed', detail: `Manifest matches ${CHUNKS.toLocaleString('en-US')} synthetic chunks.` }
}

export function receiptOf(room: Room): Receipt | undefined {
  const last = room.checks.at(-1)
  if (room.completedAt === undefined || last === undefined || last.result !== 'passed') return undefined
  const total = room.peers.reduce((n, p) => n + p.coverage, 0) || 1
  return { completedAt: room.completedAt, file: room.name, sizeMb: room.sizeMb, chunks: CHUNKS, digest: digestOf(room), contributors: room.peers.map((p) => ({ peer: p.id, share: Math.round((p.coverage / total) * 100) })) }
}

export function parseSize(raw: string | undefined): number {
  const n = Number((raw ?? '').trim())
  if (!Number.isInteger(n) || n < 1 || n > 50_000) throw new SwarmError('invalid', 'The file size must be a whole number of MB from 1 to 50,000.')
  return n
}

export function parseName(raw: string | undefined): string {
  const name = (raw ?? '').trim()
  if (name === '') throw new SwarmError('invalid', 'Give the file a name.')
  if (name.length > 60 || /[\\/]/.test(name)) throw new SwarmError('invalid', 'A file name is at most 60 characters and has no slashes.')
  return name
}
