/** Activity (`/activity`): every saved moment, newest first, filterable by kind (`?kind=`), each with a delete. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { backTo, escapeHtml, fieldOf, journalErrorOf, withNotice } from '../phone-shell/index.ts'
import { KIND_ICON, KIND_WORD, type EntryKind, subtitleOf } from '../mobiary/index.ts'

export const name = 'activity'
export const inject = ['router', 'journal', 'phoneShell']

function screenFor(ctx: Context, url: string): string {
  const shell = ctx.phoneShell
  const journal = ctx.journal
  const asked = new URL(url, 'http://local').searchParams.get('kind')
  const kind = (['note', 'voice', 'photo'] as const).find((k) => k === asked)
  const now = journal.now()
  const back = kind === undefined ? shell.href('/activity') : shell.href(`/activity?kind=${kind}`)
  const rows = journal
    .entries(kind)
    .map((e) => `<div class="entry" data-entry="${escapeHtml(e.id)}"><div class="dot${e.kind === 'voice' ? ' voice' : e.kind === 'photo' ? ' photo' : e.title.toLowerCase().includes('walk') ? ' walk' : ''}" aria-hidden="true">${KIND_ICON[e.kind]}</div><div><b>${escapeHtml(e.title)}</b><small>${escapeHtml(subtitleOf(e, now))}</small></div><form method="post" action="${shell.href(`/activity/${encodeURIComponent(e.id)}/delete`)}"><input type="hidden" name="back" value="${back}"><button type="submit" aria-label="Delete ${escapeHtml(e.title)}">×</button></form></div>`)
    .join('')
  const chips = [`<a href="${shell.href('/activity')}"${kind === undefined ? ' class="on"' : ''}>All</a>`, ...(['note', 'voice', 'photo'] as const).map((k) => `<a href="${shell.href(`/activity?kind=${k}`)}"${k === kind ? ' class="on"' : ''} data-kind="${k}">${KIND_WORD[k]}s</a>`)].join('')
  const body = `<section id="screen-activity"><div class="hello"><small>YOUR JOURNAL</small><h1>Little moments.</h1></div><div class="chips">${chips}</div>${rows === '' ? '<div class="entry"><div><b>Nothing here yet.</b><small>Capture a moment from Home.</small></div></div>' : rows}</section>`
  return shell.screen({ active: 'activity', title: 'Activity', body, url })
}

export function apply(ctx: Context): void {
  const shell = ctx.phoneShell
  const app = new Acryl().get('/activity', (c) => c.html(screenFor(ctx, c.req.url))).post('/activity/:id/delete', async (c) => {
    const body = (await c.req.parseBody()) as Record<string, unknown>
    const to = backTo(shell, fieldOf(body, 'back'), shell.href('/activity'))
    try {
      await ctx.journal.deleteEntry(c.req.param('id'))
      return c.redirect(withNotice(to, 'ok', 'Moment deleted.'), 303)
    } catch (error) {
      const refusal = journalErrorOf(error)
      if (refusal === undefined) throw error
      return c.redirect(withNotice(to, 'error', refusal.message), 303)
    }
  })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  ctx.effect(() => shell.tab({ id: 'activity', label: 'Activity', icon: '▤', path: '/activity', order: 20 }))
}
