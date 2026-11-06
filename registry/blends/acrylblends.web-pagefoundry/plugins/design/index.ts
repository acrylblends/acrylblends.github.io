/** Design inspector (right column): the selected section's headline, body, button, items, background, width and visibility, with the contrast it gives; Save, move up or down, and delete. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { backTo, escapeHtml, fieldOf, siteErrorOf, withNotice } from '../builder-shell/index.ts'
import { KIND_NAME, MIN_CONTRAST, VISIBILITY_LABEL, WIDTH_LABEL, type Visibility, type Width, contrastOf } from '../pagefoundry/index.ts'

export const name = 'design'
export const inject = ['router', 'site', 'builderShell']

export function apply(ctx: Context): void {
  const shell = ctx.builderShell
  const site = ctx.site
  const render = (sel: ReturnType<typeof shell.selection>): string => {
    const s = sel.section
    if (s === undefined) return `<div class="cap">Design inspector</div><div class="help">This page has no sections. Add a block to edit it.</div>`
    const at = { pageId: sel.page.id, sectionId: s.id }
    const back = shell.hrefFor('/', at)
    const id = encodeURIComponent(s.id)
    const base = `/pages/${encodeURIComponent(sel.page.id)}/sections/${id}`
    const ratio = contrastOf(s)
    const options = (map: Record<string, string>, current: string) => Object.entries(map).map(([v, l]) => `<option value="${v}"${v === current ? ' selected' : ''}>${escapeHtml(l)}</option>`).join('')
    const items = s.kind === 'features' ? `<div class="field"><label for="items">Items (Title | text, one per line)</label><textarea id="items" name="items" rows="5">${escapeHtml(s.items.map((i) => `${i.title} | ${i.text}`).join('\n'))}</textarea></div>` : ''
    const button = s.kind === 'hero' || s.kind === 'cta' ? `<div class="field"><label for="button">Button label</label><input id="button" name="button" value="${escapeHtml(s.button)}" maxlength="40"></div>` : ''
    const move = (dir: string, label: string) => `<form method="post" action="${shell.href(`${base}/move`)}"><input type="hidden" name="direction" value="${dir}"><input type="hidden" name="back" value="${escapeHtml(back)}"><button class="btn small" type="submit">${label}</button></form>`
    return `<div class="cap">Design inspector</div><b id="selectedName">${escapeHtml(KIND_NAME[s.kind])} section</b><div class="help">Select a page section to edit its content and appearance.</div>
<form method="post" action="${shell.href(base)}"><input type="hidden" name="back" value="${escapeHtml(back)}">
<div class="field"><label for="heading">Headline</label><textarea id="heading" name="headline" rows="2" maxlength="120" required>${escapeHtml(s.headline)}</textarea></div>
<div class="field"><label for="body">Body</label><textarea id="body" name="body" rows="3" maxlength="300">${escapeHtml(s.body)}</textarea></div>${button}${items}
<div class="field"><label for="color">Background</label><input type="color" id="color" name="bg" value="${escapeHtml(s.bg)}"><div class="help ${ratio < MIN_CONTRAST ? 'bad' : 'good'}" id="contrast">Text contrast ${ratio.toFixed(1)}:1${ratio < MIN_CONTRAST ? ` · below ${String(MIN_CONTRAST)}:1, hard to read` : ''}</div></div>
<div class="field"><label for="width">Section width</label><select id="width" name="width">${options(WIDTH_LABEL, s.width satisfies Width)}</select></div>
<div class="field"><label for="visibility">Visibility</label><select id="visibility" name="visibility">${options(VISIBILITY_LABEL, s.visibility satisfies Visibility)}</select></div>
<button class="btn dark" type="submit" id="save">Save section</button></form>
<div class="btns">${move('up', '↑ Move up')}${move('down', '↓ Move down')}<form method="post" action="${shell.href(`${base}/delete`)}"><input type="hidden" name="back" value="${escapeHtml(shell.hrefFor('/', { pageId: sel.page.id }))}"><button class="btn small danger" type="submit">Delete</button></form></div>
<div class="help" id="rightstatus">Changes are saved to this local draft.</div>`
  }
  const refused = (c: { redirect(url: string, status: 303): Response }, to: string, error: unknown) => {
    const refusal = siteErrorOf(error)
    if (refusal === undefined) throw error
    return c.redirect(withNotice(to, 'error', refusal.message), 303)
  }
  const app = new Acryl()
    .post('/pages/:page/sections/:id', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      const [pageId, id] = [c.req.param('page'), c.req.param('id')]
      const to = backTo(shell, fieldOf(body, 'back'), shell.hrefFor('/', { pageId, sectionId: id }))
      try {
        await site.editSection(pageId, id, {
          headline: fieldOf(body, 'headline'),
          body: fieldOf(body, 'body'),
          button: fieldOf(body, 'button'),
          items: fieldOf(body, 'items'),
          bg: fieldOf(body, 'bg'),
          width: fieldOf(body, 'width'),
          visibility: fieldOf(body, 'visibility'),
        })
        return c.redirect(withNotice(to, 'ok', 'Section saved to the local draft.'), 303)
      } catch (error) {
        return refused(c, to, error)
      }
    })
    .post('/pages/:page/sections/:id/move', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      const [pageId, id] = [c.req.param('page'), c.req.param('id')]
      const to = backTo(shell, fieldOf(body, 'back'), shell.hrefFor('/', { pageId, sectionId: id }))
      try {
        await site.moveSection(pageId, id, fieldOf(body, 'direction') === 'up' ? 'up' : 'down')
        return c.redirect(withNotice(to, 'ok', 'Section moved.'), 303)
      } catch (error) {
        return refused(c, to, error)
      }
    })
    .post('/pages/:page/sections/:id/delete', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      const pageId = c.req.param('page')
      const to = backTo(shell, fieldOf(body, 'back'), shell.hrefFor('/', { pageId }))
      try {
        await site.deleteSection(pageId, c.req.param('id'))
        return c.redirect(withNotice(to, 'ok', 'Section deleted.'), 303)
      } catch (error) {
        return refused(c, to, error)
      }
    })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  ctx.effect(() => shell.side({ id: 'design', column: 'right', order: 10, render }))
}
