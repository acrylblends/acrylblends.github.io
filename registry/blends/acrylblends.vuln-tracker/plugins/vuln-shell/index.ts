/** The Vulnerability Tracker's shell: the dark security rail, the page wrapper and the toast/copy client script. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type { Vulns } from '../vulns/index.ts'
import { createShell, escapeHtml, type NavItem, type Shell } from './core.ts'
import { STYLES } from './styles.ts'

export * from './core.ts'

export const APP_TITLE = 'Vulnerability Tracker'

export interface ShellConfig {
  readonly prefix?: string
}

export const name = 'vuln-shell'
export const inject = ['vulns', 'router']

declare module '@deepseek-ai/cordis' {
  interface Context {
    shell: Shell
  }
}

function rail(vulns: Vulns, nav: readonly NavItem[], active: string | undefined, href: (path: string) => string): string {
  const links = nav.map((item) => `<a href="${href(item.path)}"${item.id === active ? ' class="active"' : ''}>${item.icon} ${escapeHtml(item.label)}${(item.count?.() ?? 0) > 0 ? ` <b>${String(item.count?.())}</b>` : ''}</a>`).join('')
  return `<aside class="rail"><div class="brand"><i>⌁</i> SENTINEL / VULN</div><div class="workspace">SECURITY OPERATIONS</div><nav class="nav">${links}</nav><div class="rail-foot">Workspace · Acme Engineering<br><br>◉ Scanner: demo data</div></aside>`
}

export function apply(ctx: Context, config: ShellConfig = {}): void {
  const vulns: Vulns = ctx.vulns
  const prefix = config.prefix ?? ''
  const shell = createShell(prefix, {
    appTitle: APP_TITLE,
    css: STYLES,
    bodyClass: 'vuln',
    rail: (nav, active, href) => rail(vulns, nav, active, href),
  })
  ctx.provide('shell', shell)
  ctx.router.route(prefix === '' ? '/' : prefix, new Acryl().get('/health', (c) => c.json({ ok: true })))
}
