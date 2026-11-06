import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FRAME_MOUNT_PREFIX } from '../src/routes.ts'
import { redirectOf, withApp } from './support.ts'

test('the console shows the reference, the builder and an empty inspector as the mockup does', () =>
  withApp(async (app) => {
    const { status, html } = await app.page('/')
    assert.equal(status, 200)
    assert.match(html, /Acme developer platform · API version 2026-01/)
    assert.match(html, /<h1>Developer console<\/h1>/)
    assert.match(html, /id="copybase" type="button" data-copy="https:\/\/api\.acme\.example">Copy base URL/)
    assert.match(html, /API reference <span class="muted">v1<\/span>/)
    assert.match(html, /<div class="group">Orders<\/div><a class="endpoint active" href="\/\?endpoint=orders-list" aria-current="true" data-endpoint="orders-list"><span class="method">GET<\/span><span class="path">\/v1\/orders<\/span><\/a>/)
    assert.match(html, /<span class="method post">POST<\/span><span class="path">\/v1\/orders<\/span>/)
    assert.match(html, /<div class="group">Customers<\/div>/)
    assert.match(html, /<div class="group">Events<\/div>/)
    assert.match(html, /Reference \/ Orders<\/div><div class="endpointtitle"><span class="method" id="titlemethod">GET<\/span><h2 id="titlepath">\/v1\/orders<\/h2>/)
    assert.match(html, /List orders for the authenticated workspace\./)
    assert.match(html, /<a href="\/\?endpoint=orders-list" class="active" aria-current="page">Try it<\/a><a href="\/schema\?endpoint=orders-list">Schema<\/a><a href="\/examples\?endpoint=orders-list">Examples<\/a>/)
    assert.match(html, /id="base" value="https:\/\/api\.acme\.example" readonly/)
    assert.match(html, /name="p\.limit" value="20"/)
    assert.match(html, /<option selected>any<\/option><option>open<\/option><option>paid<\/option><option>cancelled<\/option>/)
    assert.doesNotMatch(html, /name="body"/)
    assert.match(html, /<div class="code" style="min-height:0;padding:10px">GET https:\/\/api\.acme\.example\/v1\/orders<\/div>/)
    assert.match(html, /id="send" type="submit">▶ Send test request<\/button>/)
    assert.match(html, /id="resstatus">—<\/span>/)
    assert.match(html, /No request sent/)
    assert.match(html, /\/\/ Send a test request to inspect/)
  }))

test('a POST endpoint shows its body editor with the example', () =>
  withApp(async (app) => {
    const html = (await app.page('/?endpoint=orders-create')).html
    assert.match(html, /<span class="method post" id="titlemethod">POST<\/span><h2 id="titlepath">\/v1\/orders<\/h2>/)
    assert.match(html, /<textarea id="body" name="body" rows="5" spellcheck="false">\{&quot;customer_id&quot;:&quot;cus_2048&quot;,&quot;currency&quot;:&quot;EUR&quot;,&quot;items&quot;:\[\{&quot;sku&quot;:&quot;WB-01&quot;,&quot;quantity&quot;:2\}\]\}<\/textarea>/)
    assert.match((await app.page('/?endpoint=orders-get')).html, /Path parameters/)
    assert.match((await app.page('/?endpoint=nope')).html, /id="titlepath">\/v1\/orders</)
  }))

test('Send test request shows the response in the inspector and remembers the values', () =>
  withApp(async (app) => {
    const response = await app.post('/send', { endpoint: 'orders-list', 'p.limit': '2', 'p.status': 'paid' })
    assert.equal(response.status, 303)
    assert.deepEqual(redirectOf(response), { path: '/', ok: 'Local fixture response loaded.' })
    const html = (await app.page(response.headers.get('location') ?? '/')).html
    assert.match(html, /id="resstatus">200 OK<\/span>/)
    assert.match(html, /<span id="reslabel">GET \/v1\/orders<\/span><span class="muted" id="restime">34 ms · fixture<\/span>/)
    assert.match(html, /<span class="string">&quot;ord_2048&quot;<\/span>/)
    assert.match(html, /<span class="key">&quot;status&quot;<\/span>:/)
    assert.match(html, /<span class="num">184\.5<\/span>/)
    assert.match(html, /x-request-id: req_demo_18a3/)
    assert.match(html, /name="p\.limit" value="2"/)
    assert.match(html, /<option selected>paid<\/option>/)
    assert.match(html, /GET https:\/\/api\.acme\.example\/v1\/orders\?limit=2&amp;status=paid/)
  }))

test('an invalid request shows the API\'s 422 error and says so', () =>
  withApp(async (app) => {
    const bad = await app.post('/send', { endpoint: 'orders-list', 'p.limit': '0', 'p.status': 'any' })
    assert.deepEqual(redirectOf(bad), { path: '/', error: 'The fixture API answered 422 Unprocessable Entity.' })
    const html = (await app.page('/')).html
    assert.match(html, /<span class="status-bad" id="resstatus">422 Unprocessable Entity<\/span>/)
    assert.match(html, /limit must be an integer from 1 to 100/)
    assert.equal(redirectOf(await app.post('/send', { endpoint: 'nope' })).error, 'There is no such endpoint.')
  }))

