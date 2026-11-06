/** Topology map, the first page (`/`): the five nodes and their links on a map, the leader highlighted, degraded nodes in yellow, down nodes dashed; click a node to inspect it. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type {} from '../home/index.ts'
import { escapeHtml } from '../mesh-shell/index.ts'
import { EDGES, type MeshNode, upNodes } from '../meshwatch/index.ts'

export const name = 'topology'
export const inject = ['router', 'mesh', 'meshShell', 'home']

function pageFor(ctx: Context, url: string): string {
  const shell = ctx.meshShell
  const state = ctx.mesh.state
  const selected = shell.selected(url)
  const byId = new Map(state.nodes.map((n) => [n.id, n]))
  const edges = EDGES.map(([a, b]) => {
    const from = byId.get(a)
    const to = byId.get(b)
    if (from === undefined || to === undefined) return ''
    const cut = from.health === 'down' || to.health === 'down'
    return `<path class="edge${cut ? ' cut' : ''}" d="M${String(from.x)} ${String(from.y)}L${String(to.x)} ${String(to.y)}"/>`
  }).join('')
  const nodes = state.nodes
    .map((n: MeshNode) => {
      const leader = state.leader === n.id
      const r = leader ? 37 : 31
      const cls = ['node', leader ? 'leader' : '', n.health === 'degraded' ? 'warn' : '', n.health === 'down' ? 'down' : '', n.id === selected.id ? 'selected' : ''].filter((x) => x !== '').join(' ')
      return `<a href="${shell.hrefFor('/', n)}" aria-label="${escapeHtml(n.id)}, ${leader ? 'leader' : 'follower'}, ${n.health}"><g class="${cls}" data-node="${escapeHtml(n.id)}"><circle cx="${String(n.x)}" cy="${String(n.y)}" r="${String(r)}"/><text x="${String(n.x)}" y="${String(n.y - 3)}">${escapeHtml(n.id)}</text><text class="role" x="${String(n.x)}" y="${String(n.y + 13)}">${n.health === 'down' ? 'DOWN' : leader ? 'LEADER' : 'FOLLOWER'}</text></g></a>`
    })
    .join('')
  const up = upNodes(state.nodes)
  const main = `<section class="board"><div class="boardhead"><h3>Node topology · sample state</h3><span class="badge${up < state.nodes.length ? ' bad' : ''}">${String(up)} connected</span></div>
<svg class="topology" viewBox="0 0 800 370" role="group" aria-label="Cluster topology"><g>${edges}</g>${nodes}<g fill="currentColor" font-size="10" style="color:var(--muted)"><text x="26" y="30">${escapeHtml(state.region.toUpperCase())} · CLUSTER NS-01</text><text x="600" y="350">Select a node to inspect</text></g></svg></section>`
  return shell.page({ active: 'topology', title: 'Topology map', main, url })
}

export function apply(ctx: Context): void {
  const shell = ctx.meshShell
  const app = new Acryl().get('/', (c) => c.html(pageFor(ctx, c.req.url)))
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  if (shell.prefix !== '') ctx.router.route('/', new Acryl().get(`${shell.prefix}/`, (c) => c.html(pageFor(ctx, c.req.url))))
  ctx.effect(() => shell.tab({ id: 'topology', label: 'Topology map', path: '/', order: 10 }))
  ctx.effect(() =>
    ctx.home.widget({
      id: 'topology',
      title: 'Cluster',
      render: () => {
        const s = ctx.mesh.state
        return `<p><b>${escapeHtml(s.name)}</b> · ${s.leader === undefined ? 'no leader' : `leader ${escapeHtml(s.leader)}`} · term ${String(s.term)}</p><p>${String(upNodes(s.nodes))} of ${String(s.nodes.length)} nodes up</p>`
      },
    }),
  )
}
