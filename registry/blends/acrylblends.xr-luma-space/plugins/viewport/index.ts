/**
 * The viewport, the first page (`/`): the scene as a stylised 3D view (a floor grid, the objects placed by their world position and scale), the mode
 * switch (AR, VR, MR), the world scale and the floating label of the inspected object. Nothing here is an XR session.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type {} from '../home/index.ts'
import { KINDS, MAX_SCALE, MIN_SCALE, MODES, type SceneObject, worldTransform } from '../luma/index.ts'
import { backTo, escapeHtml, fieldOf, sceneErrorOf, withNotice } from '../luma-shell/index.ts'

export const name = 'viewport'
export const inject = ['router', 'scene', 'lumaShell', 'home']

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))

export function apply(ctx: Context): void {
  const shell = ctx.lumaShell
  const scene = ctx.scene

  const marker = (o: SceneObject, selected: boolean): string => {
    const w = worldTransform(scene.state.objects, o.id)
    const left = clamp(50 + w.position.x * 7, 4, 96)
    const top = clamp(56 + w.position.z * 6 - w.position.y * 4, 12, 86)
    const size = (w.scale * scene.state.worldScale).toFixed(2)
    const inner = o.kind === 'portal' ? `<span class="body">${escapeHtml(o.name.split(' ').pop()?.toUpperCase() ?? '')} 01</span>` : `<span class="body"></span>`
    return `<a class="obj ${o.kind}${selected ? ' sel' : ''}" data-object-id="${escapeHtml(o.id)}" href="${shell.hrefFor('/', o.id)}" style="left:${left.toFixed(1)}%;top:${top.toFixed(1)}%;--s:${size}" aria-label="${escapeHtml(o.name)}">${inner}<span class="tag">${escapeHtml(o.name)}</span></a>`
  }

  const pageFor = (url: string): string => {
    const s = scene.state
    const sel = shell.selection(url)
    const o = sel.object
    const objects = s.objects.filter((x) => x.visible).map((x) => marker(x, x.id === o?.id)).join('')
    const at = o === undefined ? undefined : worldTransform(s.objects, o.id).position
    const label = o === undefined || at === undefined ? 'Nothing selected' : `${KINDS[o.kind].icon} ${o.name} · ${at.x.toFixed(1)}, ${at.y.toFixed(1)}, ${at.z.toFixed(1)} m`
    const modes = MODES.map((m) => `<button type="submit" name="mode" value="${m}"${m === s.mode ? ' class="active" aria-pressed="true"' : ' aria-pressed="false"'}>${m}</button>`).join('')
    const main = `<section class="viewport ${s.mode.toLowerCase()}" aria-label="Scene viewport"><header class="top"><div class="title"><b>${escapeHtml(s.name)}</b><small>Scene editor / Preview</small></div><div class="topcontrols"><form class="scale" method="post" action="${shell.href('/world-scale')}">${shell.hidden(sel)}<label for="world">World scale <b id="scaleval">${s.worldScale.toFixed(1)}×</b></label><input id="world" name="scale" type="range" min="${String(MIN_SCALE)}" max="${String(MAX_SCALE)}" step="0.1" value="${s.worldScale.toFixed(1)}"><button type="submit">Set</button></form><form class="modes" method="post" action="${shell.href('/mode')}" aria-label="Preview mode">${shell.hidden(sel)}${modes}</form></div></header>
<div class="world" id="world-view" role="img" aria-label="Stylised 3D preview of the scene; not an XR session"><div class="floor"></div><div class="orb"></div>${objects}<div class="floatlabel" id="viewlabel">${escapeHtml(label)}</div><div class="scenefoot"><span>VIEWPORT · 3D PREVIEW</span><span id="modefoot">${s.mode} SIMULATION · WORLD SCALE ${s.worldScale.toFixed(1)}×</span></div></div>${shell.notice(url)}</section>
<script>(function(){var r=document.getElementById('world'),v=document.getElementById('scaleval');r.addEventListener('input',function(){v.textContent=Number(r.value).toFixed(1)+'×'})})()</script>`
    return shell.page({ title: s.name, main, url })
  }

  const app = new Acryl()
    .get('/', (c) => c.html(pageFor(c.req.url)))
    .post('/mode', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      const to = shell.hrefFor('/', fieldOf(body, 'object'))
      try {
        const mode = await scene.setMode(fieldOf(body, 'mode'))
        return c.redirect(withNotice(to, 'ok', `${mode} preview selected`), 303)
      } catch (error) {
        const refusal = sceneErrorOf(error)
        if (refusal === undefined) throw error
        return c.redirect(withNotice(to, 'error', refusal.message), 303)
      }
    })
    .post('/world-scale', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      const to = backTo(shell, undefined, shell.hrefFor('/', fieldOf(body, 'object')))
      try {
        const v = await scene.setWorldScale(fieldOf(body, 'scale'))
        return c.redirect(withNotice(to, 'ok', `World scale set to ${v.toFixed(1)}×`), 303)
      } catch (error) {
        const refusal = sceneErrorOf(error)
        if (refusal === undefined) throw error
        return c.redirect(withNotice(to, 'error', refusal.message), 303)
      }
    })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  if (shell.prefix !== '') ctx.router.route('/', new Acryl().get(`${shell.prefix}/`, (c) => c.html(pageFor(c.req.url))))
  ctx.effect(() =>
    ctx.home.widget({
      id: 'viewport',
      title: 'Scene',
      render: () => `<p><b>${escapeHtml(scene.state.name)}</b> · ${String(scene.state.objects.length)} objects · ${scene.state.mode} preview</p>`,
    }),
  )
}
