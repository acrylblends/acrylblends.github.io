/**
 * The console shell (`ctx.vaultShell`): the top bar (links and "New resource"), the title with the cluster's health, the four capacity statistics and
 * the tabs every page shares. A page plugin registers its tab with `ctx.vaultShell.tab(...)` inside `ctx.effect`, so the tab and its top link leave
 * with the plugin, and renders its page with `ctx.vaultShell.page(...)`. Every link is written with `ctx.vaultShell.href(path)`: on its own server the
 * app is at the root, in the ACRYL frame at `/app`.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { type Vault, formatCount, formatGb } from '../vaultline/index.ts'
import { VAULT_STYLES } from './styles.ts'

export { VAULT_STYLES }

export interface Tab {
  readonly id: string
  readonly label: string
  /** The shorter word in the top bar. */
  readonly nav: string
  readonly path: string
  readonly order: number
}

export interface PageInput {
  readonly active?: string
  readonly title: string
  readonly main: string
  readonly url?: string
}

export interface VaultShell {
  readonly prefix: string
  href(path: string): string
  tab(tab: Tab): () => void
  tabs(): readonly Tab[]
  has(id: string): boolean
  page(input: PageInput): string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    vaultShell: VaultShell
  }
}

export const APP_TITLE = 'Vaultline'

export const escapeHtml = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')

/** A path with a notice in its query (before any `#fragment`). */
export function withNotice(path: string, kind: 'ok' | 'error', text: string): string {
  const [base = '', hash] = path.split('#')
  return `${base}${base.includes('?') ? '&' : '?'}${kind}=${encodeURIComponent(text)}${hash === undefined ? '' : `#${hash}`}`
}

export function vaultErrorOf(error: unknown): { code: 'invalid' | 'not-found' | 'conflict'; message: string } | undefined {
  if (error instanceof Error && error.name === 'VaultError') {
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

/** `Today 09:30`, `Nov 2, 02:00`. */
export function whenLabel(iso: string, now: Date): string {
  const at = new Date(iso)
  const hm = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
  const same = at.getFullYear() === now.getFullYear() && at.getMonth() === now.getMonth() && at.getDate() === now.getDate()
  return same ? `Today ${hm}` : `${at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${hm}`
}

export function createShell(vault: Vault, prefix: string): VaultShell {
  const tabs = new Map<string, Tab>()
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
      if (tabs.has(tab.id)) throw new Error(`the console already has a tab "${tab.id}"`)
      tabs.set(tab.id, tab)
      return () => {
        if (tabs.get(tab.id) === tab) tabs.delete(tab.id)
      }
    },
    tabs: sorted,
    has: (id) => tabs.has(id),
    page({ active, title, main, url }) {
      const totals = vault.totals()
      const { fabric } = vault.state
      const down = fabric.nodesTotal - fabric.nodesUp
      const watch = vault.state.pools.filter((p) => p.watch).length
      const query = url === undefined ? undefined : new URL(url, 'http://local').searchParams
      const notice = (['error', 'ok'] as const).map((kind) => ({ kind, text: query?.get(kind) ?? null })).find((n) => n.text !== null && n.text !== '')
      const nav = sorted()
        .map((t) => `<a href="${href(t.path)}"${t.id === active ? ' class="on"' : ''}>${escapeHtml(t.nav)}</a>`)
        .join('')
      const tabRow = sorted()
        .map((t) => `<a href="${href(t.path)}"${t.id === active ? ' class="active" aria-current="page"' : ''}>${escapeHtml(t.label)}</a>`)
        .join('')
      const newResource = tabs.has('volumes') ? `<a class="btn" id="newResource" href="${href('/volumes?new=1#create')}">＋ New resource</a>` : ''
      return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · ${APP_TITLE}</title>
<style>${VAULT_STYLES}</style>
</head>
<body>
<header class="top"><a class="logo" href="${href('/')}">vault<span>line</span></a><nav class="topnav" aria-label="Sections">${nav}</nav><span class="spacer"></span><span class="pill">LAB CLUSTER · DEMO</span>${newResource}</header>
<main class="wrap"><div class="title"><div><h1>Storage fabric</h1><p>${escapeHtml(fabric.region)} · ${String(vault.state.pools.length)} pools · refreshed just now</p></div><span class="pill${down > 0 || watch > 0 ? ' warn' : ''}">${down > 0 ? `${String(down)} nodes down` : watch > 0 ? `${String(watch)} pool on watch` : 'All systems healthy'}</span></div>
<section class="stats" aria-label="Capacity"><div class="stat"><small>Raw capacity</small><b>${formatGb(totals.rawGb)}</b><span>Across ${String(vault.state.pools.length)} pools</span></div><div class="stat"><small>Allocated</small><b>${formatGb(totals.allocatedGb)}</b><span>${String(totals.provisionedPercent)}% provisioned</span></div><div class="stat"><small>Objects</small><b>${formatCount(totals.objects)}</b><span>Across ${String(totals.buckets)} buckets</span></div><div class="stat"><small>Protection</small><b>${String(totals.protectionPercent)}%</b><span>Snapshot coverage</span></div></section>
<nav class="tabs" aria-label="Fabric">${tabRow}</nav>
${notice === undefined ? '' : `<p class="alert ${notice.kind}" role="${notice.kind === 'ok' ? 'status' : 'alert'}">${escapeHtml(notice.text ?? '')}</p>`}
<section class="panel">${main}</section></main>
</body>
</html>`
    },
  }
}

export interface ShellConfig {
  readonly prefix?: string
}

export const name = 'vault-shell'
export const inject = ['vault', 'router']

export function apply(ctx: Context, config: ShellConfig = {}): void {
  const prefix = config.prefix ?? ''
  ctx.provide('vaultShell', createShell(ctx.vault, prefix))
  ctx.router.route(prefix === '' ? '/' : prefix, new Acryl().get('/health', (c) => c.json({ ok: true })))
}
