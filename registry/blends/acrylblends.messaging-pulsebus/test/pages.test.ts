import assert from 'node:assert/strict'
import { test } from 'node:test'
import { seed } from '../plugins/pulsebus/index.ts'
import { FRAME_MOUNT_PREFIX } from '../src/routes.ts'
import { NOW, redirectOf, withApp } from './support.ts'

test('the explorer shows the three columns as the mockup does', () =>
  withApp(async (app) => {
    const { status, html } = await app.page('/')
    assert.equal(status, 200)
    assert.match(html, /WORKSPACE \/ SANDBOX|Workspace \/ Sandbox · Region eu-central/)
    assert.match(html, /<h1>Event infrastructure<\/h1>/)
    assert.match(html, /Topics <span class="muted">8 active<\/span>/)
    assert.match(html, /<a class="topic active" href="\/\?topic=orders\.created" aria-current="true" data-topic="orders\.created"><strong><span class="dot"><\/span>orders\.created<\/strong><small>12\.4k events \/ hour<\/small>/)
    assert.match(html, /billing\.invoice-issued<\/strong><small>1\.2k events \/ hour/)
    assert.match(html, /<strong>fulfillment-worker<\/strong><small>6 consumers · lag 0<\/small>/)
    assert.match(html, /<strong>analytics-sink<\/strong><small>3 consumers · lag 18<\/small>/)
    assert.match(html, /<strong>billing-service<\/strong><small>2 consumers · lag 0<\/small>/)
    assert.match(html, /<b id="mps">3\.4k<\/b><small>messages \/ min<\/small>[\s\S]*<b>42 ms<\/b>[\s\S]*<b>99\.98%<\/b>/)
    assert.match(html, /<strong>evt_98ab21<\/strong><div class="muted">order_id: ORD-2048 · region: AT<\/div><\/div><span class="tag">ACKED<\/span>/)
    assert.match(html, /10:42:18/)
    assert.match(html, /<strong>evt_98ab1e<\/strong><div class="muted">order_id: ORD-2045 · region: AT<\/div><\/div><span class="tag retry">RETRY<\/span>/)
    const ids = [...html.matchAll(/data-message="(evt_[0-9a-f]+)"/g)].map((m) => m[1])
    assert.deepEqual(ids, ['evt_98ab21', 'evt_98ab20', 'evt_98ab1f', 'evt_98ab1e'])
    assert.match(html, /id="dlq" href="\/dead-letters">View dead-letter queue \(2\)/)
    assert.match(html, /id="replay" type="submit">↻ Replay selected/)
  }))

