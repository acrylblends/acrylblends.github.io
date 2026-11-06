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
      assert.equal(app.root.opsShell.prefix, FRAME_MOUNT_PREFIX)
      const { status, html } = await app.page('/')
      assert.equal(status, 200)
      assert.match(html, /href="\/app\/\?workload=media"/)
      assert.equal((await app.page('/schedules')).status, 200)
    },
    { prefix: FRAME_MOUNT_PREFIX },
  )
})

test('opens the operations state over the seed and saves it at once', () =>
  withApp(async (app) => {
    assert.equal(app.store.saved, 1)
    assert.equal(app.root.ops.state.workloads.length, 4)
  }))

test('a page leaves with its plugin, taking its rail link along', async () => {
  await withApp(async (app) => {
    const { html } = await app.page('/')
    assert.match(html, /data-nav="schedules"/)
    assert.match(html, /data-nav="retention"/)
    assert.match(html, /data-nav="plans"/)
  })
  await withApp(
    async (app) => {
      const { html } = await app.page('/')
      assert.doesNotMatch(html, /data-nav="schedules"/)
      assert.equal((await app.page('/schedules')).status, 404)
    },
    { off: ['schedules'] },
  )
})

test('the shell escapes what people type and shows a notice from the redirect query', () =>
  withApp(async (app) => {
    const url = '/?error=Bad%20%3Cinput%3E'
    assert.match(app.root.opsShell.page({ title: '<x>', main: '', url }), /<title>&lt;x&gt; · Restorepoint<\/title>/)
    assert.match(app.root.opsShell.notice(url), /<p role="alert">Bad &lt;input&gt;<\/p>/)
  }))

test('the manifest decides what is mounted', async () => {
  const { readManifest } = await import('../src/app.ts')
  const library = ['router', 'home', 'restorepoint', 'ops-shell', 'workloads', 'recovery', 'schedules', 'retention', 'plans', 'extensions', 'server', 'acryl-door']
  assert.deepEqual(readManifest().plugins.map((r) => r.id).filter((id) => library.includes(id)), library)
  assert.throws(() => readManifest({ nothing: 1 }), /parameter-override-unknown/)
})

test('the recovery page opens on the production database as the mockup does', () =>
  withApp(async (app) => {
    const { html } = await app.page('/')
    assert.match(html, /<h1 id="worktitle">Production database<\/h1>/)
    assert.match(html, /98\.7%/)
    assert.match(html, /15 min/)
    assert.match(html, /2\.4 hr/)
    assert.match(html, /<small>LATEST<\/small><span>Nov 05<\/span>/)
    assert.match(html, /<small>PENDING<\/small><span>04:00<\/span>/)
    assert.match(html, /<b id="pointname">Nov 05 · 02:00<\/b>/)
    assert.match(html, /Incremental snapshot · 38\.4 GB/)
    assert.match(html, /30 daily · 12 weekly · 12 monthly/)
    assert.match(html, /Today · 02:00 · 38\.4 GB/)
    assert.match(html, /Lag 3 min/)
    assert.match(html, /3 of 4 workloads have a verified recovery point\./)
    assert.match(html, /Last readiness check · 07:10 UTC/)
    assert.match(html, /04:21:08  Waiting for restore plan…/)
    assert.match(html, /No restore operation started\./)
    assert.match(html, /Demo only\. No data is copied, changed or restored\./)
  }))

test('selecting a point and a workload', () =>
  withApp(async (app) => {
    const pending = (await app.page('/?point=db-5')).html
    assert.match(pending, /<b id="pointname">Nov 05 · 04:00<\/b>/)
    assert.match(pending, /● Pending verification/)
    assert.match(pending, /✗ Checksum · integrity not verified yet; verify the point first/)
    assert.match(pending, /id="verifyone"/)
    const lap = (await app.page('/?workload=laptops')).html
    assert.match(lap, /<h1 id="worktitle">Developer laptops<\/h1>/)
    assert.match(lap, /<small>FAILED<\/small>/)
    assert.match(lap, /Integrity check failed/)
    assert.match((await app.page('/?workload=zzz&point=zzz')).html, /Production database/)
  }))

