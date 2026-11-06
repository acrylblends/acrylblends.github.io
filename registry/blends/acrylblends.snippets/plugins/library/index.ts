/**
 * The library page: the snippet list on the left, the code editor on the right, search, language and tag filters and the snippet's own actions. It
 * is the app's first screen, so it also answers `/` with a redirect to `/snippets`.
 *
 * Routes (under the shell's prefix): GET /, GET /snippets?q&language&tag&starred&recent&sort&show, GET /snippets/:id,
 * POST /snippets/:id/star, GET and POST /snippets/:id/delete.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import {
  fileNameOf,
  LANGUAGES,
  languageOf,
  type Language,
  type Snippet,
  type SnippetFilter,
  whenText,
} from '../snippets/index.ts'
import { badge, highlight, lineNumbers } from '../snips-shell/index.ts'

export const name = 'library'
export const inject = ['snippets', 'shell', 'router']

const PAGE = 50

function query(parts: Record<string, string | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(parts)) if (value !== undefined && value !== '') search.set(key, value)
  const text = search.toString()
  return text === '' ? '' : `?${text}`
}

export function apply(ctx: Context): void {
  const { snippets, shell } = ctx
  const e = shell.e
  const prefix = shell.prefix

  const listRow = (snippet: Snippet, selected: string | undefined): string =>
    `<a href="${shell.href(`/snippets/${encodeURIComponent(snippet.id)}`)}"><article${snippet.id === selected ? ' class="active"' : ''} data-row><b>${e(snippet.title)}</b><small>${e(snippet.description)}</small><span>${e(snippet.language === 'TypeScript' ? 'TS' : snippet.language === 'JavaScript' ? 'JS' : snippet.language === 'Python' ? 'PY' : snippet.language.slice(0, 3).toUpperCase())}</span><time>${e(whenText(snippet.updatedAt, new Date()))}</time></article></a>`

  const editor = (snippet: Snippet, back: string): string => {
    const id = encodeURIComponent(snippet.id)
    const variables = snippet.variables.length === 0
      ? '<p>No variables in this snippet.</p>'
      : `<div class="i-vars">${snippet.variables.map((variable) => `<label>${e(variable)}<input data-variable="${e(variable)}" value="" placeholder="value"></label>`).join('')}</div>`
    return `<section class="i-editor"><div class="i-file"><span>${badge(snippet.language)} ${e(fileNameOf(snippet))}</span><span>${snippet.starred ? '★' : '☆'} &nbsp;···</span></div><div class="i-code"><div class="i-lines">${lineNumbers(snippet.code)}</div><pre id="code-${e(snippet.id)}">${highlight(snippet.code)}</pre></div><div class="i-editor-foot"><span>${e(snippet.language)} · UTF-8</span><span>${String(snippet.code.split('\n').length)} lines · ${String(Buffer.byteLength(snippet.code, 'utf8'))} bytes</span></div><div class="i-meta"><div><b>DESCRIPTION</b><p>${e(snippet.description)}</p></div><div><b>TAGS</b><p class="tags">${snippet.tags.map((tag) => `<i><a href="${shell.href(`/snippets?tag=${encodeURIComponent(tag)}`)}" style="color:inherit;text-decoration:none">${e(tag)}</a></i>`).join('')}<a href="${shell.href(`/snippets/${id}/edit`)}" title="Edit tags" style="color:#7d8993;text-decoration:none">＋</a></p></div><div><b>VARIABLES</b>${variables}</div><div><b>UPDATED</b><p>${e(whenText(snippet.updatedAt, new Date()))} · created ${e(whenText(snippet.createdAt, new Date()))}</p></div><div class="i-actions"><form method="post" action="${shell.href(`/snippets/${id}/star`)}"><input type="hidden" name="back" value="${e(back)}"><button>${snippet.starred ? '★ Unstar' : '☆ Star'}</button></form><button data-fill="code-${e(snippet.id)}">Copy with variables</button><button data-copy="code-${e(snippet.id)}">Copy code</button><a href="${shell.href(`/snippets/${id}/edit`)}">Edit snippet</a><a href="${shell.href(`/snippets/${id}/delete`)}" style="background:#fff0ec;color:#b45949">Delete</a></div></div></section>`
  }

  const page = (read: (name: string) => string | undefined, url: string, requested: string | undefined): string => {
    const q = (read('q') ?? '').slice(0, 120)
    const languageText = read('language')
    let language: Language | undefined
    try {
      language = languageText === undefined || languageText === '' ? undefined : languageOf(languageText)
    } catch {
      language = undefined
    }
    const tag = (read('tag') ?? '').slice(0, 40) || undefined
    const starred = read('starred') === '1'
    const recent = read('recent') === '1'
    const show = Math.min(200, Math.max(PAGE / 5, Number(read('show') ?? PAGE) || PAGE))
    const sort = read('sort') === 'name' ? 'name' : 'recent'
    const filter: SnippetFilter = {
      q,
      ...(language === undefined ? {} : { language }),
      ...(tag === undefined ? {} : { tag }),
      ...(starred ? { starred: true } : {}),
      limit: show + 1,
    }
    let rows = snippets.search(filter)
    if (sort === 'name') rows = [...rows].sort((a, b) => a.title.localeCompare(b.title))
    if (recent) rows = rows.slice(0, 10)
    const more = rows.length > show
    const shown = rows.slice(0, show)
    const requestedSnippet = requested === undefined ? undefined : snippets.get(requested)
    const selected = requestedSnippet ?? shown[0]
    const back = `/snippets${query({ q, language: languageText, tag, starred: starred ? '1' : undefined, recent: recent ? '1' : undefined, sort, show: String(show) })}`
    const stats = snippets.stats()
    const languageOptions = `<option value="">All languages</option>${LANGUAGES.map((item) => `<option value="${e(item)}"${item === language ? ' selected' : ''}>${e(item)}</option>`).join('')}`
    const viewTitle = starred ? 'Starred snippets' : recent ? 'Recently used' : 'Code snippets'
    const viewLead = starred
      ? `${String(stats.starred)} favourites`
      : recent
        ? 'The ten you changed last'
        : `${String(stats.total)} reusable pieces · Updated ${stats.updatedAt === undefined ? 'never' : e(whenText(stats.updatedAt, new Date()))}`
    const empty = shown.length === 0
      ? `<p class="empty">No snippets match${q === '' ? '' : ` “${e(q)}”`}. <a href="${shell.href('/snippets')}">Show all snippets</a></p>`
      : ''
    const main = `${shell.notice(url)}<div class="i-toolbar"><div><h1>${viewTitle}</h1><p>${viewLead}</p></div><form class="i-tools" method="get" action="${shell.href('/snippets')}">${starred ? '<input type="hidden" name="starred" value="1">' : ''}${recent ? '<input type="hidden" name="recent" value="1">' : ''}<input name="q" value="${e(q)}" placeholder="Search snippets, tags, code…" aria-label="Search snippets"><select name="language" aria-label="Language" onchange="this.form.submit()">${languageOptions}</select><button>Filter</button><a href="${shell.href(`/snippets${query({ q, language: languageText, tag, starred: starred ? '1' : undefined, recent: recent ? '1' : undefined, sort: sort === 'name' ? undefined : 'name' })}`)}">${sort === 'name' ? 'Name A–Z ↓' : 'Recently edited ↓'}</a></form></div><div class="i-content"><section class="i-list"><div class="i-list-head"><span>SNIPPET NAME</span><span>LANGUAGE</span><span>UPDATED</span></div>${shown.map((snippet) => listRow(snippet, selected?.id)).join('')}${empty}${more ? `<a class="i-more" href="${shell.href(`/snippets${query({ q, language: languageText, tag, starred: starred ? '1' : undefined, recent: recent ? '1' : undefined, sort: sort === 'name' ? 'name' : undefined, show: String(show + 20) })}`)}">Load 20 more ↓</a>` : ''}</section>${selected === undefined ? '<section class="i-editor"><p class="i-empty">Select a snippet to see its code, tags and variables.</p></section>' : editor(selected, back)}</div>`
    const crumbLanguage = language ?? selected?.language
    const crumbs = ['Library', ...(crumbLanguage === undefined ? [] : [crumbLanguage]), ...(selected === undefined ? [] : [fileNameOf(selected)])]
    return shell.page({ active: starred ? 'starred' : recent ? 'recent' : 'all-snippets', title: viewTitle, crumbs, main })
  }

  const app = new Acryl()
    .get('/', (c) => c.redirect(shell.href('/snippets'), 302))
    .get('/snippets', (c) => c.html(page((name) => c.req.query(name), c.req.url, undefined)))
    .get('/snippets/:id', (c) => c.html(page((name) => c.req.query(name), c.req.url, c.req.param('id'))))
    .post('/snippets/:id/star', async (c) => {
      const form = await c.req.parseBody()
      const back = shell.back(form.back, '/snippets')
      try {
        const snippet = await snippets.toggleStar(c.req.param('id'))
        return c.redirect(shell.url(back, { kind: 'ok', text: snippet.starred ? `“${snippet.title}” is starred.` : `“${snippet.title}” is no longer starred.` }), 303)
      } catch (error) {
        return c.redirect(shell.url(back, { kind: 'error', text: (error as Error).message }), 303)
      }
    })
    .get('/snippets/:id/delete', (c) => {
      const snippet = snippets.get(c.req.param('id'))
      if (snippet === undefined) {
        const back = '/snippets'
        return c.redirect(shell.url(back, { kind: 'error', text: 'That snippet no longer exists.' }), 303)
      }
      const main = `<div class="i-form"><h2>Delete “${e(snippet.title)}”?</h2><p class="hint">This removes the snippet from the library and from every collection. It cannot be undone.</p><form method="post" action="${shell.href(`/snippets/${encodeURIComponent(snippet.id)}/delete`)}"><input type="hidden" name="back" value="/snippets/${e(encodeURIComponent(snippet.id))}"><div class="actions"><button class="danger">Delete snippet</button><a href="${shell.href(`/snippets/${encodeURIComponent(snippet.id)}`)}">Keep it</a></div></form></div>`
      return c.html(shell.page({ active: 'all-snippets', title: `Delete ${snippet.title}`, crumbs: ['Library', fileNameOf(snippet), 'Delete'], main }))
    })
    .post('/snippets/:id/delete', async (c) => {
      const snippet = snippets.get(c.req.param('id'))
      const title = snippet?.title ?? 'Snippet'
      try {
        await snippets.remove(c.req.param('id'))
        return c.redirect(shell.url('/snippets', { kind: 'ok', text: `“${title}” was deleted.` }), 303)
      } catch (error) {
        return c.redirect(shell.url('/snippets', { kind: 'error', text: (error as Error).message }), 303)
      }
    })

  ctx.router.route(prefix === '' ? '/' : prefix, app)
  ctx.effect(() => shell.nav({ id: 'all-snippets', label: 'All snippets', icon: '◫', path: '/snippets', order: 10, count: () => snippets.all().length }))
  ctx.effect(() => shell.nav({ id: 'starred', label: 'Starred', icon: '☆', path: '/snippets?starred=1', order: 11, count: () => snippets.stats().starred }))
  ctx.effect(() => shell.nav({ id: 'recent', label: 'Recently used', icon: '◷', path: '/snippets?recent=1', order: 12 }))
}
