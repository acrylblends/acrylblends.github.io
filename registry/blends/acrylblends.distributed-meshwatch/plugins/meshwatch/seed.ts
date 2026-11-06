/**
 * The cluster a person sees on the first start: Northstar, five Raft voting nodes in eu-central with node-03 leading term 38, commit index 8,421, one
 * degraded follower (node-05), the commit log's newest entries, a few recent events and two past drills. Times are relative to now.
 */
import type { MeshState } from './domain.ts'

const ago = (now: Date, seconds: number): string => new Date(now.getTime() - seconds * 1000).toISOString()
const day = (now: Date, daysAgo: number, h: number, m: number): string => new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, h, m).toISOString()

export function seed(now: Date): MeshState {
  return {
    version: 1,
    name: 'Northstar',
    protocol: 'Raft',
    region: 'eu-central',
    nodes: [
      { id: 'node-01', zone: 'eu-central-1b', health: 'healthy', lagMs: 12, heartbeatSec: 1, x: 205, y: 190 },
      { id: 'node-02', zone: 'eu-central-1c', health: 'healthy', lagMs: 9, heartbeatSec: 1, x: 595, y: 190 },
      { id: 'node-03', zone: 'eu-central-1a', health: 'healthy', x: 400, y: 100 },
      { id: 'node-04', zone: 'eu-central-1a', health: 'healthy', lagMs: 18, heartbeatSec: 1, x: 305, y: 305 },
      { id: 'node-05', zone: 'eu-central-1c', health: 'degraded', lagMs: 142, heartbeatSec: 4, x: 495, y: 305 },
    ],
    leader: 'node-03',
    term: 38,
    log: [
      { index: 8418, term: 38, origin: 'node-01', text: 'Append entries response', committed: true },
      { index: 8419, term: 38, origin: 'node-03', text: 'Leader lease renewed', committed: true },
      { index: 8420, term: 38, origin: 'node-02', text: 'Heartbeat acknowledged', committed: true },
      { index: 8421, term: 38, origin: 'node-03', text: 'Write batch · 18 records', committed: true },
    ],
    events: [
      { at: ago(now, 32), text: 'Replica lag warning', detail: 'node-05 · 142 ms' },
      { at: ago(now, 20), text: 'Heartbeat acknowledged', detail: 'node-02' },
      { at: ago(now, 18), text: 'Commit index advanced', detail: '+18 records' },
    ],
    drills: [
      { id: 'drill-1', name: 'Quorum interruption test', at: day(now, 8, 14, 0), kind: 'quorum', detail: '3 / 5 quorum retained · Completed' },
      { id: 'drill-2', name: 'Scheduled rehearsal', at: day(now, 4, 10, 30), kind: 'failover', from: 'node-03', to: 'node-02', detail: 'node-03 → node-02 · Completed in 2.1 sec' },
    ],
  }
}
