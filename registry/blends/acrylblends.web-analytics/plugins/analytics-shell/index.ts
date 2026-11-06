/**
 * The Web Analytics console's page shell (`ctx.shell`): the white sidebar with the property, the report links and the tracking state, the main column
 * every report fills and the toast/copy client script.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type { Analytics } from '../analytics/index.ts'
import { createShell, escapeHtml, type NavItem, type Shell } from './core.ts'
import { STYLES } from './styles.ts'

export * from './core.ts'

export const APP_TITLE = 'Web Analytics'

export interface ShellConfig {
  readonly prefix?: string
}

export const name = 'analytics-shell'
export const inject = ['analytics', 'router']

declare module '@deepseek-ai/cordis' {
  interface Context {
    shell: Shell
  }
}

function sidebar(analytics: Analytics, nav: readonly NavItem[], active: string | undefined, href: (path: string) => string): string {
  const groups = new Map<string, NavItem[]>()
  for (const item of nav) {
    const group = item.group ?? 'ANALYZE'
    const list = groups.get(group)
    if (list === undefined) groups.set(group, [item])
    else list.push(item)
  }
  const navHtml = [...groups.entries()].map(([group, items]) =>
    `<small>${escapeHtml(group)}</small>${items.map((item) => `<a href="${href(item.path)}"${item.id === active ? ' class="on" aria-current="page"' : ''}>${item.icon} &nbsp; ${escapeHtml(item.label)}${(item.count?.() ?? 0) > 0 ? ` <i>${String(item.count?.())}</i>` : ''}</a>`).join('')}`,
  ).join('')
  const property = analytics.first()
  const state = property === undefined ? undefined : analytics.installState(property)
  return `<aside class="a-side"><div class="a-brand"><span>◉</span> Northstar</div><div class="a-site"><small>PROPERTY</small><b>${property === undefined ? 'No property yet' : `${escapeHtml(property.domain)}⌄`}</b></div><div class="a-nav">${navHtml}</div><div class="a-side-foot"><i></i> ${state === undefined ? 'No property' : state === 'active' ? 'Tracking active' : 'Waiting for the first event'}<small>${property === undefined ? '' : `Script · ${escapeHtml(property.trackingId)}`}</small></div></aside>`
}

export function apply(ctx: Context, config: ShellConfig = {}): void {
  const analytics: Analytics = ctx.analytics
  const prefix = config.prefix ?? ''
  const shell = createShell(prefix, {
    appTitle: APP_TITLE,
    css: STYLES,
    bodyClass: 'analytics',
    sidebar: (nav, active, href) => sidebar(analytics, nav, active, href),
  })
  ctx.provide('shell', shell)
  ctx.router.route(prefix === '' ? '/' : prefix, new Acryl().get('/health', (c) => c.json({ ok: true })))
}
