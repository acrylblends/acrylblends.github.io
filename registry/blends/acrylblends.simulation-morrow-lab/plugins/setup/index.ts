/**
 * Experiment setup, the first page (`/`): the four boundary conditions as sliders, the chamber cross-section, and the last run's peak, settle
 * time and energy. "Run simulation" posts the sliders to `/run`; "Reset baseline" puts the baseline back. On the frame's home page it shows the
 * last run as a widget.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type {} from '../home/index.ts'
import { crossSection } from '../lab-shell/charts.ts'
import { escapeHtml, fieldOf, labErrorOf, noticeQuery } from '../lab-shell/index.ts'
import { LIMITS, type ParameterSet, simulate } from '../morrow-lab/index.ts'

export const name = 'setup'
export const inject = ['router', 'lab', 'labShell', 'home']

/** How a slider's value reads: `21 °C`, `68%`, `0.74`. */
export function formatParam(key: keyof ParameterSet, value: number): string {
  if (key === 'ambient') return `${value} °C`
  if (key === 'insulation') return (value / 100).toFixed(2)
  return `${value}%`
}

const IDS: Record<keyof ParameterSet, string> = { ambient: 'ambient', heater: 'heater', airflow: 'airflow', insulation: 'ins' }

const SCRIPT = `<script>
document.querySelectorAll('#setup-form input[type=range]').forEach(function(input){input.addEventListener('input',function(){var out=document.getElementById(input.id+'Val');var v=+input.value;out.textContent=input.name==='ambient'?v+' °C':input.name==='insulation'?(v/100).toFixed(2):v+'%';var s=document.getElementById('state');if(s){s.textContent='● Parameters changed';s.className='pill changed'}})});
</script>`

function pageFor(ctx: Context, url: string): string {
  const shell = ctx.labShell
  const lab = ctx.lab
  const draft = lab.state.draft
  const latest = lab.latestRun()
  const preview = simulate(draft).summary
  const shown = latest !== undefined && !lab.state.dirty ? latest.summary : preview
  const controls = (Object.keys(LIMITS) as (keyof ParameterSet)[])
    .map((key) => {
      const { min, max, label } = LIMITS[key]
      const id = IDS[key]
      return `<div class="control"><label for="${id}">${label} <output id="${id}Val" for="${id}">${formatParam(key, draft[key])}</output></label><input id="${id}" name="${key}" type="range" min="${min}" max="${max}" step="1" value="${draft[key]}"></div>`
    })
    .join('')
  const main = `<section class="panel active" id="setup"><div class="workgrid"><form class="card" id="setup-form" method="post" action="${shell.href('/run')}"><h3>BOUNDARY CONDITIONS</h3>${controls}
<label class="sr" for="run-name">Run name</label><input class="input" id="run-name" name="name" placeholder="Run name (optional)" maxlength="60">
<div class="row" style="margin-top:12px"><button class="btn" type="submit">▶ Run</button><button class="ghost" type="submit" formaction="${shell.href('/setup')}">Keep as draft</button></div>
<button class="new" id="reset" type="submit" formaction="${shell.href('/setup/reset')}" formnovalidate>Reset baseline</button></form>
<div><div class="card"><h3>MODEL PREVIEW · CHAMBER CROSS-SECTION</h3><div class="field">${crossSection(draft)}</div><div class="legend"><span>Cold zone</span><span>Thermal gradient</span><span>Heat source</span></div>
<div class="statrow"><div class="stat"><small>Peak estimate</small><b id="peak">${shown.peak.toFixed(1)}°</b></div><div class="stat"><small>Settle time</small><b id="settle">${shown.settle.toFixed(1)}m</b></div><div class="stat"><small>Energy input</small><b id="energy">${shown.energy.toFixed(2)}</b></div></div>
${lab.state.dirty ? '<p class="legend"><span>Estimates for the draft. Run the simulation to keep them.</span></p>' : ''}</div>
<div class="notice">Illustrative local simulation. Not validated for engineering, thermal safety or certification decisions.</div></div></div></section>`
  return shell.page({ active: 'setup', title: 'Experiment setup', main, url, scripts: SCRIPT })
}

function paramsOf(body: Record<string, unknown>): Record<string, string | undefined> {
  return {
    ambient: fieldOf(body, 'ambient'),
    heater: fieldOf(body, 'heater'),
    airflow: fieldOf(body, 'airflow'),
    insulation: fieldOf(body, 'insulation'),
  }
}

function widget(ctx: Context): string {
  const latest = ctx.lab.latestRun()
  if (latest === undefined) return '<p>No runs yet.</p>'
  return `<p><b>${escapeHtml(ctx.lab.activeModel().name)} / ${escapeHtml(latest.name)} · ${String(latest.number)}</b></p><ul><li>Peak ${latest.summary.peak.toFixed(1)} °C</li><li>Settles in ${latest.summary.settle.toFixed(1)} min</li><li>Energy ${latest.summary.energy.toFixed(2)} kWh</li></ul>`
}

export function apply(ctx: Context): void {
  const shell = ctx.labShell
  const app = new Acryl()
    .get('/', (c) => c.html(pageFor(ctx, c.req.url)))
    .post('/run', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      try {
        const run = await ctx.lab.runSimulation(paramsOf(body), fieldOf(body, 'name'))
        return c.redirect(`${shell.href('/')}${noticeQuery('ok', `Simulation complete: ${run.name} · ${String(run.number)} peaks at ${run.summary.peak.toFixed(1)} °C.`)}`, 303)
      } catch (error) {
        const refusal = labErrorOf(error)
        if (refusal === undefined) throw error
        return c.redirect(`${shell.href('/')}${noticeQuery('error', refusal.message)}`, 303)
      }
    })
    .post('/setup', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      try {
        await ctx.lab.setDraft(paramsOf(body))
        return c.redirect(`${shell.href('/')}${noticeQuery('ok', 'Draft parameters kept.')}`, 303)
      } catch (error) {
        const refusal = labErrorOf(error)
        if (refusal === undefined) throw error
        return c.redirect(`${shell.href('/')}${noticeQuery('error', refusal.message)}`, 303)
      }
    })
    .post('/setup/reset', async (c) => {
      await ctx.lab.resetDraft()
      return c.redirect(`${shell.href('/')}${noticeQuery('ok', 'Baseline parameters restored.')}`, 303)
    })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  // In the frame the tile opens at `/app/`; mounted at `/app`, the page answers `/app`, so the slash form is served too.
  if (shell.prefix !== '') ctx.router.route('/', new Acryl().get(`${shell.prefix}/`, (c) => c.html(pageFor(ctx, c.req.url))))
  ctx.effect(() => shell.tab({ id: 'setup', label: 'Experiment setup', path: '/', order: 10 }))
  ctx.effect(() => ctx.home.widget({ id: 'setup', title: 'Last simulation run', render: () => widget(ctx) }))
}
