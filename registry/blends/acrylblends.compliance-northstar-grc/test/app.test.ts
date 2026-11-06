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
      assert.equal(app.root.grcShell.prefix, FRAME_MOUNT_PREFIX)
      const { status, html } = await app.page('/')
      assert.equal(status, 200)
      assert.match(html, /href="\/app\/\?control=CC8\.1"/)
    },
    { prefix: FRAME_MOUNT_PREFIX },
  )
})

test('opens the workspace over the seed and saves it at once', () =>
  withApp(async (app) => {
    assert.equal(app.store.saved, 1)
    assert.equal(app.root.grc.state.controls.length, 8)
  }))

test('a part leaves with its plugin', async () => {
  await withApp(async (app) => {
    const { html } = await app.page('/')
    assert.match(html, /Audit actions/)
    assert.match(html, /Export review/)
  })
  await withApp(
    async (app) => {
      const { html } = await app.page('/')
      assert.doesNotMatch(html, /Audit actions<\/h2>/)
      assert.equal((await app.post('/actions/a1/done', {})).status, 404)
    },
    { off: ['actions'] },
  )
  await withApp(
    async (app) => {
      assert.doesNotMatch((await app.page('/')).html, /Export review/)
      assert.equal((await app.page('/export')).status, 404)
    },
    { off: ['review-export'] },
  )
})

test('the shell escapes what people type and shows a notice from the redirect query', () =>
  withApp(async (app) => {
    const url = '/?error=Bad%20%3Cinput%3E'
    assert.match(app.root.grcShell.page({ title: '<x>', main: '', url }), /<title>&lt;x&gt; · Northstar GRC<\/title>/)
    assert.match(app.root.grcShell.notice(url), /<p role="alert">Bad &lt;input&gt;<\/p>/)
  }))

test('the manifest decides what is mounted', async () => {
  const { readManifest } = await import('../src/app.ts')
  const library = ['router', 'home', 'grc', 'grc-shell', 'posture', 'register', 'evidence', 'risks', 'actions', 'review-export', 'extensions', 'server', 'acryl-door']
  assert.deepEqual(readManifest().plugins.map((r) => r.id).filter((id) => library.includes(id)), library)
  assert.throws(() => readManifest({ nothing: 1 }), /parameter-override-unknown/)
})

test('the cockpit opens as the mockup does', () =>
  withApp(async (app) => {
    const { html } = await app.page('/')
    assert.match(html, /Governance workspace · FY2026/)
    assert.match(html, /<strong>75%<\/strong>/)
    assert.match(html, /<strong>6 \/ 8<\/strong><small>2 items need attention<\/small>/)
    assert.match(html, /<strong>04<\/strong><small>1 high residual score<\/small>/)
    assert.match(html, /<small>1 due this week<\/small>/)
    assert.match(html, /<tr data-control="IAM-04" data-status="Current" class="sel">/)
    assert.match(html, /<span class="pill warn">Review<\/span>/)
    assert.match(html, /<span class="pill bad">Exception<\/span>/)
    assert.match(html, /Stale · 146 days ago/)
    assert.match(html, /16 · High/)
    assert.match(html, /<h3>Quarterly access attestation <span class="pill">Accepted<\/span>/)
    assert.match(html, /Uploaded 14 Oct 2026 · Uploaded by J\. Weber/)
    assert.match(html, /Retention 3 years · reviewed 16 Oct 2026 by P\. Nair/)
    assert.match(html, /disabled>Evidence accepted<|Evidence accepted<\/button>/)
    assert.match(html, /Demo register · synthetic controls and evidence only · 8 of 8 shown/)
  }))

test('filters narrow the register and the open control follows', () =>
  withApp(async (app) => {
    const soc = (await app.page('/?framework=SOC%202')).html
    assert.match(soc, /data-control="CC8\.1"/)
    assert.doesNotMatch(soc, /data-control="IAM-04"/)
    assert.match(soc, /3 of 8 shown/)
    assert.match(soc, /<h2 id="detailTitle">Evidence review<\/h2><div class="hint" id="detailSub">SOC 2 · CC8\.1 Change approvals/)
    const exc = (await app.page('/?status=Exception&control=SUP-07')).html
    assert.match(exc, /<h3>Exception <span class="pill bad">Open<\/span>/)
    assert.match((await app.page('/?framework=Privacy&status=Exception')).html, /No controls match these filters\./)
    assert.match((await app.page('/?framework=zzz&owner=zzz&status=zzz&control=zzz')).html, /8 of 8 shown/)
  }))

test('accept evidence and the posture and control status follow', () =>
  withApp(async (app) => {
    const r = redirectOf(await app.post('/controls/CC8.1/accept', { control: 'CC8.1' }))
    assert.match(r.ok ?? '', /Evidence accepted in this local demo review: “Change approval sample”/)
    const html = (await app.page('/?control=CC8.1')).html
    assert.match(html, /<strong>88%<\/strong>/)
    assert.match(html, /<strong>7 \/ 8<\/strong>/)
    assert.match(html, /<tr data-control="CC8\.1" data-status="Current"/)
    assert.match(html, /Accepted evidence “Change approval sample”\./)
    assert.match(redirectOf(await app.post('/controls/CC8.1/accept', {})).error ?? '', /already accepted/)
  }))

