/** Re-run (top bar and rail): "Re-run sample audit" records a run with the score of the findings as they stand; the rail lists the latest runs with their change. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { ago } from '../clearpath/index.ts'
import { auditErrorOf, escapeHtml, withNotice } from '../audit-shell/index.ts'

export const name = 'rerun'
export const inject = ['router', 'audit', 'auditShell']

export function apply(ctx: Context): void {
  const shell = ctx.auditShell
  const audit = ctx.audit
  const top = (sel: ReturnType<typeof shell.selection>): string => `<form method="post" action="${shell.href('/rerun')}">${shell.hidden(sel)}<button class="runbtn" id="rerun" type="submit">↻ Re-run sample audit</button></form>`
  const left = (): string => {
    const runs = [...audit.state.runs].reverse().slice(0, 4)
    return `<div class="cap" style="margin-top:22px">Re-run summary</div><ul class="runs" id="runs">${runs.map((r) => `<li data-run="${escapeHtml(r.id)}"><b>${String(r.score)}</b> · ${escapeHtml(ago(r.at, audit.now()))}<br>${String(r.open)} open · ${String(r.resolved)} resolved</li>`).join('')}</ul>`
  }
  const app = new Acryl().post('/rerun', async (c) => {
    const body = (await c.req.parseBody()) as Record<string, unknown>
    const back = shell.backFor(body)
    try {
      const run = await audit.rerun()
      return c.redirect(withNotice(back, 'ok', run.summary), 303)
    } catch (error) {
      const refusal = auditErrorOf(error)
      if (refusal === undefined) throw error
      return c.redirect(withNotice(back, 'error', refusal.message), 303)
    }
  })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  ctx.effect(() => shell.side({ id: 'rerun-top', column: 'top', order: 10, render: top }))
  ctx.effect(() => shell.side({ id: 'rerun', column: 'left', order: 30, render: left }))
}
