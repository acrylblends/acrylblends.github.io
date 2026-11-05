/**
 * The page shell every page plugin shares (`ctx.shell`): the sidebar entries pages register, links under the mount prefix, the page wrapper and the
 * notice of a redirect. A page plugin registers its entry with `ctx.shell.nav(...)` inside `ctx.effect`, so the entry leaves with the plugin, mounts its
 * routes at `ctx.shell.prefix` and writes every link with `ctx.shell.href(path)`: on its own server the app is at the root, in the ACRYL frame at `/app`.
 */
export interface NavItem {
  /** The page plugin's name. */
  readonly id: string
  readonly label: string
  /** A short glyph shown before the label. */
  readonly icon: string
  /** The page's path under the prefix (`/pipeline`). */
  readonly path: string
  /** Where it sits: lower first. */
  readonly order: number
  /** A number shown at the right, read at each render; nothing when absent or zero. */
  count?(): number
}

export interface PageInput {
  /** The nav item id to highlight. */
  readonly active?: string
  /** The browser tab's title (the app name is added). */
  readonly title: string
  /** The page's content inside `<main>`. */
  readonly main: string
  /** Extra HTML at the end of the body: a page's own `<script>`. */
  readonly scripts?: string
  /** Extra HTML after `<main>` inside the app grid (an inspector column). */
  readonly aside?: string
}

/** A line after a form was sent: `?ok=` or `?error=` on the redirect. */
export type Notice = { readonly kind: 'ok' | 'error' | 'warn'; readonly text: string }

export interface Shell {
  readonly prefix: string
  /** The URL of a path of the app, under the prefix. */
  href(path: string): string
  /** Put a page in the sidebar; returns the disposer. Call it inside `ctx.effect`. */
  nav(item: NavItem): () => void
  navItems(): readonly NavItem[]
  has(id: string): boolean
  page(input: PageInput): string
  /** The notice of a request's `?ok=` / `?error=` / `?warn=` query, as HTML (empty when there is none). */
  notice(url: string): string
}

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

export interface ShellLook {
  /** The browser tab's title suffix and the app's name. */
  readonly appTitle: string
  readonly css: string
  /** The sidebar's HTML for the current entries. */
  sidebar(nav: readonly NavItem[], active: string | undefined, href: (path: string) => string): string
  /** The CSS class of the app grid (`<div class="${grid}">`). */
  readonly grid: string
  /** The CSS class of `<main>`. */
  readonly main: string
  /** The page's `<body>` class. */
  readonly body?: string
}

export function createShell(prefix: string, look: ShellLook): Shell {
  const items = new Map<string, NavItem>()
  const href = (path: string): string => `${prefix}${path.startsWith('/') ? path : `/${path}`}`
  const navItems = () => [...items.values()].sort((a, b) => a.order - b.order)
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
    notice(url) {
      const query = new URL(url, 'http://local').searchParams
      for (const kind of ['error', 'warn', 'ok'] as const) {
        const text = query.get(kind)
        if (text !== null && text !== '')
          return `<p class="notice ${kind}" role="${kind === 'ok' ? 'status' : 'alert'}">${escapeHtml(text)}</p>`
      }
      return ''
    },
    page({ active, title, main, scripts, aside }) {
      return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · ${escapeHtml(look.appTitle)}</title>
<style>${look.css}</style>
</head>
<body${look.body === undefined ? '' : ` class="${look.body}"`}>
<div class="${look.grid}">${look.sidebar(navItems(), active, href)}<main class="${look.main}">${main}</main>${aside ?? ''}</div>
${scripts ?? ''}
</body>
</html>`
    },
  }
}
