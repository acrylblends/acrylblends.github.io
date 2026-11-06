/** Object inspector (right column): name, position (m), rotation (°), scale, parent, visibility and interaction of the selected object; apply, preview the interaction, delete. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { KINDS, MAX_SCALE, MIN_SCALE, TRIGGERS, descendantsOf } from '../luma/index.ts'
import { escapeHtml, fieldOf, sceneErrorOf, withNotice } from '../luma-shell/index.ts'

export const name = 'inspector'
export const inject = ['router', 'scene', 'lumaShell']

export function apply(ctx: Context): void {
  const shell = ctx.lumaShell
  const scene = ctx.scene
  const render = (sel: ReturnType<typeof shell.selection>): string => {
    const o = sel.object
    if (o === undefined) return `<div class="label" style="margin-top:6px">Object inspector</div><p>Nothing to inspect: the scene has no objects.</p>`
    const base = `/objects/${encodeURIComponent(o.id)}`
    const num = (n: string, v: number, label: string, step = '0.1') => `<input name="${n}" type="number" step="${step}" value="${step === '1' ? String(v) : v.toFixed(1)}" aria-label="${label}" required>`
    const blocked = new Set([o.id, ...descendantsOf(scene.state.objects, o.id).map((d) => d.id)])
    const parents = [`<option value=""${o.parentId === undefined ? ' selected' : ''}>Scene origin</option>`, ...scene.state.objects.filter((p) => !blocked.has(p.id)).map((p) => `<option value="${escapeHtml(p.id)}"${p.id === o.parentId ? ' selected' : ''}>${escapeHtml(p.name)}</option>`)].join('')
    const triggers = (Object.entries(TRIGGERS) as [string, string][]).map(([v, l]) => `<option value="${v}"${v === o.interaction.trigger ? ' selected' : ''}>${escapeHtml(l)}</option>`).join('')
    return `<div class="label" style="margin-top:6px">Object inspector</div><h3 id="objname">${escapeHtml(o.name)}</h3><p>Adjust spatial transform values. Coordinates are illustrative scene units in meters. <span class="pill">${escapeHtml(KINDS[o.kind].name)}</span></p>
<form method="post" action="${shell.href(base)}"><input type="hidden" name="object" value="${escapeHtml(o.id)}">
<div class="prop"><label for="oname">Name</label><input id="oname" name="name" value="${escapeHtml(o.name)}" maxlength="24" required></div>
<div class="prop"><div class="l">Position <span>XYZ · m</span></div><div class="xyz">${num('px', o.position.x, 'X position (m)')}${num('py', o.position.y, 'Y position (m)')}${num('pz', o.position.z, 'Z position (m)')}</div></div>
<div class="prop"><div class="l">Rotation <span>Degrees</span></div><div class="xyz">${num('rx', o.rotation.x, 'X rotation (degrees)', '1')}${num('ry', o.rotation.y, 'Y rotation (degrees)', '1')}${num('rz', o.rotation.z, 'Z rotation (degrees)', '1')}</div></div>
<div class="prop"><label for="scale">Scale <b id="oscale">${o.scale.toFixed(1)}×</b></label><input id="scale" name="scale" type="range" min="${String(MIN_SCALE)}" max="${String(MAX_SCALE)}" step="0.1" value="${o.scale.toFixed(1)}"></div>
<div class="prop"><label for="parent">Placed in</label><select id="parent" name="parent">${parents}</select></div>
<div class="prop"><label for="visible">Visibility</label><select id="visible" name="visible"><option value="visible"${o.visible ? ' selected' : ''}>Visible in preview</option><option value="hidden"${o.visible ? '' : ' selected'}>Hidden in preview</option></select></div>
<div class="prop"><label for="trigger">Interaction</label><select id="trigger" name="trigger">${triggers}</select><div class="xyz" style="grid-template-columns:1fr 2fr;margin-top:6px"><input name="radius" type="number" step="0.1" min="0.1" max="5" value="${o.interaction.radius.toFixed(1)}" aria-label="Trigger radius (m)"><input name="action" value="${escapeHtml(o.interaction.action)}" maxlength="60" placeholder="What it does" aria-label="Interaction action"></div></div>
<button class="run" id="apply" type="submit">Apply changes</button></form>
<form method="post" action="${shell.href(`${base}/preview`)}"><input type="hidden" name="object" value="${escapeHtml(o.id)}"><button class="run ghost" id="test" type="submit">▷ Preview interaction</button></form>
<form method="post" action="${shell.href(`${base}/delete`)}"><input type="hidden" name="object" value="${escapeHtml(o.id)}"><button class="run danger" type="submit">Delete object</button></form>
<p id="insnote">Tap an object in the scene list to inspect it.</p><script>(function(){var r=document.getElementById('scale'),v=document.getElementById('oscale');if(r)r.addEventListener('input',function(){v.textContent=Number(r.value).toFixed(1)+'×'})})()</script>`
  }
  const bail = (c: { redirect(url: string, status: 303): Response }, to: string, error: unknown) => {
    const refusal = sceneErrorOf(error)
    if (refusal === undefined) throw error
    return c.redirect(withNotice(to, 'error', refusal.message), 303)
  }
  const app = new Acryl()
    .post('/objects/:id', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      const id = c.req.param('id')
      const to = shell.hrefFor('/', id)
      try {
        const o = await scene.editObject(id, {
          name: fieldOf(body, 'name'),
          position: { x: fieldOf(body, 'px'), y: fieldOf(body, 'py'), z: fieldOf(body, 'pz') },
          rotation: { x: fieldOf(body, 'rx'), y: fieldOf(body, 'ry'), z: fieldOf(body, 'rz') },
          scale: fieldOf(body, 'scale'),
          parent: fieldOf(body, 'parent'),
          visible: fieldOf(body, 'visible'),
          trigger: fieldOf(body, 'trigger'),
          radius: fieldOf(body, 'radius'),
          action: fieldOf(body, 'action'),
        })
        return c.redirect(withNotice(to, 'ok', `${o.name} updated`), 303)
      } catch (error) {
        return bail(c, to, error)
      }
    })
    .post('/objects/:id/preview', async (c) => {
      const id = c.req.param('id')
      const to = shell.hrefFor('/', id)
      try {
        return c.redirect(withNotice(to, 'ok', scene.preview(id)), 303)
      } catch (error) {
        return bail(c, to, error)
      }
    })
    .post('/objects/:id/delete', async (c) => {
      const id = c.req.param('id')
      try {
        const name = scene.object(id).name
        await scene.deleteObject(id)
        return c.redirect(withNotice(shell.href('/'), 'ok', `${name} deleted`), 303)
      } catch (error) {
        return bail(c, shell.hrefFor('/', id), error)
      }
    })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  ctx.effect(() => shell.side({ id: 'inspector', column: 'right', order: 10, render }))
}
