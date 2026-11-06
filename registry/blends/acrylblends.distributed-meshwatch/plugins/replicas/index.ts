/** Replica health (`/replicas`): every node's role, status, lag and last heartbeat; a node's row selects it in the inspector. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { escapeHtml } from '../mesh-shell/index.ts'
import { HEALTH_LABEL, heartbeatLabel } from '../meshwatch/index.ts'

export const name = 'replicas'
export const inject = ['router', 'mesh', 'meshShell']

function pageFor(ctx: Context, url: string): string {
  const shell = ctx.meshShell
  const state = ctx.mesh.state
  const rows = state.nodes
    .map((n) => {
      const leader = state.leader === n.id
      const tone = n.health === 'healthy' ? 'ok' : n.health === 'degraded' ? 'warn' : 'bad'
      return `<tr data-node="${escapeHtml(n.id)}"><td><a href="${shell.hrefFor('/replicas', n)}">${escapeHtml(n.id)}</a></td><td>${leader ? 'Leader' : 'Follower'}</td><td class="${tone}">${HEALTH_LABEL[n.health]}</td><td>${n.lagMs === undefined || leader ? '—' : `${String(n.lagMs)} ms`}</td><td>${heartbeatLabel(n, leader)}</td></tr>`
    })
    .join('')
  const main = `<section class="board"><h3>Replica health</h3><div class="scroll"><table class="table"><thead><tr><th scope="col">Node</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col">Lag</th><th scope="col">Last heartbeat</th></tr></thead><tbody>${rows}</tbody></table></div></section>`
  return shell.page({ active: 'replicas', title: 'Replica health', main, url })
}

export function apply(ctx: Context): void {
  const shell = ctx.meshShell
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, new Acryl().get('/replicas', (c) => c.html(pageFor(ctx, c.req.url))))
  ctx.effect(() => shell.tab({ id: 'replicas', label: 'Replica health', path: '/replicas', order: 30 }))
}
