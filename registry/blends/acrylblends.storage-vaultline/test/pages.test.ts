import assert from 'node:assert/strict'
import { test } from 'node:test'
import { seed } from '../plugins/vaultline/index.ts'
import { FRAME_MOUNT_PREFIX } from '../src/routes.ts'
import { NOW, redirectOf, withApp } from './support.ts'

test('the fabric overview shows the statistics, pools and health as the mockup does', () =>
  withApp(async (app) => {
    const { status, html } = await app.page('/')
    assert.equal(status, 200)
    assert.match(html, /<h1>Storage fabric<\/h1><p>North region · 3 pools · refreshed just now<\/p>/)
    assert.match(html, /<small>Raw capacity<\/small><b>248 TB<\/b><span>Across 3 pools<\/span>/)
    assert.match(html, /<small>Allocated<\/small><b>172 TB<\/b><span>69% provisioned<\/span>/)
    assert.match(html, /<small>Objects<\/small><b>4\.8 M<\/b><span>Across 12 buckets<\/span>/)
    assert.match(html, /<small>Protection<\/small><b>99\.98%<\/b><span>Snapshot coverage<\/span>/)
    assert.match(html, /flash-pool-01 <span class="ok">● Healthy<\/span><\/b><span>68 \/ 96 TB<\/span>/)
    assert.match(html, /capacity-pool-02 <span class="ok">● Healthy<\/span><\/b><span>91 \/ 128 TB<\/span>/)
    assert.match(html, /archive-pool-01 <span class="warn">● Watch<\/span><\/b><span>13 \/ 24 TB<\/span>/)
    assert.match(html, /NVMe · 4 nodes · compression 2\.1×/)
    assert.match(html, /Node availability<\/span><strong class="ok">12 \/ 12<\/strong>/)
    assert.match(html, /Replication lag<\/span><strong>0\.4 sec/)
    assert.match(html, /Pending scrub<\/span><strong>2 volumes/)
    assert.match(html, /<a href="\/" class="active" aria-current="page">Fabric overview<\/a>/)
    assert.match(html, /1 pool on watch/)
  }))

test('the volume explorer lists volumes with pool, kind, size, use and status', () =>
  withApp(async (app) => {
    const { status, html } = await app.page('/volumes')
    assert.equal(status, 200)
    assert.match(html, /<b>postgres-primary<\/b><br><small class="muted">flash-pool-01 · Block \/ NVMe<\/small><\/span><span>2 TB<\/span><span>1\.4 TB<\/span><span class="ok">Healthy<\/span>/)
    assert.match(html, /<b>media-assets<\/b><br><small class="muted">capacity-pool-02 · File \/ NFS<\/small><\/span><span>18 TB<\/span><span>12\.8 TB/)
    assert.match(html, /<b>backup-vault<\/b><br><small class="muted">archive-pool-01 · Object<\/small><\/span><span>10 TB<\/span><span>5\.3 TB<\/span><span class="warn">Review · scrub due<\/span>/)
    assert.match(html, /action="\/volumes\/backup-vault\/scrub"/)
    assert.doesNotMatch(html, /action="\/volumes\/postgres-primary\/scrub"/)
    assert.match(html, /<form class="form" id="create"[^>]* hidden>/)
    assert.match((await app.page('/volumes?new=1')).html, /<form class="form" id="create" method="post" action="\/volumes">/)
  }))

test('creating a volume checks capacity and name, and shows the form again with what was typed', () =>
  withApp(async (app) => {
    const ok = await app.post('/volumes', { name: 'app-data-01', poolId: 'flash-pool-01', sizeGb: '100' })
    assert.deepEqual(redirectOf(ok), { path: '/volumes', ok: 'Volume app-data-01 created in flash-pool-01; it is provisioning.' })
    const html = (await app.page('/volumes')).html
    assert.match(html, /<b>app-data-01<\/b><br><small class="muted">flash-pool-01 · Block \/ NVMe<\/small><\/span><span>100 GB<\/span><span>0 GB<\/span><span class="ok">Provisioning<\/span>/)
    assert.match(html, /action="\/volumes\/app-data-01\/activate"/)
    assert.match(html, /action="\/volumes\/app-data-01\/delete"/)
    const big = await app.post('/volumes', { name: 'huge-one', poolId: 'archive-pool-01', sizeGb: '12000' })
    assert.equal(redirectOf(big).error, 'archive-pool-01 has 11 TB free; huge-one needs 12 TB.')
    assert.equal(big.headers.get('location')?.includes('name=huge-one'), true)
    assert.match((await app.page(big.headers.get('location') ?? '/volumes')).html, /value="huge-one"/)
    assert.equal(redirectOf(await app.post('/volumes', { name: '', poolId: 'flash-pool-01', sizeGb: '1' })).error, 'Give the volume a name.')
  }))

