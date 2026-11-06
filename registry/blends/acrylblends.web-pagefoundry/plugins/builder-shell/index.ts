/**
 * The builder shell (`ctx.builderShell`): the top bar (site name, Preview and Publish), and the three regions. The centre is the stage a plugin renders
 * with `ctx.builderShell.page(...)`; the left navigator and the right inspector are parts plugins put there with `ctx.builderShell.side(...)` inside
 * `ctx.effect`, so a region leaves with its plugin. The page and section being edited are `?page=` and `?section=`; `ctx.builderShell.selection(url)`
 * resolves them and `ctx.builderShell.hrefFor(...)` keeps them in links. In preview mode the side regions fold away.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type { Page, Section, Site } from '../pagefoundry/index.ts'
import { BUILDER_STYLES } from './styles.ts'

export { BUILDER_STYLES }

export interface Selection {
  readonly page: Page
  /** The section being edited: `?section=` when it is on the page, else the page's first; absent on an empty page. */
  readonly section: Section | undefined
}

export interface SidePart {
  readonly id: string
  readonly column: 'left' | 'right'
  readonly order: number
  render(selection: Selection, url: string): string
}

export interface PageInput {
  readonly title: string
  readonly main: string
  readonly url: string
}

export interface BuilderShell {
  readonly prefix: string
  href(path: string): string
  hrefFor(path: string, selection: { pageId: string; sectionId?: string }): string
  side(part: SidePart): () => void
  has(id: string): boolean
  selection(url: string): Selection
  notice(url: string): string
  page(input: PageInput): string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    builderShell: BuilderShell
  }
}

export const APP_TITLE = 'Pagefoundry'

export const escapeHtml = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')

export function withNotice(path: string, kind: 'ok' | 'error', text: string): string {
  const [base = '', hash] = path.split('#')
  return `${base}${base.includes('?') ? '&' : '?'}${kind}=${encodeURIComponent(text)}${hash === undefined ? '' : `#${hash}`}`
}

export function siteErrorOf(error: unknown): { code: 'invalid' | 'not-found' | 'conflict'; message: string } | undefined {
  if (error instanceof Error && error.name === 'SiteError') {
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
export function backTo(shell: BuilderShell, raw: string | undefined, fallback: string): string {
  if (raw !== undefined && raw.startsWith(shell.prefix === '' ? '/' : shell.prefix) && !raw.startsWith('//') && !raw.includes('\\')) {
    const url = new URL(raw, 'http://local')
    url.searchParams.delete('ok')
    url.searchParams.delete('error')
    return `${url.pathname}${url.search}`
  }
  return fallback
}

export function createShell(site: Site, prefix: string): BuilderShell {
  const parts = new Map<string, SidePart>()
  const href = (path: string): string => {
    const clean = path.startsWith('/') ? path : `/${path}`
    if (prefix === '') return clean
    return clean === '/' ? `${prefix}/` : `${prefix}${clean}`
  }
  const selection = (url: string): Selection => {
    const q = new URL(url, 'http://local').searchParams
    const pages = site.state.pages
    const page = pages.find((p) => p.id === q.get('page')) ?? pages[0]
    if (page === undefined) throw new Error('the site has no pages')
    return { page, section: page.sections.find((s) => s.id === q.get('section')) ?? page.sections[0] }
  }
  const hrefFor = (path: string, sel: { pageId: string; sectionId?: string }): string => `${href(path)}?page=${encodeURIComponent(sel.pageId)}${sel.sectionId === undefined ? '' : `&section=${encodeURIComponent(sel.sectionId)}`}`
  return {
    prefix,
    href,
    hrefFor,
    side(part) {
      if (parts.has(part.id)) throw new Error(`the builder already has a part "${part.id}"`)
      parts.set(part.id, part)
      return () => {
        if (parts.get(part.id) === part) parts.delete(part.id)
      }
    },
    has: (id) => parts.has(id),
    selection,
    notice(url) {
      const q = new URL(url, 'http://local').searchParams
      const n = (['error', 'ok'] as const).map((kind) => ({ kind, text: q.get(kind) })).find((x) => x.text !== null && x.text !== '')
      return n === undefined ? '' : `<p class="alert ${n.kind}" role="${n.kind === 'ok' ? 'status' : 'alert'}">${escapeHtml(n.text ?? '')}</p>`
    },
    page({ title, main, url }) {
      const sel = selection(url)
      const state = site.state
      const previewing = state.view.preview
      const column = (which: 'left' | 'right') => [...parts.values()].filter((p) => p.column === which).sort((a, b) => a.order - b.order).map((p) => p.render(sel, url)).join('')
      const last = state.builds[state.builds.length - 1]
      const at = { pageId: sel.page.id, ...(sel.section === undefined ? {} : { sectionId: sel.section.id }) }
      const back = hrefFor('/', at)
      const post = (path: string, label: string, cls: string, id: string, extra = '') => `<form method="post" action="${href(path)}"><input type="hidden" name="back" value="${escapeHtml(back)}">${extra}<button class="btn${cls}" id="${id}" type="submit">${label}</button></form>`
      const controls = parts.has('publish')
        ? `${post('/preview', previewing ? '✎ Edit' : 'Preview', '', 'preview', `<input type="hidden" name="on" value="${previewing ? 'off' : 'on'}">`)}${post('/publish', last === undefined ? 'Publish ↗' : '↗ Publish again', ' dark', 'publish')}`
        : ''
      return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · ${APP_TITLE}</title>
<style>${BUILDER_STYLES}</style>
</head>
<body>
<header class="top"><a class="brand" href="${href('/')}">page<span>foundry</span></a><div class="site"><div class="favicon" aria-hidden="true">${escapeHtml(state.name.charAt(0))}</div><b>${escapeHtml(state.name)}</b><span>·</span><span id="sitestatus">${last === undefined ? 'Draft site' : `Published v${escapeHtml(last.version)}`}</span></div><div class="topright">${controls}</div></header>
<main class="builder${previewing ? ' previewing' : ''}">${previewing ? '' : `<aside class="left" aria-label="Pages and blocks">${column('left')}</aside>`}${main}${previewing ? '' : `<aside class="right" aria-label="Design inspector">${column('right')}</aside>`}</main>
</body>
</html>`
    },
  }
}

export interface ShellConfig {
  readonly prefix?: string
}

export const name = 'builder-shell'
export const inject = ['site', 'router']

export function apply(ctx: Context, config: ShellConfig = {}): void {
  const prefix = config.prefix ?? ''
  ctx.provide('builderShell', createShell(ctx.site, prefix))
  ctx.router.route(prefix === '' ? '/' : prefix, new Acryl().get('/health', (c) => c.json({ ok: true })))
}
