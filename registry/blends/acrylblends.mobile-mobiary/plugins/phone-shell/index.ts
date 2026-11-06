/**
 * The device shell (`ctx.phoneShell`): the phone (status bar, app bar, the screen a plugin renders, the tab bar) and the companion panel beside it.
 * A screen plugin registers its tab with `ctx.phoneShell.tab(...)` inside `ctx.effect` (a screen reached some other way, like capture, registers none)
 * and renders with `ctx.phoneShell.screen(...)`; the companion panel's cards are parts plugins put there with `ctx.phoneShell.side(...)`.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type { Journal } from '../mobiary/index.ts'
import { PHONE_STYLES } from './styles.ts'

export { PHONE_STYLES }

export interface Tab {
  readonly id: string
  readonly label: string
  readonly icon: string
  readonly path: string
  readonly order: number
}

export interface SidePart {
  readonly id: string
  readonly order: number
  render(url: string): string
}

export interface ScreenInput {
  /** The tab to highlight, if the screen belongs to one. */
  readonly active?: string
  readonly title: string
  readonly body: string
  readonly url: string
}

export interface PhoneShell {
  readonly prefix: string
  href(path: string): string
  tab(tab: Tab): () => void
  tabs(): readonly Tab[]
  side(part: SidePart): () => void
  has(id: string): boolean
  screen(input: ScreenInput): string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    phoneShell: PhoneShell
  }
}

export const APP_TITLE = 'Mobiary'

export const escapeHtml = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')

export function withNotice(path: string, kind: 'ok' | 'error', text: string): string {
  const [base = '', hash] = path.split('#')
  return `${base}${base.includes('?') ? '&' : '?'}${kind}=${encodeURIComponent(text)}${hash === undefined ? '' : `#${hash}`}`
}

export function journalErrorOf(error: unknown): { code: 'invalid' | 'not-found' | 'conflict'; message: string } | undefined {
  if (error instanceof Error && error.name === 'JournalError') {
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
export function backTo(shell: PhoneShell, raw: string | undefined, fallback: string): string {
  if (raw !== undefined && raw.startsWith(shell.prefix === '' ? '/' : shell.prefix) && !raw.startsWith('//') && !raw.includes('\\')) {
    const url = new URL(raw, 'http://local')
    url.searchParams.delete('ok')
    url.searchParams.delete('error')
    return `${url.pathname}${url.search}`
  }
  return fallback
}

export function createShell(journal: Journal, prefix: string): PhoneShell {
  const tabs = new Map<string, Tab>()
  const parts = new Map<string, SidePart>()
  const href = (path: string): string => {
    const clean = path.startsWith('/') ? path : `/${path}`
    if (prefix === '') return clean
    return clean === '/' ? `${prefix}/` : `${prefix}${clean}`
  }
  const sorted = () => [...tabs.values()].sort((a, b) => a.order - b.order)
  return {
    prefix,
    href,
    tab(tab) {
      if (tabs.has(tab.id)) throw new Error(`the phone already has a tab "${tab.id}"`)
      tabs.set(tab.id, tab)
      return () => {
        if (tabs.get(tab.id) === tab) tabs.delete(tab.id)
      }
    },
    tabs: sorted,
    side(part) {
      if (parts.has(part.id)) throw new Error(`the panel already has a part "${part.id}"`)
      parts.set(part.id, part)
      return () => {
        if (parts.get(part.id) === part) parts.delete(part.id)
      }
    },
    has: (id) => tabs.has(id) || parts.has(id),
    screen({ active, title, body, url }) {
      const state = journal.state
      const now = journal.now()
      const query = new URL(url, 'http://local').searchParams
      const notice = (['error', 'ok'] as const).map((kind) => ({ kind, text: query.get(kind) })).find((n) => n.text !== null && n.text !== '')
      const time = `${String(now.getHours())}:${String(now.getMinutes()).padStart(2, '0')}`
      const bar = sorted()
        .map((t) => `<a href="${href(t.path)}"${t.id === active ? ' class="active" aria-current="page"' : ''}><span aria-hidden="true">${t.icon}</span>${escapeHtml(t.label)}</a>`)
        .join('')
      const panel = [...parts.values()].sort((a, b) => a.order - b.order).map((p) => p.render(url)).join('')
      return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · ${APP_TITLE}</title>
<style>${PHONE_STYLES}</style>
</head>
<body>
<main class="stage"><div class="phone-wrap"><div class="phone${state.preferences.compact ? ' compact' : ''}"><div class="screen"><div class="status"><span>${time}</span><span>●●● ▰</span></div><header class="appbar"><b>mobiary<span style="color:#8a70da">.</span></b><div class="avatar" aria-label="${escapeHtml(state.name)}">${escapeHtml(state.name.charAt(0).toUpperCase())}</div></header><div class="scroll">${body}</div><nav class="tabs" aria-label="App">${bar}</nav></div></div></div>
<section class="details"><div class="eyebrow">62 / Mobile software</div><h1>Your day, in<br>your pocket.</h1><p>Mobiary is a mobile companion concept built around quick capture and small, useful widgets. The device preview is interactive: switch tabs and add a note without leaving the page.</p>${panel}${notice === undefined ? '' : `<div class="notice${notice.kind === 'error' ? ' error' : ''}" id="notice" role="${notice.kind === 'ok' ? 'status' : 'alert'}">${escapeHtml(notice.text ?? '')}</div>`}</section></main>
</body>
</html>`
    },
  }
}

export interface ShellConfig {
  readonly prefix?: string
}

export const name = 'phone-shell'
export const inject = ['journal', 'router']

export function apply(ctx: Context, config: ShellConfig = {}): void {
  const prefix = config.prefix ?? ''
  ctx.provide('phoneShell', createShell(ctx.journal, prefix))
  ctx.router.route(prefix === '' ? '/' : prefix, new Acryl().get('/health', (c) => c.json({ ok: true })))
}
