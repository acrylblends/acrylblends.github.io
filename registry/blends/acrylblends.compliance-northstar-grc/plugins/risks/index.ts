/** Risk watchlist (side column): open risks with their residual score and rating, the treatment form for the selected risk, and the New risk form (`?newrisk=1`). The posture strip recalculates after a change. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { TREATMENTS, inherentOf, rating, residualOf, type Rating } from '../grc/index.ts'
import { escapeHtml, fieldOf, grcErrorOf, withNotice } from '../grc-shell/index.ts'

export const name = 'risks'
export const inject = ['router', 'grc', 'grcShell']

const pillOf = (r: Rating): string => (r === 'High' ? ' bad' : r === 'Medium' ? ' warn' : '')

export function apply(ctx: Context): void {
  const shell = ctx.grcShell
  const grc = ctx.grc
  const levels = (name: string, current: number, id: string) => `<select id="${id}" name="${name}">${[1, 2, 3, 4, 5].map((n) => `<option${n === current ? ' selected' : ''}>${String(n)}</option>`).join('')}</select>`

  const top = (sel: ReturnType<typeof shell.selection>): string => `<a class="btn dark" id="newRisk" href="${shell.hrefFor('/', sel, { newrisk: '1' })}#new-risk">＋ New risk</a>`

  const render = (sel: ReturnType<typeof shell.selection>): string => {
    const s = grc.state
    const rows = [...s.risks].sort((a, b) => residualOf(b) - residualOf(a)).map((r) => {
      const res = residualOf(r)
      const rt = rating(res)
      return `<div class="riskrow${r.id === sel.risk?.id ? ' sel' : ''}" data-risk="${escapeHtml(r.id)}"><div><a href="${shell.hrefFor('/', sel, { risk: r.id })}#treatment"><b>${escapeHtml(r.title)}</b></a><div class="hint">${escapeHtml(r.area)} · ${escapeHtml(r.owner)}${r.status === 'open' ? '' : ` · ${r.status}`}</div></div><span class="pill${pillOf(rt)}">${String(res).padStart(2, '0')} · ${rt}</span></div>`
    }).join('')
    const r = sel.risk
    const treat =
      r === undefined
        ? ''
        : `<div id="treatment"><div class="hint" style="margin-top:12px"><b>Treatment · ${escapeHtml(r.title)}</b> · inherent ${String(inherentOf(r))} (${String(r.likelihood)} × ${String(r.impact)})</div><form class="form" method="post" action="${shell.href(`/risks/${encodeURIComponent(r.id)}/treatment`)}">${shell.hidden(sel)}<div><label for="action">Treatment</label><select id="action" name="action">${(Object.entries(TREATMENTS) as [string, string][]).map(([v, l]) => `<option value="${v}"${v === r.treatment.action ? ' selected' : ''}>${l}</option>`).join('')}</select></div><div class="two"><div><label for="likelihood">Residual likelihood</label>${levels('likelihood', r.treatment.likelihood, 'likelihood')}</div><div><label for="impact">Residual impact</label>${levels('impact', r.treatment.impact, 'impact')}</div></div><div><label for="note">Note</label><input id="note" name="note" value="${escapeHtml(r.treatment.note)}" maxlength="200"></div><button class="btn small" type="submit" id="savetreatment">Update treatment</button></form></div>`
    const owners = [...new Set(s.controls.map((c) => c.owner))].sort()
    const form = `<details id="new-risk"${sel.newRisk ? ' open' : ''}><summary>New risk</summary><form class="form" method="post" action="${shell.href('/risks')}">${shell.hidden(sel)}<div><label for="rtitle">Title</label><input id="rtitle" name="title" maxlength="40" required></div><div><label for="rarea">Area</label><input id="rarea" name="area" maxlength="40" required></div><div><label for="rowner">Owner</label><select id="rowner" name="owner">${owners.map((o) => `<option>${escapeHtml(o)}</option>`).join('')}</select></div><div class="two"><div><label for="rl">Likelihood</label>${levels('likelihood', 3, 'rl')}</div><div><label for="ri">Impact</label>${levels('impact', 3, 'ri')}</div></div><button class="btn small" type="submit">Add risk</button></form></details>`
    return `<section class="card"><h2>Risk watchlist</h2><div class="hint">Residual score after treatment</div>${rows}${treat}${form}</section>`
  }
  const go = async (c: { redirect(url: string, status: 303): Response }, back: string, work: () => Promise<string>) => {
    try {
      return c.redirect(withNotice(back, 'ok', await work()), 303)
    } catch (error) {
      const refusal = grcErrorOf(error)
      if (refusal === undefined) throw error
      return c.redirect(withNotice(back, 'error', refusal.message), 303)
    }
  }
  const app = new Acryl()
    .post('/risks/:id/treatment', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      const sel = shell.fromBody(body)
      const id = c.req.param('id')
      return go(c, `${shell.hrefFor('/', sel, { risk: id })}#treatment`, async () => {
        const r = await grc.setTreatment(id, { action: fieldOf(body, 'action'), note: fieldOf(body, 'note'), likelihood: fieldOf(body, 'likelihood'), impact: fieldOf(body, 'impact') })
        return `${r.title}: treatment updated, residual score ${String(residualOf(r))} (${rating(residualOf(r))}). Posture recalculated.`
      })
    })
    .post('/risks', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      const sel = shell.fromBody(body)
      return go(c, `${shell.hrefFor('/', sel, { newrisk: '1' })}#new-risk`, async () => {
        const r = await grc.addRisk({ title: fieldOf(body, 'title'), area: fieldOf(body, 'area'), owner: fieldOf(body, 'owner'), likelihood: fieldOf(body, 'likelihood'), impact: fieldOf(body, 'impact') })
        return `Risk “${r.title}” added with inherent score ${String(inherentOf(r))}.`
      }).then((res) => res)
    })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  ctx.effect(() => shell.side({ id: 'risks-top', column: 'actions', order: 20, render: top }))
  ctx.effect(() => shell.side({ id: 'risks', column: 'side', order: 10, render }))
}
