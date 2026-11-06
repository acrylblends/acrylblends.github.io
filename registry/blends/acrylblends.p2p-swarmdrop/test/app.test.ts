import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FRAME_MOUNT_PREFIX } from '../src/routes.ts'
import { redirectOf, withApp } from './support.ts'

test('answers health checks on its own server and under the frame prefix, and 404 for unknown paths', async () => {
  await withApp(async (app) => {
    assert.equal((await app.root.router.request('/health')).status, 200)
    const missing = await app.root.router.request('/nope')
    assert.equal(missing.status, 404)
    await missing.body?.cancel()
  })
  await withApp(
    async (app) => {
      assert.equal(app.root.swarmShell.prefix, FRAME_MOUNT_PREFIX)
      const { status, html } = await app.page('/')
      assert.equal(status, 200)
      assert.match(html, /href="\/app\/\?room=SD-517"/)
    },
    { prefix: FRAME_MOUNT_PREFIX },
  )
})

test('opens the swarm over the seed and saves it at once', () =>
  withApp(async (app) => {
    assert.equal(app.store.saved, 1)
    assert.equal(app.root.swarm.state.rooms.length, 3)
  }))

test('a part leaves with its plugin', async () => {
  await withApp(async (app) => {
    const { html } = await app.page('/')
    assert.match(html, /<h2>Swarm peers<\/h2>/)
    assert.match(html, /Add demo peer/)
  })
  await withApp(
    async (app) => {
      const { html } = await app.page('/')
      assert.doesNotMatch(html, /Add demo peer|<h2>Swarm peers<\/h2>/)
      assert.equal((await app.post('/rooms/SD-482/peers', {})).status, 404)
    },
    { off: ['peers'] },
  )
})

test('the shell escapes what people type and shows a notice from the redirect query', () =>
  withApp(async (app) => {
    const url = '/?error=Bad%20%3Cinput%3E'
    assert.match(app.root.swarmShell.page({ title: '<x>', url }), /<title>&lt;x&gt; · Swarmdrop<\/title>/)
    assert.match(app.root.swarmShell.notice(url), /<p role="alert">Bad &lt;input&gt;<\/p>/)
  }))

test('the manifest decides what is mounted', async () => {
  const { readManifest } = await import('../src/app.ts')
  const library = ['router', 'home', 'swarmdrop', 'swarm-shell', 'room', 'chunks', 'events', 'peers', 'receipt', 'rooms', 'extensions', 'server', 'acryl-door']
  assert.deepEqual(readManifest().plugins.map((r) => r.id).filter((id) => library.includes(id)), library)
  assert.throws(() => readManifest({ nothing: 1 }), /parameter-override-unknown/)
})

