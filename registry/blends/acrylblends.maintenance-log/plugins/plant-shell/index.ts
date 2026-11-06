/** The Maintenance Log shell: the PLANT/OPS top bar with the site and the online machine count, then the wrap. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type { Plant } from '../plant/index.ts'
import { createShell, escapeHtml, type NavItem, type Shell } from './core.ts'
import { STYLES } from './styles.ts'
export * from './core.ts'
export const APP_TITLE = 'Maintenance Log'
export interface ShellConfig { readonly prefix?: string }
export const name = 'plant-shell'
export const inject = ['plant', 'router']
declare module '@deepseek-ai/cordis' { interface Context { shell: Shell } }
function topbar(online: number): string {
  return `<header class="header"><div class="mark">PLANT<span><i>/</i>OPS</span></div><div class="site">FACILITY 04 / PRODUCTION HALL</div><div class="headright"><span class="light"></span> ${String(online)} MACHINES ONLINE <span class="btn">Plant 04 ⌄</span></div></header>`
}
export function apply(ctx: Context, config: ShellConfig = {}): void {
  const plant: Plant = ctx.plant
  const prefix = config.prefix ?? ''
  const shell = createShell(prefix, { appTitle: APP_TITLE, css: STYLES, bodyClass: 'plant', topbar: () => topbar(plant.stats().online) })
  ctx.provide('shell', shell)
  ctx.router.route(prefix === '' ? '/' : prefix, new Acryl().get('/health', (c) => c.json({ ok: true })))
}
