/** The Link Shortener's shell: the compact green top bar with the workspace links and the person, then the page column. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type { Shortly } from '../shortly/index.ts'
import { createShell, escapeHtml, type NavItem, type Shell } from './core.ts'
import { STYLES } from './styles.ts'

export * from './core.ts'

export const APP_TITLE = 'Link Shortener'

export interface ShellConfig {
  readonly prefix?: string
}

export const name = 'shortly-shell'
export const inject = ['shortly', 'router']

declare module '@deepseek-ai/cordis' {
  interface Context {
    shell: Shell
  }
}

function topbar(nav: readonly NavItem[], _crumbs: readonly string[], href: (path: string) => string, _meta: string, active: string | undefined): string {
  const links = nav
    .map((item) => `<a href="${href(item.path)}"${item.id === active ? ' class="on" aria-current="page"' : ''}>${escapeHtml(item.label)}${(item.count?.() ?? 0) > 0 ? ` <i>${String(item.count?.())}</i>` : ''}</a>`)
    .join('')
  return `<header class="topbar"><a class="logo" href="${href('/')}">short<span><i>ly</i>.</span></a><nav class="topnav">${links}</nav><div class="user">ACME STUDIO &nbsp; ◉</div></header>`
}

export function apply(ctx: Context, config: ShellConfig = {}): void {
  const shortly: Shortly = ctx.shortly
  const prefix = config.prefix ?? ''
  const shell = createShell(prefix, {
    appTitle: APP_TITLE,
    css: STYLES,
    bodyClass: 'shortly',
    topbar: (nav, crumbs, href, meta, active) => topbar(nav, crumbs, href, meta, active),
  })
  ctx.provide('shell', shell)
  ctx.router.route(prefix === '' ? '/' : prefix, new Acryl().get('/health', (c) => c.json({ ok: true })))
  void shortly
}
