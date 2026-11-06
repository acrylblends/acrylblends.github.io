import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FRAME_MOUNT_PREFIX } from '../src/routes.ts'
import { LABELS, hashOf } from '../plugins/blockscope/index.ts'
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
      assert.equal(app.root.scopeShell.prefix, FRAME_MOUNT_PREFIX)
      const { status, html } = await app.page('/')
      assert.equal(status, 200)
      assert.match(html, /href="\/app\/\?block=19482770"/)
      assert.equal((await app.page('/events')).status, 200)
    },
    { prefix: FRAME_MOUNT_PREFIX },
  )
})

test('opens the explorer over the seed and saves it at once', () =>
  withApp(async (app) => {
    assert.equal(app.store.saved, 1)
    assert.equal(app.root.chain.head, 19_482_771)
  }))

test('a page and a panel leave with their plugins', async () => {
  await withApp(async (app) => {
    const { html } = await app.page('/')
    assert.match(html, /data-tab="events"/)
    assert.match(html, /<h2>Watchlist<\/h2>/)
  })
  await withApp(
    async (app) => {
      assert.doesNotMatch((await app.page('/')).html, /data-tab="events"/)
      assert.equal((await app.page('/events')).status, 404)
    },
    { off: ['contract-events'] },
  )
  await withApp(
    async (app) => {
      assert.doesNotMatch((await app.page('/')).html, /<h2>Watchlist<\/h2>/)
      assert.equal((await app.post('/watch', {})).status, 404)
    },
    { off: ['watchlist'] },
  )
})

test('the shell escapes what people type and shows a notice from the redirect query', () =>
  withApp(async (app) => {
    const url = '/?error=Bad%20%3Cinput%3E&q=%22%3Cb%3E'
    const html = app.root.scopeShell.page({ title: '<x>', main: '', url, current: 'blocks' })
    assert.match(html, /<title>&lt;x&gt; · Blockscope Explorer<\/title>/)
    assert.match(html, /value="&quot;&lt;b&gt;"/)
    assert.match(app.root.scopeShell.notice(url), /<p class="notice error" role="alert">Bad &lt;input&gt;<\/p>/)
  }))

test('the manifest decides what is mounted', async () => {
  const { readManifest } = await import('../src/app.ts')
  const library = ['router', 'home', 'blockscope', 'scope-shell', 'network', 'blocks', 'search', 'transactions', 'addresses', 'contract-events', 'watchlist', 'extensions', 'server', 'acryl-door']
  assert.deepEqual(readManifest().plugins.map((r) => r.id).filter((id) => library.includes(id)), library)
  assert.throws(() => readManifest({ nothing: 1 }), /parameter-override-unknown/)
})

test('the explorer opens as the mockup does', () =>
  withApp(async (app) => {
    const { html } = await app.page('/')
    assert.match(html, /Read-only explorer \/ Atlas Testnet · demo fixtures/)
    assert.match(html, /<strong>19,482,771<\/strong>/)
    assert.match(html, /<strong>2\.1s<\/strong>/)
    assert.match(html, /18\.4 gwei/)
    assert.match(html, /Low congestion/)
    assert.match(html, /<strong>1,284<\/strong>/)
    assert.match(html, /<b>19,482,771<\/b><span class="hash">0x8f2a…d912<\/span><span>184 txns<\/span><span>Northstar-4<\/span><span>12 sec<\/span>/)
    assert.match(html, /0xc18e…7a04/)
    assert.match(html, /<h2 id="detailTitle">Block 19,482,771<\/h2>/)
    assert.match(html, /Pending · 0 of 31 confirmations/)
    assert.match(html, /First 8 of 184 transactions/)
    assert.match(html, /Finality checkpoint reached/)
    assert.match(html, /Height 19,482,740/)
    assert.match(html, /All chain data above is fictional and for interface demonstration only\./)
  }))

test('selecting a block shows its inspector; an old block is finalized; paging goes back in time', () =>
  withApp(async (app) => {
    const old = (await app.page('/?block=19482700')).html
    assert.match(old, /<h2 id="detailTitle">Block 19,482,700<\/h2>/)
    assert.match(old, /<span class="tag">Finalized<\/span>/)
    const picked = (await app.page('/?block=19482769')).html
    assert.match(picked, /class="blockrow sel" data-height="19482769"/)
    assert.match(picked, /149 txns/)
    const page2 = (await app.page('/?before=19482764')).html
    assert.match(page2, /data-height="19482763"/)
    assert.doesNotMatch(page2, /data-height="19482771"/)
    assert.match(page2, /← Newest/)
    assert.match((await app.page('/?block=junk')).html, /Block 19,482,771/)
    assert.match((await app.page('/?live=1')).html, /http-equiv="refresh" content="5"/)
    assert.doesNotMatch((await app.page('/')).html, /http-equiv="refresh"/)
  }))

