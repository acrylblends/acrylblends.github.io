/** The Vehicle Log shell: the MOTORLOG top bar with the garage links and the vehicle count. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type { Garage } from '../garage/index.ts'
import { createShell, escapeHtml, type NavItem, type Shell } from './core.ts'
import { STYLES } from './styles.ts'
export * from './core.ts'
export const APP_TITLE = 'Vehicle Log'
export interface ShellConfig { readonly prefix?: string }
export const name = 'garage-shell'
export const inject = ['garage', 'router']
declare module '@deepseek-ai/cordis' { interface Context { shell: Shell } }
function topbar(nav: readonly NavItem[], _crumbs: readonly string[], href: (path: string) => string, _meta: string, active: string | undefined): string {
  const links = nav.map((item) => `<a href="${href(item.path)}" style="text-decoration:none;color:${item.id === active ? '#2b6d55' : '#7c8a84'};font-weight:${item.id === active ? '750' : '400'}">${escapeHtml(item.label)}</a>`).join('')
  return `<header class="top"><a class="brand" href="${href('/')}" style="text-decoration:none;color:inherit">MOTOR<span><i>LOG</i></span></a><nav class="nav">${links}</nav><div class="user">PERSONAL GARAGE · 1 VEHICLE</div></header>`
}
export function apply(ctx: Context, config: ShellConfig = {}): void {
  const garage: Garage = ctx.garage
  const prefix = config.prefix ?? ''
  const shell = createShell(prefix, { appTitle: APP_TITLE, css: STYLES, bodyClass: 'garage', topbar: (nav, crumbs, href, meta, active) => topbar(nav, crumbs, href, meta, active) })
  ctx.provide('shell', shell)
  ctx.router.route(prefix === '' ? '/' : prefix, new Acryl().get('/health', (c) => c.json({ ok: true })))
  void garage
}
