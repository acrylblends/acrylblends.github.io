/**
 * The Snippet Manager's page shell (`ctx.shell`): the dark top bar, the library sidebar with its language and collection lists, the page wrapper and
 * the notice of a redirect. A page plugin registers its entry with `ctx.shell.nav(...)` inside `ctx.effect`, so the entry leaves with the plugin,
 * mounts its routes at `ctx.shell.prefix` and writes every link with `ctx.shell.href(path)`.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type { Snippets } from '../snippets/index.ts'
import { createShell, escapeHtml, type NavItem, type Shell, CLIENT_SCRIPT, badge } from './core.ts'
import { STYLES } from './styles.ts'

export * from './core.ts'

export const APP_TITLE = 'Snipr'

export interface ShellConfig {
  /** Where the app is mounted: empty on its own server, `/app` in the ACRYL frame (src/app.ts passes it). */
  readonly prefix?: string
}

export const name = 'snips-shell'
export const inject = ['snippets', 'router']

declare module '@deepseek-ai/cordis' {
  interface Context {
    shell: Shell
  }
}

function groupOf(item: NavItem): string {
  return item.group ?? 'LIBRARY'
}

/** The sidebar: the pages that registered an entry, the languages, and the collections. */
function sidebar(
  nav: readonly NavItem[],
  active: string | undefined,
  href: (path: string) => string,
  data: { languages: readonly { language: string; count: number }[]; collections: readonly { id: string; name: string }[] },
  hasLibrary: boolean,
  hasCollections: boolean,
): string {
  const side = nav.filter((item) => item.place !== 'top')
  const link = (item: NavItem): string => {
    const count = item.count?.() ?? 0
    return `<a href="${href(item.path)}"${item.id === active ? ' class="active" aria-current="page"' : ''}>${item.icon} &nbsp; ${escapeHtml(item.label)}${count > 0 ? `<i>${String(count)}</i>` : ''}</a>`
  }
  const byGroup = new Map<string, NavItem[]>()
  for (const item of side) {
    const group = groupOf(item)
    const list = byGroup.get(group)
    if (list === undefined) byGroup.set(group, [item])
    else list.push(item)
  }
  const title = (text: string, action = ''): string =>
    `<div class="i-nav-title">${escapeHtml(text)}${action}</div>`
  const parts: string[] = []
  parts.push(title('LIBRARY'))
  for (const item of byGroup.get('LIBRARY') ?? []) parts.push(link(item))
  parts.push('<span class="muted" title="This library is local to this app">⌑ &nbsp; Shared with me <i>local</i></span>')
  if (hasLibrary) {
    parts.push(title('LANGUAGES'))
    for (const item of data.languages)
      parts.push(
        `<a href="${href(`/snippets?language=${encodeURIComponent(item.language)}`)}">${badge(item.language)} ${escapeHtml(item.language)} <i>${String(item.count)}</i></a>`,
      )
  }
  if (hasCollections) {
    parts.push(title('COLLECTIONS', `<a href="${href('/collections#new')}" title="New collection">＋</a>`))
    for (const item of byGroup.get('COLLECTIONS') ?? []) parts.push(link(item))
    for (const collection of data.collections)
      parts.push(`<a href="${href(`/collections/${encodeURIComponent(collection.id)}`)}">↳ ${escapeHtml(collection.name)}</a>`)
  }
  for (const [group, items] of byGroup) {
    if (group === 'LIBRARY' || group === 'COLLECTIONS') continue
    parts.push(title(group))
    for (const item of items) parts.push(link(item))
  }
  return `<aside class="i-nav">${parts.join('')}<div class="i-nav-bottom">⌘ K &nbsp; Quick switcher</div></aside>`
}

/** The top bar: the brand, the breadcrumb, the local-library label, the top actions and the person. */
function topbar(
  nav: readonly NavItem[],
  crumbs: readonly string[],
  href: (path: string) => string,
  meta: string,
): string {
  const top = nav.filter((item) => item.place === 'top')
  const trail = crumbs
    .map((crumb, index) => (index === crumbs.length - 1 ? `<b>${escapeHtml(crumb)}</b>` : `${escapeHtml(crumb)} <span>/</span>`))
    .join(' ')
  return `<div class="i-top"><a class="i-brand" href="${href('/')}"><span>⌘</span> SNIPR <small>WORKSPACE</small></a><div class="i-crumb">${trail}</div><div class="i-topright"><span>${escapeHtml(meta)}</span>${top.map((item) => `<a class="top-button" href="${href(item.path)}">${item.icon} ${escapeHtml(item.label)}</a>`).join('')}<div class="avatar">AM</div></div></div>`
}

export function apply(ctx: Context, config: ShellConfig = {}): void {
  const snippets = ctx.snippets
  const prefix = config.prefix ?? ''
  const shell = createShell(
    prefix,
    {
      appTitle: APP_TITLE,
      css: STYLES,
      topbar,
      sidebar: (nav, active, href, data) =>
        sidebar(
          nav,
          active,
          href,
          data,
          nav.some((item) => item.id === 'all-snippets'),
          nav.some((item) => item.id === 'collections'),
        ),
    },
    () => ({
      languages: snippets.languages(),
      collections: snippets.collections().map((collection) => ({ id: collection.id, name: collection.name })),
    }),
  )
  const wrapped: Shell = {
    ...shell,
    page(input) {
      return shell.page({ ...input, scripts: input.scripts ?? CLIENT_SCRIPT })
    },
  }
  ctx.provide('shell', wrapped)
  ctx.router.route(prefix === '' ? '/' : prefix, new Acryl().get('/health', (c) => c.json({ ok: true })))
}

export { badge }
export type { Snippets }
