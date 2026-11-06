/** Trust rules (side column): the rules that can stop a peering approval (signed identity required, denied domains) or limit a peer; each can be switched on or off after review. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { backTo, escapeHtml, fedErrorOf, fieldOf, postButton, withNotice } from '../fed-shell/index.ts'

export const name = 'trust'
export const inject = ['router', 'fed', 'fedShell']

export function apply(ctx: Context): void {
  const shell = ctx.fedShell
  const fed = ctx.fed
  const render = (sel: ReturnType<typeof shell.selection>): string => {
    const rows = fed.state.rules
      .map((r) => `<li data-rule="${escapeHtml(r.id)}"><b>${escapeHtml(r.text)}</b> <span class="chip${r.enabled ? '' : ' warn'}">${r.enabled ? 'on' : 'off'}</span><small>${r.kind === 'require-signed' ? 'Applies to every approval' : `${r.kind === 'deny' ? 'Deny' : 'Limit'} · ${escapeHtml(r.pattern ?? '')}`}</small><div class="btnrow">${postButton(shell, `/rules/${encodeURIComponent(r.id)}/toggle`, shell.hrefFor('/', sel.instance.id), {}, r.enabled ? 'Switch off' : 'Switch on', '', 'data-toggle="rule"')}</div></li>`)
      .join('')
    return `<section class="panel" id="trust"><h2>Trust rules</h2><div class="muted">Review the rules behind peering decisions.</div><ul class="list">${rows}</ul></section>`
  }
  const app = new Acryl().post('/rules/:id/toggle', async (c) => {
    const body = (await c.req.parseBody()) as Record<string, unknown>
    const back = backTo(shell, fieldOf(body, 'back'), shell.href('/'))
    try {
      const r = await fed.toggleRule(c.req.param('id'))
      return c.redirect(withNotice(back, 'ok', `Trust rule “${r.text}” is now ${r.enabled ? 'on' : 'off'}.`), 303)
    } catch (error) {
      const refusal = fedErrorOf(error)
      if (refusal === undefined) throw error
      return c.redirect(withNotice(back, 'error', refusal.message), 303)
    }
  })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  ctx.effect(() => shell.side({ id: 'trust', column: 'side', order: 40, render }))
}
