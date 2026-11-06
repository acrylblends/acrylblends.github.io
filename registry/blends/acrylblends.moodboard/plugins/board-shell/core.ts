/**
 * The page shell every page plugin shares (`ctx.shell`): the field-notes top bar with the project crumb and the save actions, the notice of a redirect,
 * links under the mount prefix, and the canvas script (drag, arrow keys, save). Pages render their own work area below the bar.
 */
export interface PageInput {
  /** The browser tab's title (the app name is added). */
  readonly title: string
  /** The page's content, including its own work-area wrapper. */
  readonly main: string
  /** The crumb's last segment(s) after `Projects / <project>`; defaults to the board title. */
  readonly crumbs?: readonly string[]
  /** Extra HTML at the end of the body: a page's own `<script>`. */
  readonly scripts?: string
  /** An extra body class. */
  readonly bodyClass?: string
}

/** A line after a form was sent: `?ok=` or `?error=` on the redirect. */
export type Notice = { readonly kind: 'ok' | 'error' | 'warn'; readonly text: string }

export interface Shell {
  readonly prefix: string
  e(text: string): string
  /** The URL of a path of the app, under the prefix. */
  href(path: string): string
  page(input: PageInput): string
  /** The notice of a request's `?ok=` / `?error=` / `?warn=` query, as HTML (empty when there is none). */
  notice(url: string): string
  back(value: unknown, fallback: string): string
  /** A path with a notice for the page it lands on: `url('/', { kind: 'ok', text: 'Saved.' })`. */
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

/**
 * The canvas script: pointer drag with an autosave POST on drop, arrow-key nudging for a focused object, and the toast. It only acts where its elements
 * exist, so every page shares it.
 */
export const CLIENT_SCRIPT = `<script>
(function () {
  var toastTimer;
  function toast(message) {
    var element = document.getElementById('toast');
    if (!element) return;
    element.textContent = message;
    element.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { element.classList.remove('show'); }, 1900);
  }
  window.fieldNotesToast = toast;
  document.querySelectorAll('[data-toast]').forEach(function (button) {
    button.addEventListener('click', function () { toast(button.dataset.toast); });
  });
  document.querySelectorAll('.colors [data-color]').forEach(function (button) {
    button.addEventListener('click', function () { toast('Palette colour selected: ' + button.dataset.color); });
  });
  var board = document.getElementById('board');
  if (!board) return;
  function save(element, x, y) {
    var url = (board.dataset.move || '').replace('__id__', element.dataset.object);
    if (!url) return;
    var body = new URLSearchParams();
    body.set('x', String(x));
    body.set('y', String(y));
    fetch(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: body.toString() })
      .then(function (response) { if (!response.ok) throw new Error('save failed'); toast('Position saved'); })
      .catch(function () { toast('Could not save the position'); });
  }
  document.querySelectorAll('[data-object]').forEach(function (element) {
    var drag = false, startX = 0, startY = 0, originX = 0, originY = 0, moved = false;
    function percentX() { return parseFloat(element.style.left || element.dataset.x || '0'); }
    function percentY() { return parseFloat(element.style.top || element.dataset.y || '0'); }
    element.addEventListener('pointerdown', function (event) {
      if (event.button !== 0) return;
      var rect = element.getBoundingClientRect();
      drag = true; moved = false;
      startX = event.clientX; startY = event.clientY;
      originX = percentX(); originY = percentY();
      element.classList.add('dragging');
      if (element.setPointerCapture) element.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    element.addEventListener('pointermove', function (event) {
      if (!drag) return;
      var box = board.getBoundingClientRect();
      if (Math.abs(event.clientX - startX) + Math.abs(event.clientY - startY) > 3) moved = true;
      if (!moved) return;
      var x = Math.max(0, Math.min(100, originX + ((event.clientX - startX) / box.width) * 100));
      var y = Math.max(0, Math.min(100, originY + ((event.clientY - startY) / box.height) * 100));
      element.style.left = x.toFixed(2) + '%';
      element.style.top = y.toFixed(2) + '%';
      element.dataset.x = x.toFixed(2);
      element.dataset.y = y.toFixed(2);
    });
    function end() {
      if (!drag) return;
      drag = false;
      element.classList.remove('dragging');
      if (moved) save(element, element.dataset.x, element.dataset.y);
    }
    element.addEventListener('pointerup', end);
    element.addEventListener('pointercancel', end);
    element.addEventListener('click', function (event) { if (moved) { event.preventDefault(); moved = false; } });
    element.addEventListener('keydown', function (event) {
      var step = event.shiftKey ? 5 : 1;
      var delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
      if (!delta) return;
      event.preventDefault();
      var x = Math.max(0, Math.min(100, percentX() + delta[0]));
      var y = Math.max(0, Math.min(100, percentY() + delta[1]));
      element.style.left = x.toFixed(2) + '%';
      element.style.top = y.toFixed(2) + '%';
      element.dataset.x = x.toFixed(2);
      element.dataset.y = y.toFixed(2);
      save(element, x.toFixed(2), y.toFixed(2));
    });
  });
}());
</script>`

export interface ShellLook {
  readonly appTitle: string
  readonly css: string
  readonly bodyClass: string
  /** The top bar: the brand, the crumb built from the board, the history/share toasts and the save form. */
  topbar(crumbs: readonly string[], href: (path: string) => string): string
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
    page({ title, main, crumbs, scripts, bodyClass }) {
      return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · ${escapeHtml(look.appTitle)}</title>
<style>${look.css}</style>
</head>
<body class="${look.bodyClass}${bodyClass === undefined ? '' : ` ${bodyClass}`}">
${look.topbar(crumbs ?? [], href)}
${main}
<div id="toast" class="toast" aria-live="polite"></div>
${CLIENT_SCRIPT}
${scripts ?? ''}
</body>
</html>`
    },
  }
}
