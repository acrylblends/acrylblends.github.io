/**
 * The atlas shell (`ctx.foundryShell`): the header (with a link per page that registered one), the title with the search box, and the three columns.
 * The centre is the page a plugin renders with `ctx.foundryShell.page(...)`; the left and right columns are parts plugins put there with
 * `ctx.foundryShell.side(...)` inside `ctx.effect`, so a column leaves with its plugin. What is being looked at is in the query: `?q=`, `?group=`,
 * `?framework=`, `?language=` and `?package=`; `ctx.foundryShell.query(url)` reads it and `ctx.foundryShell.link(path, url, change)` writes a link that
 * keeps it, with some of it changed.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type { Atlas } from '../foundry/index.ts'
import { FOUNDRY_STYLES } from './styles.ts'

export { FOUNDRY_STYLES }

export interface Query {
  readonly q: string
  readonly group: string
  readonly framework: string
  readonly language: string
  readonly package: string
}

export interface SidePart {
  readonly id: string
  readonly column: 'left' | 'right'
  readonly order: number
  render(query: Query, url: string): string
}

export interface NavLink {
  readonly id: string
  readonly label: () => string
  readonly path: string
  readonly order: number
}

export interface PageInput {
  readonly title: string
  readonly main: string
  readonly url: string
  /** Without the filter and detail columns: the page takes the whole width. */
  readonly wide?: boolean
}

export interface FoundryShell {
  readonly prefix: string
  href(path: string): string
  /** A path that keeps the query of `url`, with the named parts changed (an empty string removes one). */
  link(path: string, url: string, change?: Partial<Query>): string
  nav(link: NavLink): () => void
  side(part: SidePart): () => void
  has(id: string): boolean
  query(url: string): Query
  page(input: PageInput): string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    foundryShell: FoundryShell
  }
}

export const APP_TITLE = 'The Foundry'

export const escapeHtml = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')

export function withNotice(path: string, kind: 'ok' | 'error', text: string): string {
  const [base = '', hash] = path.split('#')
  return `${base}${base.includes('?') ? '&' : '?'}${kind}=${encodeURIComponent(text)}${hash === undefined ? '' : `#${hash}`}`
}

export function atlasErrorOf(error: unknown): { code: 'invalid' | 'not-found' | 'conflict'; message: string } | undefined {
  if (error instanceof Error && error.name === 'AtlasError') {
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
export function backTo(shell: FoundryShell, raw: string | undefined, fallback: string): string {
  if (raw !== undefined && raw.startsWith(shell.prefix === '' ? '/' : shell.prefix) && !raw.startsWith('//') && !raw.includes('\\')) {
    const url = new URL(raw, 'http://local')
    url.searchParams.delete('ok')
    url.searchParams.delete('error')
    return `${url.pathname}${url.search}`
  }
  return fallback
}

export function createShell(atlas: Atlas, prefix: string): FoundryShell {
  const parts = new Map<string, SidePart>()
  const links = new Map<string, NavLink>()
  const href = (path: string): string => {
    const clean = path.startsWith('/') ? path : `/${path}`
    if (prefix === '') return clean
    return clean === '/' ? `${prefix}/` : `${prefix}${clean}`
  }
  const query = (url: string): Query => {
    const s = new URL(url, 'http://local').searchParams
    return { q: s.get('q') ?? '', group: s.get('group') ?? '', framework: s.get('framework') ?? '', language: s.get('language') ?? '', package: s.get('package') ?? '' }
  }
  const link = (path: string, url: string, change: Partial<Query> = {}): string => {
    const q = { ...query(url), ...change }
    const search = new URLSearchParams()
    for (const key of ['q', 'group', 'framework', 'language', 'package'] as const) if (q[key] !== '') search.set(key, q[key])
    const text = search.toString()
    return `${href(path)}${text === '' ? '' : `?${text}`}`
  }
  return {
    prefix,
    href,
    link,
    nav(item) {
      if (links.has(item.id)) throw new Error(`the atlas already has a link "${item.id}"`)
      links.set(item.id, item)
      return () => {
        if (links.get(item.id) === item) links.delete(item.id)
      }
    },
    side(part) {
      if (parts.has(part.id)) throw new Error(`the atlas already has a side part "${part.id}"`)
      parts.set(part.id, part)
      return () => {
        if (parts.get(part.id) === part) parts.delete(part.id)
      }
    },
    has: (id) => parts.has(id) || links.has(id),
    query,
    page({ title, main, url, wide }) {
      const q = query(url)
      const column = (which: 'left' | 'right') => [...parts.values()].filter((p) => p.column === which).sort((a, b) => a.order - b.order).map((p) => p.render(q, url)).join('')
      const s = new URL(url, 'http://local').searchParams
      const notice = (['error', 'ok'] as const).map((kind) => ({ kind, text: s.get(kind) })).find((n) => n.text !== null && n.text !== '')
      const nav = [...links.values()].sort((a, b) => a.order - b.order).map((l) => `<a href="${link(l.path, url)}" data-nav="${l.id}">${escapeHtml(l.label())}</a>`).join('')
      const hidden = (['group', 'framework', 'language'] as const).filter((k) => q[k] !== '').map((k) => `<input type="hidden" name="${k}" value="${escapeHtml(q[k])}">`).join('')
      const clear = q.q !== '' || q.group !== '' || q.framework !== '' || q.language !== ''
      return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · ${APP_TITLE}</title>
<style>${FOUNDRY_STYLES}</style>
</head>
<body>
<header class="bar"><a class="logo" href="${href('/')}">the foundry<span>.</span></a><div class="headerlink">Package atlas · Curated catalogue ${nav}</div></header>
<main class="wrap"><div class="top"><div><h1>Libraries &amp; frameworks</h1><div class="muted">Explore building blocks, compare versions and compose a stack.</div></div>
<form class="searchbar" method="get" action="${href('/')}" role="search">${hidden}<label class="sr" for="search">Search packages</label><input id="search" name="q" value="${escapeHtml(q.q)}" placeholder="Search packages, tags, runtimes…" type="search"><button class="btn dark" type="submit">Search</button>${clear ? `<a class="btn" id="clear" href="${href('/')}">Clear</a>` : ''}</form></div>
${notice === undefined ? '' : `<p class="alert ${notice.kind}" role="${notice.kind === 'ok' ? 'status' : 'alert'}">${escapeHtml(notice.text ?? '')}</p>`}
<div class="layout${wide === true ? ' wide' : ''}">${wide === true ? '' : `<aside class="panel" aria-label="Explore catalogue">${column('left')}</aside>`}<section class="panel" aria-label="Packages">${main}</section>${wide === true ? '' : `<aside class="panel" aria-label="Package detail">${column('right')}</aside>`}</div></main>
<script>document.addEventListener('click',function(e){var b=e.target.closest('[data-copy]');if(!b)return;var t=b.getAttribute('data-copy');if(navigator.clipboard){navigator.clipboard.writeText(t);b.textContent='Copied'}})</script>
</body>
</html>`
    },
  }
}

export interface ShellConfig {
  readonly prefix?: string
}

export const name = 'foundry-shell'
export const inject = ['atlas', 'router']

export function apply(ctx: Context, config: ShellConfig = {}): void {
  const prefix = config.prefix ?? ''
  ctx.provide('foundryShell', createShell(ctx.atlas, prefix))
  ctx.router.route(prefix === '' ? '/' : prefix, new Acryl().get('/health', (c) => c.json({ ok: true })))
}
