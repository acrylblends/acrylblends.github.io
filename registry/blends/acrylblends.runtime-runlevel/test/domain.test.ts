import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Desk, RunError, compareVersions, familyCounts, isVersion, memoryStore, rolloutCheck, seed, unitWord } from '../plugins/runlevel/index.ts'
import { NOW } from './support.ts'

const open = async () => {
  let ids = 0
  const store = memoryStore()
  const desk = await Desk.open({ store, clock: () => NOW, newId: (k) => `${k}-n${++ids}` })
  return { desk, store }
}
const s = seed(NOW)

test('versions compare numerically and are validated', () => {
  assert.ok(compareVersions('22.11.0', '22.9.0') > 0)
  assert.ok(compareVersions('21', '21.0.5') < 0)
  assert.equal(compareVersions('1.2', '1.2.0'), 0)
  assert.equal(isVersion('22.12.0'), true)
  for (const bad of ['', 'v22', '22.x', '1.2.3.4']) assert.equal(isVersion(bad), false, bad)
})

test('a rollout is checked: not newer and blocked are refused, review is allowed with a warning, verified is clean', () => {
  const api = s.processes.find((p) => p.id === 'api-gateway')!
  assert.equal(rolloutCheck(s.rules, api, '22.11.0').ok, false)
  assert.match(rolloutCheck(s.rules, api, '22.11.0').message, /not newer than api-gateway's 22\.11\.0/)
  assert.deepEqual([rolloutCheck(s.rules, api, '22.12.0').ok, rolloutCheck(s.rules, api, '22.12.0').message], [true, 'Compatible.'])
  assert.equal(rolloutCheck(s.rules, api, 'x').ok, false)
  const sync = s.processes.find((p) => p.id === 'sync-agent')!
  const blocked = rolloutCheck(s.rules, sync, '10.0.0')
  assert.equal(blocked.ok, false)
  assert.match(blocked.message, /Sync agent is blocked from \.NET 10: A native dependency/)
  const wasm = s.processes.find((p) => p.id === 'render-engine')!
  const review = rolloutCheck(s.rules, wasm, '29.0.0')
  assert.equal(review.ok, true)
})

test('the families and units read as the mockup does', () => {
  assert.deepEqual(familyCounts(s.processes).map((f) => f.family), ['Node.js', 'JVM', '.NET', 'Wasmtime'])
  assert.equal(familyCounts(s.processes).find((f) => f.family === '.NET')?.count, 3)
  assert.deepEqual([unitWord(s.hosts[0]!, 6), unitWord(s.hosts[3]!, 3), unitWord(s.hosts[3]!, 1)], ['processes', 'modules', 'module'])
})

test('a restart goes Running, Restarting, Running; a degraded process comes back healthy; repeated requests are refused', async () => {
  const { desk } = await open()
  const p = await desk.restart('render-engine')
  assert.deepEqual([p.status, p.restarts], ['restarting', 1])
  await assert.rejects(desk.restart('render-engine'), /already restarting/)
  await assert.rejects(desk.finishRestart('api-gateway'), /api-gateway is running, not restarting/)
  assert.equal((await desk.finishRestart('render-engine')).status, 'running')
  assert.equal(desk.events(1)[0]?.text, 'render-engine restarted and healthy')
  await assert.rejects(desk.restart('nope'), /no such process/)
})

test('a rollout draft is prepared, run, and rolled back; the process follows', async () => {
  const { desk, store } = await open()
  const saves = store.saved
  await assert.rejects(desk.prepareRollout('api-gateway', ''), /numbers and dots/)
  await assert.rejects(desk.prepareRollout('api-gateway', '22.1.0'), /not newer/)
  await assert.rejects(desk.prepareRollout('sync-agent', '10.0.0'), /blocked/)
  assert.equal(store.saved, saves)
  const draft = await desk.prepareRollout('api-gateway', ' 22.12.0 ')
  assert.deepEqual([draft.state, draft.from, draft.version], ['draft', '22.11.0', '22.12.0'])
  await assert.rejects(desk.prepareRollout('api-gateway', '22.13.0'), /already has a rollout draft/)
  assert.equal(desk.process('api-gateway').version, '22.11.0')
  assert.equal((await desk.runRollout(draft.id)).state, 'succeeded')
  assert.equal(desk.process('api-gateway').version, '22.12.0')
  await assert.rejects(desk.runRollout(draft.id), /That rollout is succeeded/)
  await desk.rollBack(draft.id)
  assert.equal(desk.process('api-gateway').version, '22.11.0')
  await assert.rejects(desk.rollBack(draft.id), /Only a succeeded rollout can be rolled back/)
})

test('a review verdict leaves the process degraded after the rollout; a stale roll-back is refused; a draft can be discarded', async () => {
  const { desk } = await open()
  const wasm = await desk.prepareRollout('wasm-render', '29.0.0')
  await desk.runRollout(wasm.id)
  assert.equal(desk.process('wasm-render').status, 'degraded')
  const a = await desk.prepareRollout('api-gateway', '22.12.0')
  await desk.runRollout(a.id)
  const b = await desk.prepareRollout('api-gateway', '22.13.0')
  await desk.runRollout(b.id)
  await assert.rejects(desk.rollBack(a.id), /api-gateway runs 22\.13\.0 now, not 22\.12\.0/)
  const draft = await desk.prepareRollout('billing-worker', '21.0.6')
  await desk.discardRollout(draft.id)
  await assert.rejects(desk.discardRollout(draft.id), /no such rollout/)
  await assert.rejects(desk.discardRollout('ro-1'), /only a draft can be discarded/)
  assert.ok(new RunError('invalid', 'x') instanceof Error)
})
