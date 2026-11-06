/** The page shell every page plugin shares: the dark rail, links under the mount prefix, notices and the toast. */
export interface NavItem {
  readonly id: string
  readonly label: string
  readonly icon: string
  readonly path: string
  readonly order: number
  count?(): number
}

export type Notice = { readonly kind: 'ok' | 'error' | 'warn'; readonly text: string }

export interface Shell {
  readonly prefix: string
  e(text: string): string
  href(path: string): string
  nav(item: NavItem): () => void
  navItems(): readonly NavItem[]
  page(input: { readonly active?: string; readonly title: string; readonly main: string; readonly scripts?: string }): string
  notice(url: string): string
  back(value: unknown, fallback: string): string
  url(path: string, notice?: Notice): string
}

export const escapeHtml = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')

export const CLIENT_SCRIPT = `<script>
(function () {
  var timer;
  function toast(message) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(timer);
    timer = setTimeout(function () { el.classList.remove('show'); }, 2200);
  }
  window.acrylToast = toast;
  document.querySelectorAll('[data-toast]').forEach(function (button) {
    button.addEventListener('click', function () { toast(button.dataset.toast); });
  });
  document.querySelectorAll('[data-copy]').forEach(function (button) {
    button.addEventListener('click', function () {
      var source = document.getElementById(button.dataset.copy);
      if (!source) return;
      if (navigator.clipboard) navigator.clipboard.writeText(source.textContent).then(function () { toast('Copied'); });
      else toast(source.textContent);
    });
  });
}());
</script>`

export interface ShellLook {
  readonly appTitle: string
  readonly css: string
  readonly bodyClass: string
  rail(nav: readonly NavItem[], active: string | undefined, href: (path: string) => string): string
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
    page({ active, title, main, scripts }) {
      return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · ${escapeHtml(look.appTitle)}</title>
<style>${look.css}</style>
</head>
<body class="${look.bodyClass}">
<div class="app">${look.rail(navItems(), active, href)}<main class="main">${main}</main></div>
<div class="toast" id="toast" aria-live="polite"></div>
${CLIENT_SCRIPT}
${scripts ?? ''}
</body>
</html>`
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
    back(value, fallback) {
      return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') ? value : fallback
    },
    url(path, notice) {
      if (notice === undefined) return href(path)
      const separator = path.includes('?') ? '&' : '?'
      return `${href(path)}${separator}${notice.kind}=${encodeURIComponent(notice.text)}`
    },
  }
}
