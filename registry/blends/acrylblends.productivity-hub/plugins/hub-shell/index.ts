/**
 * The hub's page shell (`ctx.hubShell`): the sidebar (logo, quick capture, the workspace's pages, the spaces) and the paper look every page shares.
 *
 * A page plugin registers its sidebar entry with `ctx.hubShell.nav(...)` inside `ctx.effect`, so the entry leaves with the plugin (switched off in
 * Settings > Plugins), and renders its page with `ctx.hubShell.page(...)`. It mounts its routes at `ctx.hubShell.prefix` and writes every link with
 * `ctx.hubShell.href(path)`: on its own server the app is at the root, in the ACRYL frame at `/app`.
 *
 * Quick capture (the sidebar field, focused with Cmd/Ctrl+K) posts to the inbox's page, so it shows only while a plugin registered the `inbox` entry.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type { Hub } from '../productivity-hub/index.ts'
import { HUB_STYLES } from './styles.ts'

export { HUB_STYLES }

/** One page in the sidebar. */
export interface NavItem {
  /** The page plugin's name; `inbox` also turns on quick capture. */
  readonly id: string
  readonly label: string
  /** A one-character glyph shown before the label. */
  readonly icon: string
  /** The page's path under the prefix (`/inbox`). */
  readonly path: string
  /** Where it sits: lower first. */
  readonly order: number
  /** A number shown at the right (the inbox's items), read at each render; nothing when absent or zero. */
  count?(): number
}

export interface PageInput {
  /** The nav item id to highlight. */
  readonly active?: string
  /** The browser tab's title (the app name is added). */
  readonly title: string
  /** The page's content inside `<main>`: usually {@link HubShell.header} and the page's own sections. */
  readonly main: string
  /** Extra HTML at the end of the body: a page's own `<script>`. */
  readonly scripts?: string
}

export interface HeaderInput {
  readonly eyebrow?: string
  /** The heading's text; it is escaped. A trailing period is drawn in sage, as the mockup does. */
  readonly title: string
  readonly lead?: string
  /** HTML for the right side (a button or a link). */
  readonly action?: string
}

/** A line under the header after a form was sent: `?ok=` or `?error=` on the redirect. */
export type Notice = { readonly kind: 'ok' | 'error' | 'warn'; readonly text: string }

export interface HubShell {
  readonly prefix: string
  /** The URL of a path of the app, under the prefix: `href('/inbox')`. */
  href(path: string): string
  /** Put a page in the sidebar; returns the disposer. Call it inside `ctx.effect`. */
  nav(item: NavItem): () => void
  navItems(): readonly NavItem[]
  /** Whether a page is in the sidebar now (another plugin links to it only then). */
  has(id: string): boolean
  page(input: PageInput): string
  header(input: HeaderInput): string
  /** The notice of a request's `?ok=` / `?error=` query, as HTML (empty when there is none). */
  notice(url: string): string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    hubShell: HubShell
  }
}

export const APP_TITLE = 'Productivity Hub'

export const escapeHtml = (text: string): string =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

/** The query string that carries a notice to the page a form redirects to. */
export function noticeQuery(notice: Notice): string {
  return `?${notice.kind}=${encodeURIComponent(notice.text)}`
}

const CAPTURE_SCRIPT = `<script>
addEventListener('keydown',function(e){if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){var i=document.getElementById('capture');if(i){e.preventDefault();i.focus()}}});
</script>`

export function createShell(hub: Hub, prefix: string): HubShell {
  const items = new Map<string, NavItem>()
  // Under a prefix the app's root is the prefix itself (`/app`, not `/app/`); every other path hangs below it.
  const href = (path: string): string => (path === '/' && prefix !== '' ? prefix : `${prefix}${path.startsWith('/') ? path : `/${path}`}`)
  const navItems = () => [...items.values()].sort((a, b) => a.order - b.order)

  const sidebar = (active: string | undefined): string => {
    const nav = navItems()
      .map((item) => {
        const count = item.count?.() ?? 0
        return `<a href="${href(item.path)}"${item.id === active ? ' class="on" aria-current="page"' : ''}><span aria-hidden="true">${item.icon}</span><span>${escapeHtml(item.label)}</span>${count > 0 ? `<em>${count}</em>` : ''}</a>`
      })
      .join('')
    const spaces = hub
      .projects()
      .map((project) =>
        items.has('tasks')
          ? `<a href="${href(`/tasks?space=${encodeURIComponent(project.id)}`)}"><span><i class="p-dot ${project.color}"></i></span><span>${escapeHtml(project.name)}</span></a>`
          : `<a><span><i class="p-dot ${project.color}"></i></span><span>${escapeHtml(project.name)}</span></a>`,
      )
      .join('')
    const capture = items.has('inbox')
      ? `<form class="p-capture" method="post" action="${href('/inbox')}"><span aria-hidden="true">+</span><input id="capture" name="text" placeholder="Quick capture" aria-label="Quick capture" autocomplete="off" maxlength="500" required><kbd>⌘ K</kbd></form>`
      : ''
    return `<aside class="p-side"><a class="p-logo" href="${href('/')}"><i aria-hidden="true">◒</i>daybook</a>${capture}<span class="p-label">Workspace</span><nav class="p-nav" aria-label="Workspace">${nav}</nav><span class="p-label p-spaces">Spaces</span><nav class="p-nav p-spaces" aria-label="Spaces">${spaces}</nav><div class="p-user"><b aria-hidden="true">ME</b><span>Your workspace<small>Saved on this computer</small></span></div></aside>`
  }

  return {
    prefix,
    href,
    nav(item) {
      if (items.has(item.id)) throw new Error(`the sidebar already has "${item.id}"`)
      items.set(item.id, item)
      return () => {
        if (items.get(item.id) === item) items.delete(item.id)
      }
    },
    navItems,
    has: (id) => items.has(id),
    header({ eyebrow, title, lead, action }) {
      const heading = title.endsWith('.') ? `${escapeHtml(title.slice(0, -1))}<span>.</span>` : escapeHtml(title)
      return `<header class="p-head"><div>${eyebrow === undefined ? '' : `<span class="p-eyebrow">${escapeHtml(eyebrow)}</span>`}<h1>${heading}</h1>${lead === undefined ? '' : `<p>${escapeHtml(lead)}</p>`}</div>${action ?? ''}</header>`
    },
    notice(url) {
      const query = new URL(url, 'http://local').searchParams
      for (const kind of ['error', 'warn', 'ok'] as const) {
        const text = query.get(kind)
        if (text !== null && text !== '')
          return `<p class="p-alert ${kind}" role="${kind === 'ok' ? 'status' : 'alert'}">${escapeHtml(text)}</p>`
      }
      return ''
    },
    page({ active, title, main, scripts }) {
      return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · ${APP_TITLE}</title>
<style>${HUB_STYLES}</style>
</head>
<body>
<div class="p-app">${sidebar(active)}<main class="p-main">${main}</main></div>
${CAPTURE_SCRIPT}${scripts ?? ''}
</body>
</html>`
    },
  }
}

export interface ShellConfig {
  /** Where the app is mounted: empty on its own server, `/app` in the frame (src/app.ts passes it). */
  readonly prefix?: string
}

export const name = 'hub-shell'
export const inject = ['hub', 'router']

export function apply(ctx: Context, config: ShellConfig = {}): void {
  const prefix = config.prefix ?? ''
  ctx.provide('hubShell', createShell(ctx.hub, prefix))
  ctx.router.route(prefix === '' ? '/' : prefix, new Acryl().get('/health', (c) => c.json({ ok: true })))
}
