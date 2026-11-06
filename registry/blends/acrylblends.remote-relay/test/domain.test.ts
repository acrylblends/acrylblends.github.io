import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ALLOWLIST, IDLE_MINUTES, Relay, formatBytes, memoryStore, parseProfile, runCommand, seed, statusOf, whenLabel } from '../plugins/relay/index.ts'
import { NOW } from './support.ts'

const open = async () => {
  let ids = 0
  const store = memoryStore()
  let now = NOW
  const relay = await Relay.open({ store, clock: () => now, newId: (kind) => `${kind}-n${++ids}` })
  return { relay, store, setNow: (d: Date) => (now = d) }
}

const staging = () => seed(NOW).profiles[0]!

test('the demo commands answer from fixtures, per profile, and anything else is denied', () => {
  const p = staging()
  assert.deepEqual(runCommand(p, 'whoami'), { output: 'deploy', exit: 0, allowed: true })
  assert.equal(runCommand(p, 'pwd').output, '/home/deploy')
  assert.equal(runCommand(p, '  docker   ps ').output.split('\n').length, 4)
  assert.equal(runCommand({ ...p, user: 'root' }, 'pwd').output, '/root')
  assert.equal(runCommand(seed(NOW).profiles[1]!, 'docker ps').exit, 127)
  assert.match(runCommand(p, 'help').output, /ls, uptime, docker ps/)
  for (const c of ALLOWLIST) assert.equal(runCommand(p, c).allowed, true, c)
  const denied = runCommand(p, 'rm -rf /')
  assert.equal(denied.allowed, false)
  assert.equal(denied.exit, 126)
  assert.match(denied.output, /not in demo allowlist/)
})

test('a session is active until it is closed or idle for 15 minutes', () => {
  const s = seed(NOW).sessions.find((x) => x.id === 'RLY-1042')!
  assert.equal(statusOf(s, NOW), 'active')
  assert.equal(statusOf(s, new Date(new Date(s.lastActivityAt).getTime() + IDLE_MINUTES * 60_000 + 1000)), 'expired')
  assert.equal(statusOf({ ...s, closedAt: NOW.toISOString() }, NOW), 'closed')
})

test('sizes and times read as the mockup does', () => {
  assert.equal(formatBytes(14 * 1024), '14 KB')
  assert.equal(formatBytes(640 * 1024), '640 KB')
  assert.equal(formatBytes(2_516_582), '2.4 MB')
  assert.equal(whenLabel(new Date(2026, 10, 4, 16, 19).toISOString(), NOW), 'Yesterday · 16:19')
  assert.equal(whenLabel(new Date(2026, 10, 3, 13, 2).toISOString(), NOW), 'Nov 3 · 13:02')
})

test('connection input is checked', () => {
  const ws = seed(NOW).workspaces
  const ok = { name: ' Build-Gateway ', user: 'deploy', host: '10.20.1.30', port: '', workspaceId: 'build-infrastructure' }
  assert.deepEqual(parseProfile(ok, ws), { name: 'build-gateway', user: 'deploy', host: '10.20.1.30', port: 22, workspaceId: 'build-infrastructure' })
  assert.equal(parseProfile({ ...ok, host: 'Gateway.Example.com' }, ws).host, 'gateway.example.com')
  assert.throws(() => parseProfile({ ...ok, name: '' }, ws), /Give the connection a name/)
  assert.throws(() => parseProfile({ ...ok, name: 'a b' }, ws), /lowercase letters/)
  assert.throws(() => parseProfile({ ...ok, user: 'Root!' }, ws), /Unix account name/)
  assert.throws(() => parseProfile({ ...ok, host: '300.1.1.1' }, ws), /IPv4 address or a host name/)
  assert.throws(() => parseProfile({ ...ok, port: '70000' }, ws), /1 to 65535/)
  assert.throws(() => parseProfile({ ...ok, workspaceId: 'x' }, ws), /Pick a workspace/)
})

