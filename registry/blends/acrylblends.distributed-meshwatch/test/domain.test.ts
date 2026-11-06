import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Mesh, MeshError, bestFollower, commitIndex, failoverSeconds, hasQuorum, memoryStore, quorumSize, replicationLagMs, seed, toleratedFailures, upNodes } from '../plugins/meshwatch/index.ts'
import { NOW } from './support.ts'

const open = async () => {
  let ids = 0
  const store = memoryStore()
  const mesh = await Mesh.open({ store, clock: () => NOW, newId: () => `drill-n${++ids}` })
  return { mesh, store }
}

test('the seed reads as the mockup: 5 / 5 up, quorum 3 / 5, commit index 8,421, 18 ms, leader node-03', () => {
  const s = seed(NOW)
  assert.equal(upNodes(s.nodes), 5)
  assert.equal(quorumSize(5), 3)
  assert.equal(toleratedFailures(5), 2)
  assert.equal(commitIndex(s), 8421)
  assert.equal(replicationLagMs(s), 18)
  assert.equal(s.leader, 'node-03')
  assert.equal(s.term, 38)
  assert.equal(hasQuorum(s.nodes), true)
})

test('quorum is a majority of the voting nodes', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map(quorumSize), [1, 2, 2, 3, 3, 4, 4].map((_, i) => Math.floor((i + 1) / 2) + 1))
  const s = seed(NOW)
  const down = (n: number) => s.nodes.map((x, i) => (i < n ? { ...x, health: 'down' as const } : x))
  assert.equal(hasQuorum(down(2)), true)
  assert.equal(hasQuorum(down(3)), false)
})

test('the best follower is healthy with the lowest lag; a degraded one is never chosen', () => {
  const s = seed(NOW)
  assert.equal(bestFollower(s)?.id, 'node-02')
  assert.equal(bestFollower(s, 'node-02')?.id, 'node-01')
  assert.equal(bestFollower({ ...s, nodes: s.nodes.map((n) => (n.id === 'node-05' || n.id === 'node-03' ? n : { ...n, health: 'down' as const })) }), undefined)
  assert.equal(failoverSeconds(s.nodes[1]!), 2.0)
})

test('a failover moves the leader, starts a new term, appends a committed log entry and records the drill', async () => {
  const { mesh } = await open()
  const drill = await mesh.runFailover(undefined)
  assert.deepEqual([drill.from, drill.to, drill.kind], ['node-03', 'node-02', 'failover'])
  assert.match(drill.detail, /node-03 → node-02 · Completed in 2\.0 sec · illustrative/)
  assert.deepEqual([mesh.state.leader, mesh.state.term, mesh.commitIndex()], ['node-02', 39, 8422])
  assert.deepEqual([mesh.log()[0]?.text, mesh.log()[0]?.origin, mesh.log()[0]?.committed], ['Leadership transition', 'node-02', true])
  assert.equal(mesh.drills()[0]?.id, drill.id)
  // The old leader is now an ordinary follower with a lag; the new leader has none.
  assert.equal(mesh.node('node-03').lagMs, 12)
  assert.equal(mesh.node('node-02').lagMs, undefined)
})

test('a failover is refused without a healthy target, to the leader, to a degraded node, or without a quorum', async () => {
  const { mesh, store } = await open()
  const saves = store.saved
  await assert.rejects(mesh.runFailover('node-03'), /node-03 already leads/)
  await assert.rejects(mesh.runFailover('node-05'), /node-05 is degraded; promote a healthy follower/)
  await assert.rejects(mesh.runFailover('nope'), /no such node/)
  await assert.rejects(mesh.runFailover(undefined, 'x'.repeat(61)), /at most 60 characters/)
  assert.equal(store.saved, saves)
  for (const id of ['node-01', 'node-02', 'node-04']) await mesh.setHealth(id, 'down')
  await assert.rejects(mesh.runFailover(undefined), /Only 2 of 5 nodes are up; a drill needs a quorum of 3/)
})

test('taking the leader down elects the best follower in a new term while a quorum remains', async () => {
  const { mesh } = await open()
  await mesh.setHealth('node-03', 'down')
  assert.deepEqual([mesh.state.leader, mesh.state.term], ['node-02', 39])
  assert.equal(mesh.node('node-03').lagMs, undefined)
  assert.deepEqual(mesh.log()[0] && [mesh.log()[0]?.text, mesh.log()[0]?.committed], ['Leader elected', true])
  assert.deepEqual(mesh.events(2).map((e) => e.text), ['Leader elected', 'Node node-03 down'])
  await assert.rejects(mesh.setHealth('node-03', 'down'), /already down/)
  // It comes back as a follower.
  await mesh.setHealth('node-03', 'healthy')
  assert.deepEqual([mesh.state.leader, mesh.node('node-03').lagMs], ['node-02', 12])
})

test('losing the quorum leaves the cluster leaderless; the nodes coming back elect a leader', async () => {
  const { mesh } = await open()
  await mesh.setHealth('node-01', 'down')
  await mesh.setHealth('node-02', 'down')
  assert.equal(mesh.state.leader, 'node-03')
  await mesh.setHealth('node-03', 'down')
  assert.equal(mesh.state.leader, undefined)
  assert.equal(hasQuorum(mesh.state.nodes), false)
  assert.equal(mesh.events(1)[0]?.text, 'Quorum lost')
  await mesh.setHealth('node-04', 'down')
  await mesh.setHealth('node-01', 'healthy')
  await mesh.setHealth('node-02', 'healthy')
  await mesh.setHealth('node-03', 'healthy')
  assert.equal(hasQuorum(mesh.state.nodes), true)
  assert.notEqual(mesh.state.leader, undefined)
  assert.equal(mesh.state.term, 39)
  assert.ok(mesh.events(6).some((e) => e.text === 'Quorum restored'))
})

test('the quorum drill reports what the cluster would survive, and fails when it would not', async () => {
  const { mesh } = await open()
  assert.match((await mesh.runQuorumDrill()).detail, /3 \/ 5 quorum retained · Completed/)
  await mesh.setHealth('node-01', 'down')
  assert.match((await mesh.runQuorumDrill()).detail, /Quorum would be lost after 2 failures with 4 nodes up · Failed/)
})

test('reset puts the seed back', async () => {
  const { mesh } = await open()
  await mesh.runFailover(undefined)
  await mesh.reset()
  assert.deepEqual([mesh.state.leader, mesh.state.term, mesh.drills().length, mesh.commitIndex()], ['node-03', 38, 2, 8421])
  assert.ok(new MeshError('invalid', 'x') instanceof Error)
})
