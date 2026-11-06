/**
 * QA and approval (top bar and right column): "Run QA" records the four checks for the open locale, the panel shows the last recorded run (flagged
 * stale once a segment changed after it), and "Approve locale" is refused until QA passes.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type { Level } from '../lingodesk/index.ts'
import { escapeHtml, fieldOf, deskErrorOf, withNotice } from '../desk-shell/index.ts'

export const name = 'qa'
export const inject = ['router', 'desk', 'deskShell']

export function apply(ctx: Context): void {
  const shell = ctx.deskShell
  const desk = ctx.desk

  const top = (sel: ReturnType<typeof shell.selection>): string =>
    `<form method="post" action="${shell.href('/qa')}">${shell.hidden(sel, sel.key)}<button class="btn" id="qa" type="submit">Run QA</button></form><form method="post" action="${shell.href('/approve-locale')}">${shell.hidden(sel, sel.key)}<button class="btn primary" id="approve" type="submit">Approve locale</button></form>`

  const label = (level: Level, count: number): string =>
    level === 'pass' ? '✓ pass' : level === 'na' ? '—' : `${String(count)} ${level === 'error' ? (count === 1 ? 'error' : 'errors') : count === 1 ? 'warning' : 'warnings'}`

  const render = (sel: ReturnType<typeof shell.selection>): string => {
    const run = desk.qaRun(sel.locale.id)
    if (run === undefined) return `<div class="qa"><h3>QA checks</h3><p>QA has not been run for this locale.</p></div>`
    const rows = run.checks.map((c) => `<div class="row" data-check="${c.id}">${escapeHtml(c.label)} <b class="${c.level}">${label(c.level, c.issues.length)}</b></div>`).join('')
    const issues = run.checks.flatMap((c) => c.issues).slice(0, 6)
    return `<div class="qa"><h3>QA checks</h3>${rows}${issues.length === 0 ? '' : `<ul class="issues" id="issues">${issues.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`}${desk.qaStale(sel.locale.id) ? '<div class="stale" id="stale">Strings changed since this run. Run QA again.</div>' : ''}</div>`
  }

  const go = async (c: { redirect(url: string, status: 303): Response }, back: string, work: () => Promise<string>) => {
    try {
      return c.redirect(withNotice(back, 'ok', await work()), 303)
    } catch (error) {
      const refusal = deskErrorOf(error)
      if (refusal === undefined) throw error
      return c.redirect(withNotice(back, 'error', refusal.message), 303)
    }
  }
  const app = new Acryl()
    .post('/qa', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      const locale = shell.selection(`/?locale=${encodeURIComponent(fieldOf(body, 'locale') ?? '')}`).locale
      return go(c, shell.backFor(body), async () => {
        const run = await desk.runQa(locale.id)
        const n = run.checks.reduce((sum, ch) => sum + ch.issues.length, 0)
        return `QA complete for ${locale.id} · ${String(n)} issue${n === 1 ? '' : 's'} found.`
      })
    })
    .post('/approve-locale', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      const locale = shell.selection(`/?locale=${encodeURIComponent(fieldOf(body, 'locale') ?? '')}`).locale
      return go(c, shell.backFor(body), async () => {
        const n = await desk.approveLocale(locale.id)
        return `${locale.name} approved: ${String(n)} string${n === 1 ? '' : 's'} moved from review to approved (simulated; nothing was published).`
      })
    })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  ctx.effect(() => shell.side({ id: 'qa-top', column: 'top', order: 10, render: top }))
  ctx.effect(() => shell.side({ id: 'qa', column: 'right', order: 20, render }))
}
