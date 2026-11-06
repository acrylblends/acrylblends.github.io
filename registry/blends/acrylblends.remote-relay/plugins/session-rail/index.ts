/** Session details (right column): the selected session's id, start, identity, fingerprint and idle timeout; recent sessions; the security note. */
import type { Context } from '@deepseek-ai/cordis'
import { escapeHtml } from '../relay-shell/index.ts'
import { IDLE_MINUTES, clockOf, whenLabel } from '../relay/index.ts'

export const name = 'session-rail'
export const inject = ['router', 'relay', 'relayShell']

export function apply(ctx: Context): void {
  const shell = ctx.relayShell
  const relay = ctx.relay
  const render = (selection: ReturnType<typeof shell.selection>): string => {
    const s = selection.session
    const now = relay.now()
    const details =
      s === undefined
        ? '<div class="row"><b>No session yet</b><span>Press New session to open one.</span></div>'
        : `<div class="row"><b>Session #${escapeHtml(s.id)}</b><span>Started ${clockOf(s.startedAt)}</span></div>
<div class="row"><b>Identity</b><span>${escapeHtml(selection.profile.user)} · sample profile</span></div>
<div class="row"><b>Host fingerprint</b><span>SHA256:demo-only</span></div>
<div class="row"><b>Idle timeout</b><span>${String(IDLE_MINUTES)} minutes</span></div>`
    const recent = relay
      .sessions()
      .slice(0, 3)
      .map((r) => {
        const profile = relay.state.profiles.find((p) => p.id === r.profileId)
        const status = relay.status(r)
        return `<div class="row"><b>${escapeHtml(profile?.name ?? r.profileId)}</b><span>${escapeHtml(whenLabel(r.startedAt, now))} · ${status === 'active' ? 'Active' : status === 'expired' ? 'Timed out' : 'Closed'}</span></div>`
      })
      .join('')
    const close =
      s !== undefined && relay.status(s) === 'active' && shell.has('terminal')
        ? `<form method="post" action="${shell.href(`/sessions/${encodeURIComponent(s.id)}/close`)}" style="margin-top:12px"><input type="hidden" name="profile" value="${escapeHtml(selection.profile.id)}"><button class="smallbtn" id="closeSession" type="submit">Close session</button></form>`
        : ''
    return `<div class="label">Session details</div>${details}${close}<div class="label" style="margin-top:25px">Recent sessions</div>${recent}<div class="label" style="margin-top:25px">Security</div><p class="muted" style="font-size:9px">Demo mode. No credentials are stored and no remote server is contacted.</p>`
  }
  ctx.effect(() => shell.side({ id: 'session-rail', column: 'right', order: 10, render }))
}
