/**
 * Collections: named lists of snippets. The plugin owns the collections pages and the collection list the shell shows in its sidebar.
 *
 * Routes (under the shell's prefix): GET /collections, GET /collections/:id, POST /collections, POST /collections/:id/add.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { fileNameOf, SnippetsError, whenText } from '../snippets/index.ts'
import { badge } from '../snips-shell/index.ts'

export const name = 'collections'
export const inject = ['snippets', 'shell', 'router']

export function apply(ctx: Context): void {
  const { snippets, shell } = ctx
  const e = shell.e
  const prefix = shell.prefix

  const listPage = (error: string | undefined): string => {
    const collections = snippets.collections()
    const rows = collections.length === 0
      ? '<p class="i-empty">No collections yet. Make one below.</p>'
      : `<table><thead><tr><th>COLLECTION</th><th>SNIPPETS</th><th>LAST UPDATED</th></tr></thead><tbody>${collections.map((collection) => {
          const items = collection.snippetIds.flatMap((id) => {
            const snippet = snippets.get(id)
            return snippet === undefined ? [] : [snippet]
          })
          const updated = items.map((snippet) => snippet.updatedAt).sort().at(-1)
          return `<tr><td><a href="${shell.href(`/collections/${encodeURIComponent(collection.id)}`)}"><b>${e(collection.name)}</b></a></td><td>${String(items.length)} snippets</td><td>${updated === undefined ? '—' : e(whenText(updated, new Date()))}</td></tr>`
        }).join('')}</tbody></table>`
    return `<div class="i-toolbar"><div><h1>Collections</h1><p>${String(collections.length)} named lists of snippets</p></div></div>${shell.notice(`?${error === undefined ? '' : `error=${encodeURIComponent(error)}`}`)}<section class="i-section"><header><b>All collections</b><small>Open a collection to add snippets</small></header>${rows}</section><div class="i-form" id="new"><h2>New collection</h2><p class="hint">A name now; add snippets from the collection's page.</p><form method="post" action="${shell.href('/collections')}"><label>NAME<input name="name" required maxlength="60" placeholder="API patterns"></label><div class="actions"><button class="primary">Create collection</button><a href="${shell.href('/collections')}">Cancel</a></div></form></div>`
  }

  const showPage = (id: string, error: string | undefined): string | undefined => {
    const collection = snippets.collection(id)
    if (collection === undefined) return undefined
    const items = collection.snippetIds.flatMap((snippetId) => {
      const snippet = snippets.get(snippetId)
      return snippet === undefined ? [] : [snippet]
    })
    const rest = snippets.all().filter((snippet) => !collection.snippetIds.includes(snippet.id))
    const rows = items.length === 0
      ? '<p class="i-empty">This collection is empty. Add a snippet below.</p>'
      : `<section class="i-section"><header><b>${e(collection.name)}</b><small>${String(items.length)} snippets</small></header><table><tbody>${items.map((snippet) => `<tr><td><a href="${shell.href(`/snippets/${encodeURIComponent(snippet.id)}`)}"><b>${e(snippet.title)}</b></a><br><small>${e(snippet.description)}</small></td><td>${badge(snippet.language)}</td><td>${e(fileNameOf(snippet))}</td></tr>`).join('')}</tbody></table></section>`
    const add = rest.length === 0
      ? '<p class="i-empty">Every snippet is already in this collection.</p>'
      : `<form method="post" action="${shell.href(`/collections/${encodeURIComponent(collection.id)}/add`)}"><label>ADD A SNIPPET<select name="snippetId">${rest.map((snippet) => `<option value="${e(snippet.id)}">${e(snippet.title)}</option>`).join('')}</select></label><div class="actions"><button class="primary">Add to collection</button></div></form>`
    return `<div class="i-toolbar"><div><h1>${e(collection.name)}</h1><p>A collection of the snippet library</p></div><div class="i-tools"><a href="${shell.href('/collections')}">All collections</a></div></div>${error === undefined ? '' : `<p class="notice error" role="alert">${e(error)}</p>`}${rows}<div class="i-form" id="new"><h2>Add a snippet</h2>${add}</div>`
  }

  const app = new Acryl()
    .get('/collections', (c) => c.html(shell.page({ active: 'collections', title: 'Collections', crumbs: ['Library', 'Collections'], main: listPage(c.req.query('error')) })))
    .get('/collections/:id', (c) => {
      const main = showPage(c.req.param('id'), c.req.query('error'))
      if (main === undefined) return c.redirect(shell.url('/collections', { kind: 'error', text: 'That collection no longer exists.' }), 303)
      const collection = snippets.collection(c.req.param('id'))
      return c.html(shell.page({ active: 'collections', title: collection?.name ?? 'Collection', crumbs: ['Library', 'Collections', collection?.name ?? ''], main }))
    })
    .post('/collections', async (c) => {
      const form = await c.req.parseBody()
      try {
        const collection = await snippets.createCollection(String(form.name ?? ''), [])
        return c.redirect(shell.url(`/collections/${encodeURIComponent(collection.id)}`, { kind: 'ok', text: `“${collection.name}” was created.` }), 303)
      } catch (error) {
        if (!(error instanceof SnippetsError)) throw error
        return c.redirect(shell.url('/collections', { kind: 'error', text: error.message }), 303)
      }
    })
    .post('/collections/:id/add', async (c) => {
      const form = await c.req.parseBody()
      const id = c.req.param('id')
      try {
        const collection = await snippets.addToCollection(id, String(form.snippetId ?? ''))
        return c.redirect(shell.url(`/collections/${encodeURIComponent(collection.id)}`, { kind: 'ok', text: 'Added to the collection.' }), 303)
      } catch (error) {
        if (!(error instanceof SnippetsError)) throw error
        return c.redirect(shell.url(`/collections/${encodeURIComponent(id)}`, { kind: 'error', text: error.message }), 303)
      }
    })

  ctx.router.route(prefix === '' ? '/' : prefix, app)
  ctx.effect(() => shell.nav({ id: 'collections', label: 'All collections', icon: '◫', path: '/collections', order: 30, group: 'COLLECTIONS', count: () => snippets.collections().length }))
}
