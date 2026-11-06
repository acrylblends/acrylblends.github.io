/** Snapshot ledger (`/snapshots`): every restore point with size, retention and status; record a snapshot, verify a queued one, purge an expired one. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { escapeHtml, fieldOf, vaultErrorOf, whenLabel, withNotice } from '../vault-shell/index.ts'
import { RETENTION_CHOICES, expiresAt, formatGb, isExpired } from '../vaultline/index.ts'

export const name = 'snapshots'
export const inject = ['router', 'vault', 'vaultShell']

function pageFor(ctx: Context, url: string): string {
  const shell = ctx.vaultShell
  const vault = ctx.vault
  const now = vault.now()
  const form = (path: string, label: string) => `<form class="inline-form" method="post" action="${shell.href(path)}"><button class="action" type="submit">${label}</button></form>`
  const rows = vault
    .snapshots()
    .map((s) => {
      const expired = isExpired(s, now)
      const status = expired ? '<span class="warn">● Expired</span>' : s.status === 'verified' ? '<span class="ok">● Verified</span>' : '<span class="warn">● Queued</span>'
      const actions = `${s.status === 'queued' && !expired ? form(`/snapshots/${encodeURIComponent(s.id)}/verify`, 'Verify') : ''}${expired ? form(`/snapshots/${encodeURIComponent(s.id)}/purge`, 'Purge') : ''}`
      return `<div class="snap" data-snapshot="${escapeHtml(s.id)}"><span><strong>${escapeHtml(s.volumeId)} · ${escapeHtml(s.label)}</strong><small>${escapeHtml(whenLabel(s.createdAt, now))} · ${formatGb(s.sizeGb)} · Retain ${String(s.retainDays)} days · ${expired ? 'expired' : 'expires'} ${escapeHtml(expiresAt(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))}</small></span><span>${status} ${actions}</span></div>`
    })
    .join('')
  const volumes = vault.state.volumes.map((v) => `<option value="${escapeHtml(v.id)}"${v.id === 'postgres-primary' ? ' selected' : ''}>${escapeHtml(v.name)}</option>`).join('')
  const main = `<div class="card"><h3>Snapshot ledger</h3><div id="snapRows">${rows === '' ? '<div class="empty">No snapshots yet.</div>' : rows}</div></div>
<form class="form" method="post" action="${shell.href('/snapshots')}"><label class="field">Volume<select class="input" name="volumeId">${volumes}</select></label><label class="field">Label<input class="input" name="label" maxlength="40" placeholder="manual snapshot"></label><label class="field">Retention<select class="input" name="retainDays">${RETENTION_CHOICES.map((d) => `<option value="${String(d)}">${String(d)} days</option>`).join('')}</select></label><div><button class="action" id="snapshot" type="submit">＋ Create snapshot record</button></div></form>`
  return shell.page({ active: 'snapshots', title: 'Snapshot ledger', main, url })
}

export function apply(ctx: Context): void {
  const shell = ctx.vaultShell
  const vault = ctx.vault
  const refused = (c: { redirect(url: string, status: 303): Response }, error: unknown) => {
    const refusal = vaultErrorOf(error)
    if (refusal === undefined) throw error
    return c.redirect(withNotice(shell.href('/snapshots'), 'error', refusal.message), 303)
  }
  const ok = (c: { redirect(url: string, status: 303): Response }, text: string) => c.redirect(withNotice(shell.href('/snapshots'), 'ok', text), 303)
  const app = new Acryl()
    .get('/snapshots', (c) => c.html(pageFor(ctx, c.req.url)))
    .post('/snapshots', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      try {
        const s = await vault.createSnapshot({ volumeId: fieldOf(body, 'volumeId'), label: fieldOf(body, 'label'), retainDays: fieldOf(body, 'retainDays') })
        return ok(c, `Snapshot of ${s.volumeId} recorded; it is queued for verification.`)
      } catch (error) {
        return refused(c, error)
      }
    })
    .post('/snapshots/:id/verify', async (c) => {
      try {
        await vault.verifySnapshot(c.req.param('id'))
        return ok(c, 'Snapshot verified.')
      } catch (error) {
        return refused(c, error)
      }
    })
    .post('/snapshots/:id/purge', async (c) => {
      try {
        await vault.purgeSnapshot(c.req.param('id'))
        return ok(c, 'Expired snapshot purged.')
      } catch (error) {
        return refused(c, error)
      }
    })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  ctx.effect(() => shell.tab({ id: 'snapshots', label: 'Snapshot ledger', nav: 'Protection', path: '/snapshots', order: 40 }))
}
