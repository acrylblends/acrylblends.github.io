/**
 * The console, the first page (`/`): the terminal of the selected tab (banner, the commands run and what the simulator answered, the prompt), the tabs,
 * and the routes that run, clear and open or close tabs. Typing runs nothing but the allowlist; ↑ and ↓ recall earlier commands (a small script over
 * the history the page carries; without it the Run button works the same).
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type {} from '../home/index.ts'
import { type Entry, isCommand, promptOf } from '../termforge/index.ts'
import { escapeHtml, fieldOf, forgeErrorOf, withNotice } from '../term-shell/index.ts'

export const name = 'console'
export const inject = ['router', 'forge', 'termShell', 'home']

const tone = (status: number): string => (status === 0 ? 'success' : status === 1 ? 'error' : 'warn')

export function apply(ctx: Context): void {
  const shell = ctx.termShell
  const forge = ctx.forge

  const line = (prompt: string, e: Entry): string =>
    `<div class="line" data-entry="${escapeHtml(e.id)}"><span class="prompt">${escapeHtml(prompt)}</span> <span class="cmd">${escapeHtml(e.command)}</span></div><div class="line ${tone(e.status)}" data-status="${String(e.status)}">${escapeHtml(e.output)}</div>`

  const pageFor = (url: string): string => {
    const sel = shell.selection(url)
    const { workspace: ws, tab } = sel
    const prompt = promptOf(ws)
    const tabs = ws.tabs.map((t, i) => `<a class="tab${t.id === tab.id ? ' on' : ''}" href="${shell.hrefFor('/', { ws: ws.id, tab: t.id })}"${t.id === tab.id ? ' aria-current="page"' : ''}>⌘ ${escapeHtml(t.name)}${ws.tabs.length > 1 ? ` ${String(i + 1)}` : ''}</a>`).join('')
    const banner = tab.cleared
      ? '<div class="line muted">Terminal cleared. Type help to continue.</div>'
      : `<div class="line muted">Termforge shell simulator · type <span class="success">help</span> for available commands.</div><div class="line muted">Demo environment: Node v22.3 · ${escapeHtml(ws.profile)} · safe command allowlist</div><br>`
    const history = tab.entries.map((e) => e.command).filter(isCommand)
    const main = `<section class="terminal" aria-label="Terminal">${shell.notice(url)}<div class="termhead">${tabs}<form method="post" action="${shell.href('/tabs')}">${shell.hidden(sel)}<button type="submit" id="newtab">＋ New tab</button></form><form class="spacer" method="post" action="${shell.href(`/tabs/${encodeURIComponent(tab.id)}/close`)}">${shell.hidden(sel)}<button type="submit" aria-label="Close this tab">✕ Close tab</button></form></div>
<div class="termout" id="out" role="log" aria-live="polite" tabindex="0">${banner}${tab.entries.map((e) => line(prompt, e)).join('')}</div>
<form class="inputrow" id="form" method="post" action="${shell.href('/run')}" data-history="${escapeHtml(JSON.stringify(history))}">${shell.hidden(sel)}<label class="prompt" for="command">❯<span class="sr"> command</span></label><input id="command" name="command" value="${escapeHtml(sel.prefill)}" autocomplete="off" spellcheck="false" placeholder="Enter a safe demo command…" maxlength="200" autofocus><button type="submit">Run ↵</button></form></section>
<script>(function(){var o=document.getElementById('out');o.scrollTop=o.scrollHeight;var f=document.getElementById('form'),i=document.getElementById('command'),h=JSON.parse(f.dataset.history||'[]'),n=h.length;i.addEventListener('keydown',function(e){if(e.key==='ArrowUp'){e.preventDefault();n=Math.max(0,n-1);i.value=h[n]||''}else if(e.key==='ArrowDown'){e.preventDefault();n=Math.min(h.length,n+1);i.value=h[n]||''}})})()</script>`
    return shell.page({ title: ws.name, main, url })
  }

  const refused = (c: { redirect(url: string, status: 303): Response }, to: string, error: unknown) => {
    const refusal = forgeErrorOf(error)
    if (refusal === undefined) throw error
    return c.redirect(withNotice(to, 'error', refusal.message), 303)
  }

  const app = new Acryl()
    .get('/', (c) => c.html(pageFor(c.req.url)))
    .post('/run', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      const t = shell.target(body)
      const to = shell.hrefFor('/', t)
      try {
        const typed = (fieldOf(body, 'command') ?? '').trim()
        if (typed === 'clear') await forge.clear(t.ws, t.tab)
        else await forge.run(t.ws, t.tab, fieldOf(body, 'command'))
        return c.redirect(`${to}#command`, 303)
      } catch (error) {
        return refused(c, `${to}#command`, error)
      }
    })
    .post('/clear', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      const t = shell.target(body)
      const to = shell.hrefFor('/', t)
      try {
        await forge.clear(t.ws, t.tab)
        return c.redirect(withNotice(to, 'ok', 'Terminal cleared.'), 303)
      } catch (error) {
        return refused(c, to, error)
      }
    })
    .post('/tabs', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      const t = shell.target(body)
      try {
        const tab = await forge.addTab(t.ws)
        return c.redirect(withNotice(shell.hrefFor('/', { ws: t.ws, tab: tab.id }), 'ok', 'New tab opened.'), 303)
      } catch (error) {
        return refused(c, shell.hrefFor('/', t), error)
      }
    })
    .post('/tabs/:id/close', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      const t = shell.target(body)
      const to = shell.hrefFor('/', t)
      try {
        await forge.closeTab(t.ws, c.req.param('id'))
        return c.redirect(withNotice(shell.hrefFor('/', { ws: t.ws, tab: forge.workspace(t.ws).tabs[0]?.id ?? '' }), 'ok', 'Tab closed.'), 303)
      } catch (error) {
        return refused(c, to, error)
      }
    })

  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  if (shell.prefix !== '') ctx.router.route('/', new Acryl().get(`${shell.prefix}/`, (c) => c.html(pageFor(c.req.url))))
  ctx.effect(() =>
    ctx.home.widget({
      id: 'console',
      title: 'Terminal',
      render: () => `<p><b>${String(forge.state.workspaces.length)}</b> workspaces · ${String(forge.state.workspaces.reduce((n, w) => n + w.tabs.reduce((m, t) => m + t.entries.length, 0), 0))} commands run</p>`,
    }),
  )
}
