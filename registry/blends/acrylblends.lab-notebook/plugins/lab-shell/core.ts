/**
 * The page shell every page plugin shares (`ctx.shell`): the notebook sidebar, the page wrapper, links under the mount prefix, the notice of a redirect
 * and the toast. Pages render the main column; the sidebar is built from the notebook and the active experiment.
 */
export interface PageInput {
  /** The browser tab's title (the app name is added). */
  readonly title: string
  /** The main column's HTML. */
  readonly main: string
  /** The notebook whose experiments the sidebar lists; absent uses the first notebook. */
  readonly notebookId?: string
  /** The experiment to highlight in the sidebar. */
  readonly experimentId?: string
  /** Extra HTML at the end of the body: a page's own `<script>`. */
  readonly scripts?: string
}

/** A line after a form was sent: `?ok=` or `?error=` on the redirect. */
export type Notice = { readonly kind: 'ok' | 'error' | 'warn'; readonly text: string }

export interface Shell {
  readonly prefix: string
  e(text: string): string
  readonly href: (path: string) => string
  page(input: PageInput): string
  /** The notice of a request's `?ok=` / `?error=` / `?warn=` query, as HTML (empty when there is none). */
  notice(url: string): string
  back(value: unknown, fallback: string): string
  /** A path with a notice for the page it lands on: `url('/data', { kind: 'ok', text: 'Saved.' })`. */
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

export const CLIENT_SCRIPT = `<script>
(function () {
  var timer;
  function toast(message) {
    var element = document.getElementById('toast');
    if (!element) return;
    element.textContent = message;
    element.classList.add('show');
    clearTimeout(timer);
    timer = setTimeout(function () { element.classList.remove('show'); }, 1800);
  }
  window.fieldLabToast = toast;
  document.querySelectorAll('[data-toast]').forEach(function (button) {
    button.addEventListener('click', function () { toast(button.dataset.toast); });
  });
}());
</script>`

export interface ShellLook {
  readonly appTitle: string
  readonly css: string
  readonly bodyClass: string
  readonly sidebar: (notebookId: string | undefined, experimentId: string | undefined, href: (path: string) => string) => string
}

export function createShell(prefix: string, look: ShellLook): Shell {
  const href = (path: string): string => `${prefix}${path.startsWith('/') ? path : `/${path}`}`
  return {
    prefix,
    e: escapeHtml,
    href,
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
    page({ title, main, notebookId, experimentId, scripts }) {
      return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · ${escapeHtml(look.appTitle)}</title>
<style>${look.css}</style>
</head>
<body class="${look.bodyClass}">
<div class="shell">${look.sidebar(notebookId, experimentId, href)}<main class="main">${main}</main></div>
<div id="toast" class="toast" aria-live="polite"></div>
${CLIENT_SCRIPT}
${scripts ?? ''}
</body>
</html>`
    },
  }
}