test('creating through the console changes what the next list shows', () =>
  withApp(async (app) => {
    const created = await app.post('/send', { endpoint: 'orders-create', body: '{"customer_id":"cus_1","currency":"EUR","items":[{"sku":"WB-01","quantity":1}]}' })
    assert.equal(redirectOf(created).ok, 'Local fixture response loaded.')
    assert.match((await app.page('/?endpoint=orders-create')).html, /id="resstatus">201 Created<\/span>/)
    await app.post('/send', { endpoint: 'orders-list', 'p.limit': '20', 'p.status': 'any' })
    assert.match((await app.page('/')).html, /ord_local_2049/)
    const conflict = await app.post('/send', { endpoint: 'customers-create', body: '{"name":"Ada","email":"ada@example.com"}' })
    assert.match(redirectOf(conflict).error ?? '', /answered 409 Conflict/)
    const badJson = await app.post('/send', { endpoint: 'customers-create', body: '{nope' })
    assert.match(redirectOf(badJson).error ?? '', /422/)
    assert.match((await app.page('/?endpoint=customers-create')).html, /value|{nope/)
  }))

test('the schema tab shows the resource and the request body fields', () =>
  withApp(async (app) => {
    const { status, html } = await app.page('/schema?endpoint=orders-create')
    assert.equal(status, 200)
    assert.match(html, /Order object/)
    assert.match(html, /<span class="key">&quot;status&quot;<\/span>: <span class="string">&quot;open \| paid \| cancelled&quot;<\/span>/)
    assert.match(html, /<td>customer_id <small class="muted">required<\/small><\/td><td>string<\/td>/)
    assert.match(html, /<td>currency <small class="muted">required<\/small><\/td><td>ISO 4217<\/td>/)
    assert.match((await app.page('/schema?endpoint=customers-list')).html, /Customer object/)
    assert.doesNotMatch((await app.page('/schema?endpoint=customers-list')).html, /Request body/)
    assert.match((await app.page('/schema')).html, /<a href="\/schema\?endpoint=orders-list" class="active" aria-current="page">Schema<\/a>/)
  }))

test('the examples tab builds snippets in each language from the typed values', () =>
  withApp(async (app) => {
    const js = (await app.page('/examples')).html
    assert.match(js, /aria-current="true" data-lang="JavaScript"/)
    assert.match(js, /<pre class="code" id="snippet">const response = await fetch\(\n  &#39;https:\/\/api\.acme\.example\/v1\/orders&#39;,/)
    const py = (await app.page('/examples?lang=Python')).html
    assert.match(py, /import requests\nresponse = requests\.get\(/)
    const go = (await app.page('/examples?endpoint=orders-create&lang=Go')).html
    assert.match(go, /req, _ := http\.NewRequest\(\n  &quot;POST&quot;, &quot;https:\/\/api\.acme\.example\/v1\/orders&quot;, payload,/)
    await app.post('/send', { endpoint: 'orders-list', 'p.limit': '5', 'p.status': 'open' })
    assert.match((await app.page('/examples?lang=Python')).html, /orders\?limit=5&amp;status=open/)
    assert.match((await app.page('/examples?lang=Cobol')).html, /aria-current="true" data-lang="JavaScript"/)
    assert.match(js, /data-copy="const response/)
  }))

test('Reset fixtures clears the response and the created records', () =>
  withApp(async (app) => {
    await app.post('/send', { endpoint: 'orders-create', body: '{"customer_id":"c","currency":"EUR","items":[{"sku":"HD-02","quantity":1}]}' })
    assert.equal(app.root.orbit.state.orders.length, 7)
    const reset = await app.post('/reset', { endpoint: 'orders-create' })
    assert.deepEqual(redirectOf(reset), { path: '/', ok: 'Fixture data and the last response were reset.' })
    assert.equal(app.root.orbit.state.orders.length, 6)
    assert.match((await app.page('/')).html, /No request sent/)
  }))

test('under the frame prefix every page and link carries it', () =>
  withApp(
    async (app) => {
      const { status, html } = await app.page('/')
      assert.equal(status, 200)
      assert.match(html, new RegExp(`href="${FRAME_MOUNT_PREFIX}/schema\\?endpoint=orders-list"`))
      assert.match(html, new RegExp(`action="${FRAME_MOUNT_PREFIX}/send"`))
      assert.equal(redirectOf(await app.post('/send', { endpoint: 'orders-list' })).path, `${FRAME_MOUNT_PREFIX}/`)
    },
    { prefix: FRAME_MOUNT_PREFIX },
  ))

test('the home widget shows the endpoint and request counts', () =>
  withApp(async (app) => {
    const widget = app.root.home.widgets().find((w) => w.id === 'try-it')
    assert.ok(widget)
    assert.match(String(await widget.render()), /<b>6<\/b> endpoints · <b>0<\/b> test requests sent/)
  }))
