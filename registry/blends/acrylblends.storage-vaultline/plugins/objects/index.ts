/**
 * Object browser (`/objects`): a bucket's objects by prefix with their metadata, an object's detail (`/objects/<id>`), and "New bucket". Buckets are
 * picked with `?bucket=`, folders with `?prefix=`.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { escapeHtml, fieldOf, vaultErrorOf, whenLabel, withNotice } from '../vault-shell/index.ts'
import { etagOf, formatBytes, formatCount, iconFor } from '../vaultline/index.ts'

export const name = 'objects'
export const inject = ['router', 'vault', 'vaultShell']

const DEFAULT_BUCKET = 'media-assets'
const DEFAULT_PREFIX = '2026/Q4/'

function pageFor(ctx: Context, url: string): string {
  const shell = ctx.vaultShell
  const vault = ctx.vault
  const query = new URL(url, 'http://local').searchParams
  const bucket = vault.state.buckets.find((b) => b.id === (query.get('bucket') ?? DEFAULT_BUCKET)) ?? vault.state.buckets[0]
  if (bucket === undefined) return shell.page({ active: 'objects', title: 'Object browser', main: '<div class="card"><div class="empty">No buckets yet.</div></div>', url })
  const given = query.get('prefix')
  const prefix = given !== null ? (given === '' || given.endsWith('/') ? given : `${given}/`) : bucket.id === DEFAULT_BUCKET ? DEFAULT_PREFIX : ''
  const listing = vault.list(bucket.id, prefix)
  const now = vault.now()
  const link = (p: string) => `${shell.href('/objects')}?bucket=${encodeURIComponent(bucket.id)}&prefix=${encodeURIComponent(p)}`
  const parts = prefix.split('/').filter((x) => x !== '')
  const crumbs = [`<a href="${link('')}">${parts.length === 0 ? `<b>${escapeHtml(bucket.name)}</b>` : escapeHtml(bucket.name)}</a>`, ...parts.map((part, i) => {
    const target = `${parts.slice(0, i + 1).join('/')}/`
    return i === parts.length - 1 ? `<b>${escapeHtml(part)}</b>` : `<a href="${link(target)}">${escapeHtml(part)}</a>`
  })].join(' &nbsp; / &nbsp; ')
  const folders = listing.folders
    .map((f) => `<div class="obj"><span class="fileicon">▣</span><span><a href="${link(f)}"><b>${escapeHtml(f.slice(prefix.length))}</b></a><small>Folder</small></span><span></span><span></span></div>`)
    .join('')
  const objects = listing.objects
    .map(
      (o) =>
        `<div class="obj" data-object="${escapeHtml(o.id)}"><span class="fileicon">${iconFor(o.contentType)}</span><span><a href="${shell.href(`/objects/${encodeURIComponent(o.id)}`)}"><b>${escapeHtml(o.key.slice(prefix.length))}</b></a><small>${escapeHtml(o.contentType)} · version ${String(o.version)}${o.encrypted ? ' · encrypted' : ''}</small></span><span>${formatBytes(o.sizeBytes)}</span><span>${escapeHtml(whenLabel(o.modifiedAt, now))}</span></div>`,
    )
    .join('')
  const bucketOptions = vault.state.buckets.map((b) => `<option value="${escapeHtml(b.id)}"${b.id === bucket.id ? ' selected' : ''}>${escapeHtml(b.name)}</option>`).join('')
  const poolOptions = vault.state.pools.map((p) => `<option value="${escapeHtml(p.id)}"${p.id === 'capacity-pool-02' ? ' selected' : ''}>${escapeHtml(p.name)}</option>`).join('')
  const open = query.get('new') === '1'
  const main = `<div class="card"><div class="crumbs">Object storage &nbsp; / &nbsp; ${crumbs}</div>
<h3>Objects <span><form class="inline-form" method="get" action="${shell.href('/objects')}"><label class="sr" for="bucket">Bucket</label><select class="input" id="bucket" name="bucket">${bucketOptions}</select> <button class="action" type="submit">Open</button></form> <a class="action" id="newBucket" href="${shell.href(`/objects?bucket=${encodeURIComponent(bucket.id)}&new=1#new-bucket`)}">＋ New bucket</a></span></h3>
<form class="form" id="new-bucket" method="post" action="${shell.href('/buckets')}"${open ? '' : ' hidden'}><label class="field">Bucket name<input class="input" name="name" required maxlength="40" placeholder="app-exports"></label><label class="field">Pool<select class="input" name="poolId">${poolOptions}</select></label><div><button class="btn" type="submit">Create bucket</button></div></form>
<p class="muted" style="margin:0 0 10px;font-size:11px">${formatCount(bucket.objectCount)} objects in ${escapeHtml(bucket.name)} · versioning ${bucket.versioning ? 'enabled' : 'off'} · ${String(listing.objects.length)} ${listing.objects.length === 1 ? 'object' : 'objects'} shown here</p>
<div id="objectRows">${folders}${objects}${folders === '' && objects === '' ? `<div class="empty"><b>${bucket.objectCount === 0 ? 'This bucket is empty.' : 'Nothing at this prefix in the sample.'}</b></div>` : ''}</div></div>`
  return shell.page({ active: 'objects', title: 'Object browser', main, url })
}

function detailPage(ctx: Context, id: string, url: string): string | undefined {
  const shell = ctx.vaultShell
  const vault = ctx.vault
  const object = vault.state.objects.find((o) => o.id === id)
  if (object === undefined) return undefined
  const folder = object.key.includes('/') ? `${object.key.slice(0, object.key.lastIndexOf('/') + 1)}` : ''
  const main = `<div class="card"><div class="crumbs"><a href="${shell.href(`/objects?bucket=${encodeURIComponent(object.bucketId)}&prefix=${encodeURIComponent(folder)}`)}">← ${escapeHtml(object.bucketId)} / ${escapeHtml(folder)}</a></div><h3>${escapeHtml(object.key.slice(folder.length))}</h3>
<dl class="meta"><dt>Bucket</dt><dd>${escapeHtml(object.bucketId)}</dd><dt>Key</dt><dd>${escapeHtml(object.key)}</dd><dt>Content type</dt><dd>${escapeHtml(object.contentType)}</dd><dt>Size</dt><dd>${formatBytes(object.sizeBytes)} (${String(object.sizeBytes)} bytes)</dd><dt>Version</dt><dd>${String(object.version)}</dd><dt>Encryption</dt><dd>${object.encrypted ? 'Server-side, enabled' : 'Off'}</dd><dt>Last modified</dt><dd>${escapeHtml(new Date(object.modifiedAt).toISOString().replace('T', ' ').slice(0, 16))} UTC</dd><dt>ETag</dt><dd>${etagOf(object)}</dd><dt>Tags</dt><dd>${object.tags.length === 0 ? '—' : object.tags.map(escapeHtml).join(', ')}</dd></dl></div>`
  return shell.page({ active: 'objects', title: object.key, main, url })
}

export function apply(ctx: Context): void {
  const shell = ctx.vaultShell
  const vault = ctx.vault
  const app = new Acryl()
    .get('/objects', (c) => c.html(pageFor(ctx, c.req.url)))
    .get('/objects/:id', (c) => {
      const page = detailPage(ctx, decodeURIComponent(c.req.param('id')), c.req.url)
      return page === undefined ? c.html(shell.page({ active: 'objects', title: 'Not found', main: `<div class="card"><div class="empty"><b>No such object.</b><br><a href="${shell.href('/objects')}">Back to the browser</a></div></div>` }), 404) : c.html(page)
    })
    .post('/buckets', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      try {
        const bucket = await vault.createBucket({ name: fieldOf(body, 'name'), poolId: fieldOf(body, 'poolId') })
        return c.redirect(withNotice(`${shell.href('/objects')}?bucket=${encodeURIComponent(bucket.id)}`, 'ok', `Bucket ${bucket.name} created; versioning is enabled.`), 303)
      } catch (error) {
        const refusal = vaultErrorOf(error)
        if (refusal === undefined) throw error
        return c.redirect(withNotice(`${shell.href('/objects')}?new=1#new-bucket`, 'error', refusal.message), 303)
      }
    })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  ctx.effect(() => shell.tab({ id: 'objects', label: 'Object browser', nav: 'Objects', path: '/objects', order: 30 }))
}
