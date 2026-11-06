/**
 * The desk shell (`ctx.runShell`): the header, the title with "Prepare rollout", the host column, and the selected host's heading, statistics and
 * tabs. A tab plugin registers its tab with `ctx.runShell.tab(...)` inside `ctx.effect`; the hosts plugin puts the left column there with
 * `ctx.runShell.side(...)`. The host and process being looked at are `?host=` and `?process=`; `ctx.runShell.selection(url)` resolves them and links
 * are written with `ctx.runShell.hrefFor(...)` so the selection travels.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { type Desk, type Host, type ManagedProcess, unitWord } from '../runlevel/index.ts'
import { RUN_STYLES } from './styles.ts'

export { RUN_STYLES }

export interface Tab {
  readonly id: string
  readonly label: string
  readonly path: string
  readonly order: number
}

export interface Selection {
  readonly host: Host
  /** The process the top button restarts: `?process=` when it is on the host, else the host's first. */
  readonly process: ManagedProcess | undefined
}

export interface SidePart {
  readonly id: string
  readonly order: number
  render(selection: Selection, url: string): string
}

export interface PageInput {
  readonly active?: string
  readonly title: string
  readonly main: string
  readonly url: string
}

export interface RunShell {
  readonly prefix: string
  href(path: string): string
  hrefFor(path: string, selection: { hostId: string; processId?: string }): string
  tab(tab: Tab): () => void
  tabs(): readonly Tab[]
  side(part: SidePart): () => void
  has(id: string): boolean
  selection(url: string): Selection
  page(input: PageInput): string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    runShell: RunShell
  }
}

export const APP_TITLE = 'Runlevel'

export const escapeHtml = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')

export function withNotice(path: string, kind: 'ok' | 'error', text: string): string {
  const [base = '', hash] = path.split('#')
  return `${base}${base.includes('?') ? '&' : '?'}${kind}=${encodeURIComponent(text)}${hash === undefined ? '' : `#${hash}`}`
}

