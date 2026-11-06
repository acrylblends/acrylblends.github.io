/** Terminology and translation memory (right column): the glossary for the open locale, each term insertable into the selected segment, and the best translation-memory suggestion for it. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { escapeHtml, fieldOf, deskErrorOf, withNotice } from '../desk-shell/index.ts'

export const name = 'glossary'
export const inject = ['router', 'desk', 'deskShell']

export function apply(ctx: Context): void {
  const shell = ctx.deskShell
  const desk = ctx.desk
  const render = (sel: ReturnType<typeof shell.selection>): string => {
    const seg = sel.key === undefined ? undefined : desk.segment(sel.key, sel.locale.id)
    const locked = seg === undefined || seg.state === 'approved'
    const base = sel.key === undefined ? '' : `/segments/${encodeURIComponent(sel.key)}`
    const terms = desk.state.glossary
      .filter((g) => g.translations[sel.locale.id] !== undefined)
      .map(
        (g) => `<div class="term" data-term="${escapeHtml(g.term)}"><div><b>${escapeHtml(g.term)}</b><small>${escapeHtml(g.translations[sel.locale.id] ?? '')} · ${escapeHtml(g.pos)}</small></div>${locked ? '' : `<form method="post" action="${shell.href(`${base}/term`)}">${shell.hidden(sel, sel.key)}<input type="hidden" name="term" value="${escapeHtml(g.id)}"><button class="btn small" type="submit" aria-label="Insert ${escapeHtml(g.term)}">Insert</button></form>`}</div>`,
      )
      .join('')
    const sug = sel.key === undefined ? undefined : desk.suggestion(sel.key, sel.locale.id)
    const suggestion =
      sug === undefined
        ? '<p style="margin-top:7px">No translation-memory match for the selected string.</p>'
        : locked
          ? `<p style="margin-top:7px">The selected string is approved: reopen it to use a suggestion.</p>`
          : `<form method="post" action="${shell.href(`${base}/suggestion`)}">${shell.hidden(sel, sel.key)}<button class="suggest" id="suggest" type="submit">↳ Insert suggestion<b>${escapeHtml(sug.entry.target)}</b>${String(sug.percent)}% match · ${escapeHtml(sug.entry.context)}</button></form>`
    return `<h3>Terminology</h3><p>Approved terms for consistent product language.</p>${terms === '' ? '<p>No terms for this locale yet.</p>' : terms}<div class="cap" style="margin-top:25px">Translation memory</div>${suggestion}`
  }
  const respond = async (c: { redirect(url: string, status: 303): Response }, back: string, work: () => Promise<string>) => {
    try {
      return c.redirect(withNotice(back, 'ok', await work()), 303)
    } catch (error) {
      const refusal = deskErrorOf(error)
      if (refusal === undefined) throw error
      return c.redirect(withNotice(back, 'error', refusal.message), 303)
    }
  }
  const app = new Acryl()
    .post('/segments/:key/term', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      const key = c.req.param('key')
      const locale = shell.selection(`/?locale=${encodeURIComponent(fieldOf(body, 'locale') ?? '')}`).locale.id
      return respond(c, shell.backFor(body, key), async () => {
        await desk.insertTerm(key, locale, fieldOf(body, 'term') ?? '')
        return `Term inserted into ${key}; it needs review.`
      })
    })
    .post('/segments/:key/suggestion', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      const key = c.req.param('key')
      const locale = shell.selection(`/?locale=${encodeURIComponent(fieldOf(body, 'locale') ?? '')}`).locale.id
      return respond(c, shell.backFor(body, key), async () => {
        const r = await desk.insertSuggestion(key, locale)
        return `Translation-memory suggestion inserted (${String(r.percent)}% match); it needs review.`
      })
    })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  ctx.effect(() => shell.side({ id: 'glossary', column: 'right', order: 10, render }))
}
