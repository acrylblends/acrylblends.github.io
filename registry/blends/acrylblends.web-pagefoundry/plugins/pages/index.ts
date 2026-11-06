/** Pages (left column): the site map with the current page highlighted, "New page", and delete for every page but the first. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { escapeHtml, fieldOf, siteErrorOf, withNotice } from '../builder-shell/index.ts'
import type {} from '../pagefoundry/index.ts'

export const name = 'pages'
export const inject = ['router', 'site', 'builderShell']

const ICON = ['⌂', '▦', '◇']

export function apply(ctx: Context): void {
  const shell = ctx.builderShell
  const site = ctx.site
  const render = (sel: ReturnType<typeof shell.selection>, url: string): string => {
    const open = new URL(url, 'http://local').searchParams.get('newpage') === '1'
    const pages = site.state.pages
      .map((p, i) => `<div class="page${p.id === sel.page.id ? ' sel' : ''}" data-page="${escapeHtml(p.id)}"><a href="${shell.hrefFor('/', { pageId: p.id })}"${p.id === sel.page.id ? ' aria-current="page"' : ''}>${ICON[i] ?? '◆'} &nbsp;${escapeHtml(p.name)}</a>${i === 0 ? '' : `<form method="post" action="${shell.href(`/pages/${encodeURIComponent(p.id)}/delete`)}"><button type="submit" aria-label="Delete page ${escapeHtml(p.name)}">×</button></form>`}</div>`)
      .join('')
    return `<div class="cap">Pages</div><div id="pages">${pages}<div class="page"><a id="newpage" href="${shell.hrefFor('/', { pageId: sel.page.id })}&newpage=1#new">＋ &nbsp;New page</a></div></div>
<form id="new" method="post" action="${shell.href('/pages')}"${open ? '' : ' hidden'}><div class="field"><label for="pname">Page name</label><input id="pname" name="name" maxlength="30" required placeholder="About"></div><button class="btn small" type="submit">Create page</button></form>`
  }
  const app = new Acryl()
    .post('/pages', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      try {
        const page = await site.addPage(fieldOf(body, 'name'))
        return c.redirect(withNotice(shell.hrefFor('/', { pageId: page.id }), 'ok', `Page ${page.name} created.`), 303)
      } catch (error) {
        const refusal = siteErrorOf(error)
        if (refusal === undefined) throw error
        return c.redirect(withNotice(`${shell.href('/')}?newpage=1#new`, 'error', refusal.message), 303)
      }
    })
    .post('/pages/:id/delete', async (c) => {
      try {
        const name = site.page(c.req.param('id')).name
        await site.deletePage(c.req.param('id'))
        return c.redirect(withNotice(shell.href('/'), 'ok', `Page ${name} deleted.`), 303)
      } catch (error) {
        const refusal = siteErrorOf(error)
        if (refusal === undefined) throw error
        return c.redirect(withNotice(shell.href('/'), 'error', refusal.message), 303)
      }
    })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  ctx.effect(() => shell.side({ id: 'pages', column: 'left', order: 10, render }))
}
