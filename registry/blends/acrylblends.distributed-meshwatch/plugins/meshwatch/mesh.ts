/**
 * The mesh (`ctx.mesh`): the saved state and every change to it. A change checks its guards, builds the next state (an append-only log entry, an
 * event, sometimes a new leader and term), saves it through the store and only then makes it current, so a failed save leaves the mesh as it was.
 */
import {
  type ClusterEvent,
  type Drill,
  type LogEntry,
  type MeshNode,
  type MeshState,
  type NodeHealth,
  MeshError,
  bestFollower,
  commitIndex,
  failoverSeconds,
  hasQuorum,
  lastIndex,
  quorumSize,
  toleratedFailures,
  upNodes,
} from './domain.ts'
import { seed } from './seed.ts'
import type { MeshStore } from './store.ts'

export interface MeshAdapters {
  readonly store: MeshStore
  readonly clock: () => Date
  readonly newId: (kind: 'drill') => string
}

export class Mesh {
  #state: MeshState
  readonly #adapters: MeshAdapters

  private constructor(state: MeshState, adapters: MeshAdapters) {
    this.#state = state
    this.#adapters = adapters
  }

  static async open(adapters: MeshAdapters): Promise<Mesh> {
    const saved = await adapters.store.load()
    if (saved !== undefined) return new Mesh(saved, adapters)
    const state = seed(adapters.clock())
    await adapters.store.save(state)
    return new Mesh(state, adapters)
  }

  get state(): MeshState {
    return this.#state
  }

  now(): Date {
    return this.#adapters.clock()
  }

  node(id: string): MeshNode {
    const node = this.#state.nodes.find((n) => n.id === id)
    if (node === undefined) throw new MeshError('not-found', 'There is no such node.')
    return node
  }

  /** Newest first. */
  log(): readonly LogEntry[] {
    return [...this.#state.log].sort((a, b) => b.index - a.index)
  }

  events(limit = 20): readonly ClusterEvent[] {
    return [...this.#state.events].reverse().sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit)
  }

  drills(): readonly Drill[] {
    return [...this.#state.drills].reverse().sort((a, b) => b.at.localeCompare(a.at))
  }

  async #commit(next: MeshState): Promise<void> {
    await this.#adapters.store.save(next)
    this.#state = next
  }

  #event(text: string, detail: string): ClusterEvent {
    return { at: this.now().toISOString(), text, detail }
  }

  /** The next log entry: committed only when the cluster has a quorum to commit it. */
  #entry(state: MeshState, origin: string, text: string, term = state.term): LogEntry {
    return { index: lastIndex(state) + 1, term, origin, text, committed: hasQuorum(state.nodes) }
  }

