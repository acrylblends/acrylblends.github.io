/** The gallery shell: the still-frame top bar, the album rail with storage, and the page column. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type { Gallery } from '../gallery/index.ts'
import { groupDigits, storagePercent, storageText } from '../gallery/index.ts'
import { createShell, escapeHtml, type NavItem, type Shell } from './core.ts'
import { STYLES } from './styles.ts'
export * from './core.ts'
export * from './ui.ts'
export const APP_TITLE = 'Photo Gallery'
export interface ShellConfig {
  readonly prefix?: string
}
export const name = 'gallery-shell'
export const inject = ['gallery', 'router']
declare module '@deepseek-ai/cordis' {
  interface Context {
    shell: Shell
  }
}

function topbar(items: readonly NavItem[], navActive: string | undefined, href: (path: string) => string, total: number): string {
  const links = items
    .map((item) => `<a href="${href(item.path)}"${item.id === navActive ? ' class="on"' : ''}>${escapeHtml(item.label)}</a>`)
    .join('')
  return `<header class="bar"><a class="wordmark" href="${href('/')}">STILL<span>FRAME</span></a><nav>${links}</nav><div class="right">STUDIO ARCHIVE &nbsp; · &nbsp; ${groupDigits(total)} ITEMS</div></header>`
}

function rail(gallery: Gallery, items: readonly NavItem[], active: string | undefined, href: (path: string) => string): string {
  const rows: string[] = []
  let group: string | undefined
  let open = false
  let first = true
  for (const item of items) {
    if (item.group !== group) {
      if (open) rows.push('</div>')
      if (item.group !== undefined) {
        rows.push(`<div class="${first ? 'aside-first' : 'aside-block'}"><div class="aside-label">${escapeHtml(item.group)}</div>`)
        open = true
        first = false
      } else {
        open = false
      }
      group = item.group
    }
    const thumb =
      item.image !== undefined
        ? `<div class="thumb"><img src="${item.image}" alt="" loading="lazy"></div>`
        : item.glyph === undefined
          ? ''
          : `<div class="thumb glyph">${escapeHtml(item.glyph)}</div>`
    const count = item.count?.() ?? 0
    rows.push(
      `<a class="album${item.id === active ? ' active' : ''}" href="${href(item.path)}">${thumb}<span class="album-label">${escapeHtml(item.label)}</span>${count > 0 ? `<span class="count">${groupDigits(count)}</span>` : ''}</a>`,
    )
  }
  if (open) rows.push('</div>')
  const bytes = gallery.storageBytes()
  const percent = storagePercent(bytes)
  const storage = `<div class="aside-block"><div class="aside-label">STORAGE</div><div class="storage"><i style="width:${String(percent)}%"></i></div><p class="storage-text">${storageText(bytes)} of 50 GB used</p></div>`
  return `<aside>${rows.join('')}${storage}</aside>`
}

export function apply(ctx: Context, config: ShellConfig = {}): void {
  const gallery: Gallery = ctx.gallery
  const prefix = config.prefix ?? ''
  const shell = createShell(prefix, {
    appTitle: APP_TITLE,
    css: STYLES,
    bodyClass: 'gallery',
    topbar: (items, navActive, href) => topbar(items, navActive, href, gallery.total()),
    rail: (items, active, href) => rail(gallery, items, active, href),
  })
  ctx.provide('shell', shell)
  ctx.router.route(prefix === '' ? '/' : prefix, new Acryl().get('/health', (c) => c.json({ ok: true })))
}
