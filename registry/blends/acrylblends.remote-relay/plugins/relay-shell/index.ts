/**
 * The workspace shell (`ctx.relayShell`): the top bar with "New session", the three columns of the mockup (saved connections, the session canvas,
 * the session details) and the tabs. A tab plugin registers its tab with `ctx.relayShell.tab(...)` in `ctx.effect`; a column plugin puts its part
 * in the left or right column with `ctx.relayShell.side(...)`. The page a person is looking at is chosen by `?profile=`: the shell resolves it to a
 * profile and its session (`ctx.relayShell.selection(url)`) and keeps it in the tab links.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type { ConnectionProfile, RemoteSession, Relay } from '../relay/index.ts'
import { RELAY_STYLES } from './styles.ts'

export { RELAY_STYLES }

export interface Tab {
  readonly id: string
  readonly label: string
  readonly path: string
  readonly order: number
}

export interface SidePart {
  readonly id: string
  readonly column: 'left' | 'right'
  readonly order: number
  /** HTML for this request: escape user text in it. */
  render(selection: Selection, url: string): string
}

export interface Selection {
  readonly profile: ConnectionProfile
  /** The profile's live session, else its newest one; absent when it never had one. */
  readonly session: RemoteSession | undefined
}

export interface PageInput {
  readonly active?: string
  readonly title: string
  /** The page's own content: the shell adds the session bar above it. */
  readonly main: string
  readonly url: string
  /** The terminal page takes the whole canvas and brings its own scroller. */
  readonly bare?: boolean
}

export interface RelayShell {
  readonly prefix: string
  href(path: string): string
  /** A path of the app that keeps the selected profile: `/transfer?profile=staging-api`. */
  hrefFor(path: string, selection: Selection): string
  tab(tab: Tab): () => void
  tabs(): readonly Tab[]
  side(part: SidePart): () => void
  has(id: string): boolean
  selection(url: string): Selection
  page(input: PageInput): string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    relayShell: RelayShell
  }
}

export const APP_TITLE = 'Relay'

export const escapeHtml = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')

export const withNotice = (path: string, kind: 'ok' | 'error', text: string): string => `${path}${path.includes('?') ? '&' : '?'}${kind}=${encodeURIComponent(text)}`

export function relayErrorOf(error: unknown): { code: 'invalid' | 'not-found' | 'conflict'; message: string } | undefined {
  if (error instanceof Error && error.name === 'RelayError') {
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
export function backTo(shell: RelayShell, raw: string | undefined, fallback: string): string {
  if (raw !== undefined && raw.startsWith(shell.prefix === '' ? '/' : shell.prefix) && !raw.startsWith('//') && !raw.includes('\\')) {
    const url = new URL(raw, 'http://local')
    url.searchParams.delete('ok')
    url.searchParams.delete('error')
    return `${url.pathname}${url.search}`
  }
  return fallback
}

export function createShell(relay: Relay, prefix: string): RelayShell {
  const tabs = new Map<string, Tab>()
  const parts = new Map<string, SidePart>()
  const href = (path: string): string => {
    const clean = path.startsWith('/') ? path : `/${path}`
    if (prefix === '') return clean
    return clean === '/' ? `${prefix}/` : `${prefix}${clean}`
  }
  const sortedTabs = () => [...tabs.values()].sort((a, b) => a.order - b.order)
  const selection = (url: string): Selection => {
    const wanted = new URL(url, 'http://local').searchParams.get('profile')
    const profiles = relay.profiles()
    const profile = profiles.find((p) => p.id === wanted) ?? profiles.find((p) => p.id === relay.sessions().find((s) => relay.status(s) === 'active')?.profileId) ?? profiles[0]
    if (profile === undefined) throw new Error('the relay has no connections')
    return { profile, session: relay.sessionFor(profile.id) }
  }
  const hrefFor = (path: string, sel: Selection): string => `${href(path)}?profile=${encodeURIComponent(sel.profile.id)}`

  return {
    prefix,
    href,
    hrefFor,
    tab(tab) {
      if (tabs.has(tab.id)) throw new Error(`the workspace already has a tab "${tab.id}"`)
      tabs.set(tab.id, tab)
      return () => {
        if (tabs.get(tab.id) === tab) tabs.delete(tab.id)
      }
    },
    tabs: sortedTabs,
    side(part) {
      if (parts.has(part.id)) throw new Error(`the workspace already has a side part "${part.id}"`)
      parts.set(part.id, part)
      return () => {
        if (parts.get(part.id) === part) parts.delete(part.id)
      }
    },
    has: (id) => tabs.has(id),
    selection,
    page({ active, title, main, url, bare }) {
      const sel = selection(url)
      const column = (which: 'left' | 'right') =>
        [...parts.values()].filter((p) => p.column === which).sort((a, b) => a.order - b.order).map((p) => p.render(sel, url)).join('')
      const status = sel.session === undefined ? undefined : relay.status(sel.session)
      const badge =
        status === 'active' ? '<span class="badge">● Connected (simulated)</span>' : status === 'expired' ? '<span class="badge warn">● Timed out</span>' : status === 'closed' ? '<span class="badge warn">● Session closed</span>' : '<span class="badge warn">● Not connected</span>'
      const nav = sortedTabs()
        .map((t) => `<a href="${hrefFor(t.path, sel)}"${t.id === active ? ' class="active" aria-current="page"' : ''}>${escapeHtml(t.label)}</a>`)
        .join('')
      const query = new URL(url, 'http://local').searchParams
      const notice = (['error', 'ok'] as const)
        .map((kind) => ({ kind, text: query.get(kind) }))
        .find((n) => n.text !== null && n.text !== '')
      const newSession = tabs.has('terminal')
        ? `<form method="post" action="${href('/sessions')}"><input type="hidden" name="profileId" value="${escapeHtml(sel.profile.id)}"><button id="connect" type="submit">＋ New session</button></form>`
        : ''
      return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · ${APP_TITLE}</title>
<style>${RELAY_STYLES}</style>
</head>
<body>
<header class="top"><a class="logo" href="${href('/')}">re<span>lay</span></a><span class="env">DEMO ENVIRONMENT</span><span class="spacer"></span><span class="muted" style="font-size:10px">No network connection</span>${newSession}</header>
<div class="layout"><aside class="left" aria-label="Saved connections">${column('left')}</aside>
<main class="main"><nav class="tabs" aria-label="Session">${nav}</nav>
<div class="sessionbar"><b id="hostName">${escapeHtml(sel.profile.name)}</b><span>SSH · port ${String(sel.profile.port)}</span>${badge}<span class="spacer"></span><span>UTF-8</span><span>80 × 24</span></div>
${notice === undefined ? '' : `<p class="alert ${notice.kind}" role="${notice.kind === 'ok' ? 'status' : 'alert'}">${escapeHtml(notice.text ?? '')}</p>`}
${bare === true ? main : `<section class="panel">${main}</section>`}</main>
<aside class="right" aria-label="Session details">${column('right')}</aside></div>
</body>
</html>`
    },
  }
}

export interface ShellConfig {
  readonly prefix?: string
}

export const name = 'relay-shell'
export const inject = ['relay', 'router']

export function apply(ctx: Context, config: ShellConfig = {}): void {
  const prefix = config.prefix ?? ''
  ctx.provide('relayShell', createShell(ctx.relay, prefix))
  ctx.router.route(prefix === '' ? '/' : prefix, new Acryl().get('/health', (c) => c.json({ ok: true })))
}
