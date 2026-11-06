/** The swarm a person sees on the first start: room SD-482 mid-transfer as in the mockup (field-recordings-archive.zip, 68%, four peers), a waiting incoming room and a finished one with its receipt. */
import { type Peer, type Room, type SwarmState, clock } from './domain.ts'

const peer = (id: string, rate: number, latency: number, coverage: number): Peer => ({ id, rate, latency, coverage })

export function seed(now: Date): SwarmState {
  const at = (sec: number): string => clock(new Date(now.getTime() - sec * 1000))
  const live: Room = {
    id: 'SD-482',
    code: 'SWM-4K8P-Q2',
    name: 'field-recordings-archive.zip',
    sizeMb: 2400,
    direction: 'outgoing',
    ranges: `${'v'.repeat(48)}${'f'.repeat(5)}${'m'.repeat(17)}`,
    corrupt: [50],
    peers: [peer('peer-north-04', 820, 18, 0.95), peer('peer-amber-11', 610, 31, 0.85), peer('peer-lake-02', 390, 46, 0.7), peer('peer-fern-08', 0, 188, 0.5)],
    paused: false,
    events: [
      { t: at(190), text: 'peer handshake established', kind: 'good' },
      { t: at(187), text: 'chunk range 000–047 verified', kind: 'info' },
      { t: at(184), text: '3 peers contributing', kind: 'good' },
      { t: at(180), text: 'peer peer-fern-08 latency elevated', kind: 'warn' },
    ],
    checks: [],
    demoPeers: 0,
  }
  const waiting: Room = {
    id: 'SD-517',
    code: 'SWM-9M2D-X7',
    name: 'design-assets.tar',
    sizeMb: 640,
    direction: 'incoming',
    ranges: 'm'.repeat(70),
    corrupt: [],
    peers: [peer('peer-rose-03', 700, 22, 0.9), peer('peer-oak-21', 450, 40, 0.8)],
    paused: true,
    events: [{ t: at(3600), text: 'room joined; waiting to start', kind: 'info' }],
    checks: [],
    demoPeers: 0,
  }
  const done: Room = {
    id: 'SD-390',
    code: 'SWM-C7TR-N5',
    name: 'quarterly-data.csv.gz',
    sizeMb: 180,
    direction: 'outgoing',
    ranges: 'v'.repeat(70),
    corrupt: [],
    peers: [peer('peer-north-04', 0, 18, 0.95), peer('peer-lake-02', 0, 46, 0.7)],
    paused: false,
    events: [{ t: at(86000), text: 'transfer complete', kind: 'good' }, { t: at(85990), text: 'integrity check passed', kind: 'good' }],
    checks: [{ at: new Date(now.getTime() - 85_990_000).toISOString(), checked: 70, of: 70, result: 'passed', detail: 'Manifest matches 1,024 synthetic chunks.' }],
    completedAt: new Date(now.getTime() - 86_000_000).toISOString(),
    demoPeers: 0,
  }
  return { version: 1, rooms: [live, waiting, done] }
}
