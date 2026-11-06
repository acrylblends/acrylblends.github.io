/**
 * The audit console shell (`ctx.auditShell`): the top bar (brand, release, the buttons plugins put there), the priority rail, the live preview and the
 * issue detail column. The preview is the page's `main`; the rail, the top buttons and the detail column are parts plugins register with
 * `ctx.auditShell.side(...)` inside `ctx.effect`, so a part leaves with its plugin. The open finding and the severity filter are the URL's `?issue=`
 * and `?severity=`: transient state, not part of the saved audit.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type { Audit, Issue, Severity } from '../clearpath/index.ts'
import { AUDIT_STYLES } from './styles.ts'

export { AUDIT_STYLES }

export type FilterId = 'all' | Severity

export interface Selection {
  readonly filter: FilterId
  /** The finding `?issue=` names if it is in the filter, else the first open one in the filter, else the first in the filter; absent when the filter is empty. */
  readonly issue: Issue | undefined
}

export interface SidePart {
  readonly id: string
  readonly column: 'left' | 'right' | 'top'
  readonly order: number
  render(selection: Selection, url: string): string
}

export interface AuditShell {
  readonly prefix: string
  href(path: string): string
  hrefFor(path: string, selection: { filter: FilterId; issue?: string | undefined }): string
  side(part: SidePart): () => void
  selection(url: string): Selection
  hidden(selection: Selection): string
  /** Where a form came back to, from its hidden `severity` and `issue` fields. */
  backFor(body: Record<string, unknown>): string
  notice(url: string): string
  page(input: { title: string; main: string; url: string }): string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    auditShell: AuditShell
  }
}

export const APP_TITLE = 'Clearpath Audit'
export const FILTER_IDS: readonly FilterId[] = ['all', 'high', 'medium', 'low']

export const escapeHtml = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')

export function withNotice(path: string, kind: 'ok' | 'error', text: string): string {
  const [base = '', hash] = path.split('#')
  return `${base}${base.includes('?') ? '&' : '?'}${kind}=${encodeURIComponent(text)}${hash === undefined ? '' : `#${hash}`}`
}

export function auditErrorOf(error: unknown): { code: 'invalid' | 'not-found' | 'conflict'; message: string } | undefined {
  if (error instanceof Error && error.name === 'AuditError') {
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

export function createShell(audit: Audit, prefix: string): AuditShell {
  const parts = new Map<string, SidePart>()
  const href = (path: string): string => {
    const clean = path.startsWith('/') ? path : `/${path}`
    if (prefix === '') return clean
    return clean === '/' ? `${prefix}/` : `${prefix}${clean}`
  }
  const resolve = (get: (n: string) => string | undefined | null): Selection => {
    const filter = FILTER_IDS.find((f) => f === get('severity')) ?? 'all'
    const inFilter = audit.state.issues.filter((i) => filter === 'all' || i.severity === filter)
    return { filter, issue: inFilter.find((i) => i.id === get('issue')) ?? inFilter.find((i) => !i.resolved) ?? inFilter[0] }
  }
  const query = (sel: { filter: FilterId; issue?: string | undefined }): string => new URLSearchParams({ severity: sel.filter, ...(sel.issue === undefined ? {} : { issue: sel.issue }) }).toString()
  const shell: AuditShell = {
    prefix,
    href,
    hrefFor: (path, sel) => `${href(path)}?${query(sel)}`,
    side(part) {
      if (parts.has(part.id)) throw new Error(`the console already has a part "${part.id}"`)
      parts.set(part.id, part)
      return () => {
        if (parts.get(part.id) === part) parts.delete(part.id)
      }
    },
    selection: (url) => {
      const q = new URL(url, 'http://local').searchParams
      return resolve((n) => q.get(n))
    },
    hidden: (sel) => `<input type="hidden" name="severity" value="${escapeHtml(sel.filter)}">${sel.issue === undefined ? '' : `<input type="hidden" name="issue" value="${escapeHtml(sel.issue.id)}">`}`,
    backFor(body) {
      const sel = resolve((n) => fieldOf(body, n))
      return `${href('/')}?${query({ filter: sel.filter, issue: sel.issue?.id })}`
    },
    notice(url) {
      const q = new URL(url, 'http://local').searchParams
      const n = (['error', 'ok'] as const).map((kind) => ({ kind, text: q.get(kind) })).find((x) => x.text !== null && x.text !== '')
      return `<div class="status${n?.kind === 'error' ? ' error' : ''}" id="status">${n === undefined ? '<p>Select an issue to inspect the affected component.</p>' : `<p role="${n.kind === 'ok' ? 'status' : 'alert'}">${escapeHtml(n.text ?? '')}</p>`}</div>`
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
<style>${AUDIT_STYLES}</style>
</head>
<body>
<header class="top"><div><a class="brand" href="${href('/')}">clearpath<span>audit</span></a><div class="crumb">${escapeHtml(audit.state.product)} / ${escapeHtml(audit.state.release)}</div></div><div>${column('top')}</div></header>
<div class="layout"><aside class="issues" aria-label="Audit summary and findings">${column('left')}</aside><main class="center">${main}</main><aside class="detail" aria-label="Finding details">${column('right')}</aside></div>
</body>
</html>`
    },
  }
  return shell
}

export interface ShellConfig {
  readonly prefix?: string
}

export const name = 'audit-shell'
export const inject = ['audit', 'router']

export function apply(ctx: Context, config: ShellConfig = {}): void {
  const prefix = config.prefix ?? ''
  ctx.provide('auditShell', createShell(ctx.audit, prefix))
  ctx.router.route(prefix === '' ? '/' : prefix, new Acryl().get('/health', (c) => c.json({ ok: true })))
}
