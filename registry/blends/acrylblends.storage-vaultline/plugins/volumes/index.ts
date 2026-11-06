/** Volume explorer (`/volumes`): the logical volumes with pool, kind, size, use and status; create a volume (guarded by the pool's free capacity), activate, scrub or delete one. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { escapeHtml, fieldOf, vaultErrorOf, withNotice } from '../vault-shell/index.ts'
import { formatGb } from '../vaultline/index.ts'

export const name = 'volumes'
export const inject = ['router', 'vault', 'vaultShell']

const STATUS: Record<string, { label: string; cls: string }> = {
  healthy: { label: 'Healthy', cls: 'ok' },
  review: { label: 'Review', cls: 'warn' },
  provisioning: { label: 'Provisioning', cls: 'ok' },
}

function pageFor(ctx: Context, url: string): string {
  const shell = ctx.vaultShell
  const vault = ctx.vault
  const query = new URL(url, 'http://local').searchParams
  const open = query.get('new') === '1' || query.get('name') !== null
  const form = (path: string, label: string, cls = 'action') => `<form class="inline-form" method="post" action="${shell.href(path)}"><button class="${cls}" type="submit">${label}</button></form>`
  const rows = vault.state.volumes
    .map((v) => {
      const pool = vault.pool(v.poolId)
      const s = STATUS[v.status] ?? { label: v.status, cls: '' }
      const id = encodeURIComponent(v.id)
      const actions = [
        v.status === 'provisioning' ? form(`/volumes/${id}/activate`, 'Activate') : '',
        v.needsScrub ? form(`/volumes/${id}/scrub`, 'Scrub') : '',
        v.usedGb === 0 && vault.snapshots(v.id).length === 0 ? form(`/volumes/${id}/delete`, 'Delete', 'action danger') : '',
      ].join(' ')
      return `<div class="vol" data-volume="${escapeHtml(v.id)}"><span><b>${escapeHtml(v.name)}</b><br><small class="muted">${escapeHtml(pool.name)} · ${escapeHtml(vault.kindOf(v))}</small></span><span>${formatGb(v.sizeGb)}</span><span>${formatGb(v.usedGb)}</span><span class="${s.cls}">${s.label}${v.needsScrub ? ' · scrub due' : ''}</span><span>${actions}</span></div>`
    })
    .join('')
  const pools = vault.state.pools.map((p) => `<option value="${escapeHtml(p.id)}"${p.id === (query.get('poolId') ?? 'flash-pool-01') ? ' selected' : ''}>${escapeHtml(p.name)} · ${formatGb(vault.poolFree(p.id))} free</option>`).join('')
  const create = `<form class="form" id="create" method="post" action="${shell.href('/volumes')}"${open ? '' : ' hidden'}>
<label class="field">Volume name<input class="input" name="name" value="${escapeHtml(query.get('name') ?? '')}" required maxlength="40" placeholder="app-data-01"></label>
<label class="field">Pool<select class="input" name="poolId">${pools}</select></label>
<label class="field">Size (GB)<input class="input" name="sizeGb" type="number" min="1" max="100000" value="${escapeHtml(query.get('sizeGb') ?? '100')}" required></label>
<div><button class="btn" type="submit">Create volume</button> <a class="action" href="${shell.href('/volumes')}">Cancel</a></div></form>`
  const main = `<div class="card"><h3>Logical volumes <a class="action" id="createVol" href="${shell.href('/volumes?new=1#create')}">＋ Create volume</a></h3>${create}
<div class="vol head"><span>Name / pool</span><span>Size</span><span>Used</span><span>Status</span><span>Actions</span></div>${rows === '' ? '<div class="empty">No volumes yet.</div>' : rows}</div>`
  return shell.page({ active: 'volumes', title: 'Volume explorer', main, url })
}

export function apply(ctx: Context): void {
  const shell = ctx.vaultShell
  const vault = ctx.vault
  const refused = (c: { redirect(url: string, status: 303): Response }, to: string, error: unknown) => {
    const refusal = vaultErrorOf(error)
    if (refusal === undefined) throw error
    return c.redirect(withNotice(to, 'error', refusal.message), 303)
  }
  const app = new Acryl().get('/volumes', (c) => c.html(pageFor(ctx, c.req.url))).post('/volumes', async (c) => {
    const body = (await c.req.parseBody()) as Record<string, unknown>
    const fields = Object.fromEntries(['name', 'poolId', 'sizeGb'].map((k) => [k, fieldOf(body, k)]))
    try {
      const volume = await vault.createVolume(fields)
      return c.redirect(withNotice(shell.href('/volumes'), 'ok', `Volume ${volume.name} created in ${vault.pool(volume.poolId).name}; it is provisioning.`), 303)
    } catch (error) {
      const q = new URLSearchParams({ new: '1', name: fields.name ?? '', poolId: fields.poolId ?? '', sizeGb: fields.sizeGb ?? '' })
      return refused(c, `${shell.href('/volumes')}?${q.toString()}#create`, error)
    }
  })
  for (const action of ['activate', 'scrub', 'delete'] as const) {
    app.post(`/volumes/:id/${action}`, async (c) => {
      const id = c.req.param('id')
      try {
        if (action === 'activate') await vault.activateVolume(id)
        else if (action === 'scrub') await vault.scrubVolume(id)
        else await vault.deleteVolume(id)
        return c.redirect(withNotice(shell.href('/volumes'), 'ok', action === 'activate' ? `${id} is healthy.` : action === 'scrub' ? `Scrub of ${id} finished.` : `${id} deleted.`), 303)
      } catch (error) {
        return refused(c, shell.href('/volumes'), error)
      }
    })
  }
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  ctx.effect(() => shell.tab({ id: 'volumes', label: 'Volume explorer', nav: 'Volumes', path: '/volumes', order: 20 }))
}
