/**
 * The control-plane shell (`ctx.gateShell`): the header with the gateway's health, the title with "Add route", and the three columns. The centre is
 * the page a plugin renders with `ctx.gateShell.page(...)`; the left and right columns are parts plugins put there with `ctx.gateShell.side(...)`
 * inside `ctx.effect`, so a column leaves with its plugin. The route being looked at is `?route=`; `ctx.gateShell.selected(url)` resolves it (the
 * first route when none is named) and `ctx.gateShell.hrefFor(path, route)` keeps it in links.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type { Gate, Route } from '../gatehouse/index.ts'
import { GATE_STYLES } from './styles.ts'

export { GATE_STYLES }

export interface SidePart {
  readonly id: string
  readonly column: 'left' | 'right'
  readonly order: number
  render(route: Route, url: string): string
}

export interface PageInput {
  readonly title: string
  readonly main: string
  readonly url: string
}

export interface GateShell {
  readonly prefix: string
  href(path: string): string
  hrefFor(path: string, route: Pick<Route, 'id'>): string
  side(part: SidePart): () => void
  has(id: string): boolean
  selected(url: string): Route
  page(input: PageInput): string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    gateShell: GateShell
  }
}

export const APP_TITLE = 'Gatehouse'

export const escapeHtml = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')

export function withNotice(path: string, kind: 'ok' | 'error', text: string): string {
  const [base = '', hash] = path.split('#')
  return `${base}${base.includes('?') ? '&' : '?'}${kind}=${encodeURIComponent(text)}${hash === undefined ? '' : `#${hash}`}`
}

export function gateErrorOf(error: unknown): { code: 'invalid' | 'not-found' | 'conflict'; message: string } | undefined {
  if (error instanceof Error && error.name === 'GateError') {
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

export function createShell(gate: Gate, prefix: string): GateShell {
  const parts = new Map<string, SidePart>()
  const href = (path: string): string => {
    const clean = path.startsWith('/') ? path : `/${path}`
    if (prefix === '') return clean
    return clean === '/' ? `${prefix}/` : `${prefix}${clean}`
  }
  const selected = (url: string): Route => {
    const wanted = new URL(url, 'http://local').searchParams.get('route')
    const route = gate.state.routes.find((r) => r.id === wanted) ?? gate.state.routes[0]
    if (route === undefined) throw new Error('the gateway has no routes')
    return route
  }
  return {
    prefix,
    href,
    hrefFor: (path, route) => `${href(path)}?route=${encodeURIComponent(route.id)}`,
    side(part) {
      if (parts.has(part.id)) throw new Error(`the console already has a side part "${part.id}"`)
      parts.set(part.id, part)
      return () => {
        if (parts.get(part.id) === part) parts.delete(part.id)
      }
    },
    has: (id) => parts.has(id),
    selected,
    page({ title, main, url }) {
      const route = selected(url)
      const column = (which: 'left' | 'right') =>
        [...parts.values()].filter((p) => p.column === which).sort((a, b) => a.order - b.order).map((p) => p.render(route, url)).join('')
      const query = new URL(url, 'http://local').searchParams
      const notice = (['error', 'ok'] as const).map((kind) => ({ kind, text: query.get(kind) })).find((n) => n.text !== null && n.text !== '')
      const healthy = gate.state.upstreams.every((u) => u.up)
      const add = parts.has('routes') ? `<a class="btn primary" id="newroute" href="${href(`/?route=${encodeURIComponent(route.id)}&add=1#add-route`)}">＋ Add route</a>` : ''
      return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · ${APP_TITLE}</title>
<style>${GATE_STYLES}</style>
</head>
<body>
<header class="bar"><a class="logo" href="${href('/')}">GATE<span>HOUSE</span></a><div class="status${healthy ? '' : ' bad'}">Edge gateway · ${escapeHtml(gate.state.environment)} · ${healthy ? 'Healthy' : 'Degraded'}</div></header>
<main class="wrap"><div class="top"><div><h1>Gateway control plane</h1><div class="sub">Route traffic through policy, auth and upstream middleware.</div></div>${add}</div>
${notice === undefined ? '' : `<p class="alert ${notice.kind}" role="${notice.kind === 'ok' ? 'status' : 'alert'}">${escapeHtml(notice.text ?? '')}</p>`}
<div class="layout"><section class="card" aria-label="Routes and upstream services">${column('left')}</section><section class="card" aria-label="Request pipeline">${main}</section><section class="card" aria-label="Route policy">${column('right')}</section></div></main>
</body>
</html>`
    },
  }
}

export interface ShellConfig {
  readonly prefix?: string
}

export const name = 'gate-shell'
export const inject = ['gate', 'router']

export function apply(ctx: Context, config: ShellConfig = {}): void {
  const prefix = config.prefix ?? ''
  ctx.provide('gateShell', createShell(ctx.gate, prefix))
  ctx.router.route(prefix === '' ? '/' : prefix, new Acryl().get('/health', (c) => c.json({ ok: true })))
}
