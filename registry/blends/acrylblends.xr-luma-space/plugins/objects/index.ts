/** Scene objects (rail): the project, the object hierarchy (children indented), "Add spatial anchor" and the scene health pill. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { KINDS, ago, hierarchy, validate } from '../luma/index.ts'
import { escapeHtml, sceneErrorOf, withNotice } from '../luma-shell/index.ts'

export const name = 'objects'
export const inject = ['router', 'scene', 'lumaShell']

export function apply(ctx: Context): void {
  const shell = ctx.lumaShell
  const scene = ctx.scene
  const render = (sel: ReturnType<typeof shell.selection>): string => {
    const s = scene.state
    const list = hierarchy(s.objects)
      .map(({ object: o, depth }) => `<a class="object${o.id === sel.object?.id ? ' active' : ''}" data-object="${escapeHtml(o.name)}" href="${shell.hrefFor('/', o.id)}" style="padding-left:${String(10 + depth * 16)}px"${o.id === sel.object?.id ? ' aria-current="true"' : ''}><span aria-hidden="true">${KINDS[o.kind].icon}</span>${escapeHtml(o.name)}${o.visible ? '' : ' <small>(hidden)</small>'}</a>`)
      .join('')
    const errors = validate(s).filter((f) => f.level === 'error').length
    const count = `${String(s.objects.length)} ${s.objects.length === 1 ? 'object' : 'objects'}`
    return `<div class="project"><small>Scene project</small><b>${escapeHtml(s.project)}</b><small class="upd">Updated ${escapeHtml(ago(s.updatedAt, scene.now()))}</small></div><div class="label">Scene objects</div><nav id="objects" aria-label="Scene objects">${list === '' ? '<p class="hint">The scene is empty. Add a spatial anchor.</p>' : list}</nav><form method="post" action="${shell.href('/objects')}">${shell.hidden(sel)}<button class="add" id="add" type="submit">＋ Add spatial anchor</button></form><div class="label">Scene health</div><span class="pill${errors === 0 ? '' : ' bad'}" id="health">● ${count} · ${errors === 0 ? 'no conflicts' : `${String(errors)} ${errors === 1 ? 'conflict' : 'conflicts'}`}</span>`
  }
  const app = new Acryl().post('/objects', async (c) => {
    try {
      const o = await scene.addAnchor()
      return c.redirect(withNotice(shell.hrefFor('/', o.id), 'ok', 'New spatial anchor added'), 303)
    } catch (error) {
      const refusal = sceneErrorOf(error)
      if (refusal === undefined) throw error
      return c.redirect(withNotice(shell.href('/'), 'error', refusal.message), 303)
    }
  })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  ctx.effect(() => shell.side({ id: 'objects', column: 'left', order: 10, render }))
}
