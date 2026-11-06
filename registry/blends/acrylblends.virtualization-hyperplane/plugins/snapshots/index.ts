/** Snapshots (`/snapshots`): every restore point with its machine, size and age, and a way to delete one. Taking one is the machines' job. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { escapeHtml, fleetErrorOf, whenLabel, withNotice } from '../fleet-shell/index.ts'
import type {} from '../hyperplane/index.ts'

export const name = 'snapshots'
export const inject = ['router', 'fleet', 'fleetShell']

function pageFor(ctx: Context, url: string): string {
  const shell = ctx.fleetShell
  const fleet = ctx.fleet
  const now = fleet.now()
  const rows = fleet
    .snapshots()
    .map((s) => {
      const vm = fleet.state.vms.find((v) => v.id === s.vmId)
      const link = vm === undefined ? 'Removed machine' : shell.has('machines') ? `<a href="${shell.href(`/machines/${encodeURIComponent(vm.id)}`)}">${escapeHtml(vm.name)}</a>` : escapeHtml(vm.name)
      return `<div class="snapshot" data-snapshot="${escapeHtml(s.id)}"><span><b>${escapeHtml(s.name)}</b><br><small class="muted">${link} · ${escapeHtml(whenLabel(s.createdAt, now))} · ${s.sizeGb.toFixed(1)} GB</small></span><span class="actions">● Ready <form method="post" action="${shell.href(`/snapshots/${encodeURIComponent(s.id)}/delete`)}"><button class="danger" type="submit" aria-label="Delete ${escapeHtml(s.name)}">Delete</button></form></span></div>`
    })
    .join('')
  const total = fleet.snapshots().reduce((n, s) => n + s.sizeGb, 0)
  const main = `${shell.header('Snapshots', `${String(fleet.snapshots().length)} ${fleet.snapshots().length === 1 ? 'restore point' : 'restore points'} · ${total.toFixed(1)} GB`)}
<section class="panel"><div class="panelhead"><h3>Restore points</h3><span class="muted">Newest first</span></div>${rows === '' ? '<div class="empty"><b>No snapshots yet.</b><br>Take one from a machine.</div>' : rows}</section>`
  return shell.page({ active: 'snapshots', title: 'Snapshots', main, url })
}

export function apply(ctx: Context): void {
  const shell = ctx.fleetShell
  const app = new Acryl()
    .get('/snapshots', (c) => c.html(pageFor(ctx, c.req.url)))
    .post('/snapshots/:id/delete', async (c) => {
      try {
        await ctx.fleet.deleteSnapshot(c.req.param('id'))
        return c.redirect(withNotice(shell.href('/snapshots'), 'ok', 'Snapshot deleted.'), 303)
      } catch (error) {
        const refusal = fleetErrorOf(error)
        if (refusal === undefined) throw error
        return c.redirect(withNotice(shell.href('/snapshots'), 'error', refusal.message), 303)
      }
    })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  ctx.effect(() => shell.nav({ id: 'snapshots', label: 'Snapshots', icon: '◫', path: '/snapshots', order: 30 }))
}
