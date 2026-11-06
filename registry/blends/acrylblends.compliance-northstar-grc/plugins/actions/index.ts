/** Audit actions (side column): the open actions with their due date, and Mark done; completing a refresh action brings the refreshed evidence in for review. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { dueLabel } from '../grc/index.ts'
import { escapeHtml, grcErrorOf, withNotice } from '../grc-shell/index.ts'

export const name = 'actions'
export const inject = ['router', 'grc', 'grcShell']

export function apply(ctx: Context): void {
  const shell = ctx.grcShell
  const grc = ctx.grc
  const render = (sel: ReturnType<typeof shell.selection>): string => {
    const now = grc.now()
    const open = grc.state.actions.filter((a) => !a.done).sort((a, b) => a.due.localeCompare(b.due))
    const rows = open.map((a) => `<div class="act" data-action="${escapeHtml(a.id)}"><div>${escapeHtml(a.text)}<small>${escapeHtml(dueLabel(a.due, now))}${a.controlId === undefined ? '' : ` · ${escapeHtml(a.controlId)}`}</small></div><form method="post" action="${shell.href(`/actions/${encodeURIComponent(a.id)}/done`)}">${shell.hidden(sel)}<button class="btn small" type="submit">Mark done</button></form></div>`).join('')
    return `<section class="card"><h2>Audit actions</h2><div class="hint">${String(open.length)} open</div>${rows === '' ? '<div class="hint" style="margin-top:10px">Nothing open.</div>' : rows}</section>`
  }
  const app = new Acryl().post('/actions/:id/done', async (c) => {
    const body = (await c.req.parseBody()) as Record<string, unknown>
    const sel = shell.fromBody(body)
    const back = shell.hrefFor('/', sel)
    try {
      const a = await grc.completeAction(c.req.param('id'))
      return c.redirect(withNotice(back, 'ok', a.refresh === undefined ? 'Action marked done.' : 'Action done; the refreshed evidence is waiting for review.'), 303)
    } catch (error) {
      const refusal = grcErrorOf(error)
      if (refusal === undefined) throw error
      return c.redirect(withNotice(back, 'error', refusal.message), 303)
    }
  })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  ctx.effect(() => shell.side({ id: 'actions', column: 'side', order: 30, render }))
}
