/**
 * The swarm (`ctx.swarm`): the saved rooms and every change to them. A change checks its input, builds the next state, saves it through the store and
 * only then makes it current, so a failed save leaves the swarm as it was. The open room, range and peer are the page's query, not saved.
 */
import {
  type EventLine,
  type IntegrityCheck,
  type Peer,
  type Room,
  type StepResult,
  type SwarmState,
  MAX_EVENTS,
  MAX_PEERS,
  MAX_ROOMS,
  RANGES,
  SwarmError,
  clock,
  codeOf,
  integrity,
  parseName,
  parseSize,
  rangeLabel,
  rng,
  runs,
  step,
} from './domain.ts'
import { seed } from './seed.ts'
import type { SwarmStore } from './store.ts'

export interface SwarmAdapters {
  readonly store: SwarmStore
  readonly clock: () => Date
}

export class Swarm {
  #state: SwarmState
  readonly #adapters: SwarmAdapters

  private constructor(state: SwarmState, adapters: SwarmAdapters) {
    this.#state = state
    this.#adapters = adapters
  }

  static async open(adapters: SwarmAdapters): Promise<Swarm> {
    const saved = await adapters.store.load()
    if (saved !== undefined) return new Swarm(saved, adapters)
    const state = seed(adapters.clock())
    await adapters.store.save(state)
    return new Swarm(state, adapters)
  }

  get state(): SwarmState {
    return this.#state
  }

  now(): Date {
    return this.#adapters.clock()
  }

  room(id: string | undefined | null): Room {
    const r = this.#state.rooms.find((x) => x.id === id)
    if (r === undefined) throw new SwarmError('not-found', 'There is no such transfer room.')
    return r
  }