test('the inspector shows the selected message as a JSON envelope, with headers and delivery', () =>
  withApp(async (app) => {
    const { html } = await app.page('/')
    assert.match(html, /<h2 id="evtitle">evt_98ab21<\/h2><div class="muted">Schema v3 · orders\.created<\/div>/)
    const text = html.replaceAll('&quot;', '"')
    assert.match(text, /"event_id": "evt_98ab21",\n  "type": "orders\.created",\n  "occurred_at": "2026-11-05T10:42:18Z",\n  "data": \{\n    "order_id": "ORD-2048",\n    "customer_region": "AT",\n    "total": 184\.5/)
    assert.match(html, /<dt>Delivery<\/dt><dd>ACKED · 1 attempt<\/dd>/)
    assert.match(html, /<dt>Content-Type<\/dt><dd>application\/json<\/dd>/)
    const retry = (await app.page('/?topic=orders.created&message=evt_98ab1e')).html
    assert.match(retry, /<h2 id="evtitle">evt_98ab1e<\/h2>/)
    assert.match(retry, /RETRY · 1 attempt/)
    assert.match(retry, /<dt>Last error<\/dt><dd>analytics-sink timed out after 5 s<\/dd>/)
    assert.match(retry, /class="listitem sel" href="\/\?topic=orders\.created&message=evt_98ab1e"/)
    assert.match(html, /<textarea id="custom" name="payload" rows="4" spellcheck="false">\{&quot;order_id&quot;:&quot;ORD-2049&quot;,&quot;customer_region&quot;:&quot;AT&quot;\}<\/textarea>/)
    assert.match(html, /Required: order_id \(string\), customer_region \(string\)/)
  }))

test('selecting another topic loads its stream, metrics and an empty state when it has none', () =>
  withApp(async (app) => {
    const html = (await app.page('/?topic=billing.invoice-issued')).html
    assert.match(html, /<span class="muted" id="streamtitle">billing\.invoice-issued<\/span>/)
    assert.match(html, /<b id="mps">330<\/b>/)
    assert.match(html, /INV-7712/)
    assert.match(html, /<span class="tag dead">DEAD<\/span>/)
    assert.match((await app.page('/?topic=nope')).html, /streamtitle">orders\.created/)
  }))

test('a topic with no messages says so and the replay button is off', () => {
  const base = seed(NOW)
  return withApp(
    async (app) => {
      const html = (await app.page('/?topic=inventory.low-stock')).html
      assert.match(html, /No messages on this topic yet\./)
      assert.match(html, /<button id="replay" disabled>/)
      assert.match(html, /No message selected/)
    },
    { state: { ...base, messages: base.messages.filter((m) => m.topicId !== 'inventory.low-stock') } },
  )
})

test('publishing a valid event adds it to the stream as LOCAL and selects it', () =>
  withApp(async (app) => {
    const body = '{"order_id":"ORD-2049","customer_region":"AT"}'
    const response = await app.post('/topics/orders.created/publish', { payload: body })
    assert.equal(response.status, 303)
    assert.deepEqual(redirectOf(response), { path: '/', ok: 'Synthetic event evt_98ab22 added to the local stream.' })
    const html = (await app.page(response.headers.get('location') ?? '/')).html
    assert.match(html, /<strong>evt_98ab22<\/strong><div class="muted">order_id: ORD-2049 · region: AT<\/div><\/div><span class="tag">LOCAL<\/span>/)
    assert.match(html, /<h2 id="evtitle">evt_98ab22<\/h2>/)
    assert.match(html, /Synthetic \(local\)/)
  }))

test('an invalid event is refused with the reason and the typed payload stays in the form', () =>
  withApp(async (app) => {
    const saves = app.store.saved
    const bad = await app.post('/topics/orders.created/publish', { payload: '{"order_id":"x"}' })
    assert.equal(redirectOf(bad).error, 'orders.created v3 requires “customer_region” (string).')
    assert.equal(app.store.saved, saves)
    const page = (await app.page(bad.headers.get('location') ?? '/')).html
    assert.match(page, /role="alert">orders\.created v3 requires/)
    assert.match(page, /<textarea[^>]*>\{&quot;order_id&quot;:&quot;x&quot;\}<\/textarea>/)
    assert.match(redirectOf(await app.post('/topics/orders.created/publish', { payload: '{broken' })).error ?? '', /Payload must be valid JSON/)
    assert.equal(redirectOf(await app.post('/topics/nope/publish', { payload: '{}' })).error, 'There is no such topic.')
  }))

test('a poison event retries on each replay and lands in the dead-letter queue', () =>
  withApp(async (app) => {
    const made = await app.post('/topics/orders.created/publish', { payload: '{"order_id":"P-1","customer_region":"AT","poison":true}' })
    assert.match(redirectOf(made).error ?? '', /evt_98ab22 was rejected by the consumer; it will retry/)
    assert.match((await app.page('/')).html, /<span class="tag retry">RETRY<\/span>/)
    const one = await app.post('/messages/evt_98ab22/replay', { back: '/?topic=orders.created&message=evt_98ab22' })
    assert.match(redirectOf(one).error ?? '', /failed again \(attempt 2\)/)
    const two = await app.post('/messages/evt_98ab22/replay', {})
    assert.match(redirectOf(two).error ?? '', /failed again and moved to the dead-letter queue/)
    assert.match((await app.page('/dead-letters')).html, /evt_98ab22[\s\S]*poison flag set · 3 attempts/)
  }))

test('replay delivers a retrying message and counts a replay of an acknowledged one', () =>
  withApp(async (app) => {
    const retry = await app.post('/messages/evt_98ab1e/replay', {})
    assert.deepEqual(redirectOf(retry), { path: '/', ok: 'evt_98ab1e delivered on attempt 2.' })
    assert.match((await app.page('/?message=evt_98ab1e')).html, /analytics-sink<\/strong><small>3 consumers · lag 17/)
    const acked = await app.post('/messages/evt_98ab21/replay', {})
    assert.equal(redirectOf(acked).ok, 'evt_98ab21 replayed (replay 1).')
    assert.match((await app.page('/')).html, /ACKED · 1 attempt · 1 replays/)
    assert.equal(redirectOf(await app.post('/messages/nope/replay', {})).error, 'There is no such message.')
  }))

test('the dead-letter queue lists the reasons; a message can be redriven or discarded', () =>
  withApp(async (app) => {
    const { status, html } = await app.page('/dead-letters')
    assert.equal(status, 200)
    assert.match(html, /Dead-letter queue <span class="muted">2 messages<\/span>/)
    assert.match(html, /evt_98a9f3<\/strong><div class="muted">billing\.invoice-issued · invoice_id: INV-7690 · amount: 75<\/div><div class="muted"[^>]*>billing-service cannot parse currency “€” \(expects ISO 4217\) · 3 attempts/)
    assert.match(html, /evt_98a7c0[\s\S]*analytics-sink timed out after 3 attempts/)
    assert.equal(redirectOf(await app.post('/dead-letters/evt_98a9f3/redrive', {})).ok, 'evt_98a9f3 redriven and acknowledged.')
    assert.equal(redirectOf(await app.post('/dead-letters/evt_98a7c0/discard', {})).ok, 'evt_98a7c0 discarded.')
    assert.match((await app.page('/dead-letters')).html, /The dead-letter queue is empty\./)
    assert.equal(redirectOf(await app.post('/dead-letters/evt_98ab21/discard', {})).error, 'evt_98ab21 is acked; only a dead letter can be discarded.')
  }))

test('a back address that leaves the app is ignored', () =>
  withApp(async (app) => {
    for (const back of ['https://evil.example/', '//evil.example', '/\\evil']) {
      const response = await app.post('/messages/evt_98ab21/replay', { back })
      assert.equal(redirectOf(response).path, '/', back)
    }
  }))

test('under the frame prefix every page and link carries it', () =>
  withApp(
    async (app) => {
      const { status, html } = await app.page('/')
      assert.equal(status, 200)
      assert.match(html, new RegExp(`href="${FRAME_MOUNT_PREFIX}/dead-letters"`))
      assert.match(html, new RegExp(`action="${FRAME_MOUNT_PREFIX}/topics/orders\\.created/publish"`))
      const response = await app.post('/messages/evt_98ab21/replay', { back: `${FRAME_MOUNT_PREFIX}/?topic=orders.created` })
      assert.equal(redirectOf(response).path, `${FRAME_MOUNT_PREFIX}/`)
    },
    { prefix: FRAME_MOUNT_PREFIX },
  ))

test('the home widget shows the topic and dead-letter counts', () =>
  withApp(async (app) => {
    const widget = app.root.home.widgets().find((w) => w.id === 'stream')
    assert.ok(widget)
    assert.match(String(await widget.render()), /<b>8<\/b> topics · <b>2<\/b> dead letters/)
  }))
