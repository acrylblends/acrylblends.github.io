/** Profile (`/profile`): the person, the quiet-hours window (editable), and what the notification preference currently means. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { escapeHtml, fieldOf, journalErrorOf, withNotice } from '../phone-shell/index.ts'
import type {} from '../mobiary/index.ts'

export const name = 'profile'
export const inject = ['router', 'journal', 'phoneShell']

function screenFor(ctx: Context, url: string): string {
  const shell = ctx.phoneShell
  const s = ctx.journal.state
  const p = s.preferences
  const body = `<section id="screen-profile"><div class="hello"><small>YOUR SPACE</small><h1>Made for you.</h1></div>
<div class="entry"><div class="avatar" aria-hidden="true">${escapeHtml(s.name.charAt(0).toUpperCase())}</div><div><b>${escapeHtml(s.name)}</b><small>Personal workspace</small></div></div>
<div class="entry"><div aria-hidden="true">☼</div><div><b>Quiet hours</b><small id="quiet-hours">${escapeHtml(p.quietFrom)} – ${escapeHtml(p.quietTo)}</small></div></div>
<div class="entry"><div aria-hidden="true">◔</div><div><b>Notifications</b><small id="notifications">${p.quiet ? 'Quiet · only reminders you choose' : 'All reminders'}</small></div></div>
<div class="entry"><div aria-hidden="true">▦</div><div><b>Layout</b><small>${p.compact ? 'Compact' : 'Comfortable'}</small></div></div>
<form class="capture" method="post" action="${shell.href('/profile/quiet-hours')}" style="margin-top:8px"><div class="kinds" style="grid-template-columns:1fr 1fr"><label class="sr" for="from">From</label><input id="from" name="from" type="time" value="${escapeHtml(p.quietFrom)}" required><label class="sr" for="to">To</label><input id="to" name="to" type="time" value="${escapeHtml(p.quietTo)}" required></div><button class="save" type="submit">Save quiet hours</button></form></section>`
  return shell.screen({ active: 'profile', title: 'Profile', body, url })
}

export function apply(ctx: Context): void {
  const shell = ctx.phoneShell
  const app = new Acryl().get('/profile', (c) => c.html(screenFor(ctx, c.req.url))).post('/profile/quiet-hours', async (c) => {
    const body = (await c.req.parseBody()) as Record<string, unknown>
    try {
      await ctx.journal.setQuietHours(fieldOf(body, 'from'), fieldOf(body, 'to'))
      return c.redirect(withNotice(shell.href('/profile'), 'ok', 'Quiet hours saved.'), 303)
    } catch (error) {
      const refusal = journalErrorOf(error)
      if (refusal === undefined) throw error
      return c.redirect(withNotice(shell.href('/profile'), 'error', refusal.message), 303)
    }
  })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  ctx.effect(() => shell.tab({ id: 'profile', label: 'Profile', icon: '◉', path: '/profile', order: 30 }))
}
