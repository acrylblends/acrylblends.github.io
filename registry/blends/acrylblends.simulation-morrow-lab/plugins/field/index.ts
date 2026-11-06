/**
 * Thermal field (`/field`): the chamber's temperature at the end of the horizon on the solver grid, drawn as a heat map, for the last run (or a
 * run picked with `?run=`).
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { fieldMap } from '../lab-shell/charts.ts'
import { escapeHtml } from '../lab-shell/index.ts'
import { type SimulationRun, thermalField } from '../morrow-lab/index.ts'

export const name = 'field'
export const inject = ['router', 'lab', 'labShell']

function pageFor(ctx: Context, url: string): string {
  const shell = ctx.labShell
  const lab = ctx.lab
  const wanted = new URL(url, 'http://local').searchParams.get('run')
  let run: SimulationRun | undefined
  try {
    run = wanted === null ? lab.latestRun() : lab.run(wanted)
  } catch {
    run = undefined
  }
  const main =
    run === undefined
      ? `<div class="card"><h3>THERMAL FIELD · MODEL SNAPSHOT</h3><div class="empty">${wanted === null ? 'This model has no run yet. Run the simulation to see its field.' : 'There is no such run.'}</div></div>`
      : `<section class="card"><h3>THERMAL FIELD · ${escapeHtml(run.name.toUpperCase())} · ${String(run.number)}</h3><div class="field" style="height:430px">${fieldMap(thermalField(run.params), run.params.ambient, run.summary.peak)}</div>
<div class="legend"><span>${run.params.ambient} °C ambient</span><span>Airflow ${run.params.airflow}% pushes heat downstream</span><span>${run.summary.peak.toFixed(1)} °C peak</span></div></section>`
  return shell.page({ active: 'field', title: 'Thermal field', main, url })
}

export function apply(ctx: Context): void {
  const shell = ctx.labShell
  const app = new Acryl().get('/field', (c) => c.html(pageFor(ctx, c.req.url)))
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  ctx.effect(() => shell.tab({ id: 'field', label: 'Thermal field', path: '/field', order: 20 }))
}
