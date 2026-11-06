/**
 * The translation workbench shell (`ctx.deskShell`): the top bar (brand, project, the buttons plugins put there), the locale rail, the editor and the
 * terminology column. The editor is the page's `main`; the rail, the top buttons and the right column are parts plugins register with
 * `ctx.deskShell.side(...)` inside `ctx.effect`, so a part leaves with its plugin. What is open is the URL's query: `?locale=`, `?type=`, `?filter=`,
 * `?key=`: transient editor state, not part of the saved project.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { type Desk, type Filter, type Locale, type TypeId, FILTERS, TYPES } from '../lingodesk/index.ts'
import { DESK_STYLES } from './styles.ts'

export { DESK_STYLES }

export interface Selection {
  readonly locale: Locale
  readonly type: TypeId
  readonly filter: Filter
  /** The segment being worked on: `?key=` when it is of this content type, else the first that is not approved, else the first. */
  readonly key: string | undefined
}

export interface SidePart {
  readonly id: string
  readonly column: 'left' | 'right' | 'top'
  readonly order: number
  render(selection: Selection, url: string): string
}

export interface DeskShell {
  readonly prefix: string
  href(path: string): string
  hrefFor(path: string, selection: Pick<Selection, 'locale' | 'type' | 'filter'>, extra?: { key?: string | undefined }): string
  side(part: SidePart): () => void
  selection(url: string): Selection
  /** Hidden fields that carry the selection through a form (`locale`, `type`, `filter`, and `key` when given). */
  hidden(selection: Selection, key?: string): string
  /** Where a form came back to: the selection its hidden fields carry. */
  backFor(body: Record<string, unknown>, key?: string): string
  notice(url: string): string
  page(input: { title: string; main: string; url: string }): string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    deskShell: DeskShell
  }
}

export const APP_TITLE = 'LingoDesk'

export const escapeHtml = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')

export function withNotice(path: string, kind: 'ok' | 'error', text: string): string {
  const [base = '', hash] = path.split('#')
  return `${base}${base.includes('?') ? '&' : '?'}${kind}=${encodeURIComponent(text)}${hash === undefined ? '' : `#${hash}`}`
}

export function deskErrorOf(error: unknown): { code: 'invalid' | 'not-found' | 'conflict'; message: string } | undefined {
  if (error instanceof Error && error.name === 'DeskError') {
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

export function createShell(desk: Desk, prefix: string): DeskShell {
  const parts = new Map<string, SidePart>()
  const href = (path: string): string => {
    const clean = path.startsWith('/') ? path : `/${path}`
    if (prefix === '') return clean
    return clean === '/' ? `${prefix}/` : `${prefix}${clean}`
  }
  const resolve = (q: URLSearchParams | Record<string, string | undefined>): Selection => {
    const get = (n: string): string | undefined => (q instanceof URLSearchParams ? (q.get(n) ?? undefined) : q[n])
    const locale = desk.state.locales.find((l) => l.id === get('locale')) ?? desk.state.locales[0]
    if (locale === undefined) throw new Error('the project has no locale')
    const type = TYPES.find((t) => t.id === get('type'))?.id ?? 'ui'
    const filter = (Object.keys(FILTERS) as Filter[]).find((f) => f === get('filter')) ?? 'all'
    const keys = desk.state.keys.filter((k) => k.type === type)
    const segments = keys.map((k) => desk.state.segments.find((s) => s.key === k.key && s.locale === locale.id))
    const chosen = keys.find((k) => k.key === get('key'))?.key ?? segments.find((s) => s !== undefined && s.state !== 'approved')?.key ?? keys[0]?.key
    return { locale, type, filter, key: chosen }
  }
  const query = (sel: Pick<Selection, 'locale' | 'type' | 'filter'>, key?: string): string => new URLSearchParams({ locale: sel.locale.id, type: sel.type, filter: sel.filter, ...(key === undefined ? {} : { key }) }).toString()
  return {
    prefix,
    href,
    hrefFor: (path, sel, extra = {}) => `${href(path)}?${query(sel, extra.key)}`,
    side(part) {
      if (parts.has(part.id)) throw new Error(`the workbench already has a part "${part.id}"`)
      parts.set(part.id, part)
      return () => {
        if (parts.get(part.id) === part) parts.delete(part.id)
      }
    },
    selection: (url) => resolve(new URL(url, 'http://local').searchParams),
    hidden(sel, key) {
      const field = (n: string, v: string) => `<input type="hidden" name="${n}" value="${escapeHtml(v)}">`
      return `${field('locale', sel.locale.id)}${field('type', sel.type)}${field('filter', sel.filter)}${key === undefined ? '' : field('key', key)}`
    },
    backFor(body, key) {
      const sel = resolve({ locale: fieldOf(body, 'locale'), type: fieldOf(body, 'type'), filter: fieldOf(body, 'filter'), key: key ?? fieldOf(body, 'key') })
      return `${href('/')}?${query(sel, key ?? sel.key)}`
    },
    notice(url) {
      const q = new URL(url, 'http://local').searchParams
      const n = (['error', 'ok'] as const).map((kind) => ({ kind, text: q.get(kind) })).find((x) => x.text !== null && x.text !== '')
      return `<div class="status${n?.kind === 'error' ? ' error' : ''}" id="status">${n === undefined ? '<p>Draft changes are stored in this local prototype.</p>' : `<p role="${n.kind === 'ok' ? 'status' : 'alert'}">${escapeHtml(n.text ?? '')}</p>`}</div>`
    },
    page({ title, main, url }) {
      const sel = resolve(new URL(url, 'http://local').searchParams)
      const column = (which: SidePart['column']) => [...parts.values()].filter((p) => p.column === which).sort((a, b) => a.order - b.order).map((p) => p.render(sel, url)).join('')
      const flow = TYPES.find((t) => t.id === sel.type)?.flow ?? ''
      return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · ${APP_TITLE}</title>
<style>${DESK_STYLES}</style>
</head>
<body>
<header class="top"><a class="brand" href="${href('/')}">lingo<span>desk</span></a><div class="project">PROJECT &nbsp; <b>${escapeHtml(desk.state.project)}</b> &nbsp; / &nbsp; <b>${escapeHtml(flow)}</b></div><div class="actions">${column('top')}</div></header>
<div class="layout"><aside class="left" aria-label="Locales and content">${column('left')}</aside><main class="center">${main}</main><aside class="right" aria-label="Terminology and QA">${column('right')}</aside></div>
</body>
</html>`
    },
  }
}

export interface ShellConfig {
  readonly prefix?: string
}

export const name = 'desk-shell'
export const inject = ['desk', 'router']

export function apply(ctx: Context, config: ShellConfig = {}): void {
  const prefix = config.prefix ?? ''
  ctx.provide('deskShell', createShell(ctx.desk, prefix))
  ctx.router.route(prefix === '' ? '/' : prefix, new Acryl().get('/health', (c) => c.json({ ok: true })))
}
