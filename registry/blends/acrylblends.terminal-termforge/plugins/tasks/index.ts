/** Task launcher (rail): build, test and deploy routines. A routine runs its allowed commands in order in the current tab and stops at the first failure. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { TASKS } from '../termforge/index.ts'
import { backTo, escapeHtml, fieldOf, forgeErrorOf, withNotice } from '../term-shell/index.ts'

export const name = 'tasks'
export const inject = ['router', 'forge', 'termShell']

export function apply(ctx: Context): void {
  const shell = ctx.termShell
  const forge = ctx.forge
  const render = (sel: ReturnType<typeof shell.selection>): string => {
    const back = shell.hrefFor('/', { ws: sel.workspace.id, tab: sel.tab.id })
    const items = TASKS.map(
      (t) => `<form method="post" action="${shell.href(`/tasks/${t.id}/run`)}">${shell.hidden(sel)}<input type="hidden" name="back" value="${escapeHtml(back)}"><button class="shortcut" type="submit" data-task="${escapeHtml(t.id)}">▶ ${escapeHtml(t.name)}<small>${escapeHtml(t.about)}</small></button></form>`,
    ).join('')
    return `<div class="tag">Task launcher</div><div class="shortcuts">${items}</div>`
  }
  const app = new Acryl().post('/tasks/:id/run', async (c) => {
    const body = (await c.req.parseBody()) as Record<string, unknown>
    const t = shell.target(body)
    const to = backTo(shell, fieldOf(body, 'back'), shell.hrefFor('/', { ws: t.ws, tab: t.tab }))
    try {
      const task = forge.task(c.req.param('id'))
      const ran = await forge.runTask(t.ws, t.tab, task.id)
      const failed = ran.find((e) => e.status !== 0)
      return c.redirect(withNotice(to, failed === undefined ? 'ok' : 'error', failed === undefined ? `${task.name} finished: ${String(ran.length)} ${ran.length === 1 ? 'step' : 'steps'} passed.` : `${task.name} stopped at “${failed.command}” (exit ${String(failed.status)}).`), 303)
    } catch (error) {
      const refusal = forgeErrorOf(error)
      if (refusal === undefined) throw error
      return c.redirect(withNotice(to, 'error', refusal.message), 303)
    }
  })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  ctx.effect(() => shell.side({ id: 'tasks', column: 'left', order: 30, render }))
}
