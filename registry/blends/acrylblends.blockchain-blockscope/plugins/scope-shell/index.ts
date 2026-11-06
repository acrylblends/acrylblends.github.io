/**
 * The explorer shell (`ctx.scopeShell`): the header (logo, search, page tabs), the network strip, the page and the inspector column. A page is a plugin that
 * registers a tab with `ctx.scopeShell.nav(...)` and renders with `ctx.scopeShell.page(...)`; the network strip and the inspector panels are parts
 * registered with `ctx.scopeShell.side(...)`. Both inside `ctx.effect`, so a tab or a panel leaves with its plugin. What is selected is the URL's query
 * (`?block=`, `?q=`, `?before=`): transient, not saved.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type { Chain } from '../blockscope/index.ts'
import { SCOPE_STYLES } from './styles.ts'

export { SCOPE_STYLES }

export interface SidePart {
  readonly id: string
  readonly column: 'stats' | 'side'
  readonly order: number
  /** `current` is the id of the page being rendered, so a panel can show itself on some pages only. */
  render(url: string, current: string): string
}

export interface NavEntry {
  readonly id: string
  readonly label: string
  readonly path: string
  readonly order: number
}

export interface ScopeShell {
  readonly prefix: string
  href(path: string): string
  side(part: SidePart): () => void
  nav(entry: NavEntry): () => void
  /** A same-app path from a form's `back` field, else the fallback. */
  backTo(raw: string | undefined, fallback: string): string
  notice(url: string): string
  page(input: { title: string; main: string; url: string; current: string; refresh?: number }): string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    scopeShell: ScopeShell
  }
}

export const APP_TITLE = 'Blockscope Explorer'

export const escapeHtml = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')

export function chainErrorOf(error: unknown): { code: 'invalid' | 'not-found' | 'conflict'; message: string } | undefined {
  if (error instanceof Error && error.name === 'ChainError') {
    const code = (error as { code?: unknown }).code
    if ((code === 'invalid' || code === 'not-found' || code === 'conflict') && error.message !== '') return { code, message: error.message }
  }
  return undefined
}

export function withNotice(path: string, kind: 'ok' | 'error', text: string): string {
  const [base = '', hash] = path.split('#')
  return `${base}${base.includes('?') ? '&' : '?'}${kind}=${encodeURIComponent(text)}${hash === undefined ? '' : `#${hash}`}`
}

export function fieldOf(body: Record<string, unknown>, name: string): string | undefined {
  const value = body[name]
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.find((item): item is string => typeof item === 'string')
  return undefined
}

export function createShell(chain: Chain, prefix: string): ScopeShell {
  const parts = new Map<string, SidePart>()
  const entries = new Map<string, NavEntry>()
  const href = (path: string): string => {
    const clean = path.startsWith('/') ? path : `/${path}`
    if (prefix === '') return clean
    return clean === '/' ? `${prefix}/` : `${prefix}${clean}`
  }
  const shell: ScopeShell = {
    prefix,
    href,
    side(part) {
      if (parts.has(part.id)) throw new Error(`the explorer already has a panel "${part.id}"`)
      parts.set(part.id, part)
      return () => {
        if (parts.get(part.id) === part) parts.delete(part.id)
      }
    },
    nav(entry) {
      if (entries.has(entry.id)) throw new Error(`the explorer already has a tab "${entry.id}"`)
      entries.set(entry.id, entry)
      return () => {
        if (entries.get(entry.id) === entry) entries.delete(entry.id)
      }
    },
    backTo(raw, fallback) {
      if (raw !== undefined && raw.startsWith(prefix === '' ? '/' : prefix) && !raw.startsWith('//') && !raw.includes('\\')) {
        const url = new URL(raw, 'http://local')
        url.searchParams.delete('ok')
        url.searchParams.delete('error')
        return `${url.pathname}${url.search}`
      }
      return fallback
    },
    notice(url) {
      const q = new URL(url, 'http://local').searchParams
      const n = (['error', 'ok'] as const).map((kind) => ({ kind, text: q.get(kind) })).find((x) => x.text !== null && x.text !== '')
      return n === undefined ? '' : `<p class="notice ${n.kind}" role="${n.kind === 'ok' ? 'status' : 'alert'}">${escapeHtml(n.text ?? '')}</p>`
    },
    page({ title, main, url, current, refresh }) {
      const column = (which: SidePart['column']) => [...parts.values()].filter((p) => p.column === which).sort((a, b) => a.order - b.order).map((p) => p.render(url, current)).join('')
      const q = new URL(url, 'http://local').searchParams.get('q') ?? ''
      const tabs = [...entries.values()].sort((a, b) => a.order - b.order).map((e) => `<a class="${e.id === current ? 'active' : ''}" data-tab="${escapeHtml(e.id)}" href="${href(e.path)}"${e.id === current ? ' aria-current="page"' : ''}>${escapeHtml(e.label)}</a>`).join('')
      return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
${refresh === undefined ? '' : `<meta http-equiv="refresh" content="${String(refresh)}">`}
<title>${escapeHtml(title)} · ${APP_TITLE}</title>
<style>${SCOPE_STYLES}</style>
</head>
<body>
<main class="app"><header class="bar"><div><a class="logo" href="${href('/')}">BLOCK<span>SCOPE</span></a><div class="chain">Read-only explorer / ${escapeHtml(chain.state.network)} · demo fixtures</div></div><form class="search" role="search" method="get" action="${href('/')}"><label class="sr" for="query">Explorer search</label><input id="query" name="q" value="${escapeHtml(q)}" placeholder="Search block, transaction hash or address label…" maxlength="80"><button type="submit" id="search">Search</button></form></header>
<nav class="tabs" aria-label="Pages">${tabs}</nav>
<section class="network" aria-label="Network">${column('stats')}</section>
<section class="workspace"><div>${main}</div><aside class="side" aria-label="Inspector">${column('side')}</aside></section></main>
</body>
</html>`
    },
  }
  return shell
}

export interface ShellConfig {
  readonly prefix?: string
}

export const name = 'scope-shell'
export const inject = ['chain', 'router']

export function apply(ctx: Context, config: ShellConfig = {}): void {
  const prefix = config.prefix ?? ''
  ctx.provide('scopeShell', createShell(ctx.chain, prefix))
  ctx.router.route(prefix === '' ? '/' : prefix, new Acryl().get('/health', (c) => c.json({ ok: true })))
}

/** The watch / unwatch button of a block, transaction or address; posts to the watchlist route and comes back to `back`. */
export function watchForm(shell: ScopeShell, watched: boolean, kind: 'block' | 'tx' | 'address', id: string, back: string): string {
  return `<form method="post" action="${shell.href('/watch')}" style="display:inline"><input type="hidden" name="kind" value="${kind}"><input type="hidden" name="id" value="${escapeHtml(id)}"><input type="hidden" name="back" value="${escapeHtml(back)}"><button class="btn" type="submit" data-watch="${kind}" aria-pressed="${watched ? 'true' : 'false'}">${watched ? '★ Watching' : '☆ Watch'}</button></form>`
}
