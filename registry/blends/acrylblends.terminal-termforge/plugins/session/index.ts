/** Session status (right column): the overview (host, shell, working directory, exit status), recent commands to recall, and the keyboard notes with Clear. */
import type { Context } from '@deepseek-ai/cordis'
import { lastStatus, recentCommands } from '../termforge/index.ts'
import { escapeHtml } from '../term-shell/index.ts'

export const name = 'session'
export const inject = ['forge', 'termShell']

export function apply(ctx: Context): void {
  const shell = ctx.termShell
  const overview = (sel: ReturnType<typeof shell.selection>): string => {
    const ws = sel.workspace
    return `<div class="panel"><h3>Session overview</h3><div class="metric"><span>Host profile</span><b>${escapeHtml(ws.profile)}</b></div><div class="metric"><span>Shell</span><b>zsh · simulated</b></div><div class="metric"><span>Working dir</span><b>${escapeHtml(ws.cwd)}</b></div><div class="metric"><span>Exit status</span><b id="exit">${String(lastStatus(sel.tab))}</b></div></div>`
  }
  const notes = (sel: ReturnType<typeof shell.selection>): string => {
    const recent = recentCommands(sel.workspace)
    const links = recent.map((c) => `<a href="${shell.hrefFor('/', { ws: sel.workspace.id, tab: sel.tab.id, cmd: c })}#command">${escapeHtml(c)}</a>`).join('')
    return `<div class="panel"><h3>Recent commands</h3>${links === '' ? '<div class="hint">Nothing run yet.</div>' : `<div class="recent" id="recent">${links}</div>`}</div><div class="panel"><h3>Keyboard notes</h3><div class="hint">Enter runs a command.<br>↑ recalls the previous command.<br>Tab is reserved for future completion.<br><br>Unknown commands are rejected and never executed.</div><form method="post" action="${shell.href('/clear')}">${shell.hidden(sel)}<button class="shortcut" id="clear" type="submit" style="margin-top:11px;text-align:center">Clear terminal</button></form></div>`
  }
  ctx.effect(() => shell.side({ id: 'session', column: 'right', order: 10, render: overview }))
  ctx.effect(() => shell.side({ id: 'notes', column: 'right', order: 30, render: notes }))
}
