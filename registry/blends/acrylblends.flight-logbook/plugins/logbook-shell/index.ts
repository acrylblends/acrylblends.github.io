/** The Flight Logbook shell: the SKYLOG top bar with the pilot records crumb and the log-flight action. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type { Logbook } from '../logbook/index.ts'
import { createShell, escapeHtml, type NavItem, type Shell } from './core.ts'
import { STYLES } from './styles.ts'
export * from './core.ts'
export const APP_TITLE = 'Flight Logbook'
export interface ShellConfig { readonly prefix?: string }
export const name = 'logbook-shell'
export const inject = ['logbook', 'router']
declare module '@deepseek-ai/cordis' { interface Context { shell: Shell } }
function topbar(nav: readonly NavItem[], _crumbs: readonly string[], href: (path: string) => string, _meta: string, _active: string | undefined): string {
  const links = nav.map((item) => `<a href="${href(item.path)}" style="font-size:9px;color:#6d8798;text-decoration:none;margin-right:12px">${escapeHtml(item.label)}</a>`).join('')
  return `<header class="top"><a class="logo" href="${href('/')}" style="text-decoration:none;color:inherit">SKY<span>LOG</span></a><div class="crumb">PILOT RECORDS / PERSONAL LOGBOOK</div><nav style="margin-left:14px">${links}</nav><div class="right">EASA FORMAT · DEMO DATA</div><a href="${href('/flights/new')}" style="background:#173f61;color:white;border-radius:4px;padding:8px 11px;font-size:8px;text-decoration:none">＋ Log flight</a></header>`
}
export function apply(ctx: Context, config: ShellConfig = {}): void {
  const logbook: Logbook = ctx.logbook
  const prefix = config.prefix ?? ''
  const shell = createShell(prefix, { appTitle: APP_TITLE, css: STYLES, bodyClass: 'logbook', topbar: (nav, crumbs, href, meta, active) => topbar(nav, crumbs, href, meta, active) })
  ctx.provide('shell', shell)
  ctx.router.route(prefix === '' ? '/' : prefix, new Acryl().get('/health', (c) => c.json({ ok: true })))
  void logbook
}
