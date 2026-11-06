/** Issue details (right column): the open finding's severity, description, what was measured, the suggested remediation, and the checklist (mark resolved, add to the next design review). */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { SEVERITIES, measure } from '../clearpath/index.ts'
import { auditErrorOf, escapeHtml, fieldOf, withNotice } from '../audit-shell/index.ts'

export const name = 'detail'
export const inject = ['router', 'audit', 'auditShell']

export function apply(ctx: Context): void {
  const shell = ctx.auditShell
  const audit = ctx.audit
  const render = (sel: ReturnType<typeof shell.selection>): string => {
    const i = sel.issue
    if (i === undefined) return `<div class="cap">Issue details</div><p>No finding to show for this priority.</p>`
    const base = `/issues/${encodeURIComponent(i.id)}`
    const toggle = (action: string, on: boolean, label: string, id: string) => `<form method="post" action="${shell.href(`${base}/${action}`)}">${shell.hidden(sel)}<input type="hidden" name="value" value="${on ? 'off' : 'on'}"><button class="check${on ? ' on' : ''}" id="${id}" type="submit" role="checkbox" aria-checked="${on ? 'true' : 'false'}"><span class="box" aria-hidden="true">${on ? '✓' : ''}</span>${label}</button></form>`
    return `<div class="cap">Issue details</div><span class="tag${i.resolved ? ' done' : ''}" id="severity">${i.resolved ? 'RESOLVED' : SEVERITIES[i.severity].tag}</span><h3 id="detailtitle">${escapeHtml(i.title)}</h3><p id="detaildesc">${escapeHtml(i.description)}</p><p><b>Component:</b> ${escapeHtml(i.component)}</p><div class="measured" id="measured">${escapeHtml(measure(i))}</div><div class="advice"><b>Suggested remediation</b><br><span id="fix">${escapeHtml(i.fix)}</span></div><div class="cap" style="margin-top:23px">Remediation</div>${toggle('resolve', i.resolved, 'Mark this finding resolved', 'resolved')}${toggle('queue', i.queued, 'Add to next design review', 'queued')}<div class="status" id="detailstatus">${i.resolved ? 'Marked as resolved in this local audit; the fix is shown in the preview.' : ''}</div>`
  }
  const app = new Acryl()
    .post('/issues/:id/resolve', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      const back = shell.backFor(body)
      try {
        const on = fieldOf(body, 'value') !== 'off'
        const i = await audit.setResolved(c.req.param('id'), on)
        return c.redirect(withNotice(back, 'ok', on ? `Marked “${i.title}” as resolved in this local audit.` : `Resolution reopened for “${i.title}”.`), 303)
      } catch (error) {
        const refusal = auditErrorOf(error)
        if (refusal === undefined) throw error
        return c.redirect(withNotice(back, 'error', refusal.message), 303)
      }
    })
    .post('/issues/:id/queue', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      const back = shell.backFor(body)
      try {
        const on = fieldOf(body, 'value') !== 'off'
        const i = await audit.setQueued(c.req.param('id'), on)
        return c.redirect(withNotice(back, 'ok', on ? `“${i.title}” added to the next design review.` : `“${i.title}” removed from the next design review.`), 303)
      } catch (error) {
        const refusal = auditErrorOf(error)
        if (refusal === undefined) throw error
        return c.redirect(withNotice(back, 'error', refusal.message), 303)
      }
    })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  ctx.effect(() => shell.side({ id: 'detail', column: 'right', order: 10, render }))
}
