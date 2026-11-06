/**
 * The model library (left column): the models to pick from, a form to create one, and the recent experiments. Its routes select and create
 * models; the lab (`ctx.lab`) keeps them.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { escapeHtml, fieldOf, labErrorOf, noticeQuery, whenLabel } from '../lab-shell/index.ts'
import type {} from '../morrow-lab/index.ts'

export const name = 'library'
export const inject = ['router', 'lab', 'labShell']

function render(ctx: Context): string {
  const shell = ctx.labShell
  const lab = ctx.lab
  const active = lab.state.activeModelId
  const models = lab
    .models()
    .map(
      (model) =>
        `<form method="post" action="${shell.href(`/models/${encodeURIComponent(model.id)}/select`)}"><button class="scenario${model.id === active ? ' active' : ''}" type="submit"${model.id === active ? ' aria-current="true"' : ''} data-model="${escapeHtml(model.name)}"><b>${escapeHtml(model.name)}</b><small>${escapeHtml(model.kind)}</small></button></form>`,
    )
    .join('')
  const now = lab.now()
  const recent = lab
    .runs('all')
    .slice(0, 4)
    .map((run) => {
      const target = shell.has('traces') ? shell.href(`/traces?run=${encodeURIComponent(run.id)}`) : undefined
      const body = `<b>${escapeHtml(run.name)} · ${String(run.number)}</b><small>${escapeHtml(whenLabel(run.createdAt, now))} · Completed</small>`
      return `<div class="log">${target === undefined ? body : `<a href="${target}">${body}</a>`}</div>`
    })
    .join('')
  return `<div class="eyebrow">Model library</div>${models}
<details class="create"><summary class="new" id="newModel">＋ Create model</summary>
<form method="post" action="${shell.href('/models')}"><label class="sr" for="model-name">Model name</label><input class="input" id="model-name" name="name" placeholder="Model name" required maxlength="60"><label class="sr" for="model-kind">Kind</label><select class="input" id="model-kind" name="kind"><option value="enclosure">Thermal enclosure · 2D</option><option value="airflow">Airflow chamber · 2D</option></select><button class="btn" type="submit">Create</button></form></details>
<div class="eyebrow" style="margin-top:26px">Recent experiments</div>${recent === '' ? '<p class="log"><small>No runs yet. Press Run simulation.</small></p>' : recent}`
}

export function apply(ctx: Context): void {
  const shell = ctx.labShell
  const back = (c: { req: { header(name: string): string | undefined } }): string => {
    const referer = c.req.header('referer')
    if (referer !== undefined) {
      const path = new URL(referer, 'http://local').pathname
      if (path.startsWith(shell.prefix === '' ? '/' : shell.prefix)) return path
    }
    return shell.href('/')
  }
  const app = new Acryl()
    .post('/models', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      try {
        const model = await ctx.lab.createModel(fieldOf(body, 'name'), fieldOf(body, 'kind'))
        return c.redirect(`${shell.href('/')}${noticeQuery('ok', `Model “${model.name}” created.`)}`, 303)
      } catch (error) {
        const refusal = labErrorOf(error)
        if (refusal === undefined) throw error
        return c.redirect(`${shell.href('/')}${noticeQuery('error', refusal.message)}`, 303)
      }
    })
    .post('/models/:id/select', async (c) => {
      try {
        await ctx.lab.selectModel(c.req.param('id'))
        return c.redirect(back(c), 303)
      } catch (error) {
        const refusal = labErrorOf(error)
        if (refusal === undefined) throw error
        return c.redirect(`${shell.href('/')}${noticeQuery('error', refusal.message)}`, 303)
      }
    })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  ctx.effect(() => shell.side({ id: 'library', column: 'left', order: 10, render: () => render(ctx) }))
}
