/**
 * Response traces (`/traces`): probe A over the 20-minute horizon for one run, another run overlaid to compare (`?run=&compare=`), the three
 * probes' end values, and the traces as CSV (`/traces.csv`).
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { type Series, traceChart } from '../lab-shell/charts.ts'
import { escapeHtml } from '../lab-shell/index.ts'
import { type SimulationRun, tracesCsv } from '../morrow-lab/index.ts'

export const name = 'traces'
export const inject = ['router', 'lab', 'labShell']

interface Picked {
  readonly run: SimulationRun | undefined
  readonly compare: SimulationRun | undefined
  readonly missing: boolean
}

function pick(ctx: Context, url: string): Picked {
  const query = new URL(url, 'http://local').searchParams
  const find = (id: string | null): SimulationRun | undefined | null => {
    if (id === null || id === '') return undefined
    return ctx.lab.state.runs.find((run) => run.id === id) ?? null
  }
  const run = find(query.get('run'))
  const compare = find(query.get('compare'))
  return {
    run: run === null ? undefined : (run ?? ctx.lab.latestRun()),
    compare: compare === null || compare?.id === (run ?? ctx.lab.latestRun())?.id ? undefined : compare,
    missing: run === null || compare === null,
  }
}

function pageFor(ctx: Context, url: string): string {
  const shell = ctx.labShell
  const { run, compare, missing } = pick(ctx, url)
  const runs = ctx.lab.runs('all')
  const label = (r: SimulationRun) => `${r.name} · ${String(r.number)}`
  const options = (selected: string | undefined, none: string | undefined) =>
    `${none === undefined ? '' : `<option value="">${none}</option>`}${runs.map((r) => `<option value="${escapeHtml(r.id)}"${r.id === selected ? ' selected' : ''}>${escapeHtml(label(r))} · ${r.summary.peak.toFixed(1)} °C</option>`).join('')}`
  if (run === undefined) {
    const main = `<div class="card"><h3>PROBE TEMPERATURE · TIME SERIES</h3><div class="empty">${missing ? 'There is no such run.' : 'No runs yet. Run the simulation to see its response.'}</div></div>`
    return shell.page({ active: 'traces', title: 'Response traces', main, url })
  }
  const series: Series[] = [{ label: label(run), trace: run.trace, kind: 'main' }]
  if (compare !== undefined) series.push({ label: label(compare), trace: compare.trace, kind: 'compare' })
  const csv = `${shell.href('/traces.csv')}?run=${encodeURIComponent(run.id)}${compare === undefined ? '' : `&compare=${encodeURIComponent(compare.id)}`}`
  const delta = (a: number, b: number) => {
    const d = a - b
    return `${d >= 0 ? '+' : ''}${d.toFixed(1)}`
  }
  const main = `<section class="card"><h3>PROBE TEMPERATURE · TIME SERIES</h3>
<form class="row" method="get" action="${shell.href('/traces')}" style="margin-bottom:12px"><label class="sr" for="run">Run</label><select class="input" style="width:auto" id="run" name="run">${options(run.id, undefined)}</select><span style="color:var(--muted)">compared with</span><label class="sr" for="compare">Compare with</label><select class="input" style="width:auto" id="compare" name="compare">${options(compare?.id, 'No comparison')}</select><button class="ghost" type="submit">Show</button><span class="spacer"></span><a class="ghost" href="${csv}" download>Export CSV</a></form>
${missing ? '<p class="alert error" role="alert">One of the runs asked for does not exist.</p>' : ''}
<div class="trace">${traceChart(series)}</div>
<div class="legend"><span style="color:var(--cyan)">━ ${escapeHtml(label(run))}</span>${compare === undefined ? '' : `<span style="color:var(--amber)">┅ ${escapeHtml(label(compare))}</span>`}</div>
<div class="metric"><span>Probe A · center</span><b id="probeA">${run.summary.probes.a.toFixed(1)} °C${compare === undefined ? '' : ` · ${delta(run.summary.probes.a, compare.summary.probes.a)}`}</b></div>
<div class="metric"><span>Probe B · intake</span><b>${run.summary.probes.b.toFixed(1)} °C${compare === undefined ? '' : ` · ${delta(run.summary.probes.b, compare.summary.probes.b)}`}</b></div>
<div class="metric"><span>Probe C · exhaust</span><b>${run.summary.probes.c.toFixed(1)} °C${compare === undefined ? '' : ` · ${delta(run.summary.probes.c, compare.summary.probes.c)}`}</b></div>
<div class="metric"><span>Settle time</span><b>${run.summary.settle.toFixed(1)} min${compare === undefined ? '' : ` · ${delta(run.summary.settle, compare.summary.settle)}`}</b></div></section>`
  return shell.page({ active: 'traces', title: 'Response traces', main, url })
}

export function apply(ctx: Context): void {
  const shell = ctx.labShell
  const app = new Acryl()
    .get('/traces', (c) => c.html(pageFor(ctx, c.req.url)))
    .get('/traces.csv', (c) => {
      const { run, compare } = pick(ctx, c.req.url)
      const runs = [run, compare].filter((r): r is SimulationRun => r !== undefined)
      if (runs.length === 0) return c.text('No runs to export.\n', 404)
      return c.body(tracesCsv(runs), 200, {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="morrow-lab-run-${String(runs[0]?.number)}.csv"`,
      })
    })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  ctx.effect(() => shell.tab({ id: 'traces', label: 'Response traces', path: '/traces', order: 30 }))
}
