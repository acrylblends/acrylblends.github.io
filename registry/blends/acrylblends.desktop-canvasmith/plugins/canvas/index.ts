/**
 * The canvas, the first page (`/`): the open file's artboard drawn from its layers at the chosen zoom, with the selected layer outlined, and the asset
 * strip (every file as a thumbnail, "+ New" for an empty artboard). Also the toolbar's routes: tools (Frame, Text and Shape add a layer), zoom and the
 * layer-list toggle.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type {} from '../home/index.ts'
import { backTo, escapeHtml, fieldOf, projectErrorOf, withNotice } from '../window-shell/index.ts'
import { type Layer, pageOf } from '../canvasmith/index.ts'

export const name = 'canvas'
export const inject = ['router', 'project', 'windowShell', 'home']

const pct = (n: number, total: number): string => `${String(Math.round((n / total) * 10000) / 100)}%`

/** One layer as a positioned element: geometry in percent of the page, type sizes in container units so everything scales with the artboard. */
function layerHtml(l: Layer, page: { width: number; height: number }, selected: boolean): string {
  if (l.kind === 'artboard' || !l.visible) return ''
  const font = l.fontSize === undefined ? '' : `font-size:${String(Math.round((l.fontSize / page.width) * 10000) / 100)}cqw;`
  const radius = l.kind === 'image' ? `${String(Math.round((l.radius / page.width) * 10000) / 100)}cqw ${String(Math.round((l.radius / page.width) * 10000) / 100)}cqw 4px 4px` : `${String(Math.round((l.radius / page.width) * 10000) / 100)}cqw`
  const base = `left:${pct(l.x, page.width)};top:${pct(l.y, page.height)};width:${pct(l.w, page.width)};height:${pct(l.h, page.height)};opacity:${String(l.opacity / 100)};`
  const text = escapeHtml(l.text ?? '')
  const cls = `l ${l.kind}${selected ? ' sel' : ''}`
  const attr = `class="${cls}" data-layer-id="${escapeHtml(l.id)}"`
  if (l.kind === 'text') return `<div ${attr} style="${base}${font}color:${l.fill};font-family:${l.serif === true ? 'Georgia,serif' : 'Inter,system-ui,sans-serif'};${l.serif === true ? 'letter-spacing:-.02em;' : ''}">${text}</div>`
  if (l.kind === 'button') return `<div ${attr} style="${base}${font}background:${l.fill};color:#fff;display:flex;align-items:center;padding:0 3%;border-radius:${radius}">${text}</div>`
  if (l.kind === 'image') return `<div ${attr} style="${base}${font || 'font-size:2.4cqw;'}background:linear-gradient(135deg,color-mix(in srgb,${l.fill} 55%,white),${l.fill} 52%,color-mix(in srgb,${l.fill} 55%,black));border-radius:${radius};display:grid;place-items:center;color:#dce8de;font-style:italic;font-family:Georgia,serif">${text}</div>`
  if (l.kind === 'frame') return `<div ${attr} style="${base}background:${l.fill};border:1px solid #00000033;border-radius:${radius}"></div>`
  return `<div ${attr} style="${base}background:${l.fill};border-radius:${radius}"></div>`
}

