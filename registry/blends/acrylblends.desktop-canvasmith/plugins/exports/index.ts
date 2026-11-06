/** Export and activity (inspector, below the properties): "Export preview" makes a simulated export at a chosen format and scale and lists the last ones; the activity list shows what happened in the project. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { backTo, escapeHtml, fieldOf, projectErrorOf, withNotice } from '../window-shell/index.ts'
import { FORMATS, SCALES } from '../canvasmith/index.ts'

export const name = 'exports'
export const inject = ['router', 'project', 'windowShell']

export function apply(ctx: Context): void {
  const shell = ctx.windowShell
  const project = ctx.project
  const render = (sel: ReturnType<typeof shell.selection>): string => {
    const back = shell.hrefFor('/', { docId: sel.doc.id, layerId: sel.layer.id })
    const exports = project
      .exports(4)
      .map((e) => `<li data-export="${escapeHtml(e.id)}">${escapeHtml(e.fileName)} · ${String(e.width)} × ${String(e.height)} · ${String(e.kb)} KB</li>`)
      .join('')
    const activity = project
      .activity(5)
      .map((a) => `<li>${escapeHtml(a.text)}</li>`)
      .join('')
    return `<div class="label" style="margin-top:20px">Export</div><form method="post" action="${shell.href('/export')}"><input type="hidden" name="file" value="${escapeHtml(sel.doc.id)}"><input type="hidden" name="back" value="${escapeHtml(back)}"><div class="prop" style="border-top:0;padding-top:0"><div class="row"><label class="sr" for="format">Format</label><select id="format" name="format">${FORMATS.map((f) => `<option>${f}</option>`).join('')}</select><label class="sr" for="scale">Scale</label><select id="scale" name="scale">${SCALES.map((s) => `<option value="${String(s)}">${String(s)}x</option>`).join('')}</select></div></div><button class="btn primary" type="submit" id="export-form">Export ${escapeHtml(sel.doc.name)}</button></form>
${exports === '' ? '' : `<ul class="log" id="exports" style="margin-top:8px">${exports}</ul>`}<div class="label" style="margin-top:20px">Activity</div>${activity === '' ? '<div class="sub" style="font-size:11px;color:var(--muted)">Nothing yet.</div>' : `<ul class="log" id="activity">${activity}</ul>`}`
  }
  const app = new Acryl().post('/export', async (c) => {
    const body = (await c.req.parseBody()) as Record<string, unknown>
    const docId = fieldOf(body, 'file') ?? ''
    const to = backTo(shell, fieldOf(body, 'back'), shell.hrefFor('/', { docId }))
    try {
      const e = await project.exportDoc(docId, fieldOf(body, 'format'), fieldOf(body, 'scale'))
      return c.redirect(withNotice(to, 'ok', `Preview export prepared · ${e.fileName} (${String(e.width)} × ${String(e.height)}, about ${String(e.kb)} KB) · simulated.`), 303)
    } catch (error) {
      const refusal = projectErrorOf(error)
      if (refusal === undefined) throw error
      return c.redirect(withNotice(to, 'error', refusal.message), 303)
    }
  })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  ctx.effect(() => shell.side({ id: 'exports', column: 'right', order: 20, render }))
}
