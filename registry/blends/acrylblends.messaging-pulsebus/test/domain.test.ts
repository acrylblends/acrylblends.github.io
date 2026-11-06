import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Bus, BusError, MAX_ATTEMPTS, attemptDelivery, compact, envelope, lagOf, memoryStore, nextMessageId, seed, summarize, validatePayload } from '../plugins/pulsebus/index.ts'
import { NOW } from './support.ts'

const open = async () => {
  const store = memoryStore()
  const bus = await Bus.open({ store, clock: () => NOW })
  return { bus, store }
}
const orders = () => seed(NOW).topics[0]!

test('counts and summaries read as the mockup does', () => {
  assert.equal(compact(12_400), '12.4k')
  assert.equal(compact(420), '420')
  assert.equal(compact(3400), '3.4k')
  assert.equal(summarize({ order_id: 'ORD-2048', customer_region: 'AT', total: 184.5 }), 'order_id: ORD-2048 · region: AT')
  assert.equal(summarize({ poison: true, a: 1 }), 'a: 1')
  assert.deepEqual(Object.keys(envelope(seed(NOW).messages[3]!)), ['event_id', 'type', 'occurred_at', 'data'])
  assert.match(String(envelope(seed(NOW).messages[3]!).occurred_at), /^2026-11-05T\d\d:\d\d:\d\dZ$/)
})

test('payloads are validated against the topic schema', () => {
  const t = orders()
  assert.deepEqual(validatePayload(t, '{"order_id":"ORD-2049","customer_region":"AT"}'), { order_id: 'ORD-2049', customer_region: 'AT' })
  assert.throws(() => validatePayload(t, '{nope'), /Payload must be valid JSON/)
  assert.throws(() => validatePayload(t, '[1]'), /must be a JSON object/)
  assert.throws(() => validatePayload(t, '{"order_id":"x"}'), /orders\.created v3 requires “customer_region” \(string\)/)
  assert.throws(() => validatePayload(t, '{"order_id":1,"customer_region":"AT"}'), /“order_id” must be a string, not number/)
  assert.throws(() => validatePayload(t, '{"order_id":"x","customer_region":"AT","total":"9"}'), /“total” must be a number/)
  assert.throws(() => validatePayload(t, '{"order_id":"x","customer_region":"AT","poison":"yes"}'), /“poison” must be true or false/)
  assert.throws(() => validatePayload(t, JSON.stringify({ order_id: 'x', customer_region: 'AT', pad: 'x'.repeat(4000) })), BusError)
  assert.equal(validatePayload(t, '{"order_id":"x","customer_region":"AT","extra":1}').extra, 1)
})

test('delivery: acknowledged, or failing until it dies at the attempt limit', () => {
  assert.deepEqual(attemptDelivery({ data: {}, attempts: 0 }, 'g'), { state: 'acked', attempts: 1 })
  assert.deepEqual(attemptDelivery({ data: { poison: true }, attempts: 0 }, 'g').state, 'retry')
  assert.equal(attemptDelivery({ data: { poison: true }, attempts: MAX_ATTEMPTS - 1 }, 'g').state, 'dead')
  assert.match(attemptDelivery({ data: { poison: true }, attempts: 0 }, 'analytics-sink').lastError ?? '', /analytics-sink rejected the event/)
})

test('ids count up in hexadecimal; lag is the base plus the messages being retried on the group\'s topics', () => {
  const s = seed(NOW)
  assert.equal(nextMessageId(s.messages), 'evt_98ab22')
  assert.equal(nextMessageId([]), 'evt_1')
  assert.deepEqual(s.groups.map((g) => lagOf(g, s.topics, s.messages)), [0, 18, 0])
})

test('publishing delivers a valid event once and keeps a poison one retrying', async () => {
  const { bus, store } = await open()
  const m = await bus.publish('orders.created', '{"order_id":"ORD-2049","customer_region":"AT"}')
  assert.deepEqual([m.id, m.state, m.attempts, m.origin, m.schemaVersion], ['evt_98ab22', 'acked', 1, 'local', 3])
  assert.equal(bus.messages('orders.created')[0]?.id, 'evt_98ab22')
  const saves = store.saved
  await assert.rejects(bus.publish('orders.created', '{}'), /requires “order_id”/)
  await assert.rejects(bus.publish('nope', '{}'), /no such topic/)
  assert.equal(store.saved, saves)
  const bad = await bus.publish('orders.created', '{"order_id":"P","customer_region":"AT","poison":true}')
  assert.deepEqual([bad.state, bad.attempts], ['retry', 1])
  assert.equal(bus.lag(bus.state.groups[1]!), 19)
})

test('replaying: a poison message dies after three attempts; a transient failure recovers; an acknowledged one counts a replay', async () => {
  const { bus } = await open()
  const bad = await bus.publish('orders.created', '{"order_id":"P","customer_region":"AT","poison":true}')
  assert.equal((await bus.replay(bad.id)).state, 'retry')
  const dead = await bus.replay(bad.id)
  assert.deepEqual([dead.state, dead.attempts], ['dead', 3])
  assert.equal(bus.deadLetters().length, 3)
  assert.equal((await bus.replay(bad.id)).state, 'dead')
  const recovered = await bus.replay('evt_98ab1e')
  assert.deepEqual([recovered.state, recovered.attempts, recovered.lastError], ['acked', 2, undefined])
  const again = await bus.replay('evt_98ab21')
  assert.deepEqual([again.state, again.replays], ['acked', 1])
  await assert.rejects(bus.replay('nope'), /no such message/)
})

test('a dead letter is redriven or discarded; only a dead one can be discarded', async () => {
  const { bus } = await open()
  assert.equal((await bus.replay('evt_98a9f3')).state, 'acked')
  assert.equal(bus.deadLetters().length, 1)
  await assert.rejects(bus.discard('evt_98ab21'), /only a dead letter can be discarded/)
  await bus.discard('evt_98a7c0')
  assert.equal(bus.deadLetters().length, 0)
  await assert.rejects(bus.discard('evt_98a7c0'), /no such message/)
})