test('producing a demo block advances the head, saves it and says so', () =>
  withApp(async (app) => {
    const r = redirectOf(await app.post('/advance', { back: '/?block=19482770' }))
    assert.equal(r.path, '/')
    assert.match(r.ok ?? '', /Demo block 19,482,772 produced \(\d+ txns\)\./)
    const html = (await app.page('/')).html
    assert.match(html, /<strong>19,482,772<\/strong>/)
    assert.match(html, /1 demo block produced/)
    assert.equal(app.store.saved, 2)
    assert.equal(new URL(((await app.post('/advance', { back: 'https://evil.example/' })).headers.get('location')) ?? '', 'http://local').hostname, 'local')
  }))

test('search results appear in the inspector, with matches, no match and the empty query', () =>
  withApp(async (app) => {
    const hit = (await app.page('/?q=19%2C482%2C771')).html
    assert.match(hit, /<h2>Search result<\/h2>/)
    assert.match(hit, /<b>1 synthetic record<\/b>/)
    assert.match(hit, /data-kind="block"/)
    const labels = (await app.page('/?q=northstar')).html
    assert.match(labels, /<b>2 synthetic records<\/b>/)
    assert.match(labels, /Northstar Treasury/)
    assert.match((await app.page('/?q=19')).html, /<b>0 synthetic records<\/b>/)
    assert.match((await app.page('/?q=%20')).html, /Search by block height, hash or address label\./)
    assert.match((await app.page('/?q=%3Cscript%3E')).html, /&lt;script&gt;/)
    assert.doesNotMatch((await app.page('/?q=%3Cscript%3Ealert(1)%3C/script%3E')).html, /<script>alert/)
  }))

test('a transaction page shows status, fee, parties and decoded logs; an unknown hash is a not-found page', () =>
  withApp(async (app) => {
    const tx = app.root.chain.block(19_482_771).txs.find((t) => t.events.length > 0)
    assert.ok(tx)
    const { status, html } = await app.page(`/tx/${tx.hash}`)
    assert.equal(status, 200)
    assert.match(html, /<h2>Transaction<\/h2>/)
    assert.match(html, /confirmations/)
    assert.match(html, /Event logs/)
    assert.match(html, new RegExp(`data-event="${tx.events[0]?.name ?? ''}"`))
    assert.match(html, /topics are demo values, not real hashes/)
    const missing = await app.page(`/tx/0x${'0'.repeat(64)}`)
    assert.match(missing.html, /Transaction not found/)
  }))

test('an address page shows the label, a synthetic balance and recent transactions', () =>
  withApp(async (app) => {
    const treasury = LABELS[0]
    assert.ok(treasury)
    const html = (await app.page(`/address/${treasury.address}`)).html
    assert.match(html, /<h2 id="addrTitle">Northstar Treasury<\/h2>/)
    assert.match(html, /\(synthetic\)/)
    assert.match(html, /<h3>Recent transactions<\/h3>/)
    assert.match((await app.page(`/address/0x${'a'.repeat(40)}`)).html, /Unlabelled address/)
    assert.match((await app.page('/address/nonsense')).html, /An address is 0x followed by 40 hexadecimal characters\./)
  }))

test('contract events filter by event name and time range', () =>
  withApp(async (app) => {
    const all = (await app.page('/events')).html
    assert.match(all, /<h2>Contract activity<\/h2>/)
    assert.match(all, /events in the last minute/)
    const swaps = (await app.page('/events?event=Swap&range=15m')).html
    assert.match(swaps, /in the last 15 minutes · Swap/)
    assert.doesNotMatch(swaps, /data-event="Transfer"/)
    assert.match(swaps, /data-event="Swap"/)
    assert.match(swaps, /<option value="Swap" selected>/)
    assert.match(swaps, /<option value="15m" selected>/)
    assert.match((await app.page('/events?event=Nope&range=zzz')).html, /<option value="" selected>All events<\/option>/)
    assert.match(all, /Swap\(sender, amountIn, amountOut\)/)
  }))

test('the watchlist saves watched items and shows them everywhere', () =>
  withApp(async (app) => {
    const tx = app.root.chain.block(19_482_771).txs[0]
    assert.ok(tx)
    const r = redirectOf(await app.post('/watch', { kind: 'tx', id: tx.hash, back: `/tx/${tx.hash}` }))
    assert.match(r.ok ?? '', /Added to the watchlist/)
    const html = (await app.page('/')).html
    assert.match(html, new RegExp(`data-watch-key="tx:${tx.hash}"`))
    assert.match((await app.page(`/tx/${tx.hash}`)).html, /★ Watching/)
    await app.post('/watch', { kind: 'block', id: '19482771' })
    const addr = LABELS[1]?.address ?? ''
    await app.post('/watch', { kind: 'address', id: addr })
    assert.match((await app.page('/')).html, /Northstar Payroll/)
    assert.match(redirectOf(await app.post('/watch', { kind: 'tx', id: tx.hash })).ok ?? '', /Removed from the watchlist/)
    assert.match(redirectOf(await app.post('/watch', { kind: 'block', id: '1' })).error ?? '', /not a block on this chain/)
    assert.equal(hashOf(19_482_771).slice(0, 6), '0x8f2a')
  }))