export function runErrorOf(error: unknown): { code: 'invalid' | 'not-found' | 'conflict'; message: string } | undefined {
  if (error instanceof Error && error.name === 'RunError') {
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
export function backTo(shell: RunShell, raw: string | undefined, fallback: string): string {
  if (raw !== undefined && raw.startsWith(shell.prefix === '' ? '/' : shell.prefix) && !raw.startsWith('//') && !raw.includes('\\')) {
    const url = new URL(raw, 'http://local')
    url.searchParams.delete('ok')
    url.searchParams.delete('error')
    return `${url.pathname}${url.search}`
  }
  return fallback
}

export function createShell(desk: Desk, prefix: string): RunShell {
  const tabs = new Map<string, Tab>()
  const parts = new Map<string, SidePart>()
  const href = (path: string): string => {
    const clean = path.startsWith('/') ? path : `/${path}`
    if (prefix === '') return clean
    return clean === '/' ? `${prefix}/` : `${prefix}${clean}`
  }
  const sorted = () => [...tabs.values()].sort((a, b) => a.order - b.order)
  const selection = (url: string): Selection => {
    const query = new URL(url, 'http://local').searchParams
    const host = desk.state.hosts.find((h) => h.id === query.get('host')) ?? desk.state.hosts[0]
    if (host === undefined) throw new Error('the desk has no hosts')
    const onHost = desk.processes(host.id)
    return { host, process: onHost.find((p) => p.id === query.get('process')) ?? onHost[0] }
  }
  const hrefFor = (path: string, sel: { hostId: string; processId?: string }): string =>
    `${href(path)}?host=${encodeURIComponent(sel.hostId)}${sel.processId === undefined ? '' : `&process=${encodeURIComponent(sel.processId)}`}`

  return {
    prefix,
    href,
    hrefFor,
    tab(tab) {
      if (tabs.has(tab.id)) throw new Error(`the desk already has a tab "${tab.id}"`)
      tabs.set(tab.id, tab)
      return () => {
        if (tabs.get(tab.id) === tab) tabs.delete(tab.id)
      }
    },
    tabs: sorted,
    side(part) {
      if (parts.has(part.id)) throw new Error(`the desk already has a side part "${part.id}"`)
      parts.set(part.id, part)
      return () => {
        if (parts.get(part.id) === part) parts.delete(part.id)
      }
    },
    has: (id) => tabs.has(id),
    selection,
    page({ active, title, main, url }) {
      const sel = selection(url)
      const { host } = sel
      const onHost = desk.processes(host.id)
      const query = new URL(url, 'http://local').searchParams
      const notice = (['error', 'ok'] as const).map((kind) => ({ kind, text: query.get(kind) })).find((n) => n.text !== null && n.text !== '')
      const nav = sorted()
        .map((t) => `<a href="${hrefFor(t.path, { hostId: host.id, ...(sel.process === undefined ? {} : { processId: sel.process.id }) })}"${t.id === active ? ' class="active" aria-current="page"' : ''}>${escapeHtml(t.label)}</a>`)
        .join('')
      const column = [...parts.values()].sort((a, b) => a.order - b.order).map((p) => p.render(sel, url)).join('')
      const back = hrefFor(active === undefined ? '/' : (sorted().find((t) => t.id === active)?.path ?? '/'), { hostId: host.id, ...(sel.process === undefined ? {} : { processId: sel.process.id }) })
      const restart =
        sel.process !== undefined && tabs.has('processes')
          ? `<form method="post" action="${href(`/processes/${encodeURIComponent(sel.process.id)}/restart`)}"><input type="hidden" name="back" value="${escapeHtml(back)}"><button class="btn" id="restart" type="submit">↻ Restart ${escapeHtml(sel.process.name)}</button></form>`
          : ''
      const prepare = tabs.has('rollouts') ? `<a class="btn primary" id="rollout" href="${hrefFor('/rollouts', { hostId: host.id })}&prepare=1#prepare">＋ Prepare rollout</a>` : ''
      return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · ${APP_TITLE}</title>
<style>${RUN_STYLES}</style>
</head>
<body>
<header class="bar"><a class="logo" href="${href('/')}">runlevel<span>.</span></a><div class="tag">Runtime control plane / Demo cluster</div></header>
<main class="wrap"><div class="intro"><div><h1>Runtime operations</h1><div class="muted">Process health, runtime compatibility and release history.</div></div>${prepare}</div>
${notice === undefined ? '' : `<p class="alert ${notice.kind}" role="${notice.kind === 'ok' ? 'status' : 'alert'}">${escapeHtml(notice.text ?? '')}</p>`}
<div class="layout"><aside class="paper" aria-label="Runtime hosts">${column}</aside>
<section class="paper"><div class="workspace"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><div><div class="muted" style="font-size:11px;letter-spacing:1px">SELECTED HOST</div><h2 id="hostname" style="margin:3px 0 16px;font:600 22px Georgia">${escapeHtml(host.id)}</h2></div>${restart}</div>
<div class="stats"><div class="stat"><b id="cpu">${String(host.cpuPercent)}%</b><small>CPU utilization</small></div><div class="stat"><b id="mem">${host.memoryGb.toFixed(1)} GB</b><small>Memory in use</small></div><div class="stat"><b>${String(onHost.length)}</b><small>${host.kind === 'module' ? 'Modules' : 'Processes'}</small></div><div class="stat"><b class="good">${String(host.availability)}%</b><small>30d availability</small></div></div>
<div class="tabs" role="navigation" aria-label="Host">${nav}</div>
${main}</div></section></div></main>
</body>
</html>`
    },
  }
}

export { unitWord }

export interface ShellConfig {
  readonly prefix?: string
}

export const name = 'run-shell'
export const inject = ['desk', 'router']

export function apply(ctx: Context, config: ShellConfig = {}): void {
  const prefix = config.prefix ?? ''
  ctx.provide('runShell', createShell(ctx.desk, prefix))
  ctx.router.route(prefix === '' ? '/' : prefix, new Acryl().get('/health', (c) => c.json({ ok: true })))
}