test('request a refresh, complete the action, accept the refreshed evidence', () =>
  withApp(async (app) => {
    assert.match(redirectOf(await app.post('/controls/IAM-04/refresh', { control: 'IAM-04' })).ok ?? '', /Refresh request added to the demo audit trail; action due 12 Nov 2026/)
    let html = (await app.page('/')).html
    assert.match(html, /<span class="pill warn">Refresh requested<\/span>/)
    assert.match(html, /<strong>05<\/strong><small>2 due this week<\/small>/)
    assert.match(html, /Collect refreshed evidence for IAM-04 Access reviews/)
    assert.match(redirectOf(await app.post('/controls/IAM-04/refresh', {})).error ?? '', /already requested/)
    const id = app.root.grc.state.actions.at(-1)?.id ?? ''
    assert.match(redirectOf(await app.post(`/actions/${id}/done`, {})).ok ?? '', /refreshed evidence is waiting for review/)
    html = (await app.page('/')).html
    assert.match(html, /Quarterly access attestation \(refreshed\) <span class="pill warn">Pending review<\/span>/)
    await app.post('/controls/IAM-04/accept', {})
    assert.match((await app.page('/')).html, /<tr data-control="IAM-04" data-status="Current"/)
  }))

test('mark and clear an exception', () =>
  withApp(async (app) => {
    assert.match(redirectOf(await app.post('/controls/CC7.2/exception', { reason: 'short' })).error ?? '', /at least 10 characters/)
    assert.match(redirectOf(await app.post('/controls/CC7.2/exception', { reason: 'Alert tooling is being replaced.' })).ok ?? '', /CC7\.2 marked as an exception/)
    const html = (await app.page('/?control=CC7.2')).html
    assert.match(html, /<tr data-control="CC7\.2" data-status="Exception"/)
    assert.match(html, /Alert tooling is being replaced\./)
    assert.match(html, /Review the CC7\.2 exception with L\. Novak/)
    assert.match(redirectOf(await app.post('/controls/CC7.2/clear-exception', {})).ok ?? '', /Exception cleared for CC7\.2/)
    assert.match(redirectOf(await app.post('/controls/CC7.2/clear-exception', {})).error ?? '', /not an exception/)
  }))

test('updating a risk treatment recalculates the watchlist and the posture; a High risk cannot be accepted', () =>
  withApp(async (app) => {
    const ok = redirectOf(await app.post('/risks/r1/treatment', { action: 'mitigate', note: 'Second supplier live', likelihood: '3', impact: '3' }))
    assert.match(ok.ok ?? '', /Supplier concentration: treatment updated, residual score 9 \(Medium\)\. Posture recalculated\./)
    const html = (await app.page('/?risk=r1')).html
    assert.match(html, /<strong>04<\/strong><small>0 high residual scores<\/small>/)
    assert.match(html, /09 · Medium/)
    assert.match(html, /<div id="treatment">/)
    assert.match(redirectOf(await app.post('/risks/r1/treatment', { action: 'accept', note: 'ok', likelihood: '4', impact: '4' })).error ?? '', /cannot be higher than the inherent|High residual/)
    assert.match(redirectOf(await app.post('/risks/r3/treatment', { action: 'accept', note: 'Tolerable', likelihood: '2', impact: '2' })).ok ?? '', /residual score 4 \(Low\)/)
    assert.match((await app.page('/')).html, /<strong>03<\/strong>/)
    assert.match(redirectOf(await app.post('/risks/zzz/treatment', { action: 'accept', note: 'x', likelihood: '1', impact: '1' })).error ?? '', /no such risk/)
  }))

test('New risk opens from the masthead and adds to the register', () =>
  withApp(async (app) => {
    assert.match((await app.page('/?newrisk=1')).html, /<details id="new-risk" open>/)
    assert.doesNotMatch((await app.page('/')).html, /<details id="new-risk" open>/)
    assert.match(redirectOf(await app.post('/risks', { title: 'Shadow IT', area: 'Software estate', owner: 'J. Weber', likelihood: '4', impact: '4' })).ok ?? '', /Risk “Shadow IT” added with inherent score 16/)
    const html = (await app.page('/')).html
    assert.match(html, /<strong>05<\/strong><small>2 high residual scores<\/small>/)
    assert.match(html, /Shadow IT/)
    assert.match(redirectOf(await app.post('/risks', { title: 'shadow it', area: 'x', owner: 'J. Weber', likelihood: '1', impact: '1' })).error ?? '', /already a risk called/)
  }))

test('audit actions can be completed', () =>
  withApp(async (app) => {
    assert.match((await app.page('/')).html, /due in 4 days · CC8\.1/)
    assert.match(redirectOf(await app.post('/actions/a3/done', {})).ok ?? '', /Action marked done\./)
    assert.match((await app.page('/')).html, /<strong>03<\/strong>/)
    assert.match(redirectOf(await app.post('/actions/a3/done', {})).error ?? '', /already done/)
  }))

test('Export review downloads a Markdown file', () =>
  withApp(async (app) => {
    const res = await app.root.router.request('/export')
    assert.equal(res.status, 200)
    assert.match(res.headers.get('content-disposition') ?? '', /attachment; filename="northstar-control-review\.md"/)
    assert.match(res.headers.get('content-type') ?? '', /text\/markdown/)
    assert.match(await res.text(), /Control coverage: 75%/)
  }))