test('commands run in a live session, are logged, and refresh the idle timer; blank and long ones are refused', async () => {
  const { relay, store, setNow } = await open()
  const entry = await relay.run('RLY-1042', 'pwd')
  assert.equal(entry.output, '/home/deploy')
  assert.equal(relay.session('RLY-1042').entries.length, 4)
  assert.deepEqual(relay.audit('RLY-1042').slice(-1)[0]?.result, 'Exit 0')
  await relay.run('RLY-1042', 'curl example.com')
  assert.equal(relay.audit('RLY-1042').slice(-1)[0]?.result, 'Denied')
  const saves = store.saved
  await assert.rejects(relay.run('RLY-1042', '  '), /Type a command first/)
  await assert.rejects(relay.run('RLY-1042', 'x'.repeat(81)), /at most 80 characters/)
  await assert.rejects(relay.run('nope', 'pwd'), /no such session/)
  assert.equal(store.saved, saves)
  // Idle for a while: the timer was refreshed by the last command, so 14 minutes later it still works; 16 does not.
  setNow(new Date(NOW.getTime() + 14 * 60_000))
  await relay.run('RLY-1042', 'whoami')
  setNow(new Date(NOW.getTime() + 31 * 60_000))
  await assert.rejects(relay.run('RLY-1042', 'whoami'), /timed out after 15 idle minutes/)
})

test('one live session per profile; a timed-out one is closed when a new one opens; numbers continue', async () => {
  const { relay, setNow } = await open()
  await assert.rejects(relay.openSession('staging-api'), /already has an active session, RLY-1042/)
  const fresh = await relay.openSession('db-replica')
  assert.equal(fresh.id, 'RLY-1043')
  assert.deepEqual(relay.audit(fresh.id).map((e) => e.text), ['Session opened', 'Host profile db-replica selected'])
  setNow(new Date(NOW.getTime() + 60 * 60_000))
  const again = await relay.openSession('staging-api')
  assert.equal(again.id, 'RLY-1044')
  assert.equal(relay.session('RLY-1042').closedAt !== undefined, true)
  assert.match(relay.audit('RLY-1042').slice(-1)[0]?.text ?? '', /timed out/)
})

test('closing a session cancels its open transfers and refuses a second close', async () => {
  const { relay } = await open()
  await relay.closeSession('RLY-1042')
  assert.equal(relay.status(relay.session('RLY-1042')), 'closed')
  assert.deepEqual(relay.transfers('RLY-1042').map((t) => t.state), ['completed', 'cancelled'])
  await assert.rejects(relay.closeSession('RLY-1042'), /already closed/)
  await assert.rejects(relay.queueTransfer('RLY-1042'), /Session RLY-1042 is closed/)
})

test('transfers step through queued, ready, running, completed; samples never repeat; cancel and the end states are guarded', async () => {
  const { relay } = await open()
  const job = await relay.queueTransfer('RLY-1042')
  assert.deepEqual([job.name, job.state, job.bytes], ['sample-bundle.zip', 'queued', 655360])
  assert.equal((await relay.advanceTransfer(job.id)).state, 'ready')
  assert.equal((await relay.advanceTransfer(job.id)).state, 'running')
  assert.equal((await relay.advanceTransfer(job.id)).state, 'completed')
  await assert.rejects(relay.advanceTransfer(job.id), /completed; it cannot move on/)
  await assert.rejects(relay.cancelTransfer(job.id), /already completed/)
  assert.equal(relay.audit('RLY-1042').slice(-1)[0]?.result, 'Checksum OK')
  for (const name of ['config-backup.tar', 'deploy-notes.md', 'access.log.gz']) assert.equal((await relay.queueTransfer('RLY-1042')).name, name)
  await assert.rejects(relay.queueTransfer('RLY-1042'), /already in the queue \(overwrite is off\)/)
  assert.equal((await relay.cancelTransfer('xfer-2')).state, 'cancelled')
  await assert.rejects(relay.advanceTransfer('nope'), /no such transfer/)
})

test('connections are added once per name', async () => {
  const { relay } = await open()
  const p = await relay.addProfile({ name: 'gateway-01', user: 'ops', host: '10.1.1.1', port: '2222', workspaceId: 'production-support' })
  assert.equal(relay.profiles('production-support').length, 4)
  assert.equal(p.port, 2222)
  await assert.rejects(relay.addProfile({ name: 'gateway-01', user: 'ops', host: '10.1.1.1', port: '22', workspaceId: 'production-support' }), /already a connection called gateway-01/)
})
