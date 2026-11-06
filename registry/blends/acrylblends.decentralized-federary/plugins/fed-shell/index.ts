/**
 * The federation console shell (`ctx.fedShell`): the masthead (brand, title and the buttons plugins put there), the stats strip, the topology and the
 * side column. The topology is the page's `main`; the masthead buttons, the stats and the side panels are parts plugins register with
 * `ctx.fedShell.side(...)` inside `ctx.effect`, so a part leaves with its plugin. The open instance is the URL's `?instance=`: transient, not saved.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type { Fed, Instance } from '../federary/index.ts'
import { FED_STYLES } from './styles.ts'

export { FED_STYLES }

export interface Selection {
  /** The instance `?instance=` names, else the primary. */
  readonly instance: Instance
  /** The request `?request=` highlights in the queue, if it names a pending one. */
  readonly request: string | undefined
}

export interface SidePart {
  readonly id: string
  readonly column: 'actions' | 'stats' | 'side'
  readonly order: number
  render(selection: Selection, url: string): string
}

export interface FedShell {
  readonly prefix: string
  href(path: string): string
  hrefFor(path: string, instance: string, extra?: Record<string, string>): string
  side(part: SidePart): () => void
  selection(url: string): Selection
  notice(url: string): string
  page(input: { title: string; main: string; url: string }): string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    fedShell: FedShell
  }
}

export const APP_TITLE = 'Federary Network'

export const escapeHtml = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')

export function withNotice(path: string, kind: 'ok' | 'error', text: string): string {
  const [base = '', hash] = path.split('#')
  return `${base}${base.includes('?') ? '&' : '?'}${kind}=${encodeURIComponent(text)}${hash === undefined ? '' : `#${hash}`}`
}

export function fedErrorOf(error: unknown): { code: 'invalid' | 'not-found' | 'conflict'; message: string } | undefined {
  if (error instanceof Error && error.name === 'FedError') {
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

export function createShell(fed: Fed, prefix: string): FedShell {
  const parts = new Map<string, SidePart>()
  const href = (path: string): string => {
    const clean = path.startsWith('/') ? path : `/${path}`
    if (prefix === '') return clean
    return clean === '/' ? `${prefix}/` : `${prefix}${clean}`
  }
  const shell: FedShell = {
    prefix,
    href,
    hrefFor: (path, instance, extra = {}) => `${href(path)}?${new URLSearchParams({ instance, ...extra }).toString()}`,
    side(part) {
      if (parts.has(part.id)) throw new Error(`the console already has a part "${part.id}"`)
      parts.set(part.id, part)
      return () => {
        if (parts.get(part.id) === part) parts.delete(part.id)
      }
    },
    selection(url) {
      const q = new URL(url, 'http://local').searchParams
      const instance = fed.state.instances.find((i) => i.id === q.get('instance')) ?? fed.primary
      const request = fed.state.instances.find((i) => i.id === q.get('request') && i.relation === 'pending-in')?.id
      return { instance, request }
    },
    notice(url) {
      const q = new URL(url, 'http://local').searchParams
      const n = (['error', 'ok'] as const).map((kind) => ({ kind, text: q.get(kind) })).find((x) => x.text !== null && x.text !== '')
      return `<div class="notice${n?.kind === 'error' ? ' error' : ''}" id="notice" aria-live="polite">${n === undefined ? '' : `<p role="${n.kind === 'ok' ? 'status' : 'alert'}">${escapeHtml(n.text ?? '')}</p>`}</div>`
    },
    page({ title, main, url }) {
      const sel = shell.selection(url)
      const column = (which: SidePart['column']) => [...parts.values()].filter((p) => p.column === which).sort((a, b) => a.order - b.order).map((p) => p.render(sel, url)).join('')
      return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · ${APP_TITLE}</title>
<style>${FED_STYLES}</style>
</head>
<body>
<main class="app"><header class="head"><div><a class="brand" href="${href('/')}">federary <span>network</span></a><h1>Federation map</h1><div class="muted">A fictional network of independently operated instances.</div></div><div class="headbtns">${column('actions')}</div></header>
<section class="stats" aria-label="Network">${column('stats')}</section>
<div class="grid"><div>${main}</div><aside class="side" aria-label="Instance, requests and moderation">${column('side')}</aside></div></main>
</body>
</html>`
    },
  }
  return shell
}

export interface ShellConfig {
  readonly prefix?: string
}

export const name = 'fed-shell'
export const inject = ['fed', 'router']

export function apply(ctx: Context, config: ShellConfig = {}): void {
  const prefix = config.prefix ?? ''
  ctx.provide('fedShell', createShell(ctx.fed, prefix))
  ctx.router.route(prefix === '' ? '/' : prefix, new Acryl().get('/health', (c) => c.json({ ok: true })))
}

/** A small POST button for the console's actions; `back` is where the person lands. */
export function postButton(shell: FedShell, path: string, back: string, fields: Record<string, string>, label: string, cls = '', attrs = ''): string {
  const hidden = Object.entries({ ...fields, back }).map(([k, v]) => `<input type="hidden" name="${k}" value="${escapeHtml(v)}">`).join('')
  return `<form method="post" action="${shell.href(path)}">${hidden}<button type="submit" class="${cls}"${attrs === '' ? '' : ` ${attrs}`}>${label}</button></form>`
}

/** Where a form came back to: a path of this app from its hidden `back`, else the console. */
export function backTo(shell: FedShell, raw: string | undefined, fallback: string): string {
  if (raw !== undefined && raw.startsWith(shell.prefix === '' ? '/' : shell.prefix) && !raw.startsWith('//') && !raw.includes('\\')) {
    const url = new URL(raw, 'http://local')
    url.searchParams.delete('ok')
    url.searchParams.delete('error')
    return `${url.pathname}${url.search}${url.hash}`
  }
  return fallback
}
