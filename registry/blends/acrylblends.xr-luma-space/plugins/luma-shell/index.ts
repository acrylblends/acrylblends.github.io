/**
 * The scene editor shell (`ctx.lumaShell`): the object rail, the viewport and the inspector column. The viewport is the page's `main`; the rail and the
 * inspector are parts plugins register with `ctx.lumaShell.side(...)` inside `ctx.effect`, so a part leaves with its plugin. The object being inspected
 * is the URL's `?object=`: transient editor state, not part of the saved scene.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type { Scene, SceneObject } from '../luma/index.ts'
import { LUMA_STYLES } from './styles.ts'

export { LUMA_STYLES }

export interface Selection {
  /** The object `?object=` names, else the first; absent when the scene is empty. */
  readonly object: SceneObject | undefined
}

export interface SidePart {
  readonly id: string
  readonly column: 'left' | 'right'
  readonly order: number
  render(selection: Selection, url: string): string
}

export interface LumaShell {
  readonly prefix: string
  href(path: string): string
  hrefFor(path: string, objectId: string | undefined): string
  side(part: SidePart): () => void
  selection(url: string): Selection
  hidden(selection: Selection): string
  notice(url: string): string
  page(input: { title: string; main: string; url: string; mode?: string }): string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    lumaShell: LumaShell
  }
}

export const APP_TITLE = 'Luma Space'

export const escapeHtml = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')

export function withNotice(path: string, kind: 'ok' | 'error', text: string): string {
  const [base = '', hash] = path.split('#')
  return `${base}${base.includes('?') ? '&' : '?'}${kind}=${encodeURIComponent(text)}${hash === undefined ? '' : `#${hash}`}`
}

export function sceneErrorOf(error: unknown): { code: 'invalid' | 'not-found' | 'conflict'; message: string } | undefined {
  if (error instanceof Error && error.name === 'SceneError') {
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
export function backTo(shell: LumaShell, raw: string | undefined, fallback: string): string {
  if (raw !== undefined && raw.startsWith(shell.prefix === '' ? '/' : shell.prefix) && !raw.startsWith('//') && !raw.includes('\\')) {
    const url = new URL(raw, 'http://local')
    url.searchParams.delete('ok')
    url.searchParams.delete('error')
    return `${url.pathname}${url.search}`
  }
  return fallback
}

export function createShell(scene: Scene, prefix: string): LumaShell {
  const parts = new Map<string, SidePart>()
  const href = (path: string): string => {
    const clean = path.startsWith('/') ? path : `/${path}`
    if (prefix === '') return clean
    return clean === '/' ? `${prefix}/` : `${prefix}${clean}`
  }
  const selection = (url: string): Selection => {
    const id = new URL(url, 'http://local').searchParams.get('object')
    const objects = scene.state.objects
    return { object: objects.find((o) => o.id === id) ?? objects[0] }
  }
  return {
    prefix,
    href,
    hrefFor: (path, objectId) => (objectId === undefined ? href(path) : `${href(path)}?object=${encodeURIComponent(objectId)}`),
    side(part) {
      if (parts.has(part.id)) throw new Error(`the editor already has a part "${part.id}"`)
      parts.set(part.id, part)
      return () => {
        if (parts.get(part.id) === part) parts.delete(part.id)
      }
    },
    selection,
    hidden: (sel) => (sel.object === undefined ? '' : `<input type="hidden" name="object" value="${escapeHtml(sel.object.id)}">`),
    notice(url) {
      const q = new URL(url, 'http://local').searchParams
      const n = (['error', 'ok'] as const).map((kind) => ({ kind, text: q.get(kind) })).find((x) => x.text !== null && x.text !== '')
      return n === undefined ? '' : `<p class="toast show ${n.kind}" role="${n.kind === 'ok' ? 'status' : 'alert'}">${escapeHtml(n.text ?? '')}</p>`
    },
    page({ title, main, url }) {
      const sel = selection(url)
      const column = (which: 'left' | 'right') => [...parts.values()].filter((p) => p.column === which).sort((a, b) => a.order - b.order).map((p) => p.render(sel, url)).join('')
      return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · ${APP_TITLE}</title>
<style>${LUMA_STYLES}</style>
</head>
<body>
<div class="app"><aside class="rail" aria-label="Scene objects"><a class="logo" href="${href('/')}">luma<span>space</span></a>${column('left')}</aside>${main}<aside class="inspector" aria-label="Object inspector">${column('right')}</aside></div>
</body>
</html>`
    },
  }
}

export interface ShellConfig {
  readonly prefix?: string
}

export const name = 'luma-shell'
export const inject = ['scene', 'router']

export function apply(ctx: Context, config: ShellConfig = {}): void {
  const prefix = config.prefix ?? ''
  ctx.provide('lumaShell', createShell(ctx.scene, prefix))
  ctx.router.route(prefix === '' ? '/' : prefix, new Acryl().get('/health', (c) => c.json({ ok: true })))
}
