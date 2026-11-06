import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Gate, GateError, memoryStore, parseRouteInput, parseTimeout, pipelineOf, samePolicy, seed, simulate, stepCount } from '../plugins/gatehouse/index.ts'
import { NOW } from './support.ts'

const open = async () => {
  let now = NOW
  const store = memoryStore()
  const gate = await Gate.open({ store, clock: () => now })
  return { gate, store, setNow: (d: Date) => (now = d) }
}
const s = seed(NOW)
const orders = s.routes[0]!
const form = (over: Record<string, string> = {}) => ({ upstreamId: 'orders-service', timeoutMs: '2500', rateLimitPerMin: '600', jwt: 'on', rateLimit: 'on', logging: 'on', ...over })

test('the default pipeline reads as the mockup: Ingress, Auth, Transform, Upstream; a cache adds a node; a layer off is dimmed', () => {
  const p = pipelineOf(orders.policy)
  assert.deepEqual(p.map((n) => n.name), ['Ingress', 'Auth policy', 'Transform', 'Upstream'])
  assert.deepEqual(p.map((n) => n.note), ['TLS · rate limit', 'JWT validation', 'Header mapping · request log', 'orders-service'])
  const cached = pipelineOf({ ...orders.policy, layers: { ...orders.policy.layers, cache: true, jwt: false } })
  assert.deepEqual(cached.map((n) => n.name), ['Ingress', 'Auth policy', 'Transform', 'Response cache', 'Upstream'])
  assert.equal(cached[1]?.active, false)
  assert.equal(stepCount(orders.policy), 4)
})

test('the simulation: latency plus 2 ms per layer, a warm cache in 8 ms, 429 at the rate limit, 504 over the timeout, 502 when the upstream is down', () => {
  const up = s.upstreams[0]!
  assert.deepEqual(simulate(orders.policy, up, 0, false), { status: 200, ms: 24, note: 'local policy simulation', cacheWarm: false })
  const cached = { ...orders.policy, layers: { ...orders.policy.layers, cache: true } }
  assert.equal(simulate(cached, up, 0, false).cacheWarm, true)
  assert.deepEqual([simulate(cached, up, 0, true).status, simulate(cached, up, 0, true).ms], [200, 8])
  assert.equal(simulate({ ...orders.policy, rateLimitPerMin: 2 }, up, 2, false).status, 429)
  assert.equal(simulate({ ...orders.policy, rateLimitPerMin: 2, layers: { ...orders.policy.layers, rateLimit: false } }, up, 5, false).status, 200)
  assert.deepEqual([simulate({ ...orders.policy, timeoutMs: 20 }, up, 0, false).status, simulate({ ...orders.policy, timeoutMs: 20 }, up, 0, false).ms], [504, 20])
  assert.equal(simulate(orders.policy, { ...up, up: false }, 0, false).status, 502)
})

