/**
 * Evidence review (side column): the open control's evidence bundle (provenance, collection and review dates, retention class), the review buttons
 * (accept the evidence, request a refresh), the exception form and the control's audit trail.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { agoLabel, dateLabel, isFresh, latestEvidence, statusOf } from '../grc/index.ts'
import { escapeHtml, fieldOf, grcErrorOf, withNotice } from '../grc-shell/index.ts'

export const name = 'evidence'
export const inject = ['router', 'grc', 'grcShell']

export function apply(ctx: Context): void {
  const shell = ctx.grcShell
  const grc = ctx.grc
  const render = (sel: ReturnType<typeof shell.selection>): string => {
    const c = sel.control
    if (c === undefined) return `<section class="card"><h2 id="detailTitle">Evidence review</h2><div class="hint">No control selected.</div></section>`
    const now = grc.now()
    const base = `/controls/${encodeURIComponent(c.id)}`
    const latest = latestEvidence(c)
    const items = [...c.evidence]
      .sort((a, b) => b.collectedAt.localeCompare(a.collectedAt))
      .map((e) => {
        const pill = e.state === 'accepted' && isFresh(e, now) ? '' : ' warn'
        const label = e.state === 'accepted' ? (isFresh(e, now) ? 'Accepted' : 'Accepted · stale') : e.state === 'pending' ? 'Pending review' : 'Refresh requested'
        return `<div class="evidence" data-evidence="${escapeHtml(e.id)}"><h3>${escapeHtml(e.title)} <span class="pill${pill}">${label}</span></h3><p>Uploaded ${escapeHtml(dateLabel(e.collectedAt))} · ${escapeHtml(e.provenance)}</p><p>${escapeHtml(e.description)}</p><p>Retention ${e.retention}${e.reviewedAt === undefined ? ' · not reviewed yet' : ` · reviewed ${escapeHtml(dateLabel(e.reviewedAt))} by ${escapeHtml(e.reviewer ?? '')}`}</p></div>`
      })
      .join('')
    const post = (action: string, label: string, cls: string, id: string, disabled = false) => `<form method="post" action="${shell.href(`${base}/${action}`)}">${shell.hidden(sel)}<button class="${cls}" id="${id}" type="submit"${disabled ? ' disabled' : ''}>${label}</button></form>`
    const accepted = latest?.state === 'accepted'
    const exception =
      c.exception === undefined
        ? `<details><summary>Mark an exception</summary><form class="form" method="post" action="${shell.href(`${base}/exception`)}">${shell.hidden(sel)}<div><label for="reason">Reason (at least 10 characters)</label><textarea id="reason" name="reason" rows="3" maxlength="200" required></textarea></div><button class="btn small" type="submit">Mark exception</button></form></details>`
        : `<div class="evidence" id="exception"><h3>Exception <span class="pill bad">Open</span></h3><p>${escapeHtml(c.exception.reason)}</p><p>Marked ${escapeHtml(agoLabel(c.exception.at, now))} by ${escapeHtml(c.exception.by)}</p>${post('clear-exception', 'Clear exception', 'request', 'clear')}</div>`
    const trail = grc.history(c.id).slice(0, 5).map((e) => `<li>${escapeHtml(dateLabel(e.at))} · ${escapeHtml(e.actor)}<br>${escapeHtml(e.text)}</li>`).join('')
    return `<section class="card"><h2 id="detailTitle">Evidence review</h2><div class="hint" id="detailSub">${escapeHtml(c.framework)} · ${escapeHtml(c.id)} ${escapeHtml(c.title)} · <b>${statusOf(c, now)}</b></div>${items === '' ? '<div class="evidence"><p>No evidence collected yet.</p></div>' : items}<div class="actions">${post('accept', accepted ? 'Evidence accepted' : 'Accept evidence', 'accept', 'accept', accepted)}${post('refresh', 'Request refresh', 'request', 'refresh')}</div>${exception}<div class="hint" style="margin-top:14px"><b>Review history</b></div>${trail === '' ? '<div class="hint">No review history yet.</div>' : `<ul class="trail" id="trail">${trail}</ul>`}</section>`
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
  const prep = async (c: { req: { parseBody(): Promise<unknown>; param(n: string): string } }) => {
    const body = (await c.req.parseBody()) as Record<string, unknown>
    const sel = shell.fromBody(body)
    const id = c.req.param('id')
    return { body, id, back: shell.hrefFor('/', { ...sel, control: grc.state.controls.find((x) => x.id === id) ?? sel.control }) }
  }
  const app = new Acryl()
    .post('/controls/:id/accept', async (c) => {
      const { id, back } = await prep(c)
      return go(c, back, async () => `Evidence accepted in this local demo review: “${(await grc.acceptEvidence(id)).title}”.`)
    })
    .post('/controls/:id/refresh', async (c) => {
      const { id, back } = await prep(c)
      return go(c, back, async () => `Refresh request added to the demo audit trail; action due ${dateLabel((await grc.requestRefresh(id)).due)}.`)
    })
    .post('/controls/:id/exception', async (c) => {
      const { body, id, back } = await prep(c)
      return go(c, back, async () => {
        await grc.markException(id, fieldOf(body, 'reason'))
        return `${id} marked as an exception; a review action was opened.`
      })
    })
    .post('/controls/:id/clear-exception', async (c) => {
      const { id, back } = await prep(c)
      return go(c, back, async () => {
        await grc.clearException(id)
        return `Exception cleared for ${id}.`
      })
    })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  ctx.effect(() => shell.side({ id: 'evidence', column: 'side', order: 20, render }))
}
