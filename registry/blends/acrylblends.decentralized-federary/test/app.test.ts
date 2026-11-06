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
      assert.equal(app.root.fedShell.prefix, FRAME_MOUNT_PREFIX)
      const { status, html } = await app.page('/')
      assert.equal(status, 200)
      assert.match(html, /href="\/app\/\?instance=garden\.pub"/)
    },
    { prefix: FRAME_MOUNT_PREFIX },
  )
})

test('opens the network over the seed and saves it at once', () =>
  withApp(async (app) => {
    assert.equal(app.store.saved, 1)
    assert.equal(app.root.fed.state.instances.length, 12)
  }))

test('a part leaves with its plugin', async () => {
  await withApp(async (app) => {
    const { html } = await app.page('/')
    assert.match(html, /Trust rules/)
    assert.match(html, /Export topology/)
  })
  await withApp(
    async (app) => {
      assert.doesNotMatch((await app.page('/')).html, /<h2>Trust rules<\/h2>/)
      assert.equal((await app.post('/rules/rule-deny/toggle', {})).status, 404)
    },
    { off: ['trust'] },
  )
  await withApp(
    async (app) => {
      assert.doesNotMatch((await app.page('/')).html, /Export topology/)
      assert.equal((await app.page('/export.json')).status, 404)
    },
    { off: ['topology-export'] },
  )
})

test('the shell escapes what people type and shows a notice from the redirect query', () =>
  withApp(async (app) => {
    const url = '/?error=Bad%20%3Cinput%3E'
    assert.match(app.root.fedShell.page({ title: '<x>', main: '', url }), /<title>&lt;x&gt; · Federary Network<\/title>/)
    assert.match(app.root.fedShell.notice(url), /<p role="alert">Bad &lt;input&gt;<\/p>/)
  }))

test('the manifest decides what is mounted', async () => {
  const { readManifest } = await import('../src/app.ts')
  const library = ['router', 'home', 'federary', 'fed-shell', 'stats', 'topology', 'profile', 'queue', 'moderation', 'trust', 'history', 'topology-export', 'extensions', 'server', 'acryl-door']
  assert.deepEqual(readManifest().plugins.map((r) => r.id).filter((id) => library.includes(id)), library)
  assert.throws(() => readManifest({ nothing: 1 }), /parameter-override-unknown/)
})

test('the map opens as the mockup does', () =>
  withApp(async (app) => {
    const { html } = await app.page('/')
    assert.match(html, /<h1>Federation map<\/h1>/)
    assert.match(html, /A fictional network of independently operated instances\./)
    assert.match(html, /<strong>12<\/strong>/)
    assert.match(html, /<strong>5 \/ 12<\/strong>/)
    assert.match(html, /<strong>03<\/strong>/)
    assert.match(html, /<strong>05<\/strong>/)
    assert.match(html, /class="node selected review?[^"]*"|class="node selected healthy" style="left:50%;top:49%" data-name="northstar\.social"/)
    assert.match(html, /<h2 id="peerTitle">northstar\.social<\/h2>/)
    assert.match(html, /Federary 4\.2\.1/)
    assert.match(html, /Open federation/)
    assert.match(html, /18 inbound · 12 outbound/)
    assert.match(html, /34 sec ago/)
    assert.match(html, /Primary instance · fictional demo node/)
    assert.match(html, /Peer policy permits public posts and signed identity assertions\. Private profile data is not federated\./)
    assert.match(html, /Incoming federation requests/)
    assert.match(html, /data-request="meadow\.community"/)
    assert.match(html, /<small>Review needed<\/small>/)
    assert.equal((html.match(/<line /g) ?? []).length, 13)
  }))

test('picking an instance shows its profile, allowed actions and peers', () =>
  withApp(async (app) => {
    const html = (await app.page('/?instance=openfield.net')).html
    assert.match(html, /<h2 id="peerTitle">openfield\.net<\/h2>/)
    assert.match(html, /Restricted/)
    assert.match(html, /data-action="hold"/)
    assert.doesNotMatch(html, /data-action="approve"[^>]*>Approve<\/button><\/form><form[^]*id="profile"/)
    assert.match(html, /data-peer="weave\.place"/)
    assert.match(html, /<b id="relation">Peered<\/b>/)
    assert.match((await app.page('/?instance=nope')).html, /<h2 id="peerTitle">northstar\.social<\/h2>/)
  }))

test('approving a request updates the map, the stats and the history; the decision can be undone', () =>
  withApp(async (app) => {
    const r = redirectOf(await app.post('/instances/meadow.community/act', { action: 'approve', back: '/?instance=meadow.community' }))
    assert.equal(r.path, '/')
    assert.match(r.ok ?? '', /Approve: meadow\.community is now peered\. Demo decision recorded; you can undo it\./)
    const html = (await app.page('/?instance=meadow.community')).html
    assert.match(html, /<strong>6 \/ 12<\/strong>/)
    assert.match(html, /<strong>02<\/strong>/)
    assert.match(html, /data-decision="decision-1"/)
    assert.match(html, /Approve: Request pending → Peered\./)
    assert.equal((html.match(/<line /g) ?? []).length, 13)
    assert.match(redirectOf(await app.post('/decisions/decision-1/undo', {})).ok ?? '', /Undid “approve” for meadow\.community/)
    assert.match((await app.page('/')).html, /<strong>03<\/strong>/)
    assert.match(redirectOf(await app.post('/decisions/decision-1/undo', {})).error ?? '', /already undone/)
  }))

