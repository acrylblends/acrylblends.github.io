import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FRAME_MOUNT_PREFIX } from '../src/routes.ts'
import { redirectOf, withApp } from './support.ts'

test('the control plane shows the gateway as the mockup does', () =>
  withApp(async (app) => {
    const { status, html } = await app.page('/')
    assert.equal(status, 200)
    assert.match(html, /Edge gateway · Sandbox environment · Healthy/)
    assert.match(html, /<h1>Gateway control plane<\/h1>/)
    assert.match(html, /Route registry <span class="status">12 routes<\/span>/)
    assert.match(html, /<a class="route active" href="\/\?route=rt_01H9X" aria-current="true" data-route="rt_01H9X"><b>GET \/v1\/orders<\/b><small>orders-service · 2\.4k req\/min<\/small>/)
    assert.match(html, /<b>GET \/v1\/users\/:id<\/b><small>identity-service · 1\.1k req\/min/)
    assert.match(html, /<b>POST \/v1\/payments<\/b><small>billing-service · 320 req\/min/)
    assert.match(html, /<b>POST \/webhooks\/\*<\/b><small>integration-bus · 56 req\/min/)
    assert.match(html, /<b>● orders-service<\/b><small>10\.2\.1\.14:8080 · 18 ms<\/small>/)
    assert.match(html, /<b>● billing-service<\/b><small>10\.2\.1\.32:8080 · 34 ms/)
    assert.match(html, /<span class="pill">ACTIVE CONFIG<\/span>/)
    assert.match(html, /Selected route · <span id="path">GET \/v1\/orders<\/span>/)
    const nodes = [...html.matchAll(/<div class="node[^"]*"><b>([^<]+)<\/b><small>([^<]+)<\/small>/g)].map((m) => `${m[1]}: ${m[2]}`)
    assert.deepEqual(nodes, ['Ingress: TLS · rate limit', 'Auth policy: JWT validation', 'Transform: Header mapping · request log', 'Upstream: orders-service'])
    assert.match(html, /<span class="time">10:42:18<\/span><span>GET \/v1\/orders · 4 middleware steps<\/span><b class="code ">200 · 42ms<\/b>/)
    assert.match(html, /GET \/v1\/orders · cache hit<\/span><b class="code ">200 · 8ms/)
    assert.match(html, /GET \/v1\/orders · upstream retry<\/span><b class="code warn">206 · 88ms/)
    assert.match(html, /<h2 id="inspect">GET \/v1\/orders<\/h2><div class="status">Route ID · rt_01H9X<\/div>/)
    assert.match(html, /<option value="orders-service" selected>orders-service<\/option>/)
    assert.match(html, /name="timeoutMs" type="number" min="10" max="60000" value="2500"/)
    assert.match(html, /JWT validation <input type="checkbox" name="jwt" checked>/)
    assert.match(html, /Response cache <input type="checkbox" name="cache">/)
  }))

test('choosing another route shows its pipeline, policy and traces', () =>
  withApp(async (app) => {
    const html = (await app.page('/?route=rt_01H9Y')).html
    assert.match(html, /Selected route · <span id="path">GET \/v1\/users\/:id<\/span>/)
    assert.match(html, /<b>Response cache<\/b><small>Cache lookup<\/small>/)
    assert.match(html, /<option value="identity-service" selected>/)
    assert.match(html, /Response cache <input type="checkbox" name="cache" checked>/)
    assert.match(html, /No traces yet\. Run a test request\./)
    const open = (await app.page('/?route=rt_01HA1')).html
    assert.match(open, /<div class="node off"><b>Auth policy<\/b><small>Disabled<\/small>/)
    assert.match((await app.page('/?route=nope')).html, /id="path">GET \/v1\/orders/)
  }))

test('Run test request adds a trace and says what happened', () =>
  withApp(async (app) => {
    const response = await app.post('/routes/rt_01H9X/trace', {})
    assert.equal(response.status, 303)
    assert.deepEqual(redirectOf(response), { path: '/', ok: 'Synthetic request trace added: 200 in 24 ms.' })
    const html = (await app.page('/?route=rt_01H9X')).html
    assert.match(html, /<span class="time">now<\/span><span>GET \/v1\/orders · local policy simulation · 4 steps<\/span><b class="code ">200 · 24ms/)
    assert.equal(redirectOf(await app.post('/routes/nope/trace', {})).error, 'There is no such route.')
  }))

test('a saved draft does not change the pipeline until it is applied', () =>
  withApp(async (app) => {
    const saved = await app.post('/routes/rt_01H9X/draft', { upstreamId: 'billing-service', timeoutMs: '4000', rateLimitPerMin: '600', jwt: 'on', rateLimit: 'on', cache: 'on' })
    assert.deepEqual(redirectOf(saved), { path: '/', ok: 'Route policy saved to the local draft. Apply it to change the pipeline.' })
    let html = (await app.page('/?route=rt_01H9X')).html
    assert.match(html, /<span class="pill warn">DRAFT PENDING<\/span>/)
    assert.match(html, /<b>Upstream<\/b><small>orders-service<\/small>/)
    assert.doesNotMatch(html, /<b>Response cache<\/b>/)
    assert.match(html, /<option value="billing-service" selected>/)
    assert.match(html, /name="timeoutMs" type="number" min="10" max="60000" value="4000"/)
    assert.match(html, /Request logging <input type="checkbox" name="logging">/)
    assert.match(html, /id="apply"/)
    assert.equal(redirectOf(await app.post('/routes/rt_01H9X/apply', {})).ok, 'GET /v1/orders now runs the new policy.')
    html = (await app.page('/?route=rt_01H9X')).html
    assert.match(html, /<span class="pill">ACTIVE CONFIG<\/span>/)
    assert.match(html, /<b>Upstream<\/b><small>billing-service<\/small>/)
    assert.match(html, /<b>Response cache<\/b>/)
    assert.doesNotMatch(html, /request log</)
    assert.equal(redirectOf(await app.post('/routes/rt_01H9X/apply', {})).error, 'GET /v1/orders has no draft changes to apply.')
  }))

test('a draft can be discarded, and a bad value is refused with the reason', () =>
  withApp(async (app) => {
    await app.post('/routes/rt_01H9X/draft', { upstreamId: 'search-service', timeoutMs: '900', rateLimitPerMin: '10' })
    assert.equal(redirectOf(await app.post('/routes/rt_01H9X/discard', {})).ok, 'Draft discarded.')
    assert.match((await app.page('/')).html, /<option value="orders-service" selected>/)
    assert.equal(redirectOf(await app.post('/routes/rt_01H9X/discard', {})).error, 'GET /v1/orders has no draft to discard.')
    assert.equal(redirectOf(await app.post('/routes/rt_01H9X/draft', { upstreamId: 'orders-service', timeoutMs: 'x' })).error, 'The timeout is a whole number of milliseconds from 10 to 60000.')
    assert.equal(redirectOf(await app.post('/routes/rt_01H9X/draft', { upstreamId: 'nope', timeoutMs: '1000' })).error, 'There is no such upstream service.')
  }))

test('a rate-limited or timed-out request shows in the trace with its reason and colour', () =>
  withApp(async (app) => {
    await app.post('/routes/rt_01H9X/draft', { upstreamId: 'orders-service', timeoutMs: '20', rateLimitPerMin: '1', jwt: 'on', rateLimit: 'on', logging: 'on' })
    await app.post('/routes/rt_01H9X/apply', {})
    const slow = await app.post('/routes/rt_01H9X/trace', {})
    assert.match(redirectOf(slow).error ?? '', /504 in 20 ms \(upstream timeout\)/)
    const limited = await app.post('/routes/rt_01H9X/trace', {})
    assert.match(redirectOf(limited).error ?? '', /429/)
    const html = (await app.page('/')).html
    assert.match(html, /<b class="code bad">429 · 1ms<\/b>/)
    assert.match(html, /<b class="code bad">504 · 20ms<\/b>/)
  }))

test('marking an upstream down degrades the header and fails requests through it', () =>
  withApp(async (app) => {
    assert.equal(redirectOf(await app.post('/upstreams/orders-service/down', { route: 'rt_01H9X' })).ok, 'orders-service is marked down.')
    const html = (await app.page('/')).html
    assert.match(html, /<div class="status bad">Edge gateway · Sandbox environment · Degraded<\/div>/)
    assert.match(html, /<b>○ orders-service<\/b><small>10\.2\.1\.14:8080 · unreachable<\/small>/)
    assert.match(redirectOf(await app.post('/routes/rt_01H9X/trace', {})).error ?? '', /502 in 2500 ms \(upstream unreachable\)/)
    assert.equal(redirectOf(await app.post('/upstreams/orders-service/down', {})).error, 'orders-service is already down.')
    assert.equal(redirectOf(await app.post('/upstreams/orders-service/up', {})).ok, 'orders-service is marked up.')
    assert.equal(redirectOf(await app.post('/upstreams/nope/up', {})).error, 'There is no such upstream service.')
  }))

test('Add route registers a route and opens it; a duplicate or bad path is refused', () =>
  withApp(async (app) => {
    const ok = await app.post('/routes', { method: 'POST', path: '/v1/refunds', upstreamId: 'billing-service', timeoutMs: '3000' })
    assert.equal(redirectOf(ok).ok, 'POST /v1/refunds registered with the default policy.')
    const html = (await app.page(ok.headers.get('location') ?? '/')).html
    assert.match(html, /Route registry <span class="status">13 routes<\/span>/)
    assert.match(html, /<h2 id="inspect">POST \/v1\/refunds<\/h2>/)
    assert.equal(redirectOf(await app.post('/routes', { method: 'POST', path: '/v1/refunds', upstreamId: 'billing-service' })).error, 'POST /v1/refunds is already registered.')
    assert.match(redirectOf(await app.post('/routes', { method: 'GET', path: 'nope', upstreamId: 'billing-service' })).error ?? '', /starts with \//)
    assert.match((await app.page('/?add=1')).html, /<form class="routes" id="add-route" method="post" action="\/routes">/)
    assert.match((await app.page('/')).html, /<form class="routes" id="add-route"[^>]* hidden>/)
  }))

test('under the frame prefix every page and link carries it', () =>
  withApp(
    async (app) => {
      const { status, html } = await app.page('/')
      assert.equal(status, 200)
      assert.match(html, new RegExp(`href="${FRAME_MOUNT_PREFIX}/\\?route=rt_01H9Y"`))
      assert.match(html, new RegExp(`action="${FRAME_MOUNT_PREFIX}/routes/rt_01H9X/trace"`))
      assert.equal(redirectOf(await app.post('/routes/rt_01H9X/trace', {})).path, `${FRAME_MOUNT_PREFIX}/`)
    },
    { prefix: FRAME_MOUNT_PREFIX },
  ))

test('the home widget shows the route and upstream counts', () =>
  withApp(async (app) => {
    const widget = app.root.home.widgets().find((w) => w.id === 'pipeline')
    assert.ok(widget)
    assert.match(String(await widget.render()), /<b>12<\/b> routes · <b>5<\/b> of 5 upstreams up/)
  }))
