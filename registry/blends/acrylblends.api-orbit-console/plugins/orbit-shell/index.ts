/**
 * The console shell (`ctx.orbitShell`): the header, the title with "Copy base URL", and the three columns. The centre shows the selected endpoint's
 * title and description with the tabs plugins registered (`ctx.orbitShell.tab(...)` inside `ctx.effect`), and the tab's own content; the left and right
 * columns are parts plugins put there with `ctx.orbitShell.side(...)`. The endpoint being looked at is `?endpoint=`; `ctx.orbitShell.endpointOf(url)`
 * resolves it and `ctx.orbitShell.hrefFor(path, endpointId)` keeps it in links.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type { Endpoint, Orbit } from '../orbit/index.ts'
import { ORBIT_STYLES } from './styles.ts'

export { ORBIT_STYLES }

export interface Tab {
  readonly id: string
  readonly label: string
  readonly path: string
  readonly order: number
}

export interface SidePart {
  readonly id: string
  readonly column: 'left' | 'right'
  readonly order: number
  render(endpoint: Endpoint, url: string): string
}

export interface PageInput {
  readonly active: string
  readonly title: string
  readonly main: string
  readonly url: string
}

export interface OrbitShell {
  readonly prefix: string
  href(path: string): string
  hrefFor(path: string, endpointId: string, extra?: Record<string, string>): string
  tab(tab: Tab): () => void
  tabs(): readonly Tab[]
  side(part: SidePart): () => void
  has(id: string): boolean
  endpointOf(url: string): Endpoint
  page(input: PageInput): string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    orbitShell: OrbitShell
  }
}

export const APP_TITLE = 'Orbit'

export const escapeHtml = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')

export function withNotice(path: string, kind: 'ok' | 'error', text: string): string {
  const [base = '', hash] = path.split('#')
  return `${base}${base.includes('?') ? '&' : '?'}${kind}=${encodeURIComponent(text)}${hash === undefined ? '' : `#${hash}`}`
}

export function orbitErrorOf(error: unknown): { code: 'invalid' | 'not-found'; message: string } | undefined {
  if (error instanceof Error && error.name === 'OrbitError') {
    const code = (error as { code?: unknown }).code
    if ((code === 'invalid' || code === 'not-found') && error.message !== '') return { code, message: error.message }
  }
  return undefined
}

export function fieldOf(body: Record<string, unknown>, name: string): string | undefined {
  const value = body[name]
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.find((item): item is string => typeof item === 'string')
  return undefined
}

/** JSON as the inspector shows it: keys, strings and numbers coloured, everything escaped. */
export function highlight(value: unknown): string {
  const text = JSON.stringify(value, null, 2) ?? ''
  return escapeHtml(text).replace(/(&quot;(?:[^&]|&(?!quot;))*&quot;)(\s*:)?|\b(-?\d+(?:\.\d+)?)\b/g, (_m, str: string | undefined, colon: string | undefined, num: string | undefined) =>
    num !== undefined ? `<span class="num">${num}</span>` : colon !== undefined ? `<span class="key">${str ?? ''}</span>${colon}` : `<span class="string">${str ?? ''}</span>`,
  )
}

export function createShell(orbit: Orbit, prefix: string): OrbitShell {
  const tabs = new Map<string, Tab>()
  const parts = new Map<string, SidePart>()
  const href = (path: string): string => {
    const clean = path.startsWith('/') ? path : `/${path}`
    if (prefix === '') return clean
    return clean === '/' ? `${prefix}/` : `${prefix}${clean}`
  }
  const sorted = () => [...tabs.values()].sort((a, b) => a.order - b.order)
  const endpointOf = (url: string): Endpoint => {
    const wanted = new URL(url, 'http://local').searchParams.get('endpoint')
    const endpoints = orbit.endpoints()
    const endpoint = endpoints.find((e) => e.id === wanted) ?? endpoints[0]
    if (endpoint === undefined) throw new Error('the API has no endpoints')
    return endpoint
  }
  const hrefFor = (path: string, endpointId: string, extra: Record<string, string> = {}): string => {
    const search = new URLSearchParams({ endpoint: endpointId, ...extra })
    return `${href(path)}?${search.toString()}`
  }
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
    has: (id) => tabs.has(id) || parts.has(id),
    endpointOf,
    page({ active, title, main, url }) {
      const endpoint = endpointOf(url)
      const column = (which: 'left' | 'right') => [...parts.values()].filter((p) => p.column === which).sort((a, b) => a.order - b.order).map((p) => p.render(endpoint, url)).join('')
      const query = new URL(url, 'http://local').searchParams
      const notice = (['error', 'ok'] as const).map((kind) => ({ kind, text: query.get(kind) })).find((n) => n.text !== null && n.text !== '')
      const nav = sorted().map((t) => `<a href="${hrefFor(t.path, endpoint.id)}"${t.id === active ? ' class="active" aria-current="page"' : ''}>${escapeHtml(t.label)}</a>`).join('')
      const post = endpoint.method === 'POST'
      return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · ${APP_TITLE}</title>
<style>${ORBIT_STYLES}</style>
</head>
<body>
<header class="bar"><a class="logo" href="${href('/')}">orbit<span>/</span>api</a><div class="env">Acme developer platform · API version ${escapeHtml(orbit.state.apiVersion)}</div></header>
<main class="wrap"><div class="top"><div><h1>Developer console</h1><div class="muted">Explore endpoints, assemble requests and preview SDK examples.</div></div><button class="btn" id="copybase" type="button" data-copy="${escapeHtml(orbit.state.baseUrl)}">Copy base URL</button></div>
${notice === undefined ? '' : `<p class="alert ${notice.kind}" role="${notice.kind === 'ok' ? 'status' : 'alert'}">${escapeHtml(notice.text ?? '')}</p>`}
<div class="workspace"><aside class="panel" aria-label="API reference">${column('left')}</aside>
<section class="panel"><div class="center"><div class="crumb">Reference / ${escapeHtml(endpoint.group)}</div><div class="endpointtitle"><span class="method${post ? ' post' : ''}" id="titlemethod">${endpoint.method}</span><h2 id="titlepath">${escapeHtml(endpoint.path)}</h2></div><div class="desc" id="desc">${escapeHtml(endpoint.description)}</div>
<div class="tabs" role="navigation" aria-label="Endpoint">${nav}</div>${main}</div></section>
<aside class="panel" aria-label="Response inspector">${column('right')}</aside></div></main>
<script>document.addEventListener('click',function(e){var b=e.target.closest('[data-copy]');if(!b)return;if(navigator.clipboard){navigator.clipboard.writeText(b.getAttribute('data-copy'));b.textContent='Copied'}})</script>
</body>
</html>`
    },
  }
}

export interface ShellConfig {
  readonly prefix?: string
}

export const name = 'orbit-shell'
export const inject = ['orbit', 'router']

export function apply(ctx: Context, config: ShellConfig = {}): void {
  const prefix = config.prefix ?? ''
  ctx.provide('orbitShell', createShell(ctx.orbit, prefix))
  ctx.router.route(prefix === '' ? '/' : prefix, new Acryl().get('/health', (c) => c.json({ ok: true })))
}