test('a trust rule stops an approval and the request says so; switching the rule off lets it through', () =>
  withApp(async (app) => {
    const html = (await app.page('/')).html
    assert.match(html, /data-request="signal\.social"[^]*stopped by a trust rule/)
    assert.match(redirectOf(await app.post('/instances/signal.social/act', { action: 'approve' })).error ?? '', /Require signed identity assertions/)
    assert.match(redirectOf(await app.post('/rules/rule-signed/toggle', {})).ok ?? '', /“Require signed identity assertions” is now off/)
    assert.match(redirectOf(await app.post('/instances/signal.social/act', { action: 'approve' })).ok ?? '', /signal\.social is now peered/)
    assert.match((await app.page('/')).html, /<span class="chip warn">off<\/span>/)
  }))

test('Review peer request jumps to the first inbound request; hold and block change its relation', () =>
  withApp(async (app) => {
    const html = (await app.page('/')).html
    assert.match(html, /id="invite" href="[^"]*request=meadow\.community#requests"/)
    assert.match((await app.page('/?request=meadow.community')).html, /class="queue hl" data-request="meadow\.community"/)
    assert.match(redirectOf(await app.post('/instances/meadow.community/act', { action: 'hold' })).ok ?? '', /meadow\.community is now quarantined/)
    assert.match(redirectOf(await app.post('/instances/signal.social/act', { action: 'block' })).ok ?? '', /signal\.social is now blocked/)
    assert.match((await app.page('/')).html, /class="node blocked"[^>]*data-name="signal\.social"|data-name="signal\.social"/)
    assert.match(redirectOf(await app.post('/instances/garden.pub/act', { action: 'approve' })).error ?? '', /cannot be set to peered/)
    assert.equal(new URL((await app.post('/instances/garden.pub/act', { action: 'hold', back: 'https://evil.example/' })).headers.get('location') ?? '', 'http://local').hostname, 'local')
  }))

test('outbound requests can be withdrawn, an unpeered instance can be asked', () =>
  withApp(async (app) => {
    assert.match((await app.page('/')).html, /data-outbound="reed\.network"/)
    assert.match(redirectOf(await app.post('/instances/reed.network/act', { action: 'withdraw' })).ok ?? '', /reed\.network is now not peered/)
    assert.match(redirectOf(await app.post('/instances/lantern.club/act', { action: 'request' })).ok ?? '', /lantern\.club is now awaiting reply/)
    assert.match((await app.page('/')).html, /data-outbound="lantern\.club"/)
  }))

test('moderation decisions act on the report and the instance, and are recorded', () =>
  withApp(async (app) => {
    assert.match((await app.page('/')).html, /5 open · 0 decided/)
    assert.match(redirectOf(await app.post('/reports/rep-5/decide', { action: 'dismiss' })).ok ?? '', /Report decided: dismiss/)
    assert.match(redirectOf(await app.post('/reports/rep-1/decide', { action: 'limit' })).ok ?? '', /Report decided: limit/)
    const html = (await app.page('/')).html
    assert.match(html, /3 open · 2 decided/)
    assert.match(html, /<strong>03<\/strong>/)
    assert.match(redirectOf(await app.post('/reports/rep-2/decide', { action: 'limit' })).error ?? '', /already quarantined/)
    assert.match(redirectOf(await app.post('/reports/rep-1/decide', { action: 'block' })).error ?? '', /already been decided/)
  }))

test('handshakes run from the profile; an expired assertion fails', () =>
  withApp(async (app) => {
    assert.match(redirectOf(await app.post('/instances/garden.pub/handshake', {})).ok ?? '', /Identity handshake with garden\.pub completed/)
    assert.match(redirectOf(await app.post('/instances/lantern.club/handshake', {})).error ?? '', /identity assertion has expired/)
    assert.match((await app.page('/?instance=lantern.club')).html, /Identity handshake failed: the assertion has expired\./)
    assert.match((await app.page('/?instance=hollow.cafe')).html, /data-action="unblock"/)
    assert.doesNotMatch((await app.page('/?instance=hollow.cafe')).html, /id="handshake"/)
  }))

test('Export topology downloads JSON', () =>
  withApp(async (app) => {
    const res = await app.root.router.request('/export.json')
    assert.equal(res.status, 200)
    assert.match(res.headers.get('content-disposition') ?? '', /attachment; filename="federary-topology\.json"/)
    const body = (await res.json()) as { instances: unknown[]; links: unknown[] }
    assert.deepEqual([body.instances.length, body.links.length], [12, 9])
  }))
