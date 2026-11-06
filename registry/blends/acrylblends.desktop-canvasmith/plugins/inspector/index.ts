/** Inspector (right): the selected layer's name, position, size, opacity, fill, corner radius, visibility and (for text) content; Apply saves them with the checks; Arrange moves it forward or back; Delete removes it. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { backTo, escapeHtml, fieldOf, projectErrorOf, withNotice } from '../window-shell/index.ts'
import type {} from '../canvasmith/index.ts'

export const name = 'inspector'
export const inject = ['router', 'project', 'windowShell']

export function apply(ctx: Context): void {
  const shell = ctx.windowShell
  const project = ctx.project
  const render = (sel: ReturnType<typeof shell.selection>): string => {
    const l = sel.layer
    const at = { docId: sel.doc.id, layerId: l.id }
    const back = shell.hrefFor('/', at)
    const id = encodeURIComponent(l.id)
    const art = l.kind === 'artboard'
    const textField = l.text === undefined ? '' : `<div class="prop"><label for="text">Text</label><textarea id="text" name="text" rows="3" maxlength="300">${escapeHtml(l.text)}</textarea></div>`
    const arrange = art
      ? ''
      : `<div class="btns"><form method="post" action="${shell.href(`/layers/${id}/arrange`)}"><input type="hidden" name="file" value="${escapeHtml(sel.doc.id)}"><input type="hidden" name="back" value="${escapeHtml(back)}"><input type="hidden" name="direction" value="forward"><button class="btn" type="submit">Bring forward</button></form><form method="post" action="${shell.href(`/layers/${id}/arrange`)}"><input type="hidden" name="file" value="${escapeHtml(sel.doc.id)}"><input type="hidden" name="back" value="${escapeHtml(back)}"><input type="hidden" name="direction" value="backward"><button class="btn" type="submit">Send backward</button></form><form method="post" action="${shell.href(`/layers/${id}/delete`)}"><input type="hidden" name="file" value="${escapeHtml(sel.doc.id)}"><input type="hidden" name="back" value="${escapeHtml(shell.hrefFor('/', { docId: sel.doc.id }))}"><button class="btn danger" type="submit">Delete layer</button></form></div>`
    return `<div class="label">Inspector</div><b id="selname" style="font-size:12px">${escapeHtml(l.name)}</b><div class="sub" style="font-size:10px;color:var(--muted);margin-top:3px">Selected object · ${escapeHtml(l.kind)}</div>
<form method="post" action="${shell.href(`/layers/${id}`)}"><input type="hidden" name="file" value="${escapeHtml(sel.doc.id)}"><input type="hidden" name="back" value="${escapeHtml(back)}">
<div class="prop"><label for="name">Name</label><input id="name" name="name" value="${escapeHtml(l.name)}" maxlength="40"></div>
<div class="prop"><span class="l">Position</span><div class="row"><input name="x" value="${String(l.x)}" aria-label="X position"${art ? ' readonly' : ''}><input name="y" value="${String(l.y)}" aria-label="Y position"${art ? ' readonly' : ''}></div></div>
<div class="prop"><span class="l">Dimensions</span><div class="row"><input name="w" value="${String(l.w)}" aria-label="Width"><input name="h" value="${String(l.h)}" aria-label="Height"></div></div>
<div class="prop"><label for="opacity">Opacity</label><input id="opacity" name="opacity" type="range" min="0" max="100" value="${String(l.opacity)}" style="padding:0"></div>
<div class="prop"><label for="fill">Fill</label><input id="fill" name="fill" type="color" value="${escapeHtml(l.fill)}" style="height:31px;padding:2px"></div>
<div class="prop"><label for="radius">Corner radius (px)</label><input id="radius" name="radius" value="${String(l.radius)}"></div>
${textField}<div class="prop"><label class="check"><input type="checkbox" name="visible" value="on"${l.visible ? ' checked' : ''}> Visible</label></div>
<button class="btn primary" type="submit" id="apply">Apply</button></form>${arrange}`
  }
  const refused = (c: { redirect(url: string, status: 303): Response }, to: string, error: unknown) => {
    const refusal = projectErrorOf(error)
    if (refusal === undefined) throw error
    return c.redirect(withNotice(to, 'error', refusal.message), 303)
  }
  const app = new Acryl()
    .post('/layers/:id', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      const docId = fieldOf(body, 'file') ?? ''
      const id = c.req.param('id')
      const to = backTo(shell, fieldOf(body, 'back'), shell.hrefFor('/', { docId, layerId: id }))
      try {
        const layer = await project.edit(docId, id, {
          name: fieldOf(body, 'name'),
          x: fieldOf(body, 'x'),
          y: fieldOf(body, 'y'),
          w: fieldOf(body, 'w'),
          h: fieldOf(body, 'h'),
          opacity: fieldOf(body, 'opacity'),
          fill: fieldOf(body, 'fill'),
          radius: fieldOf(body, 'radius'),
          text: fieldOf(body, 'text'),
          visible: fieldOf(body, 'visible') === 'on' ? 'on' : 'off',
        })
        return c.redirect(withNotice(to, 'ok', `${layer.name} updated.`), 303)
      } catch (error) {
        return refused(c, to, error)
      }
    })
    .post('/layers/:id/arrange', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      const docId = fieldOf(body, 'file') ?? ''
      const to = backTo(shell, fieldOf(body, 'back'), shell.hrefFor('/', { docId }))
      try {
        const direction = fieldOf(body, 'direction') === 'backward' ? 'backward' : 'forward'
        await project.arrange(docId, c.req.param('id'), direction)
        return c.redirect(withNotice(to, 'ok', `Layer moved ${direction}.`), 303)
      } catch (error) {
        return refused(c, to, error)
      }
    })
    .post('/layers/:id/delete', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      const docId = fieldOf(body, 'file') ?? ''
      const to = backTo(shell, fieldOf(body, 'back'), shell.hrefFor('/', { docId }))
      try {
        await project.deleteLayer(docId, c.req.param('id'))
        return c.redirect(withNotice(to, 'ok', 'Layer deleted.'), 303)
      } catch (error) {
        return refused(c, to, error)
      }
    })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  ctx.effect(() => shell.side({ id: 'inspector', column: 'right', order: 10, render }))
}
