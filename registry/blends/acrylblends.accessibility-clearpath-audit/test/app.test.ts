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
      assert.equal(app.root.auditShell.prefix, FRAME_MOUNT_PREFIX)
      const { status, html } = await app.page('/')
      assert.equal(status, 200)
      assert.match(html, /href="\/app\/\?severity=high/)
    },
    { prefix: FRAME_MOUNT_PREFIX },
  )
})

test('opens the audit over the seed and saves it at once', () =>
  withApp(async (app) => {
    assert.equal(app.store.saved, 1)
    assert.equal(app.root.audit.state.issues.length, 4)
  }))

test('a part leaves with its plugin', async () => {
  await withApp(async (app) => {
    const { html } = await app.page('/')
    assert.match(html, /Re-run summary/)
    assert.match(html, /Re-run sample audit/)
  })
  await withApp(
    async (app) => {
      const { html } = await app.page('/')
      assert.doesNotMatch(html, /Re-run sample audit/)
      assert.equal((await app.post('/rerun', {})).status, 404)
    },
    { off: ['rerun'] },
  )
})

test('the shell escapes what people type and shows a notice from the redirect query', () =>
  withApp(async (app) => {
    const url = '/?error=Bad%20%3Cinput%3E'
    assert.match(app.root.auditShell.page({ title: '<x>', main: '', url }), /<title>&lt;x&gt; · Clearpath Audit<\/title>/)
    assert.match(app.root.auditShell.notice(url), /<p role="alert">Bad &lt;input&gt;<\/p>/)
  }))

test('the manifest decides what is mounted', async () => {
  const { readManifest } = await import('../src/app.ts')
  const library = ['router', 'home', 'clearpath', 'audit-shell', 'summary', 'issues', 'preview', 'detail', 'rerun', 'extensions', 'server', 'acryl-door']
  assert.deepEqual(readManifest().plugins.map((r) => r.id).filter((id) => library.includes(id)), library)
  assert.throws(() => readManifest({ nothing: 1 }), /parameter-override-unknown/)
})

test('the console opens on the first finding as the mockup does', () =>
  withApp(async (app) => {
    const { html } = await app.page('/')
    assert.match(html, /id="score">78</)
    assert.match(html, /Sample audit score · heuristic preview/)
    assert.match(html, /All 4/)
    assert.match(html, /class="issue active" data-id="contrast" data-sev="high"/)
    assert.match(html, /id="severity">HIGH PRIORITY</)
    assert.match(html, /<h3 id="detailtitle">Low text contrast<\/h3>/)
    assert.match(html, /class="cta inspect"/)
    assert.match(html, /Measured 1\.6:1/)
    assert.match(html, /Select an issue to inspect the affected component\./)
    assert.match(html, /⚠ no alt text/)
    assert.match(html, /<span class="bad">h3<\/span>/)
  }))

test('filters and selection narrow the list and move the outline to the affected component', () =>
  withApp(async (app) => {
    const med = (await app.page('/?severity=medium')).html
    assert.match(med, /data-id="focus"/)
    assert.doesNotMatch(med, /data-id="contrast"/)
    assert.match(med, /<h3 id="detailtitle">Focus indicator missing<\/h3>/)
    assert.match(med, /class="[^"]*inspect[^"]*" data-component="nav"/)
    const alt = (await app.page('/?issue=alt')).html
    assert.match(alt, /id="severity">MEDIUM PRIORITY</)
    assert.match(alt, /class="illus inspect"/)
    assert.match((await app.page('/?severity=zzz&issue=zzz')).html, /Low text contrast/)
  }))

test('view settings toggle and persist', () =>
  withApp(async (app) => {
    assert.match(redirectOf(await app.post('/preview-setting', { setting: 'contrast' })).ok ?? '', /High contrast preview on\./)
    assert.match((await app.page('/')).html, /class="previewbox highcontrast"/)
    await app.post('/preview-setting', { setting: 'large' })
    assert.match((await app.page('/')).html, /previewbox highcontrast large/)
    assert.match(redirectOf(await app.post('/preview-setting', { setting: 'contrast' })).ok ?? '', /off\./)
    assert.match(redirectOf(await app.post('/preview-setting', { setting: 'x' })).error ?? '', /Pick a preview setting/)
    await app.post('/preview-setting', { setting: 'focus' })
    assert.match((await app.page('/')).html, /still has no visible focus indicator/)
  }))

test('resolving a finding applies the fix to the preview; the score changes on a re-run', () =>
  withApp(async (app) => {
    const r = redirectOf(await app.post('/issues/contrast/resolve', { severity: 'all', issue: 'contrast', value: 'on' }))
    assert.match(r.ok ?? '', /Marked “Low text contrast” as resolved in this local audit/)
    const html = (await app.page('/?issue=contrast')).html
    assert.match(html, /class="cta fixed inspect"/)
    assert.match(html, /id="severity">RESOLVED</)
    assert.match(html, /Measured 9\.\d:1 for the button text; meets/)
    assert.match(html, /id="score">78</)
    assert.match(html, /re-run to update \(now 88\)/)
    assert.match(redirectOf(await app.post('/rerun', {})).ok ?? '', /score 88 \(\+10 since the last run\); 3 open, 1 resolved/)
    const after = (await app.page('/')).html
    assert.match(after, /id="score">88</)
    assert.match(after, /data-run="run-1"/)
    assert.match(redirectOf(await app.post('/issues/contrast/resolve', { value: 'off' })).ok ?? '', /Resolution reopened/)
    assert.match(redirectOf(await app.post('/issues/nope/resolve', { value: 'on' })).error ?? '', /no such finding/)
  }))

test('the other findings show their fixes; a finding can be queued for the next design review', () =>
  withApp(async (app) => {
    await app.post('/issues/alt/resolve', { value: 'on' })
    await app.post('/issues/heading/resolve', { value: 'on' })
    await app.post('/issues/focus/resolve', { value: 'on' })
    await app.post('/preview-setting', { setting: 'focus' })
    const html = (await app.page('/')).html
    assert.match(html, /alt: Team planning board/)
    assert.match(html, /role="img" aria-label="Team planning board"/)
    assert.match(html, /h1 Make good work easier to do → h2 See the whole picture/)
    assert.match(html, /focusring/)
    assert.match(redirectOf(await app.post('/issues/focus/queue', { value: 'on' })).ok ?? '', /added to the next design review/)
    assert.match((await app.page('/')).html, /1 queued for the next design review/)
    assert.match(redirectOf(await app.post('/issues/focus/queue', { value: 'off' })).ok ?? '', /removed from the next design review/)
  }))
