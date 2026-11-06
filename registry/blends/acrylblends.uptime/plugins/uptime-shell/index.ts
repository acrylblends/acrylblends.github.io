/**
 * The Uptime Checker's page shell (`ctx.shell`): the dark status rail with the breadcrumb, the page links, the checks-running state and the add-monitor
 * action, and the `u-main` column every page fills.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { createShell, escapeHtml, type NavItem, type Shell } from './core.ts'
import { STYLES } from './styles.ts'

export * from './core.ts'

export const APP_TITLE = 'Uptime Checker'

export interface ShellConfig {
  readonly prefix?: string
}

export const name = 'uptime-shell'
export const inject = ['uptime', 'router']

declare module '@deepseek-ai/cordis' {
  interface Context {
    shell: Shell
  }
}

function topbar(nav: readonly NavItem[], crumbs: readonly string[], href: (path: string) => string, _meta: string, active: string | undefined): string {
  const trail = crumbs.map((crumb) => escapeHtml(crumb)).join(' <span>/</span> ')
  const links = nav
    .map((item) => `<a href="${href(item.path)}"${item.id === active ? ' class="on"' : ''}>${item.icon} ${escapeHtml(item.label)}</a>`)
    .join('')
  return `<div class="u-top"><div class="u-mark">◉ <b>UPTIME</b><small>MONITOR</small></div><div class="u-breadcrumb">${trail}</div><nav class="u-nav-links" aria-label="Uptime Checker">${links}</nav><div class="u-topright"><span><i></i> CHECKS RUNNING</span><a href="${href('/monitors/new')}" style="background:#3c9c7e;color:white;border-radius:4px;padding:8px 11px;font-size:8px;text-decoration:none">＋ Add monitor</a><div class="avatar">AM</div></div></div>`
}

export function apply(ctx: Context, config: ShellConfig = {}): void {
  const prefix = config.prefix ?? ''
  const shell = createShell(prefix, {
    appTitle: APP_TITLE,
    css: STYLES,
    bodyClass: 'uptime',
    topbar,
  })
  ctx.provide('shell', shell)
  ctx.router.route(prefix === '' ? '/' : prefix, new Acryl().get('/health', (c) => c.json({ ok: true })))
}
