/**
 * The Deploy Board's page shell (`ctx.shell`): the dark release top bar, the control-room sidebar with the incident count, the main column and the
 * incident rail a page may put after it.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type { Release } from '../release/index.ts'
import { createShell, escapeHtml, type NavItem, type Shell } from './core.ts'
import { STYLES } from './styles.ts'

export * from './core.ts'

export const APP_TITLE = 'Deploy Board'

export interface ShellConfig {
  readonly prefix?: string
}

export const name = 'release-shell'
export const inject = ['release', 'router']

declare module '@deepseek-ai/cordis' {
  interface Context {
    shell: Shell
  }
}

function topbar(nav: readonly NavItem[], crumbs: readonly string[], href: (path: string) => string, _meta: string, _active: string | undefined): string {
  const trail = crumbs.map((crumb) => escapeHtml(crumb)).join(' <span>/</span> ')
  return `<div class="r-top"><div class="r-brand"><span>⬢</span> RELEASE / CONTROL</div><div class="r-breadcrumb">${trail}</div><div class="r-right"><span><i></i> ALL SYSTEMS OPERATIONAL</span><a href="${href('/deployments/new')}" style="background:#4b9d7d;color:white;border-radius:4px;padding:8px 11px;font-size:8px;text-decoration:none">＋ New deployment</a><div class="avatar">AM</div></div></div>`
}

function sidebar(release: Release, nav: readonly NavItem[], active: string | undefined, href: (path: string) => string): string {
  const groups = new Map<string, NavItem[]>()
  for (const item of nav) {
    const group = item.group ?? 'CONTROL ROOM'
    const list = groups.get(group)
    if (list === undefined) groups.set(group, [item])
    else list.push(item)
  }
  const links = [...groups.entries()].map(([group, items]) =>
    `<small>${escapeHtml(group)}</small>${items.map((item) => `<a href="${href(item.path)}"${item.id === active ? ' class="active"' : ''}>${item.icon} &nbsp; ${escapeHtml(item.label)}${(item.count?.() ?? 0) > 0 ? ` <i>${String(item.count?.())}</i>` : ''}</a>`).join('')}`,
  ).join('')
  return `<aside class="r-sidebar">${links}<div class="r-scope"><small>PROJECT</small><b>webboxes-platform⌄</b><small>REGION</small><b>eu-central-1⌄</b></div></aside>`
}

export function apply(ctx: Context, config: ShellConfig = {}): void {
  const release: Release = ctx.release
  const prefix = config.prefix ?? ''
  const shell = createShell(prefix, {
    appTitle: APP_TITLE,
    css: STYLES,
    bodyClass: 'release',
    topbar,
    sidebar: (nav, active, href) => sidebar(release, nav, active, href),
  })
  ctx.provide('shell', shell)
  ctx.router.route(prefix === '' ? '/' : prefix, new Acryl().get('/health', (c) => c.json({ ok: true })))
}
