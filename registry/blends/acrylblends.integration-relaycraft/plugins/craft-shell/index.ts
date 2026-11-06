/**
 * The studio shell (`ctx.craftShell`): the dark rail (brand, workspace, the pages plugins registered with `nav`, the plan card) and the main area with
 * the title and actions. A page plugin registers its rail entry with `ctx.craftShell.nav(...)` inside `ctx.effect` and renders with
 * `ctx.craftShell.page(...)`; a plugin that adds a card to the pipelines page's right column does it with `ctx.craftShell.side(...)`. The pipeline
 * being edited is `?pipeline=`; `ctx.craftShell.selected(url)` resolves it.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type { Pipeline, Studio } from '../relaycraft/index.ts'
import { CRAFT_STYLES } from './styles.ts'

export { CRAFT_STYLES }

export interface NavItem {
  readonly id: string
  readonly label: string
  readonly icon: string
  readonly path: string
  readonly order: number
}

export interface SidePart {
  readonly id: string
  readonly order: number
  render(pipeline: Pipeline, url: string): string
}

export interface PageInput {
  readonly active: string
  readonly title: string
  /** The crumb above the title, after "Pipelines /". */
  readonly crumb?: string
  readonly main: string
  readonly url: string
  /** Buttons at the top right. */
  readonly actions?: string
  /** Show the right column (the plugins' side parts) beside the page. */
  readonly aside?: boolean
}

export interface CraftShell {
  readonly prefix: string
  href(path: string): string
  hrefFor(path: string, pipelineId: string): string
  nav(item: NavItem): () => void
  side(part: SidePart): () => void
  has(id: string): boolean
  selected(url: string): Pipeline
  page(input: PageInput): string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    craftShell: CraftShell
  }
}

export const APP_TITLE = 'Relaycraft'

export const escapeHtml = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')

export function withNotice(path: string, kind: 'ok' | 'error', text: string): string {
  const [base = '', hash] = path.split('#')
  return `${base}${base.includes('?') ? '&' : '?'}${kind}=${encodeURIComponent(text)}${hash === undefined ? '' : `#${hash}`}`
}

export function studioErrorOf(error: unknown): { code: 'invalid' | 'not-found' | 'conflict'; message: string } | undefined {
  if (error instanceof Error && error.name === 'StudioError') {
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

export function createShell(studio: Studio, prefix: string): CraftShell {
  const items = new Map<string, NavItem>()
  const parts = new Map<string, SidePart>()
  const href = (path: string): string => {
    const clean = path.startsWith('/') ? path : `/${path}`
    if (prefix === '') return clean
    return clean === '/' ? `${prefix}/` : `${prefix}${clean}`
  }
  const selected = (url: string): Pipeline => {
    const wanted = new URL(url, 'http://local').searchParams.get('pipeline')
    const pipelines = studio.state.pipelines
    const pipeline = pipelines.find((p) => p.id === wanted) ?? pipelines[0]
    if (pipeline === undefined) throw new Error('the studio has no pipelines')
    return pipeline
  }
  return {
    prefix,
    href,
    hrefFor: (path, pipelineId) => `${href(path)}?pipeline=${encodeURIComponent(pipelineId)}`,
    nav(item) {
      if (items.has(item.id)) throw new Error(`the rail already has "${item.id}"`)
      items.set(item.id, item)
      return () => {
        if (items.get(item.id) === item) items.delete(item.id)
      }
    },
    side(part) {
      if (parts.has(part.id)) throw new Error(`the studio already has a side part "${part.id}"`)
      parts.set(part.id, part)
      return () => {
        if (parts.get(part.id) === part) parts.delete(part.id)
      }
    },
    has: (id) => items.has(id) || parts.has(id),
    selected,
    page({ active, title, crumb, main, url, actions, aside }) {
      const pipeline = selected(url)
      const query = new URL(url, 'http://local').searchParams
      const notice = (['error', 'ok'] as const).map((kind) => ({ kind, text: query.get(kind) })).find((n) => n.text !== null && n.text !== '')
      const nav = [...items.values()].sort((a, b) => a.order - b.order).map((i) => `<a href="${href(i.path)}${i.id === 'pipelines' ? `?pipeline=${encodeURIComponent(pipeline.id)}` : ''}"${i.id === active ? ' class="active" aria-current="page"' : ''}>${i.icon} ${escapeHtml(i.label)}</a>`).join('')
      const column = [...parts.values()].sort((a, b) => a.order - b.order).map((p) => p.render(pipeline, url)).join('')
      const state = studio.state
      const flows = state.pipelines.length
      return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · ${APP_TITLE}</title>
<style>${CRAFT_STYLES}</style>
</head>
<body>
<div class="app"><aside class="side"><div class="brand">relay<b>craft</b></div><div class="workspace">Workspace / ${escapeHtml(state.workspace)}</div><nav class="nav" aria-label="Studio">${nav}</nav>
<div class="sidecard">PLAN <b style="float:right;color:#75e2bd">TEAM</b><p>${String(flows)} of ${String(state.planLimit)} active flows</p><div style="height:4px;background:#31545a;border-radius:5px"><div style="width:${String(Math.min(100, Math.round((flows / state.planLimit) * 100)))}%;height:4px;background:#52d3b8;border-radius:5px"></div></div></div></aside>
<main class="main"><div class="top"><div><div class="crumb">Pipelines / <b>${escapeHtml(crumb ?? title)}</b></div><h1>${escapeHtml(title)}</h1></div><div class="actions">${actions ?? ''}</div></div>
${notice === undefined ? '' : `<p class="alert ${notice.kind}" role="${notice.kind === 'ok' ? 'status' : 'alert'}">${escapeHtml(notice.text ?? '')}</p>`}
<div class="grid${aside === true ? '' : ' one'}"><section>${main}</section>${aside === true ? `<aside aria-label="Connections and runs">${column}</aside>` : ''}</div></main></div>
</body>
</html>`
    },
  }
}

export interface ShellConfig {
  readonly prefix?: string
}

export const name = 'craft-shell'
export const inject = ['studio', 'router']

export function apply(ctx: Context, config: ShellConfig = {}): void {
  const prefix = config.prefix ?? ''
  ctx.provide('craftShell', createShell(ctx.studio, prefix))
  ctx.router.route(prefix === '' ? '/' : prefix, new Acryl().get('/health', (c) => c.json({ ok: true })))
}
