/**
 * The snippet editor: one form for a new snippet and for changing an existing one. It is a plugin of its own, so its "New snippet" button leaves the
 * top bar when the row is switched off.
 *
 * Routes (under the shell's prefix): GET /new, GET /snippets/:id/edit, POST /snippets, POST /snippets/:id.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { fileNameOf, LANGUAGES, type Snippet, SnippetsError } from '../snippets/index.ts'

export const name = 'editor'
export const inject = ['snippets', 'shell', 'router']

const DIRTY_SCRIPT = `<script>
(function () {
  var form = document.querySelector('[data-dirty]');
  if (!form) return;
  var initial = new FormData(form).toString();
  window.addEventListener('beforeunload', function (event) {
    if (new FormData(form).toString() === initial) return;
    event.preventDefault();
    event.returnValue = '';
  });
  form.addEventListener('submit', function () { window.onbeforeunload = null; });
}());
</script>`

interface Values {
  readonly title: string
  readonly description: string
  readonly language: string
  readonly tags: string
  readonly code: string
}

const EMPTY: Values = { title: '', description: '', language: 'TypeScript', tags: '', code: '' }

export function apply(ctx: Context): void {
  const { snippets, shell } = ctx
  const e = shell.e
  const prefix = shell.prefix

  const formPage = (
    values: Values,
    mode: 'new' | 'edit',
    snippet: Snippet | undefined,
    error: string | undefined,
  ): string => {
    const action = snippet === undefined ? shell.href('/snippets') : shell.href(`/snippets/${encodeURIComponent(snippet.id)}`)
    const title = mode === 'new' ? 'New snippet' : `Edit ${fileNameOf(snippet as Snippet)}`
    const lead = mode === 'new'
      ? 'Keep a small piece of code you will want again. Its {{variables}} become inputs on the snippet page.'
      : 'Change the snippet. Its variables are read from the code again when you save.'
    const notice = error === undefined ? '' : `<p class="notice error" role="alert">${e(error)}</p>`
    const main = `<div class="i-form"><h2>${e(title)}</h2><p class="hint">${e(lead)}</p>${notice}<form method="post" action="${action}" data-dirty><div class="row"><label>TITLE<input name="title" required maxlength="120" value="${e(values.title)}" placeholder="retry-with-backoff"></label><label>LANGUAGE<select name="language">${LANGUAGES.map((language) => `<option value="${e(language)}"${language === values.language ? ' selected' : ''}>${e(language)}</option>`).join('')}</select></label></div><label>DESCRIPTION<input name="description" required maxlength="300" value="${e(values.description)}" placeholder="Exponential retry wrapper for async calls"></label><label>TAGS<input name="tags" maxlength="240" value="${e(values.tags)}" placeholder="async, resilience, network"></label><label>CODE<textarea name="code" required spellcheck="false" placeholder="export async function withRetry(...) { ... }">${e(values.code)}</textarea></label><div class="actions"><button class="primary">${mode === 'new' ? 'Create snippet' : 'Save changes'}</button><a href="${snippet === undefined ? shell.href('/snippets') : shell.href(`/snippets/${encodeURIComponent(snippet.id)}`)}">Cancel</a>${snippet === undefined ? '' : `<a class="danger" href="${shell.href(`/snippets/${encodeURIComponent(snippet.id)}/delete`)}">Delete</a>`}</div></form></div>`
    return shell.page({
      active: 'new-snippet',
      title,
      crumbs: ['Library', ...(snippet === undefined ? ['New'] : [fileNameOf(snippet), 'Edit'])],
      main,
      scripts: DIRTY_SCRIPT,
    })
  }

  const valuesOf = (snippet: Snippet | undefined, form?: Record<string, unknown>): Values => {
    if (form !== undefined)
      return {
        title: String(form.title ?? ''),
        description: String(form.description ?? ''),
        language: String(form.language ?? 'TypeScript'),
        tags: String(form.tags ?? ''),
        code: String(form.code ?? ''),
      }
    return snippet === undefined ? EMPTY : {
      title: snippet.title,
      description: snippet.description,
      language: snippet.language,
      tags: snippet.tags.join(', '),
      code: snippet.code,
    }
  }

  const app = new Acryl()
    .get('/new', (c) => c.html(formPage(EMPTY, 'new', undefined, c.req.query('error'))))
    .get('/snippets/:id/edit', (c) => {
      const snippet = snippets.get(c.req.param('id'))
      if (snippet === undefined) return c.redirect(shell.url('/snippets', { kind: 'error', text: 'That snippet no longer exists.' }), 303)
      return c.html(formPage(valuesOf(snippet), 'edit', snippet, undefined))
    })
    .post('/snippets', async (c) => {
      const form = await c.req.parseBody()
      try {
        const snippet = await snippets.create({
          title: String(form.title ?? ''),
          description: String(form.description ?? ''),
          language: String(form.language ?? ''),
          tags: String(form.tags ?? ''),
          code: String(form.code ?? ''),
        })
        return c.redirect(shell.url(`/snippets/${encodeURIComponent(snippet.id)}`, { kind: 'ok', text: `“${snippet.title}” was added to the library.` }), 303)
      } catch (error) {
        if (!(error instanceof SnippetsError)) throw error
        return c.html(formPage(valuesOf(undefined, form), 'new', undefined, error.message))
      }
    })
    .post('/snippets/:id', async (c) => {
      const form = await c.req.parseBody()
      const snippet = snippets.get(c.req.param('id'))
      if (snippet === undefined) return c.redirect(shell.url('/snippets', { kind: 'error', text: 'That snippet no longer exists.' }), 303)
      try {
        const next = await snippets.update(snippet.id, {
          title: String(form.title ?? ''),
          description: String(form.description ?? ''),
          language: String(form.language ?? ''),
          tags: String(form.tags ?? ''),
          code: String(form.code ?? ''),
        })
        return c.redirect(shell.url(`/snippets/${encodeURIComponent(next.id)}`, { kind: 'ok', text: 'Saved.' }), 303)
      } catch (error) {
        if (!(error instanceof SnippetsError)) throw error
        return c.html(formPage(valuesOf(undefined, form), 'edit', snippet, error.message))
      }
    })

  ctx.router.route(prefix === '' ? '/' : prefix, app)
  ctx.effect(() => shell.nav({ id: 'new-snippet', label: 'New snippet', icon: '＋', path: '/new', order: 1, place: 'top' }))
}
