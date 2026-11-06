/**
 * The CSV Explorer's page shell (`ctx.shell`): the white data-tool top bar with the dataset file, the page links and the import action, the page
 * wrapper and the notice of a redirect.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type { Tables } from '../tables/index.ts'
import { createShell, escapeHtml, type NavItem, type Shell } from './core.ts'
import { STYLES } from './styles.ts'

export * from './core.ts'

export const APP_TITLE = 'CSV Explorer'

export interface ShellConfig {
  readonly prefix?: string
}

export const name = 'table-shell'
export const inject = ['tables', 'router']

declare module '@deepseek-ai/cordis' {
  interface Context {
    shell: Shell
  }
}

function topbar(
  nav: readonly NavItem[],
  crumbs: readonly string[],
  href: (path: string) => string,
  meta: string,
  active: string | undefined,
  exportHref: string,
): string {
  const links = nav
    .map((item) => `<a href="${href(item.path)}"${item.id === active ? ' class="on" aria-current="page"' : ''}>${item.icon} ${escapeHtml(item.label)}</a>`)
    .join('')
  return `<div class="d-top"><a class="d-mark" href="${href('/')}" style="text-decoration:none">▦ <b>TABLE / LAB</b></a><div class="d-file"><span>Dataset</span><b>${escapeHtml(meta)}</b><small>· local workspace</small></div><div class="d-top-actions"><nav class="d-nav-links" aria-label="CSV Explorer">${links}</nav><a href="${exportHref}" style="background:white;border:1px solid var(--line);border-radius:4px;padding:8px 10px;font-size:8px;color:#62717a;text-decoration:none">↓ Export</a><a class="d-primary" href="${href('/import')}" style="background:#187e76;color:white;border:1px solid #187e76;border-radius:4px;padding:8px 10px;font-size:8px;text-decoration:none">＋ Import CSV</a></div></div>`
}

export function apply(ctx: Context, config: ShellConfig = {}): void {
  const tables: Tables = ctx.tables
  const prefix = config.prefix ?? ''
  const shell = createShell(prefix, {
    appTitle: APP_TITLE,
    css: STYLES,
    bodyClass: 'data',
    topbar: (nav, crumbs, href, meta, active) => {
      const first = tables.first()
      return topbar(nav, crumbs, href, meta === 'LOCAL DATA' ? (first?.fileName ?? 'No dataset') : meta, active, first === undefined ? href('/import') : href(`/datasets/${encodeURIComponent(first.id)}/export.csv`))
    },
  })
  ctx.provide('shell', shell)
  ctx.router.route(prefix === '' ? '/' : prefix, new Acryl().get('/health', (c) => c.json({ ok: true })))
}
