/** Workspaces (rail): the sessions to switch between; the current one is highlighted. */
import type { Context } from '@deepseek-ai/cordis'
import { escapeHtml } from '../term-shell/index.ts'
import type {} from '../termforge/index.ts'

export const name = 'workspaces'
export const inject = ['forge', 'termShell']

export function apply(ctx: Context): void {
  const shell = ctx.termShell
  const render = (sel: ReturnType<typeof shell.selection>): string => {
    const items = ctx.forge.state.workspaces
      .map((w) => {
        const on = w.id === sel.workspace.id
        return `<a class="session${on ? ' active' : ''}" data-workspace="${escapeHtml(w.id)}" href="${shell.hrefFor('/', { ws: w.id, tab: w.tabs[0]?.id ?? '' })}"${on ? ' aria-current="page"' : ''}>${on ? '▸' : '▹'} &nbsp;${escapeHtml(w.name)}</a>`
      })
      .join('')
    return `<div class="tag">Workspaces</div><nav aria-label="Workspaces">${items}</nav>`
  }
  ctx.effect(() => shell.side({ id: 'workspaces', column: 'left', order: 10, render }))
}
