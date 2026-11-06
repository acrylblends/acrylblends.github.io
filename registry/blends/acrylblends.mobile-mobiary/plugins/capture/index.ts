/**
 * Capture (`/capture`): a note, or a voice-memo or photo placeholder, with a short description; saving puts it at the top of the activity list. The
 * quick-capture buttons on Home open this screen with the kind chosen (`?kind=`).
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { backTo, escapeHtml, fieldOf, journalErrorOf, withNotice } from '../phone-shell/index.ts'
import { KIND_ICON, KIND_WORD, type EntryKind, MAX_TITLE } from '../mobiary/index.ts'

export const name = 'capture'
export const inject = ['router', 'journal', 'phoneShell']

function screenFor(ctx: Context, url: string): string {
  const shell = ctx.phoneShell
  const query = new URL(url, 'http://local').searchParams
  const kind: EntryKind = (['note', 'voice', 'photo'] as const).find((k) => k === query.get('kind')) ?? 'note'
  const kinds = (['note', 'voice', 'photo'] as const).map((k) => `<a href="${shell.href(`/capture?kind=${k}`)}"${k === kind ? ' class="on" aria-current="true"' : ''} data-kind="${k}"><em aria-hidden="true">${KIND_ICON[k]}</em>${KIND_WORD[k]}</a>`).join('')
  const placeholder = kind === 'voice' ? '<div class="placeholder">◖ 0:12 · voice memo placeholder<br>Nothing is recorded in this prototype.</div>' : kind === 'photo' ? '<div class="placeholder">▧ photo placeholder<br>No camera is used in this prototype.</div>' : ''
  const body = `<section id="screen-capture"><div class="hello"><small>NEW MOMENT</small><h1>${kind === 'note' ? 'Write it down.' : kind === 'voice' ? 'Say it out loud.' : 'Keep the view.'}</h1></div><form class="capture" method="post" action="${shell.href('/capture')}"><input type="hidden" name="kind" value="${kind}"><div class="kinds">${kinds}</div>${placeholder}<label class="sr" for="title">Description</label><textarea id="title" name="title" maxlength="${String(MAX_TITLE)}" placeholder="${kind === 'note' ? 'Capture a thought…' : 'A few words about it…'}" required autofocus>${escapeHtml(query.get('title') ?? '')}</textarea><button class="save" type="submit">Save moment</button></form></section>`
  return shell.screen({ title: 'Capture', body, url })
}

export function apply(ctx: Context): void {
  const shell = ctx.phoneShell
  const journal = ctx.journal
  const app = new Acryl().get('/capture', (c) => c.html(screenFor(ctx, c.req.url))).post('/capture', async (c) => {
    const body = (await c.req.parseBody()) as Record<string, unknown>
    const kind = fieldOf(body, 'kind')
    const to = backTo(shell, fieldOf(body, 'back'), shell.has('activity') ? shell.href('/activity') : shell.href('/'))
    try {
      const entry = await journal.capture(kind, fieldOf(body, 'title'))
      return c.redirect(withNotice(to, 'ok', `Saved to your demo journal: ${entry.title}`), 303)
    } catch (error) {
      const refusal = journalErrorOf(error)
      if (refusal === undefined) throw error
      return c.redirect(withNotice(`${shell.href('/capture')}?kind=${encodeURIComponent(kind ?? 'note')}&title=${encodeURIComponent(fieldOf(body, 'title') ?? '')}`, 'error', refusal.message), 303)
    }
  })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  ctx.effect(() => shell.side({ id: 'capture', order: 90, render: () => '' }))
}
