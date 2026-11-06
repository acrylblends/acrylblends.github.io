/** Consensus log (`/consensus`): the append-only Raft commit log, newest first, with index, term, origin, event and whether it committed. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { escapeHtml } from '../mesh-shell/index.ts'
import type {} from '../meshwatch/index.ts'

export const name = 'consensus'
export const inject = ['router', 'mesh', 'meshShell']

function pageFor(ctx: Context, url: string): string {
  const shell = ctx.meshShell
  const rows = ctx.mesh
    .log()
    .map((e) => `<tr data-index="${String(e.index)}"><td>${String(e.index)}</td><td>${String(e.term)}</td><td>${escapeHtml(e.origin)}</td><td>${escapeHtml(e.text)}</td><td class="${e.committed ? 'ok' : 'warn'}">${e.committed ? 'Committed' : 'Uncommitted'}</td></tr>`)
    .join('')
  const main = `<section class="board"><h3>Raft commit log</h3><div class="scroll"><table class="table"><thead><tr><th scope="col">Index</th><th scope="col">Term</th><th scope="col">Origin</th><th scope="col">Event</th><th scope="col">Commit</th></tr></thead><tbody id="logRows">${rows}</tbody></table></div></section>`
  return shell.page({ active: 'consensus', title: 'Consensus log', main, url })
}

export function apply(ctx: Context): void {
  const shell = ctx.meshShell
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, new Acryl().get('/consensus', (c) => c.html(pageFor(ctx, c.req.url))))
  ctx.effect(() => shell.tab({ id: 'consensus', label: 'Consensus log', path: '/consensus', order: 20 }))
}
