/** Home, the first screen (`/`): the greeting, the daily focus with its progress, the quick-capture buttons and the recent moments; each part shows only while its module is on. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type {} from '../home/index.ts'
import { escapeHtml } from '../phone-shell/index.ts'
import { KIND_ICON, KIND_WORD, type EntryKind, dateLabel, greeting, progressOf, subtitleOf } from '../mobiary/index.ts'

export const name = 'today'
export const inject = ['router', 'journal', 'phoneShell', 'home']

function screenFor(ctx: Context, url: string): string {
  const shell = ctx.phoneShell
  const journal = ctx.journal
  const s = journal.state
  const now = journal.now()
  const progress = progressOf(s.goals)
  const dot = (kind: EntryKind, title: string) => `<div class="dot${kind === 'voice' ? ' voice' : kind === 'photo' ? ' photo' : title.toLowerCase().includes('walk') ? ' walk' : ''}" aria-hidden="true">${KIND_ICON[kind]}</div>`
  const recent = journal
    .entries()
    .slice(0, 3)
    .map((e) => `<div class="entry" data-entry="${escapeHtml(e.id)}">${dot(e.kind, e.title)}<div><b>${escapeHtml(e.title)}</b><small>${escapeHtml(subtitleOf(e, now))}</small></div></div>`)
    .join('')
  const focus = s.widgets.focus
    ? `<div class="focus" id="focus"><small>TODAY'S FOCUS</small><strong>${escapeHtml(s.focus)}</strong><small>${String(progress.done)} of ${String(progress.total)} small goals completed</small><div class="progress" role="progressbar" aria-valuenow="${String(progress.percent)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${String(progress.percent)}%"></span></div></div>`
    : ''
  const quick = s.widgets.quick && ctx.phoneShell.has('capture')
    ? `<div class="quick">${(['note', 'voice', 'photo'] as const).map((k) => `<a href="${shell.href(`/capture?kind=${k}`)}" data-capture="${k}"><em aria-hidden="true">${KIND_ICON[k]}</em>${KIND_WORD[k]}</a>`).join('')}</div>`
    : ''
  const moments = s.widgets.moments
    ? `<div class="section"><b>Recent moments</b>${shell.has('activity') ? `<a href="${shell.href('/activity')}"><small>See all</small></a>` : ''}</div><div id="entries">${recent === '' ? '<div class="entry"><div><small>Nothing saved yet.</small></div></div>' : recent}</div>`
    : ''
  const body = `<section id="screen-home"><div class="hello"><small>${escapeHtml(dateLabel(now))}</small><h1>${greeting(now)},<br>${escapeHtml(s.name)}.</h1></div>${focus}${quick}${moments}</section>`
  return shell.screen({ active: 'home', title: 'Home', body, url })
}

export function apply(ctx: Context): void {
  const shell = ctx.phoneShell
  const app = new Acryl().get('/', (c) => c.html(screenFor(ctx, c.req.url)))
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  if (shell.prefix !== '') ctx.router.route('/', new Acryl().get(`${shell.prefix}/`, (c) => c.html(screenFor(ctx, c.req.url))))
  ctx.effect(() => shell.tab({ id: 'home', label: 'Home', icon: '⌂', path: '/', order: 10 }))
  ctx.effect(() =>
    ctx.home.widget({
      id: 'today',
      title: 'Journal',
      render: () => `<p><b>${String(ctx.journal.state.entries.length)}</b> moments · ${escapeHtml(ctx.journal.state.focus)}</p>`,
    }),
  )
}