test('the room opens as the mockup does', () =>
  withApp(async (app) => {
    const { html } = await app.page('/')
    assert.match(html, /Room SD-482 · all peers and rates are simulated/)
    assert.match(html, /ACTIVE TRANSFER · OUTGOING/)
    assert.match(html, /field-recordings-archive\.zip/)
    assert.match(html, /2\.4 GB · 1,024 chunks · SHA-256 fixture/)
    assert.match(html, /id="percent">68%</)
    assert.match(html, /1\.8 MB\/s · \d+m \d\ds remaining/)
    assert.equal((html.match(/class="chunk done/g) ?? []).length, 48)
    assert.equal((html.match(/class="chunk pending/g) ?? []).length, 5)
    assert.match(html, /peer-north-04<\/b><span class="rate">820 KB\/s<\/span><span class="">18 ms/)
    assert.match(html, /<span class="warnc">188 ms<\/span>/)
    assert.match(html, /SWM-4K8P-Q2/)
    assert.match(html, /peer handshake established/)
    assert.match(html, /peer peer-fern-08 latency elevated/)
    assert.match(html, /Receipt available after the transfer completes/)
  }))

test('selecting a range and a peer shows their details', () =>
  withApp(async (app) => {
    const html = (await app.page('/?range=50&peer=peer-lake-02')).html
    assert.match(html, /Range 50 · chunks 731–745/)
    assert.match(html, /In flight/)
    assert.match(html, /<h2>peer-lake-02<\/h2>/)
    assert.match(html, /Ranges held<\/span><b>\d+ of 70/)
    assert.doesNotMatch((await app.page('/?range=999')).html, /id="range"/)
    assert.match((await app.page('/?room=SD-517')).html, /design-assets\.tar/)
  }))

test('pause, resume and advance change the transfer and are refused when they cannot run', () =>
  withApp(async (app) => {
    assert.match(redirectOf(await app.post('/rooms/SD-482/pause', {})).ok ?? '', /Transfer paused locally/)
    assert.match((await app.page('/')).html, /PAUSED/)
    assert.match((await app.page('/')).html, /▶ Resume transfer/)
    assert.match(redirectOf(await app.post('/rooms/SD-482/advance', {})).error ?? '', /paused/)
    assert.match(redirectOf(await app.post('/rooms/SD-482/pause', {})).ok ?? '', /resumed in local simulation/)
    const r = redirectOf(await app.post('/rooms/SD-482/advance', {}))
    assert.match(r.ok ?? '', /Step done: 4 verified, 5 requested, 1 failed verification and will be requested again/)
    const html = (await app.page('/')).html
    assert.match(html, /id="percent">74%</)
    assert.match(html, /range 50 failed verification \(hash mismatch\); asking another peer/)
    assert.match(redirectOf(await app.post('/rooms/nope/advance', {})).error ?? '', /no such transfer room/)
  }))

test('the integrity check reports partial progress, and a finished transfer gets its receipt', () =>
  withApp(async (app) => {
    assert.match(redirectOf(await app.post('/rooms/SD-482/verify', {})).ok ?? '', /Integrity check partial: 48 of 70 ranges verified so far/)
    assert.match((await app.page('/')).html, /id="check">partial</)
    for (let i = 0; i < 30; i += 1) await app.post('/rooms/SD-482/advance', {})
    assert.match(redirectOf(await app.post('/rooms/SD-482/verify', {})).ok ?? '', /Integrity check complete: Manifest matches 1,024 synthetic chunks/)
    const html = (await app.page('/')).html
    assert.match(html, /COMPLETED TRANSFER/)
    assert.match(html, /<h2>Transfer receipt<\/h2>/)
    assert.match(html, /integrity check passed \(demo\)/)
    assert.match(redirectOf(await app.post('/rooms/SD-482/advance', {})).error ?? '', /already complete/)
  }))

test('a completed room shows its receipt at once', () =>
  withApp(async (app) => {
    const html = (await app.page('/?room=SD-390')).html
    assert.match(html, /<h2>Transfer receipt<\/h2>/)
    assert.match(html, /quarterly-data\.csv\.gz/)
    assert.doesNotMatch(html, /id="advance"/)
  }))

test('peers: add a demo peer, disconnect one; a stalled swarm says so', () =>
  withApp(async (app) => {
    assert.match(redirectOf(await app.post('/rooms/SD-517/peers', {})).ok ?? '', /Synthetic peer peer-demo-15 added to swarm/)
    assert.match((await app.page('/?room=SD-517')).html, /peer-demo-15/)
    assert.match(redirectOf(await app.post('/rooms/SD-517/peers/peer-demo-15/drop', {})).ok ?? '', /disconnected/)
    assert.match(redirectOf(await app.post('/rooms/SD-517/peers/nope/drop', {})).error ?? '', /no such peer/)
    for (const p of ['peer-north-04', 'peer-amber-11', 'peer-lake-02']) await app.post(`/rooms/SD-482/peers/${p}/drop`, {})
    await app.post('/rooms/SD-482/advance', {})
    assert.match(redirectOf(await app.post('/rooms/SD-482/advance', {})).ok ?? '', /Stalled: no connected peer holds the remaining ranges/)
  }))

test('rooms: join by code, create, copy the code, close', () =>
  withApp(async (app) => {
    const joined = redirectOf(await app.post('/rooms/join', { code: 'swm-9m2d-x7' }))
    assert.match(joined.ok ?? '', /Joined room SD-517/)
    assert.match(redirectOf(await app.post('/rooms/join', { code: 'SWM-0000-00' })).error ?? '', /No transfer room has the code/)
    const made = redirectOf(await app.post('/rooms', { name: 'notes.txt', size: '120' }))
    assert.match(made.ok ?? '', /Room SD-518 created for notes\.txt\. Code SWM-/)
    assert.match((await app.page('/?room=SD-518')).html, /Room SD-518 ·/)
    assert.match(redirectOf(await app.post('/rooms', { name: 'notes.txt', size: '120' })).error ?? '', /already a room for/)
    assert.match(redirectOf(await app.post('/rooms', { name: 'x', size: '0' })).error ?? '', /from 1 to 50,000/)
    assert.match(redirectOf(await app.post('/rooms/SD-482/copy', {})).ok ?? '', /Room code SWM-4K8P-Q2 \(synthetic\) is ready to share/)
    assert.match(redirectOf(await app.post('/rooms/SD-518/close', {})).ok ?? '', /Room for notes\.txt closed/)
    assert.equal(app.root.swarm.state.rooms.length, 3)
  }))
