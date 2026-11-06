/**
 * The page shell every page plugin shares (`ctx.shell`): the top bar, the sidebar entries pages register, links under the mount prefix, the page
 * wrapper and the notice of a redirect. A page plugin registers its entry with `ctx.shell.nav(...)` inside `ctx.effect`, so the entry leaves with the
 * plugin, mounts its routes at `ctx.shell.prefix` and writes every link with `ctx.shell.href(path)`: on its own server the app is at the root, in the
 * ACRYL frame at `/app`.
 */
import type { Language } from '../snippets/index.ts'

export interface NavItem {
  /** The page plugin's name. */
  readonly id: string
  readonly label: string
  /** A short glyph shown before the label. */
  readonly icon: string
  /** The page's path under the prefix (`/snippets`), query included. */
  readonly path: string
  /** The sidebar group; lower first, and the built-in LANGUAGES and COLLECTIONS groups sit between LIBRARY and the rest. */
  readonly group?: string
  /** Where it sits: lower first. */
  readonly order: number
  /** `top` puts it in the top bar as a button (the New snippet button). */
  readonly place?: 'top'
  /** A number shown at the right, read at each render; nothing when absent or zero. */
  count?(): number
}

export interface PageInput {
  /** The nav item id to highlight. */
  readonly active?: string
  /** The browser tab's title (the app name is added). */
  readonly title: string
  /** The breadcrumb segments, last one bold. */
  readonly crumbs: readonly string[]
  /** The page's content inside `<main>`. */
  readonly main: string
  /** Extra HTML at the end of the body: a page's own `<script>`. */
  readonly scripts?: string
  /** The page's right meta in the top bar (default: `LOCAL LIBRARY`). */
  readonly meta?: string
}

/** A line after a form was sent: `?ok=` or `?error=` on the redirect. */
export type Notice = { readonly kind: 'ok' | 'error' | 'warn'; readonly text: string }

export interface SnippetNavData {
  readonly languages: readonly { language: Language; count: number }[]
  readonly collections: readonly { id: string; name: string }[]
}