test('activate, scrub and delete follow the rules', () =>
  withApp(async (app) => {
    await app.post('/volumes', { name: 'app-data-01', poolId: 'flash-pool-01', sizeGb: '100' })
    assert.equal(redirectOf(await app.post('/volumes/app-data-01/activate', {})).ok, 'app-data-01 is healthy.')
    assert.equal(redirectOf(await app.post('/volumes/app-data-01/activate', {})).error, 'app-data-01 is not provisioning.')
    assert.equal(redirectOf(await app.post('/volumes/backup-vault/scrub', {})).ok, 'Scrub of backup-vault finished.')
    assert.match((await app.page('/')).html, /Pending scrub<\/span><strong>1 volume</)
    assert.match(redirectOf(await app.post('/volumes/media-assets/delete', {})).error ?? '', /holds 12\.8 TB/)
    assert.equal(redirectOf(await app.post('/volumes/app-data-01/delete', {})).ok, 'app-data-01 deleted.')
    assert.equal(redirectOf(await app.post('/volumes/nope/delete', {})).error, 'There is no such volume.')
  }))

test('the object browser opens media-assets at 2026/Q4 with metadata, breadcrumbs and folders', () =>
  withApp(async (app) => {
    const { status, html } = await app.page('/objects')
    assert.equal(status, 200)
    assert.match(html, /Object storage &nbsp; \/ &nbsp; <a href="\/objects\?bucket=media-assets&prefix=">media-assets<\/a> &nbsp; \/ &nbsp; <a href="\/objects\?bucket=media-assets&prefix=2026%2F">2026<\/a> &nbsp; \/ &nbsp; <b>Q4<\/b>/)
    assert.match(html, /<b>launch-film-final\.mp4<\/b><\/a><small>video\/mp4 · version 3 · encrypted<\/small><\/span><span>2\.4 GB<\/span><span>Yesterday|Nov 4, 16:42/)
    assert.match(html, /product-render-08\.webp<\/b><\/a><small>image\/webp · version 1 · encrypted<\/small><\/span><span>8\.2 MB<\/span><span>Nov 4, 14:10/)
    assert.match(html, /brand-guidelines\.pdf<\/b><\/a><small>application\/pdf · version 2 · encrypted<\/small><\/span><span>18\.5 MB<\/span><span>Nov 3, 09:08/)
    assert.match(html, /640 MB<\/span>/)
    assert.match(html, /1\.9 M objects in media-assets · versioning enabled · 4 objects shown here/)
    const year = await app.page('/objects?bucket=media-assets&prefix=2026/')
    assert.match(year.html, /<b>Q3\/<\/b><\/a><small>Folder/)
    assert.match((await app.page('/objects?bucket=backups-daily')).html, /pg\/<\/b>/)
    assert.match((await app.page('/objects?bucket=tmp-share')).html, /Nothing at this prefix in the sample/)
  }))