function pageFor(ctx: Context, url: string): string {
  const shell = ctx.windowShell
  const project = ctx.project
  const sel = shell.selection(url)
  const doc = sel.doc
  const page = pageOf(doc)
  const art = doc.layers[0]
  const view = project.state.view
  const scale = view.zoom / 100
  const children = doc.layers.map((l) => layerHtml(l, page, l.id === sel.layer.id)).join('')
  const ratio = (page.height / page.width) * 100
  const assets = project.state.docs
    .map((d) => `<form method="get" action="${shell.href('/')}"><input type="hidden" name="file" value="${escapeHtml(d.id)}"><button class="asset${d.id === doc.id ? ' active' : ''}" type="submit" aria-label="Open ${escapeHtml(d.name)}"${d.id === doc.id ? ' aria-current="true"' : ''}><b aria-hidden="true">${d.id === 'brand-marks' ? '◇' : d.id === 'social-card' ? '◩' : '▤'}</b>${escapeHtml(d.name.split(' ')[0] ?? d.name)}</button></form>`)
    .join('')
  const main = `<div class="canvasarea">${shell.notice(url)}<div class="canvashead"><span>Page 01 · ${escapeHtml(doc.name)}</span><span>${String(page.width)} × ${String(page.height)} px</span></div>
<div class="stagebox"><div class="artboard" id="artboard" style="aspect-ratio:${String(page.width)}/${String(page.height)};padding-top:0;background:${art?.visible === false ? 'transparent' : (art?.fill ?? '#fff')};border-radius:${String(art?.radius ?? 0)}px;transform:scale(${String(scale)});opacity:${String((art?.opacity ?? 100) / 100)}" role="img" aria-label="${escapeHtml(doc.name)} at ${String(view.zoom)} percent" data-ratio="${String(Math.round(ratio))}">${children}</div></div>
<div class="assets">${assets}<form method="post" action="${shell.href('/files')}"><button class="asset" id="new" type="submit" aria-label="New artboard"><b aria-hidden="true">+</b>New</button></form></div></div>`
  return shell.page({ title: doc.name, main, url })
}

export function apply(ctx: Context): void {
  const shell = ctx.windowShell
  const project = ctx.project
  const refused = (c: { redirect(url: string, status: 303): Response }, to: string, error: unknown) => {
    const refusal = projectErrorOf(error)
    if (refusal === undefined) throw error
    return c.redirect(withNotice(to, 'error', refusal.message), 303)
  }
  const target = async (c: { req: { parseBody(): Promise<Record<string, unknown>> } }) => {
    const body = await c.req.parseBody()
    return { body, to: backTo(shell, fieldOf(body, 'back'), shell.href('/')) }
  }
  const app = new Acryl()
    .get('/', (c) => c.html(pageFor(ctx, c.req.url)))
    .post('/files', async (c) => {
      const { to } = await target(c)
      try {
        const doc = await project.newDoc()
        return c.redirect(withNotice(shell.hrefFor('/', { docId: doc.id }), 'ok', `New artboard created (demo): ${doc.name}.`), 303)
      } catch (error) {
        return refused(c, to, error)
      }
    })
    .post('/tools/:tool', async (c) => {
      const { body, to } = await target(c)
      const tool = c.req.param('tool')
      try {
        if (tool !== 'select' && tool !== 'frame' && tool !== 'text' && tool !== 'shape') return c.redirect(withNotice(to, 'error', 'There is no such tool.'), 303)
        await project.setTool(tool)
        if (tool === 'select') return c.redirect(to, 303)
        const docId = new URL(to, 'http://local').searchParams.get('file') ?? project.state.docs[0]?.id ?? ''
        const layer = await project.addLayer(docId, tool)
        void body
        return c.redirect(withNotice(shell.hrefFor('/', { docId, layerId: layer.id }), 'ok', `${layer.name} added.`), 303)
      } catch (error) {
        return refused(c, to, error)
      }
    })
    .post('/zoom/:change', async (c) => {
      const { to } = await target(c)
      const change = c.req.param('change')
      try {
        if (change !== 'in' && change !== 'out' && change !== 'reset') return c.redirect(withNotice(to, 'error', 'There is no such zoom.'), 303)
        await project.zoom(change)
        return c.redirect(to, 303)
      } catch (error) {
        return refused(c, to, error)
      }
    })
    .post('/view/layers', async (c) => {
      const { to } = await target(c)
      await project.toggleLayers()
      return c.redirect(to, 303)
    })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  if (shell.prefix !== '') ctx.router.route('/', new Acryl().get(`${shell.prefix}/`, (c) => c.html(pageFor(ctx, c.req.url))))
  ctx.effect(() => shell.side({ id: 'canvas', column: 'left', order: 99, render: () => '' }))
  ctx.effect(() =>
    ctx.home.widget({
      id: 'canvas',
      title: 'Project',
      render: () => `<p><b>${escapeHtml(project.state.name)}</b> · ${String(project.state.docs.length)} files · ${String(project.state.exports.length)} exports</p>`,
    }),
  )
}
