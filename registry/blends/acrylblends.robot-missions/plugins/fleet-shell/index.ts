/** The Robot Missions shell: the MOTION/OPS top bar with the fleet crumb and the simulation state. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type { Fleet } from '../fleet/index.ts'
import { createShell, escapeHtml, type NavItem, type Shell } from './core.ts'
import { STYLES } from './styles.ts'
export * from './core.ts'
export const APP_TITLE = 'Robot Missions'
export interface ShellConfig { readonly prefix?: string }
export const name = 'fleet-shell'
export const inject = ['fleet', 'router']
declare module '@deepseek-ai/cordis' { interface Context { shell: Shell } }
function topbar(_nav: readonly NavItem[], _crumbs: readonly string[], _href: (path: string) => string, _meta: string, _active: string | undefined): string {
  return `<header class="top"><div class="brand">MOTION <i>OPS</i></div><div class="divider"></div><div class="crumb">FLEET / MISSION PLANNER / DEMO FACILITY</div><div class="status">● SIMULATION READY</div><span class="btn" style="border:1px solid #33474f;background:#16242b;color:#c7d6db;border-radius:4px;padding:7px 9px;font-size:8px">Layers</span></header>`
}
export function apply(ctx: Context, config: ShellConfig = {}): void {
  const fleet: Fleet = ctx.fleet
  const prefix = config.prefix ?? ''
  const shell = createShell(prefix, { appTitle: APP_TITLE, css: STYLES, bodyClass: 'fleet', topbar: (nav, crumbs, href, meta, active) => topbar(nav, crumbs, href, meta, active) })
  ctx.provide('shell', shell)
  ctx.router.route(prefix === '' ? '/' : prefix, new Acryl().get('/health', (c) => c.json({ ok: true })))
  void fleet
}