test('an object\'s detail shows its metadata; an unknown object is a 404', () =>
  withApp(async (app) => {
    const id = encodeURIComponent('media-assets:2026/Q4/launch-film-final.mp4')
    const { status, html } = await app.page(`/objects/${id}`)
    assert.equal(status, 200)
    assert.match(html, /<dt>Content type<\/dt><dd>video\/mp4<\/dd>/)
    assert.match(html, /<dt>Size<\/dt><dd>2\.4 GB \(2400000000 bytes\)<\/dd>/)
    assert.match(html, /<dt>Version<\/dt><dd>3<\/dd>/)
    assert.match(html, /<dt>Encryption<\/dt><dd>Server-side, enabled<\/dd>/)
    assert.match(html, /<dt>ETag<\/dt><dd>[0-9a-f]{32}<\/dd>/)
    assert.match(html, /campaign:launch, master/)
    assert.match(html, /href="\/objects\?bucket=media-assets&prefix=2026%2FQ4%2F">← media-assets \/ 2026\/Q4\//)
    const missing = await app.page('/objects/nope')
    assert.equal(missing.status, 404)
    assert.match(missing.html, /No such object/)
  }))

test('New bucket creates an empty bucket and opens it; a duplicate is refused', () =>
  withApp(async (app) => {
    const ok = await app.post('/buckets', { name: 'app-exports', poolId: 'capacity-pool-02' })
    assert.deepEqual(redirectOf(ok), { path: '/objects', ok: 'Bucket app-exports created; versioning is enabled.' })
    const html = (await app.page('/objects?bucket=app-exports')).html
    assert.match(html, /0 objects in app-exports · versioning enabled · 0 objects shown here/)
    assert.match(html, /This bucket is empty\./)
    assert.match((await app.page('/')).html, /Across 13 buckets/)
    assert.equal(redirectOf(await app.post('/buckets', { name: 'app-exports', poolId: 'capacity-pool-02' })).error, 'There is already a bucket called app-exports.')
    assert.match((await app.page('/objects?new=1')).html, /<form class="form" id="new-bucket" method="post" action="\/buckets">/)
  }))

test('the snapshot ledger lists restore points with size and retention; a new one is queued, then verified', () =>
  withApp(async (app) => {
    const html = (await app.page('/snapshots')).html
    assert.match(html, /<strong>postgres-primary · pre-upgrade<\/strong><small>Today 09:30 · 1\.4 TB · Retain 30 days · expires Dec 5<\/small>/)
    assert.match(html, /<strong>media-assets · weekly<\/strong><small>Nov 2, 02:00 · 12\.8 TB · Retain 90 days/)
    assert.match(html, /<strong>backup-vault · monthly<\/strong><small>Nov 1, 01:00 · 5\.3 TB · Retain 365 days/)
    assert.equal((html.match(/● Verified/g) ?? []).length, 3)
    const made = await app.post('/snapshots', { volumeId: 'postgres-primary', label: 'manual snapshot', retainDays: '30' })
    assert.equal(redirectOf(made).ok, 'Snapshot of postgres-primary recorded; it is queued for verification.')
    const after = (await app.page('/snapshots')).html
    assert.match(after, /postgres-primary · manual snapshot<\/strong><small>Today 11:00 · 1\.4 TB · Retain 30 days/)
    assert.match(after, /● Queued/)
    assert.equal(redirectOf(await app.post('/snapshots/snapshot-1/verify', {})).ok, 'Snapshot verified.')
    assert.equal(redirectOf(await app.post('/snapshots/snapshot-1/verify', {})).error, 'That snapshot is already verified.')
    assert.equal(redirectOf(await app.post('/snapshots', { volumeId: 'postgres-primary', retainDays: '5' })).error, 'Retention is 30, 90, 365 days.')
    assert.equal(redirectOf(await app.post('/snapshots/nope/purge', {})).error, 'There is no such snapshot.')
    assert.match(redirectOf(await app.post('/snapshots/snap-1/purge', {})).error ?? '', /still within its retention period/)
  }))

test('an expired snapshot shows as expired and can be purged', async () => {
  const base = seed(NOW)
  const old = { ...base.snapshots[0]!, id: 'snap-old', createdAt: new Date(2026, 8, 1, 10, 0).toISOString(), retainDays: 30 }
  await withApp(
    async (app) => {
      const html = (await app.page('/snapshots')).html
      assert.match(html, /<span class="warn">● Expired<\/span>/)
      assert.match(html, /expired Oct 1/)
      assert.match(html, /action="\/snapshots\/snap-old\/purge"/)
      assert.equal(redirectOf(await app.post('/snapshots/snap-old/purge', {})).ok, 'Expired snapshot purged.')
      assert.doesNotMatch((await app.page('/snapshots')).html, /snap-old|expired Oct 1/)
    },
    { state: { ...base, snapshots: [...base.snapshots, old] } },
  )
})

test('the top bar offers New resource, which opens the volume form', () =>
  withApp(async (app) => {
    const { html } = await app.page('/')
    assert.match(html, /<a class="btn" id="newResource" href="\/volumes\?new=1#create">＋ New resource<\/a>/)
    assert.match(html, /<a href="\/objects">Objects<\/a><a href="\/snapshots">Protection<\/a>/)
  }))

test('under the frame prefix every page and link carries it', () =>
  withApp(
    async (app) => {
      const { status, html } = await app.page('/')
      assert.equal(status, 200)
      assert.match(html, new RegExp(`href="${FRAME_MOUNT_PREFIX}/objects"`))
      const response = await app.post('/volumes', { name: 'app-data-01', poolId: 'flash-pool-01', sizeGb: '100' })
      assert.equal(redirectOf(response).path, `${FRAME_MOUNT_PREFIX}/volumes`)
    },
    { prefix: FRAME_MOUNT_PREFIX },
  ))

test('the home widget shows the allocation', () =>
  withApp(async (app) => {
    const widget = app.root.home.widgets().find((w) => w.id === 'fabric')
    assert.ok(widget)
    assert.match(String(await widget.render()), /172 TB<\/b> of 248 TB allocated \(69%\)/)
  }))
