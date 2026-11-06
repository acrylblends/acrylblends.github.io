/** Session audit (`/audit`): the selected session's event log (opened, profile selected, every command with its exit, transfers, closed) and the connection's details. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { escapeHtml } from '../relay-shell/index.ts'
import { clockOf, whenLabel } from '../relay/index.ts'

export const name = 'audit'
export const inject = ['router', 'relay', 'relayShell']

function pageFor(ctx: Context, url: string): string {
  const shell = ctx.relayShell
  const relay = ctx.relay
  const sel = shell.selection(url)
  const session = sel.session
  const events = session === undefined ? [] : [...relay.audit(session.id)]
  const lines = events
    .map((e) => `<div class="audit">${clockOf(e.at)} · ${escapeHtml(e.text)}${e.result === undefined ? '' : ` <span class="${e.result === 'Denied' ? 'badge bad' : 'badge'}">${escapeHtml(e.result)}</span>`}</div>`)
    .join('')
  const others = relay
    .sessions()
    .filter((s) => s.profileId === sel.profile.id)
    .map((s) => `<div class="row"><span>${escapeHtml(s.id)} · ${escapeHtml(whenLabel(s.startedAt, relay.now()))}</span><b class="${relay.status(s) === 'active' ? 'badge' : 'status'}">${relay.status(s) === 'active' ? 'Active' : relay.status(s) === 'expired' ? 'Timed out' : 'Closed'}</b></div>`)
    .join('')
  const p = sel.profile
  const main = `<div class="card"><h3>Session event log${session === undefined ? '' : ` · ${escapeHtml(session.id)}`}</h3>${lines === '' ? '<div class="empty">No events yet. Open a session first.</div>' : lines}</div>
<div class="card"><h3>Connection detail</h3><div class="row"><span>Profile</span><b>${escapeHtml(p.name)}</b></div><div class="row"><span>Target</span><b>${escapeHtml(p.user)}@${escapeHtml(p.host)}:${String(p.port)}</b></div><div class="row"><span>Sessions on this connection</span><b>${String(relay.sessions().filter((s) => s.profileId === p.id).length)}</b></div>${others}</div>`
  return shell.page({ active: 'audit', title: 'Session audit', main, url })
}

export function apply(ctx: Context): void {
  const shell = ctx.relayShell
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, new Acryl().get('/audit', (c) => c.html(pageFor(ctx, c.req.url))))
  ctx.effect(() => shell.tab({ id: 'audit', label: 'Session audit', path: '/audit', order: 30 }))
}