test('Verify latest point verifies the newest point; a corrupt one reports the failure', () =>
  withApp(async (app) => {
    const ok = redirectOf(await app.post('/verify', { workload: 'prod-db', latest: '1' }))
    assert.match(ok.ok ?? '', /Nov 05 · 04:00 verified in the local simulation/)
    const html = (await app.page('/?workload=prod-db')).html
    assert.match(html, /<small>LATEST<\/small><span>04:00<\/span>/)
    assert.match(html, /✓ Catalog and checksum passed/)
    const bad = redirectOf(await app.post('/verify', { workload: 'laptops', latest: '1' }))
    assert.match(bad.error ?? '', /Verification failed for Nov 05 · 01:00: checksum mismatch in segment 14\. The point is not a usable recovery point/)
    assert.match((await app.page('/')).html, /3 of 4 workloads/)
    await app.post('/verify', { workload: 'laptops', point: 'lap-1' })
    assert.match((await app.page('/')).html, /4 of 4 workloads/)
  }))

test('the restore preview runs, or is blocked with the failing check; the log and the plans page follow', () =>
  withApp(async (app) => {
    const ok = redirectOf(await app.post('/restore', { workload: 'prod-db', point: 'db-4', scope: 'Selected tables only', dest: 'staging' }))
    assert.match(ok.ok ?? '', /Restore preview completed\. No data was modified\./)
    const html = (await app.page('/?workload=prod-db&point=db-4&scope=Selected%20tables%20only&dest=staging')).html
    assert.match(html, /Scope: Selected tables only/)
    assert.match(html, /<option value="staging" selected>/)
    assert.match(html, /✓ Restore simulation complete/)
    const blocked = redirectOf(await app.post('/restore', { workload: 'media', point: 'media-3', scope: 'Full bucket set', dest: 'staging' }))
    assert.match(blocked.error ?? '', /Restore preview blocked: Target capacity: .* only 500\.0 GB available/)
    assert.match(redirectOf(await app.post('/restore', { workload: 'prod-db', point: 'db-4', dest: 'production' })).error ?? '', /Approval: production restores need an approved change/)
    const plans = (await app.page('/plans')).html
    assert.match(plans, /Simulated/)
    assert.match(plans, /Blocked · Target capacity/)
    assert.match(plans, /data-nav="plans"[^>]*aria-current="page"|aria-current="page"[^>]*data-nav="plans"/)
  }))

test('the plans page is empty before any preview', () =>
  withApp(async (app) => {
    assert.match((await app.page('/plans')).html, /No restore previews yet/)
  }))

test('retention policies are edited and refused with a reason', () =>
  withApp(async (app) => {
    const page = (await app.page('/retention')).html
    assert.match(page, /474 days/)
    assert.match(redirectOf(await app.post('/retention/prod-db', { daily: '10', weekly: '4', monthly: '2', rpo: '30' })).ok ?? '', /Retention policy saved for Production database/)
    assert.match((await app.page('/retention')).html, /98 days/)
    assert.match(redirectOf(await app.post('/retention/prod-db', { daily: '0', weekly: '4', monthly: '2', rpo: '30' })).error ?? '', /at least one daily point/)
    assert.match(redirectOf(await app.post('/retention/nope', { daily: '1', weekly: '1', monthly: '1', rpo: '30' })).error ?? '', /no such workload/)
    assert.match((await app.page('/?workload=prod-db')).html, /30 min/)
  }))

test('pausing schedules puts the RPO at risk, and resuming restores it', () =>
  withApp(async (app) => {
    assert.match((await app.page('/schedules')).html, /met by the schedule/)
    assert.match(redirectOf(await app.post('/schedules/prod-db/db-log/pause', {})).ok ?? '', /Job paused\./)
    assert.match(redirectOf(await app.post('/schedules/prod-db/db-repl/pause', {})).ok ?? '', /the RPO target is now at risk/)
    const html = (await app.page('/?workload=prod-db')).html
    assert.match(html, /at risk: schedule paused/)
    assert.match(html, /Paused/)
    assert.match(redirectOf(await app.post('/schedules/prod-db/db-log/resume', {})).ok ?? '', /Job resumed\./)
    assert.match(redirectOf(await app.post('/schedules/prod-db/db-log/explode', {})).error ?? '', /Pick pause or resume/)
    assert.match(redirectOf(await app.post('/schedules/prod-db/nope/pause', {})).error ?? '', /no such backup job/)
  }))
