/** Command snippets (right column): saved commands that fill the prompt when clicked; save a new one from the allowlist, delete one. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { COMMANDS } from '../termforge/index.ts'
import { backTo, escapeHtml, fieldOf, forgeErrorOf, withNotice } from '../term-shell/index.ts'

export const name = 'snippets'
export const inject = ['router', 'forge', 'termShell']

export function apply(ctx: Context): void {
  const shell = ctx.termShell
  const forge = ctx.forge
  const render = (sel: ReturnType<typeof shell.selection>): string => {
    const back = shell.hrefFor('/', { ws: sel.workspace.id, tab: sel.tab.id })
    const items = forge.state.snippets
      .map(
        (s) => `<div class="snipline" data-snippet="${escapeHtml(s.label)}"><a class="snippet" href="${shell.hrefFor('/', { ws: sel.workspace.id, tab: sel.tab.id, cmd: s.command })}#command">${escapeHtml(s.label)} <code>${escapeHtml(s.command)}</code></a><form method="post" action="${shell.href(`/snippets/${encodeURIComponent(s.id)}/delete`)}">${shell.hidden(sel)}<button type="submit" aria-label="Delete snippet ${escapeHtml(s.label)}">×</button></form></div>`,
      )
      .join('')
    const options = COMMANDS.filter((c) => c !== 'clear').map((c) => `<option>${escapeHtml(c)}</option>`).join('')
    return `<div class="panel"><h3>Command snippets</h3>${items === '' ? '<div class="hint">No snippets yet.</div>' : items}<form class="mini" method="post" action="${shell.href('/snippets')}">${shell.hidden(sel)}<input type="hidden" name="back" value="${escapeHtml(back)}"><label class="sr" for="snipname">Snippet name</label><input id="snipname" name="label" placeholder="Name" maxlength="30" required><label class="sr" for="snipcmd">Command</label><select id="snipcmd" name="command">${options}</select><button type="submit">Save snippet</button></form></div>`
  }
  const app = new Acryl()
    .post('/snippets', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      const t = shell.target(body)
      const to = backTo(shell, fieldOf(body, 'back'), shell.hrefFor('/', t))
      try {
        const s = await forge.addSnippet(fieldOf(body, 'label'), fieldOf(body, 'command'))
        return c.redirect(withNotice(to, 'ok', `Snippet ${s.label} saved.`), 303)
      } catch (error) {
        const refusal = forgeErrorOf(error)
        if (refusal === undefined) throw error
        return c.redirect(withNotice(to, 'error', refusal.message), 303)
      }
    })
    .post('/snippets/:id/delete', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      const t = shell.target(body)
      const to = shell.hrefFor('/', t)
      try {
        await forge.deleteSnippet(c.req.param('id'))
        return c.redirect(withNotice(to, 'ok', 'Snippet deleted.'), 303)
      } catch (error) {
        const refusal = forgeErrorOf(error)
        if (refusal === undefined) throw error
        return c.redirect(withNotice(to, 'error', refusal.message), 303)
      }
    })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  ctx.effect(() => shell.side({ id: 'snippets', column: 'right', order: 20, render }))
}
