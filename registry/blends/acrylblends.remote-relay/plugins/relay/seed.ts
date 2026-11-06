/**
 * What a person sees on the first start: two workspaces with eight saved connections, the active session RLY-1042 on staging-api (whoami, uptime and
 * docker ps already run), two closed sessions, two transfers and the audit trail. Times are relative to now, so the active session is always a few
 * minutes old.
 */
import { type ConnectionProfile, type RelayState, type RemoteSession, type TerminalEntry, runCommand } from './domain.ts'

const profiles: ConnectionProfile[] = [
  { id: 'staging-api', name: 'staging-api', user: 'deploy', host: '10.20.1.14', port: 22, workspaceId: 'production-support', health: 'ok' },
  { id: 'db-replica', name: 'db-replica', user: 'ops', host: '10.20.1.22', port: 2222, workspaceId: 'production-support', health: 'ok' },
  { id: 'edge-node', name: 'edge-node', user: 'root', host: '10.20.9.8', port: 22, workspaceId: 'production-support', health: 'warn' },
  { id: 'ci-runner-a', name: 'ci-runner-a', user: 'builder', host: '10.30.0.11', port: 22, workspaceId: 'build-infrastructure', health: 'ok' },
  { id: 'ci-runner-b', name: 'ci-runner-b', user: 'builder', host: '10.30.0.12', port: 22, workspaceId: 'build-infrastructure', health: 'ok' },
  { id: 'artifact-store', name: 'artifact-store', user: 'ops', host: '10.30.0.20', port: 22, workspaceId: 'build-infrastructure', health: 'ok' },
  { id: 'cache-node', name: 'cache-node', user: 'builder', host: '10.30.0.31', port: 2200, workspaceId: 'build-infrastructure', health: 'warn' },
  { id: 'signing-host', name: 'signing-host', user: 'release', host: '10.30.0.40', port: 22, workspaceId: 'build-infrastructure', health: 'ok' },
]

const iso = (now: Date, daysAgo: number, h: number, m: number, s = 0) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, h, m, s).toISOString()

export function seed(now: Date): RelayState {
  const start = new Date(now.getTime() - (7 * 60 + 59) * 1000)
  const t = (offsetSeconds: number) => new Date(start.getTime() + offsetSeconds * 1000).toISOString()
  const staging = profiles[0]
  if (staging === undefined) throw new Error('seed')
  const entry = (offset: number, command: string): TerminalEntry => ({ at: t(offset), command, ...(({ output, exit }) => ({ output, exit }))(runCommand(staging, command)) })
  const active: RemoteSession = {
    id: 'RLY-1042',
    profileId: 'staging-api',
    startedAt: t(0),
    lastActivityAt: t(11),
    entries: [entry(5, 'whoami'), entry(9, 'uptime'), entry(11, 'docker ps')],
  }
  const closed = (id: string, profileId: string, at: string, minutes: number): RemoteSession => ({
    id,
    profileId,
    startedAt: at,
    lastActivityAt: new Date(new Date(at).getTime() + minutes * 60_000).toISOString(),
    closedAt: new Date(new Date(at).getTime() + minutes * 60_000).toISOString(),
    entries: [],
  })
  return {
    version: 1,
    workspaces: [
      { id: 'production-support', name: 'Production support' },
      { id: 'build-infrastructure', name: 'Build infrastructure' },
    ],
    profiles,
    sessions: [
      closed('RLY-1031', 'edge-node', iso(now, 2, 13, 2), 11),
      closed('RLY-1037', 'db-replica', iso(now, 1, 16, 19), 24),
      active,
    ],
    transfers: [
      { id: 'xfer-1', sessionId: 'RLY-1042', name: 'release-notes.txt', direction: 'up', path: '/tmp/', bytes: 14 * 1024, state: 'completed' },
      { id: 'xfer-2', sessionId: 'RLY-1042', name: 'diagnostics.tar.gz', direction: 'down', path: '/var/log/', bytes: 2_516_582, state: 'ready' },
    ],
    audit: [
      { id: 'audit-1', sessionId: 'RLY-1042', at: t(0), text: 'Session opened', result: 'OK' },
      { id: 'audit-2', sessionId: 'RLY-1042', at: t(3), text: 'Host profile staging-api selected' },
      { id: 'audit-3', sessionId: 'RLY-1042', at: t(5), text: 'whoami', result: 'Exit 0' },
      { id: 'audit-4', sessionId: 'RLY-1042', at: t(9), text: 'uptime', result: 'Exit 0' },
      { id: 'audit-5', sessionId: 'RLY-1042', at: t(11), text: 'docker ps', result: 'Exit 0' },
      { id: 'audit-6', sessionId: 'RLY-1037', at: iso(now, 1, 16, 19), text: 'Session opened', result: 'OK' },
      { id: 'audit-7', sessionId: 'RLY-1037', at: iso(now, 1, 16, 43), text: 'Session closed', result: 'OK' },
      { id: 'audit-8', sessionId: 'RLY-1031', at: iso(now, 2, 13, 2), text: 'Session opened', result: 'OK' },
      { id: 'audit-9', sessionId: 'RLY-1031', at: iso(now, 2, 13, 13), text: 'Session closed', result: 'OK' },
    ],
  }
}