test('route and policy input are checked', () => {
  assert.deepEqual(parseRouteInput({ method: 'post', path: '/v1/refunds/:id' }), { method: 'POST', path: '/v1/refunds/:id' })
  assert.throws(() => parseRouteInput({ method: 'TRACE', path: '/x' }), /method is one of/)
  assert.throws(() => parseRouteInput({ method: 'GET', path: 'v1' }), /starts with \//)
  assert.throws(() => parseRouteInput({ method: 'GET', path: '/a//b' }), GateError)
  assert.equal(parseTimeout('250'), 250)
  assert.throws(() => parseTimeout('5'), /10 to 60000/)
  assert.throws(() => parseTimeout(''), GateError)
  assert.equal(samePolicy(orders.policy, { ...orders.policy }), true)
  assert.equal(samePolicy(orders.policy, { ...orders.policy, timeoutMs: 1 }), false)
})

test('a draft is saved, does not change the pipeline until applied, and can be discarded', async () => {
  const { gate } = await open()
  const route = await gate.saveDraft('rt_01H9X', form({ timeoutMs: '4000', upstreamId: 'billing-service', cache: 'on' }))
  assert.equal(route.draft?.timeoutMs, 4000)
  assert.equal(route.policy.timeoutMs, 2500)
  assert.equal(gate.hasPendingDraft(route), true)
  assert.equal(gate.editing(route).upstreamId, 'billing-service')
  const applied = await gate.applyDraft('rt_01H9X')
  assert.deepEqual([applied.policy.timeoutMs, applied.policy.upstreamId, applied.policy.layers.cache, applied.draft], [4000, 'billing-service', true, undefined])
  await assert.rejects(gate.applyDraft('rt_01H9X'), /has no draft changes to apply/)
  await assert.rejects(gate.discardDraft('rt_01H9X'), /has no draft to discard/)
  await gate.saveDraft('rt_01H9X', form())
  assert.equal((await gate.discardDraft('rt_01H9X')).draft, undefined)
  // A draft equal to the policy in force is not pending.
  const same = await gate.saveDraft('rt_01H9Y', form({ upstreamId: 'identity-service', timeoutMs: '2000', cache: 'on' }))
  assert.equal(gate.hasPendingDraft(same), false)
})

test('a bad draft is refused without saving', async () => {
  const { gate, store } = await open()
  const saves = store.saved
  await assert.rejects(gate.saveDraft('rt_01H9X', form({ timeoutMs: '5' })), /10 to 60000/)
  await assert.rejects(gate.saveDraft('rt_01H9X', form({ upstreamId: 'nope' })), /no such upstream/)
  await assert.rejects(gate.saveDraft('rt_01H9X', form({ rateLimitPerMin: '0' })), /requests per minute from 1 to 100000/)
  await assert.rejects(gate.saveDraft('nope', form()), /no such route/)
  assert.equal(store.saved, saves)
})

test('test requests record traces, fill and use the cache, respect the rate limit window and an upstream marked down', async () => {
  const { gate, setNow } = await open()
  const t = await gate.runTest('rt_01H9X')
  assert.deepEqual([t.status, t.ms, t.summary, t.origin], [200, 24, 'GET /v1/orders · local policy simulation · 4 steps', 'test'])
  // Users has the cache on: the first request fills it, the second is a hit.
  assert.equal((await gate.runTest('rt_01H9Y')).ms, 34)
  const hit = await gate.runTest('rt_01H9Y')
  assert.deepEqual([hit.status, hit.ms, hit.summary], [200, 8, 'GET /v1/users/:id · cache hit'])
  // Rate limit: payments admits 120 a minute; lower it to 2 and the third request inside the minute is refused.
  await gate.saveDraft('rt_01H9Z', form({ upstreamId: 'billing-service', timeoutMs: '5000', rateLimitPerMin: '2' }))
  await gate.applyDraft('rt_01H9Z')
  await gate.runTest('rt_01H9Z')
  await gate.runTest('rt_01H9Z')
  assert.equal((await gate.runTest('rt_01H9Z')).status, 429)
  setNow(new Date(NOW.getTime() + 61_000))
  assert.equal((await gate.runTest('rt_01H9Z')).status, 200)
  await gate.setUpstream('orders-service', false)
  const down = await gate.runTest('rt_01H9X')
  assert.deepEqual([down.status, down.ms], [502, 2500])
  await assert.rejects(gate.setUpstream('orders-service', false), /already down/)
  await gate.setUpstream('orders-service', true)
  assert.equal(gate.traces('rt_01H9X')[0]?.status, 502)
})

test('routes are registered once per method and path, with the default policy', async () => {
  const { gate } = await open()
  const r = await gate.addRoute({ method: 'POST', path: '/v1/refunds', upstreamId: 'billing-service', timeoutMs: '3000' })
  assert.deepEqual([r.reqPerMin, r.policy.timeoutMs, r.policy.layers], [0, 3000, { jwt: true, rateLimit: true, logging: true, cache: false }])
  assert.equal(gate.state.routes.length, 13)
  await assert.rejects(gate.addRoute({ method: 'POST', path: '/v1/refunds', upstreamId: 'billing-service' }), /already registered/)
  await assert.rejects(gate.addRoute({ method: 'GET', path: '/x', upstreamId: 'nope' }), /no such upstream/)
})