  async #commit(room: Room, events: readonly Pick<EventLine, 'text' | 'kind'>[] = []): Promise<Room> {
    const t = clock(this.now())
    const next: Room = { ...room, events: [...room.events, ...events.map((e) => ({ ...e, t }))].slice(-MAX_EVENTS) }
    await this.#adapters.store.save({ ...this.#state, rooms: this.#state.rooms.map((r) => (r.id === next.id ? next : r)) })
    this.#state = { ...this.#state, rooms: this.#state.rooms.map((r) => (r.id === next.id ? next : r)) }
    return next
  }

  /** Create a room for a file: nothing has arrived and no peer is connected yet. */
  async createRoom(rawName: string | undefined, rawSize: string | undefined): Promise<Room> {
    const name = parseName(rawName)
    const sizeMb = parseSize(rawSize)
    if (this.#state.rooms.length >= MAX_ROOMS) throw new SwarmError('conflict', `At most ${String(MAX_ROOMS)} rooms are kept; close one first.`)
    if (this.#state.rooms.some((r) => r.name.toLowerCase() === name.toLowerCase())) throw new SwarmError('conflict', `There is already a room for ${name}.`)
    const n = Math.max(...this.#state.rooms.map((r) => Number(r.id.slice(3))), 482) + 1
    const id = `SD-${String(n)}`
    const room: Room = { id, code: codeOf(id), name, sizeMb, direction: 'incoming', ranges: 'm'.repeat(RANGES), corrupt: [], peers: [], paused: true, events: [], checks: [], demoPeers: 0 }
    const t = clock(this.now())
    const stored: Room = { ...room, events: [{ t, text: 'room created; add a peer to start', kind: 'info' }] }
    this.#state = { ...this.#state, rooms: [...this.#state.rooms, stored] }
    await this.#adapters.store.save(this.#state)
    return stored
  }

  /** Join a room by its share code. */
  joinRoom(rawCode: string | undefined): Room {
    const code = (rawCode ?? '').trim().toUpperCase()
    if (code === '') throw new SwarmError('invalid', 'Enter a room code like SWM-4K8P-Q2.')
    const room = this.#state.rooms.find((r) => r.code === code)
    if (room === undefined) throw new SwarmError('not-found', `No transfer room has the code ${code}.`)
    return room
  }

  async closeRoom(id: string): Promise<void> {
    const room = this.room(id)
    if (this.#state.rooms.length === 1) throw new SwarmError('conflict', 'Keep at least one room.')
    this.#state = { ...this.#state, rooms: this.#state.rooms.filter((r) => r.id !== room.id) }
    await this.#adapters.store.save(this.#state)
  }

  async setPaused(id: string, paused: boolean): Promise<Room> {
    const room = this.room(id)
    if (room.completedAt !== undefined) throw new SwarmError('conflict', 'This transfer is complete; there is nothing to pause.')
    if (room.paused === paused) return room
    return this.#commit({ ...room, paused }, [{ text: paused ? 'transfer paused locally' : 'transfer resumed in local simulation', kind: 'info' }])
  }

  /** Add a synthetic peer with a deterministic rate, latency and coverage. */
  async addPeer(id: string): Promise<Peer> {
    const room = this.room(id)
    if (room.peers.length >= MAX_PEERS) throw new SwarmError('conflict', `A room holds at most ${String(MAX_PEERS)} peers.`)
    const n = room.demoPeers + 1
    const r = rng(`demo:${room.id}:${String(n)}`)
    const peer: Peer = { id: `peer-demo-${String(14 + n)}`, rate: 240 + Math.floor(r() * 4) * 40, latency: 40 + Math.floor(r() * 30), coverage: 0.7 }
    await this.#commit({ ...room, peers: [...room.peers, peer], demoPeers: n }, [{ text: `synthetic peer ${peer.id} joined (${String(peer.rate)} KB/s, ${String(peer.latency)} ms)`, kind: 'good' }])
    return peer
  }

  async dropPeer(id: string, peerId: string): Promise<void> {
    const room = this.room(id)
    if (!room.peers.some((p) => p.id === peerId)) throw new SwarmError('not-found', 'There is no such peer in this room.')
    await this.#commit({ ...room, peers: room.peers.filter((p) => p.id !== peerId) }, [{ text: `peer ${peerId} disconnected`, kind: 'warn' }])
  }

  /** Run one simulation step. Refused while paused or complete; reports a stall when no connected peer holds what is missing. */
  async advance(id: string): Promise<StepResult> {
    const room = this.room(id)
    if (room.completedAt !== undefined) throw new SwarmError('conflict', 'This transfer is already complete.')
    if (room.paused) throw new SwarmError('conflict', 'The transfer is paused. Resume it to advance the simulation.')
    const r = step(room)
    const events: Pick<EventLine, 'text' | 'kind'>[] = []
    if (r.verified.length > 0) events.push({ text: `chunk range ${runs(r.verified)} verified`, kind: 'info' })
    for (const i of r.failed) events.push({ text: `range ${rangeLabel(i)} failed verification (hash mismatch); asking another peer`, kind: 'warn' })
    if (r.started.length > 0) events.push({ text: `requested range ${runs(r.started)}`, kind: 'info' })
    if (r.stalled) events.push({ text: 'stalled: no connected peer holds the remaining ranges', kind: 'warn' })
    if (r.complete) events.push({ text: 'transfer complete; run the integrity check for the receipt', kind: 'good' })
    await this.#commit({ ...room, ranges: r.ranges, corrupt: r.corrupt, ...(r.complete ? { completedAt: this.now().toISOString() } : {}) }, events)
    return r
  }

  /** Compare the verified ranges with the manifest and record the result; a finished, passing check gives the receipt. */
  async verify(id: string): Promise<IntegrityCheck> {
    const room = this.room(id)
    const check = integrity(room, this.now().toISOString())
    await this.#commit({ ...room, checks: [...room.checks, check].slice(-10) }, [{ text: check.result === 'passed' ? 'integrity check passed (demo)' : `integrity check ${check.result}: ${check.detail}`, kind: check.result === 'passed' ? 'good' : 'warn' }])
    return check
  }
}
