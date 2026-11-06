/**
 * The Cloud Costs workspace's page shell (`ctx.shell`): the dark top bar with the billing period and the import action, the white sidebar with the
 * page links and the connected providers, and the main column every page fills.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type { Finops } from '../finops/index.ts'
import { escapeHtml as e, createShell, type NavItem, type Shell } from './core.ts'
import { STYLES } from './styles.ts'

export * from './core.ts'

export const APP_TITLE = 'Cloud Costs'

export interface ShellConfig {
  readonly prefix?: string
}

export const name = 'finops-shell'
export const inject = ['finops', 'router']

declare module '@deepseek-ai/cordis' {
  interface Context {
    shell: Shell
  }
}

function topbar(nav: readonly NavItem[], _crumbs: readonly string[], href: (path: string) => string, _meta: string, active: string | undefined, monthLabel: string): string {
  const links = nav
    .map((item) => `<a href="${href(item.path)}"${item.id === active ? ' class="on"' : ''}>${item.icon} ${e(item.label)}</a>`)
    .join('')
  return `<div class="f-top"><div class="f-symbol">◈</div><div class="f-brand">COST<span>SCOUT</span><small>FINOPS WORKSPACE</small></div><div class="f-period">Billing period <b>${e(monthLabel)}⌄</b></div><nav class="f-nav-links" aria-label="Cost overview">${links}</nav><div class="f-top-actions"><a href="${href('/imports')}" style="background:#e69a58;color:#33271d;border-radius:4px;padding:8px 12px;font-size:8px;font-weight:750;text-decoration:none">Import billing data</a><div class="avatar">AM</div></div></div>`
}

function sidebar(finops: Finops, nav: readonly NavItem[], active: string | undefined, href: (path: string) => string): string {
  const links = nav
    .map((item) => `<a href="${href(item.path)}"${item.id === active ? ' class="active"' : ''}>${item.icon} &nbsp; ${e(item.label)}</a>`)
    .join('')
  const providers = finops.providers().map((provider) => {
    const mark = provider.sourceType === 'aws' ? 'aws' : provider.sourceType === 'gcp' ? 'G' : 'A'
    const tint = provider.sourceType === 'aws' ? 'aws' : provider.sourceType === 'gcp' ? 'gcp' : 'az'
    const last = finops.imports().find((item) => item.providerId === provider.id)
    return `<div class="f-provider"><i class="${tint}">${mark}</i><span>${e(provider.name)}<small>${provider.connected ? (last === undefined ? 'Connected' : `Last sync · ${e(last.importedAt.slice(11, 16))}`) : 'Not connected'}</small></span><b>${provider.connected ? '✓' : '＋'}</b></div>`
  }).join('')
  const risky = finops.alerts().filter((alert) => alert.status === 'open').length
  return `<aside class="f-side"><small>WORKSPACE</small>${links}<small>DATA SOURCES</small>${providers}<div class="f-side-note"><b>Budget watch</b><p>${risky === 0 ? 'Every budget is inside its forecast.' : `${String(risky)} budget alert${risky === 1 ? ' is' : 's are'} open.`}</p><a href="${href('/alerts')}" style="color:#9f632e;font-size:8px;text-decoration:none">Review alerts →</a></div></aside>`
}

export function apply(ctx: Context, config: ShellConfig = {}): void {
  const finops: Finops = ctx.finops
  const prefix = config.prefix ?? ''
  const shell = createShell(prefix, {
    appTitle: APP_TITLE,
    css: STYLES,
    bodyClass: 'finops',
    topbar: (nav, crumbs, href, meta, active) => topbar(nav, crumbs, href, meta, active, finops.monthLabel),
    sidebar: (nav, active, href) => sidebar(finops, nav, active, href),
  })
  ctx.provide('shell', shell)
  ctx.router.route(prefix === '' ? '/' : prefix, new Acryl().get('/health', (c) => c.json({ ok: true })))
}
