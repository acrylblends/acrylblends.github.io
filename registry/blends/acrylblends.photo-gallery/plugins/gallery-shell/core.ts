/**
 * The page shell every page plugin shares (`ctx.shell`): the entries pages register in the top bar and the album rail, links under the mount prefix,
 * the page wrapper and the notice of a redirect. A page plugin registers its entries with `ctx.shell.nav(...)` inside `ctx.effect`, so an entry leaves
 * with its plugin; every page mounts its routes at `ctx.shell.prefix` and writes every link with `ctx.shell.href(path)`.
 */
export interface NavItem {
  /** The page plugin's name for the entry. */
  readonly id: string
  /** Where it sits: the top bar or the album rail. */
  readonly area: 'top' | 'side'
  readonly label: string
  /** The rail's section heading (`LIBRARY`, `SMART COLLECTIONS`); adjacent entries share one heading. */
  readonly group?: string
  /** A glyph in the rail's thumbnail slot (`✦`). */
  readonly glyph?: string
  /** The data URI drawn in the rail's thumbnail slot. */
  readonly image?: string
  /** The page's path under the prefix (`/albums/landscapes`). */
  readonly path: string
  /** Where it sits: lower first. */
  readonly order: number
  /** A number shown after the label, read at each render; nothing when absent or zero. */
  count?(): number
}

export interface PageInput {
  /** The rail entry id to highlight (`all`, `album:<id>`, `favourites`). */
  readonly active?: string
  /** The top bar entry id to highlight (`library`, `albums`, `shared`, `recent`). */
  readonly navActive?: string
  /** The browser tab's title (the app name is added). */
  readonly title: string
  /** An extra body class for a page that changes the shell's behaviour (the lightbox's arrow keys). */
  readonly bodyClass?: string
  /** The breadcrumb segments (optional for a top bar that does not show them). */
  readonly crumbs?: readonly string[]
  /** The page's content. */
  readonly main: string
  /** Extra HTML at the end of the body: a page's own `<script>`. */
  readonly scripts?: string
}

/** A line after a form was sent: `?ok=` or `?error=` on the redirect. */
export type Notice = { readonly kind: 'ok' | 'error' | 'warn'; readonly text: string }

export interface Shell {
  readonly prefix: string
  e(text: string): string
  /** The URL of a path of the app, under the prefix. */
  href(path: string): string
  nav(item: NavItem): () => void
  navItems(): readonly NavItem[]
  has(id: string): boolean
  page(input: PageInput): string
  /** The notice of a request's `?ok=` / `?error=` / `?warn=` query, as HTML (empty when there is none). */
  notice(url: string): string
  back(value: unknown, fallback: string): string
  /** A path with a notice for the page it lands on: `url('/photos/1', { kind: 'ok', text: 'Saved.' })`. */
  url(path: string, notice?: Notice): string
}

export const escapeHtml = (text: string): string =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

export function noticeQuery(notice: Notice): string {
  return `?${notice.kind}=${encodeURIComponent(notice.text)}`
}

/** The page's toast and the lightbox keys (Escape, arrows), shared by every page. */
export const CLIENT_SCRIPT = `<script>
(function () {
  var toastTimer;
  function toast(message) {
    var element = document.getElementById('toast');
    if (!element) return;
    element.textContent = message;
    element.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { element.classList.remove('show'); }, 2200);
  }
  window.stillframeToast = toast;
  document.querySelectorAll('[data-toast]').forEach(function (button) {
    button.addEventListener('click', function () { toast(button.dataset.toast); });
  });
  document.querySelectorAll('[data-submit]').forEach(function (element) {
    element.addEventListener('change', function () { element.form && element.form.requestSubmit(); });
  });
  if (document.body.classList.contains('lightbox-open')) {
    document.addEventListener('keydown', function (event) {
      var prev = document.querySelector('[data-lightbox-prev]');
      var next = document.querySelector('[data-lightbox-next]');
      var close = document.querySelector('[data-lightbox-close]');
      if (event.key === 'ArrowLeft' && prev) location.href = prev.getAttribute('href');
      if (event.key === 'ArrowRight' && next) location.href = next.getAttribute('href');
      if (event.key === 'Escape' && close) location.href = close.getAttribute('href');
    });
  }
}());
</script>`

export interface ShellLook {
  readonly appTitle: string
  readonly css: string
  /** The top bar's HTML. */
  topbar(items: readonly NavItem[], navActive: string | undefined, href: (path: string) => string): string
  /** The album rail. */
  rail(items: readonly NavItem[], active: string | undefined, href: (path: string) => string): string
  /** The class of the wrapper around the page's main HTML. */
  readonly bodyClass: string
}

export function createShell(prefix: string, look: ShellLook): Shell {
  const items = new Map<string, NavItem>()
  const href = (path: string): string => `${prefix}${path.startsWith('/') ? path : `/${path}`}`
  const navItems = () => [...items.values()].sort((a, b) => a.order - b.order)
  return {
    prefix,
    e: escapeHtml,
    href,
    nav(item) {
      if (items.has(item.id)) throw new Error(`the shell already has "${item.id}"`)
      items.set(item.id, item)
      return () => {
        if (items.get(item.id) === item) items.delete(item.id)
      }
    },
    navItems,
    has: (id) => items.has(id),
    back(value, fallback) {
      return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')
        ? value
        : fallback
    },
    url(path, notice) {
      const [base, query] = path.split('?') as [string, string | undefined]
      const noticeText = notice === undefined ? '' : noticeQuery(notice).slice(1)
      const joined = [query, noticeText].filter((part) => part !== undefined && part !== '').join('&')
      return `${href(base)}${joined === '' ? '' : `?${joined}`}`
    },
    notice(url) {
      const query = new URL(url, 'http://local').searchParams
      for (const kind of ['error', 'warn', 'ok'] as const) {
        const text = query.get(kind)
        if (text !== null && text !== '')
          return `<p class="notice ${kind}" role="${kind === 'ok' ? 'status' : 'alert'}">${escapeHtml(text)}</p>`
      }
      return ''
    },
    page({ active, navActive, title, bodyClass, main, scripts }) {
      return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · ${escapeHtml(look.appTitle)}</title>
<style>${look.css}</style>
</head>
<body class="${look.bodyClass}${bodyClass === undefined ? '' : ` ${bodyClass}`}">
${look.topbar(navItems().filter((item) => item.area === 'top'), navActive, href)}
<div class="layout">${look.rail(navItems().filter((item) => item.area === 'side'), active, href)}<main class="main">${main}</main></div>
<div id="toast" class="toast" aria-live="polite"></div>
${scripts ?? CLIENT_SCRIPT}
</body>
</html>`
    },
  }
}
