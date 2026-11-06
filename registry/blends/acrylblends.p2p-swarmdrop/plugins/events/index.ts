/** Transfer events (main column): the room's recent events, newest last. */
import type { Context } from '@deepseek-ai/cordis'
import { escapeHtml } from '../swarm-shell/index.ts'

export const name = 'events'
export const inject = ['swarm', 'swarmShell']

export function apply(ctx: Context): void {
  const shell = ctx.swarmShell
  const render = (sel: ReturnType<typeof shell.selection>): string => {
    const lines = sel.room.events.map((e) => `<div>${escapeHtml(e.t)} <span class="${e.kind === 'info' ? '' : e.kind}">${escapeHtml(e.text)}</span></div>`).join('')
    return `<section class="panel"><h2>Transfer events</h2><div class="events" id="events" role="log">${lines === '' ? '<div>No events yet.</div>' : lines}</div></section>`
  }
  ctx.effect(() => shell.side({ id: 'events', column: 'main', order: 20, render }))
}
