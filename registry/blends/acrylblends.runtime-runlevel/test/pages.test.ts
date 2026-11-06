import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FRAME_MOUNT_PREFIX } from '../src/routes.ts'
import { redirectOf, withApp } from './support.ts'

test('the desk shows the selected host, its statistics and processes as the mockup does', () =>
  withApp(async (app) => {
    const { status, html } = await app.page('/')
    assert.equal(status, 200)
    assert.match(html, /<h1>Runtime operations<\/h1>/)
    assert.match(html, /<h2 id="hostname"[^>]*>edge-01<\/h2>/)
    assert.match(html, /<b id="cpu">31%<\/b><small>CPU utilization<\/small>/)
    assert.match(html, /<b id="mem">6\.2 GB<\/b>/)
    assert.match(html, /<b>6<\/b><small>Processes<\/small>/)
    assert.match(html, /<b class="good">99\.96%<\/b><small>30d availability<\/small>/)
    assert.match(html, /<b>edge-01 <span class="warn" aria-label="degraded">●<\/span><\/b><small>Vienna · 6 processes<\/small>/)
    assert.match(html, /edge-02 <span class="good" aria-label="healthy">●<\/span><\/b><small>Prague · 4 processes/)
    assert.match(html, /worker-01 <span class="warn"[^>]*>●<\/span><\/b><small>Frankfurt · 8 processes/)
    assert.match(html, /wasm-01 <span class="good"[^>]*>●<\/span><\/b><small>EU edge · 3 modules/)
    assert.match(html, /<b>Node\.js 22 LTS<\/b><small>9 processes<\/small>/)
    assert.match(html, /<b>Wasmtime 28<\/b><small>4 modules<\/small>/)
    assert.match(html, /<td><a href="\/\?host=edge-01&process=api-gateway"><b>api-gateway<\/b><\/a><\/td><td>Node\.js<\/td><td>22\.11\.0<\/td><td><span class="badge">Running<\/span><\/td>/)
    assert.match(html, /render-engine<\/b><\/a><\/td><td>Wasmtime<\/td><td>28\.0\.1<\/td><td><span class="badge yellow">Degraded<\/span>/)
    assert.match(html, /<button class="btn" id="restart" type="submit">↻ Restart api-gateway<\/button>/)
    assert.match(html, /<a href="\/\?host=edge-01&process=api-gateway" class="active" aria-current="page">Processes<\/a>/)
  }))

test('choosing a host or a process changes the page; a module host says modules', () =>
  withApp(async (app) => {
    const w = (await app.page('/?host=wasm-01')).html
    assert.match(w, /<h2 id="hostname"[^>]*>wasm-01<\/h2>/)
    assert.match(w, /Managed modules/)
    assert.match(w, /<small>Modules<\/small>/)
    assert.match(w, /<b id="cpu">19%<\/b>/)
    const p = (await app.page('/?host=edge-01&process=render-engine')).html
    assert.match(p, /↻ Restart render-engine/)
    assert.match((await app.page('/?host=nope')).html, /id="hostname"[^>]*>edge-01/)
  }))

test('Restart requests a simulated restart, shows a local confirmation, and Complete restart finishes it', () =>
  withApp(async (app) => {
    const r = await app.post('/processes/api-gateway/restart', { back: '/?host=edge-01&process=api-gateway' })
    assert.equal(r.status, 303)
    assert.deepEqual(redirectOf(r), { path: '/', ok: 'Restart requested for api-gateway (simulation only).' })
    let html = (await app.page('/')).html
    assert.match(html, /<span class="badge yellow">Restarting<\/span> <small class="muted">1×<\/small>/)
    assert.match(html, /data-action="complete">Complete restart<\/button>/)
    assert.match(html, /Restart requested for api-gateway<\/span>/)
    assert.match(redirectOf(await app.post('/processes/api-gateway/restart', {})).error ?? '', /already restarting/)
    assert.equal(redirectOf(await app.post('/processes/api-gateway/complete', {})).ok, 'api-gateway restarted and healthy.')
    html = (await app.page('/')).html
    assert.match(html, /api-gateway<\/b><\/a><\/td><td>Node\.js<\/td><td>22\.11\.0<\/td><td><span class="badge">Running<\/span> <small class="muted">1×/)
    assert.equal(redirectOf(await app.post('/processes/nope/restart', {})).error, 'There is no such process.')
  }))

test('the compatibility matrix lists workloads with verdicts and reasons', () =>
  withApp(async (app) => {
    const { status, html } = await app.page('/compat')
    assert.equal(status, 200)
    assert.match(html, /<td>API gateway<\/td><td>Node 20<\/td><td>Node 22<\/td><td><span class="badge">Verified<\/span><br><small class="muted">Test suite passes on 22 LTS\.<\/small>/)
    assert.match(html, /<td>Render engine<\/td><td>WASM 1\.0<\/td><td>WASM 2\.0<\/td><td><span class="badge yellow">Review<\/span>/)
    assert.match(html, /<td>Sync agent<\/td><td>\.NET 8<\/td><td>\.NET 10<\/td><td><span class="badge red">Blocked<\/span>/)
  }))

