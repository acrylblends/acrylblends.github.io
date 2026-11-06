/**
 * The terminal shell (`ctx.termShell`): the rail (brand, parts, footer note), the top bar, the console area and the right column. The console is the
 * page's `main`; the rail and the right column are parts plugins put there with `ctx.termShell.side(...)` inside `ctx.effect`, so a part leaves with
 * its plugin. What is selected lives in the URL: `?ws=` the workspace, `?tab=` the tab, `?cmd=` a command to put in the prompt.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type { Forge, Tab, Workspace } from '../termforge/index.ts'
import { TERM_STYLES } from './styles.ts'

export { TERM_STYLES }

export interface Selection {
  readonly workspace: Workspace
  readonly tab: Tab
  /** A command to put in the prompt (`?cmd=`), from a shortcut, snippet or recent command. */
  readonly prefill: string
}

export interface SidePart {
  readonly id: string
  readonly column: 'left' | 'right'
  readonly order: number
  render(selection: Selection, url: string): string
}

export interface TermShell {
  readonly prefix: string
  href(path: string): string
  hrefFor(path: string, selection: { ws: string; tab: string; cmd?: string }): string
  side(part: SidePart): () => void
  selection(url: string): Selection
  /** The workspace and tab a form names (`ws`, `tab`), else the first of each. */
  target(body: Record<string, unknown>): { ws: string; tab: string }
  hidden(selection: { workspace: Workspace; tab: Tab }): string
  notice(url: string): string
  page(input: { title: string; main: string; url: string }): string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    termShell: TermShell
  }
}

export const APP_TITLE = 'Termforge'

export const escapeHtml = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')

export function withNotice(path: string, kind: 'ok' | 'error', text: string): string {
  const [base = '', hash] = path.split('#')
  return `${base}${base.includes('?') ? '&' : '?'}${kind}=${encodeURIComponent(text)}${hash === undefined ? '' : `#${hash}`}`
}

export function forgeErrorOf(error: unknown): { code: 'invalid' | 'not-found' | 'conflict'; message: string } | undefined {
  if (error instanceof Error && error.name === 'ForgeError') {
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
export function backTo(shell: TermShell, raw: string | undefined, fallback: string): string {
  if (raw !== undefined && raw.startsWith(shell.prefix === '' ? '/' : shell.prefix) && !raw.startsWith('//') && !raw.includes('\\')) {
    const url = new URL(raw, 'http://local')
    url.searchParams.delete('ok')
    url.searchParams.delete('error')
    return `${url.pathname}${url.search}`
  }
  return fallback
}

export function createShell(forge: Forge, prefix: string): TermShell {
  const parts = new Map<string, SidePart>()
  const href = (path: string): string => {
    const clean = path.startsWith('/') ? path : `/${path}`
    if (prefix === '') return clean
    return clean === '/' ? `${prefix}/` : `${prefix}${clean}`
  }
  const selection = (url: string): Selection => {
    const q = new URL(url, 'http://local').searchParams
    const all = forge.state.workspaces
    const workspace = all.find((w) => w.id === q.get('ws')) ?? all[0]
    if (workspace === undefined) throw new Error('there is no workspace')
    const tab = workspace.tabs.find((t) => t.id === q.get('tab')) ?? workspace.tabs[0]
    if (tab === undefined) throw new Error('the workspace has no tab')
    return { workspace, tab, prefill: q.get('cmd') ?? '' }
  }
  const hrefFor: TermShell['hrefFor'] = (path, sel) => `${href(path)}?ws=${encodeURIComponent(sel.ws)}&tab=${encodeURIComponent(sel.tab)}${sel.cmd === undefined ? '' : `&cmd=${encodeURIComponent(sel.cmd)}`}`
  return {
    prefix,
    href,
    hrefFor,
    side(part) {
      if (parts.has(part.id)) throw new Error(`the shell already has a part "${part.id}"`)
      parts.set(part.id, part)
      return () => {
        if (parts.get(part.id) === part) parts.delete(part.id)
      }
    },
    selection,
    target(body) {
      const all = forge.state.workspaces
      const workspace = all.find((w) => w.id === fieldOf(body, 'ws')) ?? all[0]
      const tab = workspace?.tabs.find((t) => t.id === fieldOf(body, 'tab')) ?? workspace?.tabs[0]
      return { ws: workspace?.id ?? '', tab: tab?.id ?? '' }
    },
    hidden: (sel) => `<input type="hidden" name="ws" value="${escapeHtml(sel.workspace.id)}"><input type="hidden" name="tab" value="${escapeHtml(sel.tab.id)}">`,
    notice(url) {
      const q = new URL(url, 'http://local').searchParams
      const n = (['error', 'ok'] as const).map((kind) => ({ kind, text: q.get(kind) })).find((x) => x.text !== null && x.text !== '')
      return n === undefined ? '' : `<p class="alert ${n.kind}" role="${n.kind === 'ok' ? 'status' : 'alert'}">${escapeHtml(n.text ?? '')}</p>`
    },
    page({ title, main, url }) {
      const sel = selection(url)
      const column = (which: 'left' | 'right') => [...parts.values()].filter((p) => p.column === which).sort((a, b) => a.order - b.order).map((p) => p.render(sel, url)).join('')
      const [first = '', ...rest] = sel.workspace.name.split(' / ')
      return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · ${APP_TITLE}</title>
<style>${TERM_STYLES}</style>
</head>
<body>
<div class="shell"><aside class="rail" aria-label="Workspaces and commands"><a class="brand" href="${href('/')}">term<span>forge</span></a>${column('left')}<div class="railfooter">LOCAL SIMULATION · NO HOST SHELL<br>termforge 0.8.4 · demo profile</div></aside>
<div class="main"><header class="top"><span>workspace / <strong>${escapeHtml(first)}</strong>${rest.map((r) => ` / ${escapeHtml(r)}`).join('')}</span><span class="live">● SESSION ACTIVE</span></header>
<main class="work">${main}<aside class="right" aria-label="Session status">${column('right')}</aside></main>
<footer class="footer"><span>TERMFORGE TUI · DEMO SESSION</span><span>UTF-8 · 120 × 32 · <b>SAFE MODE ON</b></span></footer></div></div>
</body>
</html>`
    },
  }
}

export interface ShellConfig {
  readonly prefix?: string
}

export const name = 'term-shell'
export const inject = ['forge', 'router']

export function apply(ctx: Context, config: ShellConfig = {}): void {
  const prefix = config.prefix ?? ''
  ctx.provide('termShell', createShell(ctx.forge, prefix))
  ctx.router.route(prefix === '' ? '/' : prefix, new Acryl().get('/health', (c) => c.json({ ok: true })))
}
