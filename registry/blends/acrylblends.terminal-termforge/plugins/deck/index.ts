/** Command deck (rail): shortcut buttons that put a command in the prompt (`?cmd=`); the person reads it and presses Run. */
import type { Context } from '@deepseek-ai/cordis'
import { DECK } from '../termforge/index.ts'
import { escapeHtml } from '../term-shell/index.ts'

export const name = 'deck'
export const inject = ['forge', 'termShell']

export function apply(ctx: Context): void {
  const shell = ctx.termShell
  const render = (sel: ReturnType<typeof shell.selection>): string => {
    const items = DECK.map((d) => `<a class="shortcut" data-command="${escapeHtml(d.command)}" href="${shell.hrefFor('/', { ws: sel.workspace.id, tab: sel.tab.id, cmd: d.command })}#command">${escapeHtml(d.label)} <kbd>${escapeHtml(d.keys)}</kbd></a>`).join('')
    return `<div class="tag">Command deck</div><div class="shortcuts">${items}</div>`
  }
  ctx.effect(() => shell.side({ id: 'deck', column: 'left', order: 20, render }))
}
