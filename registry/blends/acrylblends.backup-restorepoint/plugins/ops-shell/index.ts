/**
 * The operations console shell (`ctx.opsShell`): the rail (brand, the workload list and the page links plugins register), the footer note, and the page
 * area. Pages are plugins that register a nav entry with `ctx.opsShell.nav(...)` and render with `ctx.opsShell.page(...)`; the rail's workload list and
 * readiness note are parts registered with `ctx.opsShell.side(...)`. Both inside `ctx.effect`, so an entry leaves with its plugin. What is open is the
 * URL's query (`?workload=`, `?point=`, `?scope=`, `?dest=`): transient, not part of the saved state.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { DESTINATIONS, type Destination, type Ops, type RecoveryPoint, type Scope, type Workload, latestVerified } from '../restorepoint/index.ts'
import { OPS_STYLES } from './styles.ts'

export { OPS_STYLES }

export interface Selection {
  readonly workload: Workload
  /** `?point=` when it is one of the workload's, else its latest verified point, else its newest. */
  readonly point: RecoveryPoint | undefined
  readonly scope: Scope
  readonly dest: Destination
}

export interface SidePart {
  readonly id: string
  readonly column: 'left' | 'foot'
  readonly order: number
  render(selection: Selection, url: string): string
}

export interface NavEntry {
  readonly id: string
  readonly label: string
  readonly icon: string
  readonly path: string
  readonly order: number
}

export interface OpsShell {
  readonly prefix: string
  href(path: string): string
  hrefFor(path: string, selection: { workload: string; point?: string | undefined; scope?: string | undefined; dest?: string | undefined }): string
  side(part: SidePart): () => void
  nav(entry: NavEntry): () => void
  selection(url: string): Selection
  /** The selection a form's hidden fields name. */
  fromBody(body: Record<string, unknown>): Selection
  hidden(selection: Selection): string
  notice(url: string): string
  page(input: { title: string; main: string; url: string; current?: string }): string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    opsShell: OpsShell
  }
}

export const APP_TITLE = 'Restorepoint'

export const escapeHtml = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')

export function withNotice(path: string, kind: 'ok' | 'error', text: string): string {
  const [base = '', hash] = path.split('#')
  return `${base}${base.includes('?') ? '&' : '?'}${kind}=${encodeURIComponent(text)}${hash === undefined ? '' : `#${hash}`}`
}

export function opsErrorOf(error: unknown): { code: 'invalid' | 'not-found' | 'conflict'; message: string } | undefined {
  if (error instanceof Error && error.name === 'OpsError') {
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

export function createShell(ops: Ops, prefix: string): OpsShell {
  const parts = new Map<string, SidePart>()
  const entries = new Map<string, NavEntry>()
  const href = (path: string): string => {
    const clean = path.startsWith('/') ? path : `/${path}`
    if (prefix === '') return clean
    return clean === '/' ? `${prefix}/` : `${prefix}${clean}`
  }
  const resolve = (get: (n: string) => string | undefined | null): Selection => {
    const workload = ops.state.workloads.find((w) => w.id === get('workload')) ?? ops.state.workloads[0]
    if (workload === undefined) throw new Error('there is no workload')
    const point = workload.points.find((p) => p.id === get('point')) ?? latestVerified(workload) ?? workload.points.at(-1)
    const scope = workload.scopes.find((s) => s.name === get('scope')) ?? workload.scopes[0]
    if (scope === undefined) throw new Error('the workload has no scope')
    const dest = DESTINATIONS.find((d) => d.id === get('dest')) ?? DESTINATIONS[0]
    if (dest === undefined) throw new Error('there is no destination')
    return { workload, point, scope, dest }
  }
  const shell: OpsShell = {
    prefix,
    href,
    hrefFor(path, sel) {
      const q = new URLSearchParams({ workload: sel.workload })
      for (const [k, v] of [['point', sel.point], ['scope', sel.scope], ['dest', sel.dest]] as const) if (v !== undefined) q.set(k, v)
      return `${href(path)}?${q.toString()}`
    },
    side(part) {
      if (parts.has(part.id)) throw new Error(`the console already has a part "${part.id}"`)
      parts.set(part.id, part)
      return () => {
        if (parts.get(part.id) === part) parts.delete(part.id)
      }
    },
    nav(entry) {
      if (entries.has(entry.id)) throw new Error(`the console already has a page "${entry.id}"`)
      entries.set(entry.id, entry)
      return () => {
        if (entries.get(entry.id) === entry) entries.delete(entry.id)
      }
    },
    selection: (url) => {
      const q = new URL(url, 'http://local').searchParams
      return resolve((n) => q.get(n))
    },
    fromBody: (body) => resolve((n) => fieldOf(body, n)),
    hidden: (sel) => `<input type="hidden" name="workload" value="${escapeHtml(sel.workload.id)}">${sel.point === undefined ? '' : `<input type="hidden" name="point" value="${escapeHtml(sel.point.id)}">`}`,
    notice(url) {
      const q = new URL(url, 'http://local').searchParams
      const n = (['error', 'ok'] as const).map((kind) => ({ kind, text: q.get(kind) })).find((x) => x.text !== null && x.text !== '')
      return `<div class="status${n?.kind === 'error' ? ' error' : ''}" id="status">${n === undefined ? '<p>No restore operation started.</p>' : `<p role="${n.kind === 'ok' ? 'status' : 'alert'}">${escapeHtml(n.text ?? '')}</p>`}</div>`
    },
    page({ title, main, url, current }) {
      const sel = shell.selection(url)
      const left = [...parts.values()].filter((p) => p.column === 'left').sort((a, b) => a.order - b.order).map((p) => p.render(sel, url)).join('')
      const foot = [...parts.values()].filter((p) => p.column === 'foot').sort((a, b) => a.order - b.order).map((p) => p.render(sel, url)).join('')
      const nav = [...entries.values()].sort((a, b) => a.order - b.order).map((e) => `<a class="workload${e.id === current ? ' active' : ''}" data-nav="${escapeHtml(e.id)}" href="${shell.hrefFor(e.path, { workload: sel.workload.id })}"${e.id === current ? ' aria-current="page"' : ''}>${e.icon} &nbsp;${escapeHtml(e.label)}</a>`).join('')
      return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · ${APP_TITLE}</title>
<style>${OPS_STYLES}</style>
</head>
<body>
<div class="app"><aside class="left" aria-label="Workloads and operations"><a class="brand" href="${href('/')}">restore<span>point</span></a><div class="org">Ops center / ${escapeHtml(ops.state.org)}</div>${left}${nav === '' ? '' : `<div class="cap">Operations</div><nav aria-label="Operations">${nav}</nav>`}${foot}</aside><main class="main">${main}</main></div>
</body>
</html>`
    },
  }
  return shell
}

export interface ShellConfig {
  readonly prefix?: string
}

export const name = 'ops-shell'
export const inject = ['ops', 'router']

export function apply(ctx: Context, config: ShellConfig = {}): void {
  const prefix = config.prefix ?? ''
  ctx.provide('opsShell', createShell(ctx.ops, prefix))
  ctx.router.route(prefix === '' ? '/' : prefix, new Acryl().get('/health', (c) => c.json({ ok: true })))
}
