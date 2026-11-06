/**
 * The cluster shell (`ctx.meshShell`): the top bar with the quorum state and "Run failover drill", the cluster heading with the leader badge, the four
 * statistics, the tabs, and the right column. A page plugin registers its tab with `ctx.meshShell.tab(...)` inside `ctx.effect`; the inspector plugin
 * puts its parts in the right column with `ctx.meshShell.side(...)`. The node being looked at is chosen by `?node=` and kept in the tab links.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { type Mesh, type MeshNode, commitIndex, formatNumber, hasQuorum, quorumSize, replicationLagMs, upNodes } from '../meshwatch/index.ts'
import { MESH_STYLES } from './styles.ts'

export { MESH_STYLES }

export interface Tab {
  readonly id: string
  readonly label: string
  readonly path: string
  readonly order: number
}

export interface SidePart {
  readonly id: string
  readonly order: number
  render(selected: MeshNode, url: string): string
}

export interface PageInput {
  readonly active?: string
  readonly title: string
  readonly main: string
  readonly url: string
}

export interface MeshShell {
  readonly prefix: string
  href(path: string): string
  /** A path that keeps the selected node: `/replicas?node=node-02`. */
  hrefFor(path: string, node: MeshNode): string
  tab(tab: Tab): () => void
  tabs(): readonly Tab[]
  side(part: SidePart): () => void
  has(id: string): boolean
  /** The node `?node=` names, else the leader, else the first node. */
  selected(url: string): MeshNode
  page(input: PageInput): string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    meshShell: MeshShell
  }
}

export const APP_TITLE = 'Meshwatch'

export const escapeHtml = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')

export function withNotice(path: string, kind: 'ok' | 'error', text: string): string {
  const [base = '', hash] = path.split('#')
  return `${base}${base.includes('?') ? '&' : '?'}${kind}=${encodeURIComponent(text)}${hash === undefined ? '' : `#${hash}`}`
}

export function meshErrorOf(error: unknown): { code: 'invalid' | 'not-found' | 'conflict'; message: string } | undefined {
  if (error instanceof Error && error.name === 'MeshError') {
    const code = (error as { code?: unknown }).code
    if ((code === 'invalid' || code === 'not-found' || code === 'conflict') && error.message !== '') return { code, message: error.message }
  }
  return undefined
}

export function fieldOf(body: Record<string, unknown>, name: string): string | undefined {
  const value = body[name]
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.find((item): item is string => typeof item === 'string')
  return undefined
}

/** Where to go after an action: the page the form came from when it is a path of this app, else the fallback. */
export function backTo(shell: MeshShell, raw: string | undefined, fallback: string): string {
  if (raw !== undefined && raw.startsWith(shell.prefix === '' ? '/' : shell.prefix) && !raw.startsWith('//') && !raw.includes('\\')) {
    const url = new URL(raw, 'http://local')
    url.searchParams.delete('ok')
    url.searchParams.delete('error')
    return `${url.pathname}${url.search}`
  }
  return fallback
}

