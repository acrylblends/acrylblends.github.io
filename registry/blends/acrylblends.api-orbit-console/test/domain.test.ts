import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ENDPOINTS, Orbit, memoryStore, endpointOf, inputsFor, latencyMs, requestIdOf, respond, seed, snippetOf, urlOf } from '../plugins/orbit/index.ts'
import { NOW } from './support.ts'

const data = seed(NOW)
const ep = (id: string) => endpointOf(id)
const call = (id: string, params: Record<string, string> = {}, body = '') => respond(ep(id), { params: { ...inputsFor(ep(id), undefined).params, ...params }, body: body === '' ? inputsFor(ep(id), undefined).body : body }, data, NOW)

test('listing orders filters by status, honours the limit and reports more', () => {
  const all = call('orders-list')
  assert.equal(all.status, 200)
  assert.equal((all.body as { data: unknown[] }).data.length, 6)
  assert.equal((all.body as { has_more: boolean }).has_more, false)
  const open = call('orders-list', { status: 'open' }).body as { data: { id: string }[] }
  assert.deepEqual(open.data.map((o) => o.id), ['ord_2047', 'ord_2044'])
  const two = call('orders-list', { limit: '2' }).body as { data: unknown[]; has_more: boolean }
  assert.deepEqual([two.data.length, two.has_more], [2, true])
})

test('bad parameters answer 422 with the parameter named', () => {
  assert.deepEqual(call('orders-list', { limit: '0' }).body, { error: { code: 'invalid_parameter', message: 'limit must be an integer from 1 to 100' } })
  assert.equal(call('orders-list', { limit: 'abc' }).status, 422)
  assert.equal(call('orders-list', { limit: '101' }).status, 422)
  assert.match(JSON.stringify(call('orders-list', { status: 'weird' }).body), /status must be one of any, open, paid, cancelled/)
})

test('fetching one order answers 200 or 404', () => {
  assert.equal(call('orders-get', { id: 'ord_2046' }).status, 200)
  assert.deepEqual(call('orders-get', { id: 'ord_9' }).body, { error: { code: 'not_found', message: 'No order with id ord_9' } })
  assert.equal(call('orders-get', { id: 'ord_9' }).status, 404)
})

test('creating an order validates the body, prices the items and answers 201 with the new order', () => {
  const ok = call('orders-create')
  assert.equal(ok.status, 201)
  assert.deepEqual(ok.body, { id: 'ord_local_2049', customer_id: 'cus_2048', status: 'open', currency: 'EUR', total: 184.5, created_at: '2026-11-05T11:00:00Z' })
  assert.equal(ok.created?.kind, 'order')
  const msg = (body: string) => (call('orders-create', {}, body).body as { error: { message: string } }).error?.message
  assert.equal(msg('{nope'), 'The request body must be valid JSON')
  assert.equal(msg('[1]'), 'The request body must be a JSON object')
  assert.equal(msg('{"currency":"EUR","items":[{"sku":"WB-01","quantity":1}]}'), 'customer_id is required')
  assert.equal(msg('{"customer_id":"c","currency":"eur","items":[]}'), 'currency must be an ISO 4217 code such as EUR')
  assert.equal(msg('{"customer_id":"c","currency":"EUR","items":[]}'), 'items must be a non-empty array')
  assert.equal(msg('{"customer_id":"c","currency":"EUR","items":[{"sku":"NOPE","quantity":1}]}'), 'items[0].sku is unknown')
  assert.equal(msg('{"customer_id":"c","currency":"EUR","items":[{"sku":"WB-01","quantity":0}]}'), 'items[0].quantity must be a positive integer')
  assert.equal((call('orders-create', {}, '{"customer_id":"c","currency":"USD","items":[{"sku":"HD-02","quantity":3},{"sku":"KB-03","quantity":1}]}').body as { total: number }).total, 123.7)
})

test('customers: search, limit, create with validation and a conflict on a repeated e-mail', () => {
  assert.equal((call('customers-list', { q: 'ada' }).body as { data: unknown[] }).data.length, 1)
  assert.equal((call('customers-list', { q: 'EXAMPLE.COM' }).body as { data: unknown[] }).data.length, 5)
  const ok = call('customers-create')
  assert.equal(ok.status, 201)
  assert.deepEqual(ok.body, { id: 'cus_local_2050', name: 'Nora Bell', email: 'nora@example.com', created_at: '2026-11-05T11:00:00Z' })
  assert.equal(call('customers-create', {}, '{"name":"X","email":"ADA@example.com"}').status, 409)
  assert.match(JSON.stringify(call('customers-create', {}, '{"name":"X","email":"nope"}').body), /valid e-mail address/)
  assert.match(JSON.stringify(call('customers-create', {}, '{"email":"a@b.co"}').body), /name is required/)
})

