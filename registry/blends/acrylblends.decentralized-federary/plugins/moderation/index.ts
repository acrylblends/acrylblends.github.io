/** Moderation queue (side column): open content reports from peer instances; dismiss one, or limit (quarantine) or block the instance. Every decision is recorded and reversible. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { ago } from '../federary/index.ts'
import { backTo, escapeHtml, fedErrorOf, fieldOf, postButton, withNotice } from '../fed-shell/index.ts'

export const name = 'moderation'
export const inject = ['router', 'fed', 'fedShell']

export function apply(ctx: Context): void {
  const shell = ctx.fedShell
  const fed = ctx.fed
  const render = (): string => {
    const open = fed.state.reports.filter((r) => r.state === 'open')
    const rows = open
      .map((r) => {
        const back = shell.hrefFor('/', r.instance)
        const btn = (action: string, label: string, cls = '') => postButton(shell, `/reports/${encodeURIComponent(r.id)}/decide`, back, { action }, label, cls, `data-action="${action}"`)
        return `<li data-report="${escapeHtml(r.id)}"><b>${escapeHtml(r.subject)}</b> <span class="chip">${escapeHtml(r.reason)}</span><small>${escapeHtml(r.excerpt)} · ${escapeHtml(ago(r.at, fed.now()))}</small><div class="btnrow">${btn('dismiss', 'Dismiss')}${btn('limit', 'Limit instance')}${btn('block', 'Block instance', 'danger')}</div></li>`
      })
      .join('')
    const decided = fed.state.reports.length - open.length
    return `<section class="panel" id="moderation"><h2>Moderation queue</h2><div class="muted">${String(open.length)} open · ${String(decided)} decided · synthetic reports</div>${rows === '' ? '<div class="muted" style="margin-top:8px">The queue is empty.</div>' : `<ul class="list">${rows}</ul>`}</section>`
  }
  const app = new Acryl().post('/reports/:id/decide', async (c) => {
    const body = (await c.req.parseBody()) as Record<string, unknown>
    const id = c.req.param('id')
    const back = backTo(shell, fieldOf(body, 'back'), shell.href('/'))
    try {
      const d = await fed.decideReport(id, fieldOf(body, 'action'))
      return c.redirect(withNotice(back, 'ok', `Report decided: ${d.action}. Demo decision recorded; you can undo it.`), 303)
    } catch (error) {
      const refusal = fedErrorOf(error)
      if (refusal === undefined) throw error
      return c.redirect(withNotice(back, 'error', refusal.message), 303)
    }
  })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  ctx.effect(() => shell.side({ id: 'moderation', column: 'side', order: 30, render }))
}
