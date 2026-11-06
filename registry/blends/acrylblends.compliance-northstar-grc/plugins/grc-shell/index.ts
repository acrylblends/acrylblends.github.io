/**
 * The assurance cockpit shell (`ctx.grcShell`): the masthead (brand, title and the buttons plugins put there), the posture strip, the register and the
 * side column. The control register is the page's `main`; the masthead buttons, the posture strip and the side column are parts plugins register with
 * `ctx.grcShell.side(...)` inside `ctx.effect`, so a part leaves with its plugin. What is filtered and open is the URL's query (`?framework=`, `?owner=`,
 * `?status=`, `?control=`, `?risk=`, `?newrisk=1`): transient, not part of the saved workspace.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { type Control, type Grc, type Risk, filterControls } from '../grc/index.ts'
import { GRC_STYLES } from './styles.ts'

export { GRC_STYLES }

export interface Selection {
  readonly framework: string
  readonly owner: string
  readonly status: string
  /** The control `?control=` names if it is in the filtered register, else the first of the filtered register; absent when the filter matches nothing. */
  readonly control: Control | undefined
  readonly risk: Risk | undefined
  readonly newRisk: boolean
}

export interface SidePart {
  readonly id: string
  readonly column: 'actions' | 'stats' | 'side'
  readonly order: number
  render(selection: Selection, url: string): string
}

export interface GrcShell {
  readonly prefix: string
  href(path: string): string
  /** The page's URL for a selection, with `patch` fields replaced (a `null` removes a field). */
  hrefFor(path: string, sel: Selection, patch?: Partial<Record<'framework' | 'owner' | 'status' | 'control' | 'risk' | 'newrisk', string | null>>): string
  side(part: SidePart): () => void
  selection(url: string): Selection
  fromBody(body: Record<string, unknown>): Selection
  hidden(selection: Selection): string
  notice(url: string): string
  page(input: { title: string; main: string; url: string }): string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    grcShell: GrcShell
  }
}

export const APP_TITLE = 'Northstar GRC'

export const escapeHtml = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')

export function withNotice(path: string, kind: 'ok' | 'error', text: string): string {
  const [base = '', hash] = path.split('#')
  return `${base}${base.includes('?') ? '&' : '?'}${kind}=${encodeURIComponent(text)}${hash === undefined ? '' : `#${hash}`}`
}

export function grcErrorOf(error: unknown): { code: 'invalid' | 'not-found' | 'conflict'; message: string } | undefined {
  if (error instanceof Error && error.name === 'GrcError') {
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

export function createShell(grc: Grc, prefix: string): GrcShell {
  const parts = new Map<string, SidePart>()
  const href = (path: string): string => {
    const clean = path.startsWith('/') ? path : `/${path}`
    if (prefix === '') return clean
    return clean === '/' ? `${prefix}/` : `${prefix}${clean}`
  }
  const resolve = (get: (n: string) => string | undefined | null): Selection => {
    const s = grc.state
    const framework = s.frameworks.includes(get('framework') ?? '') ? (get('framework') as string) : 'all'
    const owner = s.controls.some((c) => c.owner === get('owner')) ? (get('owner') as string) : 'all'
    const status = ['Current', 'Review', 'Exception'].includes(get('status') ?? '') ? (get('status') as string) : 'all'
    const shown = filterControls(s, { framework, owner, status }, grc.now())
    return { framework, owner, status, control: shown.find((c) => c.id === get('control')) ?? shown[0], risk: s.risks.find((r) => r.id === get('risk')), newRisk: get('newrisk') === '1' }
  }
  const shell: GrcShell = {
    prefix,
    href,
    hrefFor(path, sel, patch = {}) {
      const q = new URLSearchParams()
      const base: Record<string, string | null | undefined> = { framework: sel.framework === 'all' ? null : sel.framework, owner: sel.owner === 'all' ? null : sel.owner, status: sel.status === 'all' ? null : sel.status, control: sel.control?.id, risk: sel.risk?.id, ...patch }
      for (const [k, v] of Object.entries(base)) if (v !== null && v !== undefined) q.set(k, v)
      const text = q.toString()
      return `${href(path)}${text === '' ? '' : `?${text}`}`
    },
    side(part) {
      if (parts.has(part.id)) throw new Error(`the cockpit already has a part "${part.id}"`)
      parts.set(part.id, part)
      return () => {
        if (parts.get(part.id) === part) parts.delete(part.id)
      }
    },
    selection: (url) => {
      const q = new URL(url, 'http://local').searchParams
      return resolve((n) => q.get(n))
    },
    fromBody: (body) => resolve((n) => fieldOf(body, n)),
    hidden(sel) {
      const f = (n: string, v: string | undefined) => (v === undefined || v === 'all' ? '' : `<input type="hidden" name="${n}" value="${escapeHtml(v)}">`)
      return f('framework', sel.framework) + f('owner', sel.owner) + f('status', sel.status) + f('control', sel.control?.id) + f('risk', sel.risk?.id)
    },
    notice(url) {
      const q = new URL(url, 'http://local').searchParams
      const n = (['error', 'ok'] as const).map((kind) => ({ kind, text: q.get(kind) })).find((x) => x.text !== null && x.text !== '')
      return `<div class="toast${n?.kind === 'error' ? ' error' : ''}" id="feedback" aria-live="polite">${n === undefined ? '' : `<p role="${n.kind === 'ok' ? 'status' : 'alert'}">${escapeHtml(n.text ?? '')}</p>`}</div>`
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
<style>${GRC_STYLES}</style>
</head>
<body>
<div class="app"><header class="mast"><div><a class="brand" href="${href('/')}">northstar <span>/ assurance</span></a><div class="eyebrow">Governance workspace · ${escapeHtml(grc.state.year)}</div><h1>Control assurance</h1><div class="hint">A working view of controls, evidence freshness and accepted risk.</div></div><div class="mastbtns">${column('actions')}</div></header>
<section class="stats" aria-label="Posture">${column('stats')}</section>
<div class="layout"><main>${main}</main><aside class="sidecol" aria-label="Risks, evidence and actions">${column('side')}</aside></div></div>
</body>
</html>`
    },
  }
  return shell
}

export interface ShellConfig {
  readonly prefix?: string
}

export const name = 'grc-shell'
export const inject = ['grc', 'router']

export function apply(ctx: Context, config: ShellConfig = {}): void {
  const prefix = config.prefix ?? ''
  ctx.provide('grcShell', createShell(ctx.grc, prefix))
  ctx.router.route(prefix === '' ? '/' : prefix, new Acryl().get('/health', (c) => c.json({ ok: true })))
}
