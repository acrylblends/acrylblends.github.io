/**
 * The companion panel (beside the phone): "Home screen modules" switches, the preferences (compact mode, quiet notifications), today's focus and goals,
 * and the quick-note form. Each switch is a form; the device preview changes as soon as the page reloads.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { backTo, escapeHtml, fieldOf, journalErrorOf, withNotice } from '../phone-shell/index.ts'
import { WIDGETS, progressOf } from '../mobiary/index.ts'

export const name = 'widgets'
export const inject = ['router', 'journal', 'phoneShell']

export function apply(ctx: Context): void {
  const shell = ctx.phoneShell
  const journal = ctx.journal
  const render = (url: string): string => {
    const s = journal.state
    const here = new URL(url, 'http://local')
    here.searchParams.delete('ok')
    here.searchParams.delete('error')
    const back = `${here.pathname}${here.search}`
    const toggle = (action: string, on: boolean, label: string, value?: string) =>
      `<form method="post" action="${shell.href(action)}"><input type="hidden" name="back" value="${escapeHtml(back)}"><input type="hidden" name="on" value="${on ? 'off' : 'on'}">${value === undefined ? '' : `<input type="hidden" name="value" value="${value}">`}<button class="switch${on ? ' on' : ''}" type="submit" role="switch" aria-checked="${on ? 'true' : 'false'}" aria-label="${escapeHtml(label)}"></button></form>`
    const modules = WIDGETS.map((w) => `<div class="widget" data-widget="${w.id}"><div><b>${escapeHtml(w.name)}</b><small>${escapeHtml(w.hint)}</small></div>${toggle(`/widgets/${w.id}`, s.widgets[w.id], `Toggle ${w.name.toLowerCase()}`)}</div>`).join('')
    const prefs = `<div class="widget" data-pref="quiet"><div><b>Quiet notifications</b><small>Only reminders you choose</small></div>${toggle('/preferences/quiet', s.preferences.quiet, 'Toggle quiet notifications')}</div><div class="widget" data-pref="compact"><div><b>Compact mode</b><small>Smaller type and spacing</small></div>${toggle('/preferences/compact', s.preferences.compact, 'Toggle compact mode')}</div>`
    const progress = progressOf(s.goals)
    const goals = `<form method="post" action="${shell.href('/focus')}"><input type="hidden" name="back" value="${escapeHtml(back)}"><label class="field">Today’s focus<input name="focus" value="${escapeHtml(s.focus)}" maxlength="60" required></label><label class="field">Small goals (one per line, up to five) · ${String(progress.done)} of ${String(progress.total)} done<textarea name="goals" rows="5">${escapeHtml(s.goals.map((g) => g.text).join('\n'))}</textarea></label><p style="margin-top:8px"><button class="btn" type="submit">Save focus</button></p></form><div class="widget-list" style="margin-top:8px">${s.goals.map((g) => `<div class="widget" data-goal="${escapeHtml(g.id)}"><div><b${g.done ? ' style="text-decoration:line-through;opacity:.7"' : ''}>${escapeHtml(g.text)}</b></div><form method="post" action="${shell.href(`/goals/${encodeURIComponent(g.id)}/toggle`)}"><input type="hidden" name="back" value="${escapeHtml(back)}"><button class="btn ghost" type="submit">${g.done ? 'Undo' : 'Done'}</button></form></div>`).join('')}</div>`
    const note = shell.has('capture') ? `<form class="note-form" id="noteform" method="post" action="${shell.href('/capture')}"><input type="hidden" name="kind" value="note"><input type="hidden" name="back" value="${escapeHtml(back)}"><label class="sr" for="note">Quick note</label><input id="note" name="title" placeholder="Capture a thought…" maxlength="80" required><button type="submit">Add note</button></form>` : ''
    return `<div class="feature-card"><h2>Home screen modules</h2><p>Choose what appears when the app opens.</p><div class="widget-list">${modules}${prefs}</div>${note}</div><div class="feature-card"><h2>Today’s focus</h2><p>One intention and up to five small goals.</p>${goals}</div>`
  }
  const refused = (c: { redirect(url: string, status: 303): Response }, to: string, error: unknown) => {
    const refusal = journalErrorOf(error)
    if (refusal === undefined) throw error
    return c.redirect(withNotice(to, 'error', refusal.message), 303)
  }
  const app = new Acryl()
    .post('/widgets/:id', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      const to = backTo(shell, fieldOf(body, 'back'), shell.href('/'))
      try {
        const on = fieldOf(body, 'on') === 'on'
        await journal.setWidget(c.req.param('id'), on)
        return c.redirect(withNotice(to, 'ok', `${WIDGETS.find((w) => w.id === c.req.param('id'))?.name ?? 'Module'} ${on ? 'added to' : 'removed from'} the home screen.`), 303)
      } catch (error) {
        return refused(c, to, error)
      }
    })
    .post('/preferences/:name', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      const to = backTo(shell, fieldOf(body, 'back'), shell.href('/'))
      const name = c.req.param('name')
      if (name !== 'compact' && name !== 'quiet') return c.redirect(withNotice(to, 'error', 'There is no such preference.'), 303)
      const on = fieldOf(body, 'on') === 'on'
      await journal.setPreference(name, on)
      return c.redirect(withNotice(to, 'ok', `${name === 'quiet' ? 'Quiet notifications' : 'Compact mode'} ${on ? 'on' : 'off'}.`), 303)
    })
    .post('/focus', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      const to = backTo(shell, fieldOf(body, 'back'), shell.href('/'))
      try {
        await journal.setFocus(fieldOf(body, 'focus'), fieldOf(body, 'goals'))
        return c.redirect(withNotice(to, 'ok', 'Today’s focus saved.'), 303)
      } catch (error) {
        return refused(c, to, error)
      }
    })
    .post('/goals/:id/toggle', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      const to = backTo(shell, fieldOf(body, 'back'), shell.href('/'))
      try {
        await journal.toggleGoal(c.req.param('id'))
        return c.redirect(to, 303)
      } catch (error) {
        return refused(c, to, error)
      }
    })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  ctx.effect(() => shell.side({ id: 'widgets', order: 10, render }))
}
