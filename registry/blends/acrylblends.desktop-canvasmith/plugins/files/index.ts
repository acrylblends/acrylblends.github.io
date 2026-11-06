/** Project sidebar (left): the project's files (opening one selects it) and the layer list of the open file, with a visibility toggle per layer; the layer list can be hidden from the toolbar. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { backTo, escapeHtml, fieldOf, projectErrorOf, withNotice } from '../window-shell/index.ts'
import { KIND_ICON } from '../canvasmith/index.ts'

export const name = 'files'
export const inject = ['router', 'project', 'windowShell']

export function apply(ctx: Context): void {
  const shell = ctx.windowShell
  const project = ctx.project
  const render = (sel: ReturnType<typeof shell.selection>, url: string): string => {
    const files = project.state.docs
      .map((d) => `<li class="${d.id === sel.doc.id ? 'sel' : ''}" data-file="${escapeHtml(d.name)}"><a href="${shell.hrefFor('/', { docId: d.id })}"${d.id === sel.doc.id ? ' aria-current="true"' : ''}><span aria-hidden="true">${d.id === 'brand-marks' ? '◇' : d.id === 'typography' ? 'Ｔ' : '▧'}</span>${escapeHtml(d.name)}</a></li>`)
      .join('')
    const back = shell.hrefFor('/', { docId: sel.doc.id, layerId: sel.layer.id })
    const layers = project.state.view.showLayers
      ? `<div class="label" style="margin-top:28px">Layers</div><ul class="tree" id="layers">${sel.doc.layers
          .map(
            (l) =>
              `<li class="${l.id === sel.layer.id ? 'sel' : ''}${l.visible ? '' : ' hidden'}" data-layer="${escapeHtml(l.name)}"><a href="${shell.hrefFor('/', { docId: sel.doc.id, layerId: l.id })}"${l.id === sel.layer.id ? ' aria-current="true"' : ''}><span aria-hidden="true">${KIND_ICON[l.kind]}</span>${escapeHtml(l.name)}</a><form method="post" action="${shell.href(`/layers/${encodeURIComponent(l.id)}/visible`)}"><input type="hidden" name="file" value="${escapeHtml(sel.doc.id)}"><input type="hidden" name="back" value="${escapeHtml(back)}"><input type="hidden" name="visible" value="${l.visible ? 'off' : 'on'}"><button type="submit" aria-label="${l.visible ? 'Hide' : 'Show'} ${escapeHtml(l.name)}">${l.visible ? '◉' : '○'}</button></form></li>`,
          )
          .join('')}</ul>`
      : ''
    void url
    return `<div class="projectname">▣ ${escapeHtml(project.state.name)}</div><div class="label">Project files</div><ul class="tree" id="files">${files}</ul>${layers}`
  }
  const app = new Acryl().post('/layers/:id/visible', async (c) => {
    const body = (await c.req.parseBody()) as Record<string, unknown>
    const docId = fieldOf(body, 'file') ?? ''
    const to = backTo(shell, fieldOf(body, 'back'), shell.hrefFor('/', { docId }))
    try {
      const layer = await project.setVisible(docId, c.req.param('id'), fieldOf(body, 'visible') === 'on')
      return c.redirect(withNotice(to, 'ok', `${layer.name} is ${layer.visible ? 'visible' : 'hidden'}.`), 303)
    } catch (error) {
      const refusal = projectErrorOf(error)
      if (refusal === undefined) throw error
      return c.redirect(withNotice(to, 'error', refusal.message), 303)
    }
  })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  ctx.effect(() => shell.side({ id: 'files', column: 'left', order: 10, render }))
}