export function createShell(mesh: Mesh, prefix: string): MeshShell {
  const tabs = new Map<string, Tab>()
  const parts = new Map<string, SidePart>()
  const href = (path: string): string => {
    const clean = path.startsWith('/') ? path : `/${path}`
    if (prefix === '') return clean
    return clean === '/' ? `${prefix}/` : `${prefix}${clean}`
  }
  const sorted = () => [...tabs.values()].sort((a, b) => a.order - b.order)
  const selected = (url: string): MeshNode => {
    const wanted = new URL(url, 'http://local').searchParams.get('node')
    const nodes = mesh.state.nodes
    const node = nodes.find((n) => n.id === wanted) ?? nodes.find((n) => n.id === mesh.state.leader) ?? nodes[0]
    if (node === undefined) throw new Error('the cluster has no nodes')
    return node
  }
  const hrefFor = (path: string, node: MeshNode): string => `${href(path)}?node=${encodeURIComponent(node.id)}`

  return {
    prefix,
    href,
    hrefFor,
    tab(tab) {
      if (tabs.has(tab.id)) throw new Error(`the console already has a tab "${tab.id}"`)
      tabs.set(tab.id, tab)
      return () => {
        if (tabs.get(tab.id) === tab) tabs.delete(tab.id)
      }
    },
    tabs: sorted,
    side(part) {
      if (parts.has(part.id)) throw new Error(`the console already has a side part "${part.id}"`)
      parts.set(part.id, part)
      return () => {
        if (parts.get(part.id) === part) parts.delete(part.id)
      }
    },
    has: (id) => tabs.has(id),
    selected,
    page({ active, title, main, url }) {
      const state = mesh.state
      const node = selected(url)
      const n = state.nodes.length
      const quorum = hasQuorum(state.nodes)
      const lag = replicationLagMs(state)
      const query = new URL(url, 'http://local').searchParams
      const notice = (['error', 'ok'] as const).map((kind) => ({ kind, text: query.get(kind) })).find((x) => x.text !== null && x.text !== '')
      const nav = sorted()
        .map((t) => `<a href="${hrefFor(t.path, node)}"${t.id === active ? ' class="active" aria-current="page"' : ''}>${escapeHtml(t.label)}</a>`)
        .join('')
      const column = [...parts.values()].sort((a, b) => a.order - b.order).map((p) => p.render(node, url)).join('')
      const drillButton = tabs.has('drills') ? `<form method="post" action="${href('/drills')}"><button id="drillBtn" type="submit">Run failover drill</button></form>` : ''
      return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · ${APP_TITLE}</title>
<style>${MESH_STYLES}</style>
</head>
<body>
<header class="top"><a class="logo" href="${href('/')}">mesh<span>watch</span></a><span class="crumb">Clusters / ${escapeHtml(state.name)} / Consensus</span><span class="spacer"></span><span class="health${quorum ? '' : ' bad'}">● ${quorum ? 'Quorum available' : 'Quorum lost'}</span>${drillButton}</header>
<div class="shell"><main class="main"><div class="head"><div><h1>${escapeHtml(state.name)} cluster</h1><p>${escapeHtml(state.protocol)} consensus · ${String(n)} voting nodes · region ${escapeHtml(state.region)}</p></div><span class="badge${state.leader === undefined ? ' bad' : ''}" id="leaderBadge">${state.leader === undefined ? 'No leader' : `Leader · ${escapeHtml(state.leader)}`}</span></div>
<section class="stats" aria-label="Cluster summary"><div class="stat"><small>Node availability</small><b>${String(upNodes(state.nodes))} / ${String(n)}</b></div><div class="stat"><small>Quorum</small><b class="${quorum ? '' : 'bad'}">${String(quorumSize(n))} / ${String(n)}</b></div><div class="stat"><small>Commit index</small><b id="commit">${formatNumber(commitIndex(state))}</b></div><div class="stat"><small>Replication lag</small><b>${lag === undefined ? '—' : `${String(lag)} ms`}</b></div></section>
<nav class="tabs" aria-label="Cluster">${nav}</nav>
${notice === undefined ? '' : `<p class="alert ${notice.kind}" role="${notice.kind === 'ok' ? 'status' : 'alert'}">${escapeHtml(notice.text ?? '')}</p>`}
${main}</main><aside class="right" aria-label="Node inspector">${column}</aside></div>
</body>
</html>`
    },
  }
}

export interface ShellConfig {
  readonly prefix?: string
}

export const name = 'mesh-shell'
export const inject = ['mesh', 'router']

export function apply(ctx: Context, config: ShellConfig = {}): void {
  const prefix = config.prefix ?? ''
  ctx.provide('meshShell', createShell(ctx.mesh, prefix))
  ctx.router.route(prefix === '' ? '/' : prefix, new Acryl().get('/health', (c) => c.json({ ok: true })))
}
