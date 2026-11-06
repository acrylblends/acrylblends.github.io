/**
 * The window shell (`ctx.windowShell`): the native-style chrome (title bar, menu bar, toolbar with tools, zoom and Export preview, status bar) around the
 * three regions. The centre is the page a plugin renders with `ctx.windowShell.page(...)`; the sidebar and the inspector are parts plugins put there
 * with `ctx.windowShell.side(...)` inside `ctx.effect`, so a region leaves with its plugin. The file and layer being looked at are `?file=` and
 * `?layer=`; `ctx.windowShell.selection(url)` resolves them and `ctx.windowShell.hrefFor(...)` keeps them in links.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { type Doc, type Layer, type Project, countLayers } from '../canvasmith/index.ts'
import { WINDOW_STYLES } from './styles.ts'

export { WINDOW_STYLES }

export interface Selection {
  readonly doc: Doc
  readonly layer: Layer
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

export interface WindowShell {
  readonly prefix: string
  href(path: string): string
  /** A path that keeps the selection: `/?file=hero-poster&layer=headline`. */
  hrefFor(path: string, selection: { docId: string; layerId?: string }): string
  side(part: SidePart): () => void
  has(id: string): boolean
  selection(url: string): Selection
  /** The `?ok=` / `?error=` notice of a request as HTML (empty when there is none). */
  notice(url: string): string
  page(input: PageInput): string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    windowShell: WindowShell
  }
}

export const APP_TITLE = 'Canvasmith'

export const escapeHtml = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')

export function withNotice(path: string, kind: 'ok' | 'error', text: string): string {
  const [base = '', hash] = path.split('#')
  return `${base}${base.includes('?') ? '&' : '?'}${kind}=${encodeURIComponent(text)}${hash === undefined ? '' : `#${hash}`}`
}

export function projectErrorOf(error: unknown): { code: 'invalid' | 'not-found' | 'conflict'; message: string } | undefined {
  if (error instanceof Error && error.name === 'ProjectError') {
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
export function backTo(shell: WindowShell, raw: string | undefined, fallback: string): string {
  if (raw !== undefined && raw.startsWith(shell.prefix === '' ? '/' : shell.prefix) && !raw.startsWith('//') && !raw.includes('\\')) {
    const url = new URL(raw, 'http://local')
    url.searchParams.delete('ok')
    url.searchParams.delete('error')
    return `${url.pathname}${url.search}`
  }
  return fallback
}

export function createShell(project: Project, prefix: string): WindowShell {
  const parts = new Map<string, SidePart>()
  const href = (path: string): string => {
    const clean = path.startsWith('/') ? path : `/${path}`
    if (prefix === '') return clean
    return clean === '/' ? `${prefix}/` : `${prefix}${clean}`
  }
  const selection = (url: string): Selection => {
    const q = new URL(url, 'http://local').searchParams
    const docs = project.state.docs
    const doc = docs.find((d) => d.id === q.get('file')) ?? docs[0]
    if (doc === undefined) throw new Error('the project has no files')
    const layer = doc.layers.find((l) => l.id === q.get('layer')) ?? doc.layers[0]
    if (layer === undefined) throw new Error('the file has no layers')
    return { doc, layer }
  }
  const hrefFor = (path: string, sel: { docId: string; layerId?: string }): string => `${href(path)}?file=${encodeURIComponent(sel.docId)}${sel.layerId === undefined ? '' : `&layer=${encodeURIComponent(sel.layerId)}`}`
  return {
    prefix,
    href,
    hrefFor,
    side(part) {
      if (parts.has(part.id)) throw new Error(`the window already has a part "${part.id}"`)
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
      const state = project.state
      const view = state.view
      const column = (which: 'left' | 'right') => [...parts.values()].filter((p) => p.column === which).sort((a, b) => a.order - b.order).map((p) => p.render(sel, url)).join('')
      const at = { docId: sel.doc.id, layerId: sel.layer.id }
      const back = hrefFor('/', at)
      const post = (path: string, label: string, cls: string, aria: string, extra = '') => `<form method="post" action="${href(path)}"><input type="hidden" name="back" value="${escapeHtml(back)}">${extra}<button class="tool${cls}" type="submit" aria-label="${escapeHtml(aria)}">${label}</button></form>`
      const tools = parts.has('canvas')
        ? (
            [
              ['select', '↖ Select'],
              ['frame', '▱ Frame'],
              ['text', 'T Text'],
              ['shape', '◩ Shape'],
            ] as const
          )
            .map(([tool, label]) => post(`/tools/${tool}`, label, view.tool === tool ? ' active' : '', `${label.slice(2)} tool`, ''))
            .join('')
        : ''
      const zoom = parts.has('canvas')
        ? `${post('/zoom/out', '−', '', 'Zoom out')}${post('/zoom/reset', `<span id="zoom">${String(view.zoom)}%</span>`, '', 'Reset zoom to 100%')}${post('/zoom/in', '+', '', 'Zoom in')}${post('/view/layers', '▤', view.showLayers ? ' active' : '', 'Toggle the layer list')}`
        : ''
      const exportButton = parts.has('exports')
        ? `<form method="post" action="${href('/export')}"><input type="hidden" name="back" value="${escapeHtml(back)}"><input type="hidden" name="file" value="${escapeHtml(sel.doc.id)}"><input type="hidden" name="format" value="PNG"><input type="hidden" name="scale" value="1"><button class="export" id="export" type="submit">Export preview</button></form>`
        : ''
      const last = state.activity[state.activity.length - 1]
      return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · ${APP_TITLE}</title>
<style>${WINDOW_STYLES}</style>
</head>
<body>
<main class="window"><div class="titlebar"><div class="lights" aria-hidden="true"><i></i><i></i><i></i></div><div class="title">Canvasmith — ${escapeHtml(state.name)}</div></div>
<div class="menubar" aria-hidden="true" title="The native menu bar is a demo-only decoration"><b>Canvasmith</b><span>File</span><span>Edit</span><span>Object</span><span>Arrange</span><span>View</span><span>Window</span><span>Help</span></div>
<div class="toolbar"><div class="toolgroup" role="toolbar" aria-label="Tools">${tools}</div><div class="file">${escapeHtml(state.name)} / <span>${escapeHtml(sel.doc.file)}</span></div><div class="toolgroup">${zoom}${exportButton}</div></div>
<section class="work"><aside class="sidebar" aria-label="Project">${column('left')}</aside>${main}<aside class="inspector" aria-label="Inspector">${column('right')}</aside></section>
<footer class="statusbar"><span id="status">${last === undefined ? 'Ready' : escapeHtml(last.text)} · All changes saved</span><span>1 page · ${String(countLayers(sel.doc))} layers · RGB</span></footer></main>
</body>
</html>`
    },
  }
}

export interface ShellConfig {
  readonly prefix?: string
}

export const name = 'window-shell'
export const inject = ['project', 'router']

export function apply(ctx: Context, config: ShellConfig = {}): void {
  const prefix = config.prefix ?? ''
  ctx.provide('windowShell', createShell(ctx.project, prefix))
  ctx.router.route(prefix === '' ? '/' : prefix, new Acryl().get('/health', (c) => c.json({ ok: true })))
}