export interface Shell {
  readonly prefix: string
  /** Escape user text for HTML. */
  e(text: string): string
  /** The URL of a path of the app, under the prefix. */
  href(path: string): string
  /** Put an entry in the sidebar or the top bar; returns the disposer. Call it inside `ctx.effect`. */
  nav(item: NavItem): () => void
  navItems(): readonly NavItem[]
  has(id: string): boolean
  page(input: PageInput): string
  /** The notice of a request's `?ok=` / `?error=` / `?warn=` query, as HTML (empty when there is none). */
  notice(url: string): string
  /** A same-app path from a form's `back` field, or `fallback`: only paths of the app are accepted, never another site. */
  back(value: unknown, fallback: string): string
  /** A path with a notice for the page it lands on: `url('/snippets', { kind: 'ok', text: 'Saved.' })`. */
  url(path: string, notice?: Notice): string
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

const KEYWORDS = new Set([
  'as', 'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'default', 'def', 'delete', 'do',
  'else', 'enum', 'except', 'export', 'extends', 'false', 'finally', 'for', 'from', 'function', 'if', 'implements',
  'import', 'in', 'instanceof', 'interface', 'let', 'new', 'None', 'null', 'of', 'or', 'and', 'not', 'pass',
  'private', 'protected', 'public', 'raise', 'readonly', 'return', 'select', 'static', 'switch', 'this', 'throw',
  'true', 'try', 'type', 'typeof', 'undefined', 'var', 'void', 'while', 'with', 'yield', 'INSERT', 'UPDATE',
  'DELETE', 'SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT', 'GROUP', 'ORDER', 'BY', 'HAVING', 'LIMIT', 'RETURNING',
  'WITH', 'ON', 'CONFLICT', 'DO', 'SET', 'VALUES', 'EXPLAIN', 'ANALYZE', 'VACUUM', 'AS', 'DISTINCT', 'SUM',
])

/**
 * The code as HTML with line breaks kept and the few token classes the mockup colours: comments, strings, keywords and numbers. It is escaped
 * first; the scanner then only wraps runs that cannot contain a tag, so the result is always safe to put in a page.
 */
export function highlight(code: string): string {
  const token = /(\/\/[^\n]*|#[^\n]*|--[^\n]*)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)/gu
  let html = ''
  let last = 0
  for (const match of code.matchAll(token)) {
    const index = match.index ?? 0
    html += escapeHtml(code.slice(last, index))
    const [whole, comment, text, number, word] = match
    if (comment !== undefined) html += `<span class="tok-comment">${escapeHtml(whole)}</span>`
    else if (text !== undefined) html += `<span class="tok-string">${escapeHtml(whole)}</span>`
    else if (number !== undefined) html += `<span class="tok-number">${escapeHtml(whole)}</span>`
    else if (word !== undefined)
      html += KEYWORDS.has(word)
        ? `<em>${escapeHtml(whole)}</em>`
        : /^[A-Z][A-Za-z0-9]*$/u.test(whole)
          ? `<strong>${escapeHtml(whole)}</strong>`
          : escapeHtml(whole)
    last = index + whole.length
  }
  html += escapeHtml(code.slice(last))
  return html
}

/** The line numbers beside the code. */
export function lineNumbers(code: string): string {
  return code.split('\n').map((_, index) => String(index + 1)).join('<br/>')
}

export interface ShellLook {
  readonly appTitle: string
  readonly css: string
  /** The sidebar's HTML for the current entries and the app's languages and collections. */
  sidebar(nav: readonly NavItem[], active: string | undefined, href: (path: string) => string, data: SnippetNavData): string
  /** The top bar's HTML. */
  topbar(nav: readonly NavItem[], crumbs: readonly string[], href: (path: string) => string, meta: string): string
}

export function createShell(prefix: string, look: ShellLook, data: () => SnippetNavData): Shell {
  const items = new Map<string, NavItem>()
  const href = (path: string): string => `${prefix}${path.startsWith('/') ? path : `/${path}`}`
  const navItems = () => [...items.values()].sort((a, b) => a.order - b.order)
  return {
    prefix,
    href,
    e: escapeHtml,
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
    page({ active, title, crumbs, main, scripts, meta }) {
      return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · ${escapeHtml(look.appTitle)}</title>
<style>${look.css}</style>
</head>
<body class="ide">
${look.topbar(navItems(), crumbs, href, meta ?? 'LOCAL LIBRARY')}
<div class="i-app">${look.sidebar(navItems(), active, href, data())}<main class="i-main">${main}</main></div>
<div id="toast" class="toast" aria-live="polite"></div>
${scripts ?? CLIENT_SCRIPT}
</body>
</html>`
    },
  }
}

/** The page's copy buttons, the fill-the-variables form and its toast. */
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
  function copy(text, message) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(function () { toast(message); }, function () { toast('Copy failed'); });
      return;
    }
    var area = document.createElement('textarea');
    area.value = text;
    document.body.append(area);
    area.select();
    document.execCommand('copy');
    area.remove();
    toast(message);
  }
  document.querySelectorAll('[data-copy]').forEach(function (button) {
    button.addEventListener('click', function () {
      var code = document.getElementById(button.dataset.copy);
      if (code) copy(code.textContent, 'Snippet copied to clipboard');
    });
  });
  document.querySelectorAll('[data-fill]').forEach(function (button) {
    button.addEventListener('click', function () {
      var code = document.getElementById(button.dataset.fill);
      if (!code) return;
      var inputs = Array.prototype.slice.call(document.querySelectorAll('[data-variable]'));
      var missing = inputs.filter(function (input) { return input.value.trim() === ''; });
      if (missing.length > 0) {
        missing[0].focus();
        toast('Fill in every variable first');
        return;
      }
      var text = code.textContent;
      inputs.forEach(function (input) {
        text = text.split('{{' + input.dataset.variable + '}}').join(input.value.trim());
      });
      copy(text, 'Filled snippet copied');
    });
  });
  document.querySelectorAll('[data-search]').forEach(function (input) {
    input.addEventListener('input', function () {
      var query = input.value.toLowerCase();
      var table = document.querySelector(input.dataset.search);
      if (!table) return;
      table.querySelectorAll('[data-row]').forEach(function (row) {
        row.style.display = row.textContent.toLowerCase().includes(query) ? '' : 'none';
      });
    });
  });
  document.querySelectorAll('[data-confirm]').forEach(function (form) {
    form.addEventListener('submit', function (event) {
      if (!window.confirm(form.dataset.confirm)) event.preventDefault();
    });
  });
}());
</script>`

/** A language badge: the short label on its tint. */
export function badge(language: string): string {
  const classes: Readonly<Record<string, string>> = {
    TypeScript: 'ts',
    JavaScript: 'js',
    Python: 'py',
    SQL: 'sql',
    Shell: 'sh',
  }
  const short: Readonly<Record<string, string>> = {
    TypeScript: 'TS',
    JavaScript: 'JS',
    Python: 'Py',
    SQL: 'SQL',
    Shell: '$',
  }
  return `<b class="lang ${classes[language] ?? 'ts'}">${short[language] ?? 'TS'}</b>`
}