test('events list filters by type', () => {
  assert.equal((call('events-list').body as { data: unknown[] }).data.length, 4)
  assert.equal((call('events-list', { type: 'customer.created' }).body as { data: unknown[] }).data.length, 1)
})

test('the URL fills path parameters and lists only the query values that differ from their default', () => {
  assert.equal(urlOf('https://x', ep('orders-list'), inputsFor(ep('orders-list'), undefined)), 'https://x/v1/orders')
  assert.equal(urlOf('https://x', ep('orders-list'), { params: { limit: '5', status: 'paid' }, body: '' }), 'https://x/v1/orders?limit=5&status=paid')
  assert.equal(urlOf('https://x', ep('orders-get'), { params: { id: 'ord 1' }, body: '' }), 'https://x/v1/orders/ord%201')
})

test('SDK snippets are built from the typed values in three languages, for GET and POST', () => {
  const get = inputsFor(ep('orders-list'), undefined)
  assert.equal(snippetOf('JavaScript', 'https://api.acme.example', ep('orders-list'), get), "const response = await fetch(\n  'https://api.acme.example/v1/orders',\n  { headers: { Authorization: `Bearer ${token}` } }\n);\nconst result = await response.json();")
  assert.match(snippetOf('Python', 'https://api.acme.example', ep('orders-list'), { params: { limit: '5', status: 'any' }, body: '' }), /requests\.get\(\n {4}'https:\/\/api\.acme\.example\/v1\/orders\?limit=5',/)
  assert.match(snippetOf('Go', 'https://api.acme.example', ep('orders-list'), get), /"GET", "https:\/\/api\.acme\.example\/v1\/orders", nil/)
  const post = inputsFor(ep('orders-create'), undefined)
  assert.match(snippetOf('JavaScript', 'https://api.acme.example', ep('orders-create'), post), /method: 'POST'[\s\S]*body: JSON\.stringify\(\{"customer_id":"cus_2048"/)
  assert.match(snippetOf('Python', 'https://x', ep('customers-create'), { params: {}, body: '{"a":true}' }), /json=\{"a":True\}/)
  assert.match(snippetOf('Go', 'https://x', ep('customers-create'), post), /strings\.NewReader\(`\{"customer_id"/)
  assert.match(snippetOf('JavaScript', 'https://x', ep('orders-create'), { params: {}, body: '{broken' }), /JSON\.stringify\(\{broken\)/)
})

test('latency and request ids are deterministic', () => {
  assert.equal(latencyMs(ep('orders-list'), 6), 42)
  assert.equal(latencyMs(ep('orders-create'), 1), 44)
  assert.equal(requestIdOf(0), 'req_demo_18a2')
  assert.equal(requestIdOf(1), 'req_demo_18a3')
  assert.equal(ENDPOINTS.length, 6)
})

test('sending keeps the response and the typed inputs, and a create changes the data later reads see', async () => {
  const store = memoryStore()
  const orbit = await Orbit.open({ store, clock: () => NOW })
  const sent = await orbit.send('orders-create', inputsFor(ep('orders-create'), undefined))
  assert.deepEqual([sent.status, sent.statusText, sent.requestId, sent.method], [201, 'Created', 'req_demo_18a3', 'POST'])
  assert.equal(orbit.state.orders[0]?.id, 'ord_local_2049')
  assert.equal((orbit.state.last as { status: number }).status, 201)
  const again = await orbit.send('orders-create', inputsFor(ep('orders-create'), undefined))
  assert.equal((again.body as { id: string }).id, 'ord_local_2050')
  const list = await orbit.send('orders-list', { params: { limit: '20', status: 'any' }, body: '' })
  assert.equal((list.body as { data: unknown[] }).data.length, 8)
  assert.deepEqual(orbit.inputs(ep('orders-list')).params, { limit: '20', status: 'any' })
  const failed = await orbit.send('orders-list', { params: { limit: '0', status: 'any' }, body: '' })
  assert.deepEqual([failed.status, failed.statusText], [422, 'Unprocessable Entity'])
  await orbit.reset()
  assert.deepEqual([orbit.state.orders.length, orbit.state.last, orbit.state.requests], [6, undefined, 0])
  assert.throws(() => orbit.endpoint('nope'), /no such endpoint/)
})
