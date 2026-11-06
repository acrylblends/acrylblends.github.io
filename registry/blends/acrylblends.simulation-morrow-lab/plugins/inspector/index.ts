/**
 * The run inspector (right column): the solver's settings, the last run's runtime, the experiment notes and "Save experiment snapshot", which
 * keeps the setup's current parameters under a name.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { escapeHtml, fieldOf, labErrorOf, noticeQuery } from '../lab-shell/index.ts'
import { GRID, STEP_MIN } from '../morrow-lab/index.ts'

export const name = 'inspector'
export const inject = ['router', 'lab', 'labShell']

function render(ctx: Context): string {
  const shell = ctx.labShell
  const latest = ctx.lab.latestRun()
  const notes = ctx.lab.state.notes
    .map((note) => `<div class="log">${escapeHtml(note.title)}<small>${escapeHtml(note.text)}</small></div>`)
    .join('')
  return `<div class="eyebrow">Run inspector</div>
<div class="metric"><span>Solver</span><b>Finite-volume · demo</b></div>
<div class="metric"><span>Grid resolution</span><b>${GRID.cols} × ${GRID.rows}</b></div>
<div class="metric"><span>Time step</span><b>${STEP_MIN} min</b></div>
<div class="metric"><span>Last runtime</span><b id="runtime">${latest === undefined ? '—' : `${latest.summary.runtime.toFixed(1)} sec`}</b></div>
<div class="eyebrow" style="margin-top:28px">Experiment notes</div>${notes}
<details class="create"><summary class="new" id="save">Save experiment snapshot</summary>
<form method="post" action="${shell.href('/snapshots')}"><label class="sr" for="snapshot-name">Snapshot name</label><input class="input" id="snapshot-name" name="name" placeholder="Snapshot name" required maxlength="60"><button class="btn" type="submit">Save snapshot</button></form></details>
<div class="notice">No real sensors or industrial controllers are connected.</div>`
}

export function apply(ctx: Context): void {
  const shell = ctx.labShell
  const app = new Acryl().post('/snapshots', async (c) => {
    const body = (await c.req.parseBody()) as Record<string, unknown>
    const archive = shell.has('archive') ? shell.href('/archive') : shell.href('/')
    try {
      const snapshot = await ctx.lab.saveSnapshot(fieldOf(body, 'name'))
      return c.redirect(`${archive}${noticeQuery('ok', `Snapshot “${snapshot.name}” saved.`)}`, 303)
    } catch (error) {
      const refusal = labErrorOf(error)
      if (refusal === undefined) throw error
      return c.redirect(`${shell.href('/')}${noticeQuery('error', refusal.message)}`, 303)
    }
  })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  ctx.effect(() => shell.side({ id: 'inspector', column: 'right', order: 10, render: () => render(ctx) }))
}
