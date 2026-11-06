/** Add block (left column): the block library (hero, feature grid, quote, call to action); a click inserts the block at the end of the current page and selects it. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { backTo, escapeHtml, fieldOf, siteErrorOf, withNotice } from '../builder-shell/index.ts'
import { BLOCKS } from '../pagefoundry/index.ts'

export const name = 'blocks'
export const inject = ['router', 'site', 'builderShell']

export function apply(ctx: Context): void {
  const shell = ctx.builderShell
  const site = ctx.site
  const render = (sel: ReturnType<typeof shell.selection>): string => {
    const items = BLOCKS.map(
      (b) =>
        `<form method="post" action="${shell.href(`/pages/${encodeURIComponent(sel.page.id)}/sections`)}"><input type="hidden" name="kind" value="${b.kind}"><button class="blockitem" type="submit" data-block="${escapeHtml(b.name)}"><i aria-hidden="true">${b.icon}</i>${escapeHtml(b.name)}</button></form>`,
    ).join('')
    return `<div class="cap" style="margin-top:28px">Add block</div>${items}<div class="status" id="leftstatus">${String(BLOCKS.length)} blocks available</div>`
  }
  const app = new Acryl().post('/pages/:id/sections', async (c) => {
    const body = (await c.req.parseBody()) as Record<string, unknown>
    const id = c.req.param('id')
    const to = backTo(shell, fieldOf(body, 'back'), shell.hrefFor('/', { pageId: id }))
    try {
      const section = await site.addSection(id, fieldOf(body, 'kind'))
      return c.redirect(withNotice(shell.hrefFor('/', { pageId: id, sectionId: section.id }), 'ok', `Added ${section.kind === 'cta' ? 'Call to action' : BLOCKS.find((b) => b.kind === section.kind)?.name ?? section.kind}.`), 303)
    } catch (error) {
      const refusal = siteErrorOf(error)
      if (refusal === undefined) throw error
      return c.redirect(withNotice(to, 'error', refusal.message), 303)
    }
  })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  ctx.effect(() => shell.side({ id: 'blocks', column: 'left', order: 20, render }))
}