  /**
   * Set a node's health. Taking the leader down makes the survivors elect the healthiest follower in a new term when they still have a quorum; with no
   * quorum the cluster is leaderless until enough nodes return. A node coming back while there is no leader triggers the election.
   */
  async setHealth(id: string, health: NodeHealth): Promise<MeshNode> {
    const before = this.node(id)
    if (before.health === health) throw new MeshError('conflict', `${id} is already ${health}.`)
    const wasLeader = this.#state.leader === id
    const bare = (n: MeshNode): MeshNode => ({ id: n.id, zone: n.zone, health: n.health, x: n.x, y: n.y })
    // A follower that is not down has a lag to show; the leader and a down node have none.
    const lagged = (n: MeshNode, lag: number, beat: number): MeshNode => ({ ...bare(n), lagMs: lag, heartbeatSec: beat })
    const changed: MeshNode = { ...bare(before), health }
    const updated = health === 'down' || wasLeader ? changed : lagged(changed, health === 'degraded' ? 142 : 12, health === 'degraded' ? 4 : 1)
    let nodes = this.#state.nodes.map((n) => (n.id === id ? updated : n))
    let leader: string | undefined = this.#state.leader
    let term = this.#state.term
    const events: ClusterEvent[] = [this.#event(`Node ${id} ${health}`, health === 'degraded' ? 'Replica lag warning · 142 ms' : health === 'down' ? 'Heartbeat timeout' : 'Heartbeat resumed')]
    const log: LogEntry[] = []
    const countsUp = (list: readonly MeshNode[]) => `${String(upNodes(list))} / ${String(list.length)} nodes up`
    const elect = (why: ClusterEvent | undefined): void => {
      const winner = bestFollower({ ...this.#state, nodes, ...(leader === undefined ? {} : { leader }) }, wasLeader ? id : undefined)
      if (winner === undefined) return
      term += 1
      leader = winner.id
      nodes = nodes.map((n) => (n.id === winner.id ? bare(n) : n))
      if (why !== undefined) events.push(why)
      events.push(this.#event('Leader elected', `${winner.id} · term ${String(term)}`))
      log.push({ index: lastIndex(this.#state) + 1, term, origin: winner.id, text: 'Leader elected', committed: true })
    }
    if (wasLeader && health === 'down') {
      leader = undefined
      if (hasQuorum(nodes)) elect(undefined)
      else events.push(this.#event('Quorum lost', `${countsUp(nodes)} · ${String(quorumSize(nodes.length))} needed`))
    } else if (leader === undefined && health !== 'down' && hasQuorum(nodes)) {
      elect(this.#event('Quorum restored', countsUp(nodes)))
    }
    // The old leader coming back is an ordinary follower with a fresh lag.
    nodes = nodes.map((n) => (n.id !== leader && n.health !== 'down' && n.lagMs === undefined ? lagged(n, 12, 1) : n))
    const next: MeshState = { ...this.#state, nodes, term, log: [...this.#state.log, ...log], events: [...this.#state.events, ...events] }
    const { leader: _old, ...withoutLeader } = next
    await this.#commit(leader === undefined ? withoutLeader : { ...withoutLeader, leader })
    return this.node(id)
  }

  /** Move leadership to a healthy follower (the best one when none is named), in a new term; needs a quorum. */
  async runFailover(target: string | undefined, rawName?: string): Promise<Drill> {
    const state = this.#state
    if (!hasQuorum(state.nodes)) throw new MeshError('conflict', `Only ${String(upNodes(state.nodes))} of ${String(state.nodes.length)} nodes are up; a drill needs a quorum of ${String(quorumSize(state.nodes.length))}.`)
    if (state.leader === undefined) throw new MeshError('conflict', 'The cluster has no leader; restore a quorum first.')
    const to = target === undefined || target === '' ? bestFollower(state) : this.node(target)
    if (to === undefined) throw new MeshError('conflict', 'There is no healthy follower to promote.')
    if (to.id === state.leader) throw new MeshError('conflict', `${to.id} already leads the cluster.`)
    if (to.health !== 'healthy') throw new MeshError('conflict', `${to.id} is ${to.health}; promote a healthy follower.`)
    const name = (rawName ?? '').trim() || 'Local failover drill'
    if (name.length > 60) throw new MeshError('invalid', 'A drill name is at most 60 characters.')
    const from = state.leader
    const next: MeshState = { ...state, leader: to.id, term: state.term + 1 }
    const entry = this.#entry(next, to.id, 'Leadership transition')
    const drill: Drill = { id: this.#adapters.newId('drill'), name, at: this.now().toISOString(), kind: 'failover', from, to: to.id, detail: `${from} → ${to.id} · Completed in ${failoverSeconds(to).toFixed(1)} sec · illustrative` }
    await this.#commit({
      ...next,
      nodes: next.nodes.map((n) => (n.id === to.id ? { id: n.id, zone: n.zone, health: n.health, x: n.x, y: n.y } : n.id === from ? { ...n, lagMs: 12, heartbeatSec: 1 } : n)),
      log: [...state.log, entry],
      events: [...state.events, this.#event('Failover drill', `${from} → ${to.id} · term ${String(next.term)}`)],
      drills: [...state.drills, drill],
    })
    return drill
  }

  /** Check what the cluster would survive: how many nodes it can lose and keep a quorum. Changes no node; records the drill. */
  async runQuorumDrill(): Promise<Drill> {
    const n = this.#state.nodes.length
    const retained = upNodes(this.#state.nodes) - toleratedFailures(n)
    const ok = retained >= quorumSize(n)
    const drill: Drill = {
      id: this.#adapters.newId('drill'),
      name: 'Quorum interruption test',
      at: this.now().toISOString(),
      kind: 'quorum',
      detail: ok ? `${String(quorumSize(n))} / ${String(n)} quorum retained · Completed` : `Quorum would be lost after ${String(toleratedFailures(n))} failures with ${String(upNodes(this.#state.nodes))} nodes up · Failed`,
    }
    await this.#commit({ ...this.#state, drills: [...this.#state.drills, drill], events: [...this.#state.events, this.#event('Quorum drill', ok ? 'Quorum retained' : 'Quorum at risk')] })
    return drill
  }

  /** Put the fixture back as it was on the first start. */
  async reset(): Promise<void> {
    await this.#commit(seed(this.now()))
  }

  commitIndex(): number {
    return commitIndex(this.#state)
  }
}