test('the rollout history lists past rollouts with their outcome', () =>
  withApp(async (app) => {
    const { html } = await app.page('/rollouts')
    assert.match(html, /<small>Today · 09:20<\/small><div><b>Node\.js 22\.11\.0<\/b><br><small>api-gateway · edge-01 · from 22\.10\.0<\/small><\/div><span><span class="good">Succeeded<\/span>/)
    assert.match(html, /<small>Yesterday<\/small><div><b>JVM 21\.0\.5<\/b>/)
    assert.match(html, /<small>Nov 02<\/small><div><b>Wasmtime 28\.0\.1<\/b>[\s\S]*<span class="warn">Rolled back<\/span>/)
    assert.match(html, /<form class="form" id="prepare"[^>]* hidden>/)
    assert.match((await app.page('/rollouts?prepare=1')).html, /<form class="form" id="prepare" method="post" action="\/rollouts">/)
    assert.match(html, /id="rollout" href="\/rollouts\?host=edge-01&prepare=1#prepare">＋ Prepare rollout/)
  }))

test('preparing a rollout creates a draft; run it, then roll it back', () =>
  withApp(async (app) => {
    const made = await app.post('/rollouts', { processId: 'api-gateway', version: '22.12.0', back: '/rollouts?host=edge-01' })
    assert.deepEqual(redirectOf(made), { path: '/rollouts', ok: 'Rollout draft created locally: api-gateway 22.11.0 → 22.12.0.' })
    let html = (await app.page('/rollouts')).html
    assert.match(html, /<b>Node\.js 22\.12\.0<\/b>[\s\S]*Draft<\/span>/)
    assert.match(html, /action="\/rollouts\/rollout-1\/run"/)
    assert.equal(redirectOf(await app.post('/rollouts/rollout-1/run', {})).ok, 'api-gateway rolled out to 22.12.0.')
    assert.match((await app.page('/')).html, /<td>Node\.js<\/td><td>22\.12\.0<\/td>/)
    assert.match((await app.page('/rollouts')).html, /action="\/rollouts\/rollout-1\/rollback"/)
    assert.equal(redirectOf(await app.post('/rollouts/rollout-1/rollback', {})).ok, 'api-gateway rolled back to 22.11.0.')
    assert.equal(redirectOf(await app.post('/rollouts/rollout-1/run', {})).error, 'That rollout is rolled-back.')
    const second = await app.post('/rollouts', { processId: 'billing-worker', version: '21.0.6' })
    const draftId = app.root.desk.rollouts().find((r) => r.state === 'draft')?.id ?? ''
    assert.equal(redirectOf(await app.post(`/rollouts/${draftId}/discard`, {})).ok, 'Rollout draft discarded.')
    assert.equal(second.status, 303)
  }))

test('a blocked, stale or malformed rollout is refused with the reason and the form keeps what was typed', () =>
  withApp(async (app) => {
    const blocked = await app.post('/rollouts', { processId: 'sync-agent', version: '10.0.0' })
    assert.match(redirectOf(blocked).error ?? '', /Sync agent is blocked from \.NET 10/)
    const page = (await app.page(blocked.headers.get('location') ?? '/rollouts')).html
    assert.match(page, /role="alert">Sync agent is blocked/)
    assert.match(page, /value="10\.0\.0"/)
    assert.match(redirectOf(await app.post('/rollouts', { processId: 'api-gateway', version: '20.0.0' })).error ?? '', /not newer than api-gateway's 22\.11\.0/)
    assert.match(redirectOf(await app.post('/rollouts', { processId: 'api-gateway', version: 'abc' })).error ?? '', /numbers and dots/)
    const review = await app.post('/rollouts', { processId: 'wasm-render', version: '29.0.0' })
    assert.match(redirectOf(review).ok ?? '', /wasm-render 28\.0\.1 → 29\.0\.0 \(compatibility needs review\)/)
  }))

test('a back address that leaves the app is ignored', () =>
  withApp(async (app) => {
    for (const back of ['https://evil.example/', '//evil.example', '/\\evil']) {
      const response = await app.post('/processes/api-gateway/restart', { back })
      assert.equal(redirectOf(response).path, '/', back)
      await app.post('/processes/api-gateway/complete', {})
    }
  }))

test('under the frame prefix every page and link carries it', () =>
  withApp(
    async (app) => {
      const { status, html } = await app.page('/')
      assert.equal(status, 200)
      assert.match(html, new RegExp(`href="${FRAME_MOUNT_PREFIX}/rollouts\\?host=edge-01&process=api-gateway"`))
      assert.match(html, new RegExp(`action="${FRAME_MOUNT_PREFIX}/processes/api-gateway/restart"`))
      assert.equal(redirectOf(await app.post('/processes/api-gateway/restart', {})).path, `${FRAME_MOUNT_PREFIX}/`)
    },
    { prefix: FRAME_MOUNT_PREFIX },
  ))

test('the home widget shows what is not running', () =>
  withApp(async (app) => {
    const widget = app.root.home.widgets().find((w) => w.id === 'processes')
    assert.ok(widget)
    assert.match(String(await widget.render()), /<b>21<\/b> managed processes on 4 hosts[\s\S]*render-engine · Degraded[\s\S]*order-worker · Degraded/)
  }))
