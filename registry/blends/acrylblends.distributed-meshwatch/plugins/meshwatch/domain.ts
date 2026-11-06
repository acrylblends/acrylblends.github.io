/**
 * Meshwatch's domain: a Raft-style cluster of voting nodes, its quorum arithmetic, leader election, the append-only commit log, the event feed and the
 * failover drills. Pure functions and plain data; the {@link Mesh} in mesh.ts applies them to the saved state and the pages only read what it returns.
 *
 * The cluster is a fixture: no node is contacted and the numbers are illustrative.
 */

export type NodeHealth = 'healthy' | 'degraded' | 'down'
export type Role = 'leader' | 'follower'

export interface MeshNode {
  readonly id: string
  readonly zone: string
  readonly health: NodeHealth
  /** The replica lag in ms behind the leader; absent for the leader and for a node that is down. */
  readonly lagMs?: number
  /** The heartbeat as the fixture shows it: seconds since the last one, absent when the node is down. */
  readonly heartbeatSec?: number
  /** Where the node is drawn on the 800 x 370 topology map. */
  readonly x: number
  readonly y: number
}

export interface LogEntry {
  readonly index: number
  readonly term: number
  readonly origin: string
  readonly text: string
  readonly committed: boolean
}

export interface ClusterEvent {
  readonly at: string
  readonly text: string
  readonly detail: string
}

export interface Drill {
  readonly id: string
  readonly name: string
  readonly at: string
  readonly kind: 'failover' | 'quorum'
  readonly from?: string
  readonly to?: string
  /** The sentence under the name: `node-03 → node-02 · Completed in 2.1 sec`. */
  readonly detail: string
}

export interface MeshState {
  readonly version: 1
  readonly name: string
  readonly protocol: string
  readonly region: string
  readonly nodes: readonly MeshNode[]
  /** The leader's id; absent while the cluster has none. */
  readonly leader?: string
  readonly term: number
  readonly log: readonly LogEntry[]
  readonly events: readonly ClusterEvent[]
  readonly drills: readonly Drill[]
}

export class MeshError extends Error {
  override readonly name = 'MeshError'
  readonly code: 'invalid' | 'not-found' | 'conflict'
  constructor(code: 'invalid' | 'not-found' | 'conflict', message: string) {
    super(message)
    this.code = code
  }
}

/** The edges of the topology map, as pairs of node ids. */
export const EDGES: readonly (readonly [string, string])[] = [
  ['node-03', 'node-01'],
  ['node-03', 'node-02'],
  ['node-01', 'node-04'],
  ['node-02', 'node-05'],
  ['node-01', 'node-02'],
  ['node-04', 'node-05'],
]

export const HEALTH_LABEL: Readonly<Record<NodeHealth, string>> = { healthy: 'Healthy', degraded: 'Degraded', down: 'Down' }

// ---- quorum -----------------------------------------------------------------------------------------------------------------------------------

/** Votes needed to decide: a majority of the voting nodes. */
export const quorumSize = (nodeCount: number): number => Math.floor(nodeCount / 2) + 1

/** Nodes that can vote: everything that is not down (a degraded node still answers, slowly). */
export const upNodes = (nodes: readonly MeshNode[]): number => nodes.filter((n) => n.health !== 'down').length

export const hasQuorum = (nodes: readonly MeshNode[]): boolean => upNodes(nodes) >= quorumSize(nodes.length)

/** How many nodes the cluster can lose and still decide. */
export const toleratedFailures = (nodeCount: number): number => nodeCount - quorumSize(nodeCount)

export const roleOf = (state: MeshState, id: string): Role => (state.leader === id ? 'leader' : 'follower')

/** The index of the newest committed entry: what the commit-index card shows. */
export const commitIndex = (state: MeshState): number => Math.max(0, ...state.log.filter((e) => e.committed).map((e) => e.index))

export const lastIndex = (state: MeshState): number => Math.max(0, ...state.log.map((e) => e.index))

/** The highest lag among healthy followers; the degraded one is reported on its own row. */
export function replicationLagMs(state: MeshState): number | undefined {
  const lags = state.nodes.filter((n) => n.id !== state.leader && n.health === 'healthy' && n.lagMs !== undefined).map((n) => n.lagMs ?? 0)
  return lags.length === 0 ? undefined : Math.max(...lags)
}

/** The follower an election or an unspecified drill picks: healthy, lowest lag, then lowest id. */
export function bestFollower(state: MeshState, excluding?: string): MeshNode | undefined {
  return state.nodes
    .filter((n) => n.id !== state.leader && n.id !== excluding && n.health === 'healthy')
    .sort((a, b) => (a.lagMs ?? 0) - (b.lagMs ?? 0) || a.id.localeCompare(b.id))[0]
}

/** Seconds a failover to a node takes in the fixture: a fixed base plus its lag, so the same node always takes the same time. */
export const failoverSeconds = (node: MeshNode): number => Math.round((1.8 + (node.lagMs ?? 0) / 40) * 10) / 10

export const formatNumber = (n: number): string => n.toLocaleString('en-US')

/** `10:42:12`, local time. */
export function clockOf(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** `Nov 1`, or `Today` / `just now` for the clock's own day. */
export function dayLabel(iso: string, now: Date): string {
  const at = new Date(iso)
  if (now.getTime() - at.getTime() < 60_000) return 'just now'
  return at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function heartbeatLabel(node: MeshNode, isLeader: boolean): string {
  if (node.health === 'down') return 'No response'
  if (isLeader) return 'now'
  return `${String(node.heartbeatSec ?? 1)} sec ago`
}
