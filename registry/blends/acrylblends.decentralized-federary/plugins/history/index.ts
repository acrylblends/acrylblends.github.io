/** Peering history (side column): the recent decisions with Undo (while the result still stands) and the federation events of the open instance. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { ago } from '../federary/index.ts'
import { backTo, escapeHtml, fedErrorOf, fieldOf, postButton, withNotice } from '../fed-shell/index.ts'

export const name = 'history'
export const inject = ['router', 'fed', 'fedShell']

export function apply(ctx: Context): void {
  const shell = ctx.fedShell
  const fed = ctx.fed
  const render = (sel: ReturnType<typeof shell.selection>): string => {
    const now = fed.now()
    const decisions = [...fed.state.decisions].reverse().slice(0, 5)
    const drows = decisions.map((d) => `<li data-decision="${escapeHtml(d.id)}"><b>${d.undone ? '<s>' : ''}${escapeHtml(d.action.toUpperCase())} · ${escapeHtml(d.target)}${d.undone ? '</s>' : ''}</b><small>demo decision recorded · ${escapeHtml(ago(d.at, now))}${d.undone ? ' · undone' : ''}</small>${d.undone ? '' : `<div class="btnrow">${postButton(shell, `/decisions/${encodeURIComponent(d.id)}/undo`, shell.hrefFor('/', sel.instance.id), {}, 'Undo', '', 'data-undo="1"')}</div>`}</li>`).join('')
    const events = fed.history(sel.instance.id).slice(0, 4).map((e) => `<li>${escapeHtml(e.text)}<small>${escapeHtml(e.kind)} · ${escapeHtml(ago(e.at, now))}</small></li>`).join('')
    return `<section class="panel" id="history"><h2>Peering history</h2><div class="muted">Decisions are demo actions and can be undone.</div>${drows === '' ? '<div class="muted" style="margin-top:8px">No decisions yet.</div>' : `<ul class="list" id="decisions">${drows}</ul>`}<h2 style="margin-top:14px">${escapeHtml(sel.instance.id)}</h2>${events === '' ? '<div class="muted">No events for this instance.</div>' : `<ul class="list" id="events">${events}</ul>`}</section>`
  }
  const app = new Acryl().post('/decisions/:id/undo', async (c) => {
    const body = (await c.req.parseBody()) as Record<string, unknown>
    const back = backTo(shell, fieldOf(body, 'back'), shell.href('/'))
    try {
      const d = await fed.undo(c.req.param('id'))
      return c.redirect(withNotice(back, 'ok', `Undid “${d.action}” for ${d.target}.`), 303)
    } catch (error) {
      const refusal = fedErrorOf(error)
      if (refusal === undefined) throw error
      return c.redirect(withNotice(back, 'error', refusal.message), 303)
    }
  })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  ctx.effect(() => shell.side({ id: 'history', column: 'side', order: 50, render }))
}
