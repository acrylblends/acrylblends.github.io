/**
 * The workbench, the first page (`/`): the open modality with its three variants, the scenario stage, the calibration controls (sensitivity and feedback
 * style) and the routes that choose a variant, save a calibration, run the task simulation and reset. Every result is synthetic.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type {} from '../home/index.ts'
import { FEEDBACK, type FeedbackId, MAX_SENSITIVITY, MIN_SENSITIVITY, MODALITIES } from '../sensepath/index.ts'
import { escapeHtml, fieldOf, labErrorOf, withNotice } from '../sense-shell/index.ts'

export const name = 'workbench'
export const inject = ['router', 'lab', 'senseShell', 'home']

export function apply(ctx: Context): void {
  const shell = ctx.senseShell
  const lab = ctx.lab

  const pageFor = (url: string): string => {
    const sel = shell.selection(url)
    const { modality: m, settings: s } = sel
    const base = `/modalities/${m.id}`
    const tiles = m.variants.map((v, i) => `<button class="tile${i === s.variant ? ' active' : ''}" type="submit" name="variant" value="${String(i)}" data-variant="${escapeHtml(v.name)}" aria-pressed="${i === s.variant ? 'true' : 'false'}"><b aria-hidden="true">${v.icon}</b><span>${escapeHtml(v.name)}</span></button>`).join('')
    const options = (Object.entries(FEEDBACK) as [FeedbackId, { label: string }][]).map(([id, f]) => `<option value="${id}"${id === s.feedback ? ' selected' : ''}>${escapeHtml(f.label)}</option>`).join('')
    const missed = sel.run?.outcome === 'missed'
    const main = `<div class="panel"><h2 id="modtitle">${escapeHtml(m.name)}</h2><div class="sub" id="moddesc">${escapeHtml(m.blurb)}</div>
<form method="post" action="${shell.href(`${base}/variant`)}"><div class="modality" role="group" aria-label="Variants">${tiles}</div></form>
<div class="task"><small>Scenario / 01</small><h3 id="tasktitle">${escapeHtml(m.scenario.title)}</h3><p id="taskdesc">${escapeHtml(m.scenario.description)}</p><div class="target${missed ? ' missed' : ''}" id="target" aria-hidden="true">${escapeHtml(m.target)}</div></div>
<form id="calibration" method="post" action="${shell.href(`${base}/run`)}"><div class="control"><label for="sensitivity"><span>Recognition sensitivity</span><b id="sens">${String(s.sensitivity)}%</b></label><input type="range" id="sensitivity" name="sensitivity" min="${String(MIN_SENSITIVITY)}" max="${String(MAX_SENSITIVITY)}" value="${String(s.sensitivity)}"></div>
<div class="control"><label for="feedback"><span>Feedback style</span></label><select id="feedback" name="feedback">${options}</select></div>
<div class="actions"><button class="btn" id="run" type="submit">▷ Run task simulation</button><button class="secondary" id="savecal" type="submit" formaction="${shell.href(`${base}/calibration`)}">Save settings</button><button class="secondary" id="reset" type="submit" formaction="${shell.href(`${base}/reset`)}">Reset</button></div></form>${shell.notice(url)}</div>
<script>(function(){var r=document.getElementById('sensitivity'),v=document.getElementById('sens');r.addEventListener('input',function(){v.textContent=r.value+'%'})})()</script>`
    return shell.page({ title: m.name, main, url })
  }

  const go = async (c: { redirect(url: string, status: 303): Response }, id: string, work: () => Promise<string>) => {
    try {
      const text = await work()
      return c.redirect(withNotice(shell.hrefFor('/', id), 'ok', text), 303)
    } catch (error) {
      const refusal = labErrorOf(error)
      if (refusal === undefined) throw error
      return c.redirect(withNotice(shell.hrefFor('/', id), 'error', refusal.message), 303)
    }
  }
  const settingsOf = (body: Record<string, unknown>) => ({ variant: fieldOf(body, 'variant'), sensitivity: fieldOf(body, 'sensitivity'), feedback: fieldOf(body, 'feedback') })

  const app = new Acryl()
    .get('/', (c) => c.html(pageFor(c.req.url)))
    .post('/modalities/:id/variant', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      const id = c.req.param('id')
      return go(c, id, async () => {
        const s = await lab.calibrate(id, { variant: fieldOf(body, 'variant') })
        return `${lab.modality(id).variants[s.variant]?.name ?? ''} profile selected.`
      })
    })
    .post('/modalities/:id/calibration', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      const id = c.req.param('id')
      return go(c, id, async () => {
        await lab.calibrate(id, { sensitivity: fieldOf(body, 'sensitivity'), feedback: fieldOf(body, 'feedback') })
        return 'Calibration saved.'
      })
    })
    .post('/modalities/:id/run', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      const id = c.req.param('id')
      return go(c, id, async () => {
        const run = await lab.run(id, { sensitivity: settingsOf(body).sensitivity, feedback: settingsOf(body).feedback })
        const name = lab.modality(id).name
        return run.outcome === 'completed' ? `Simulation complete: ${name} task completed with the selected feedback profile (${String(run.completion)}%, ${run.latency.toFixed(1)} s).` : `Simulation complete: the ${name} task was missed (${String(run.completion)}%). Raise the sensitivity or change the feedback.`
      })
    })
    .post('/modalities/:id/reset', async (c) => {
      const id = c.req.param('id')
      return go(c, id, async () => {
        await lab.reset(id)
        return 'Scenario reset.'
      })
    })

  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  if (shell.prefix !== '') ctx.router.route('/', new Acryl().get(`${shell.prefix}/`, (c) => c.html(pageFor(c.req.url))))
  ctx.effect(() =>
    ctx.home.widget({
      id: 'workbench',
      title: 'Interaction workbench',
      render: () => `<p><b>${String(MODALITIES.length)}</b> modalities · ${String(lab.state.runs.length)} runs · ${String(lab.state.observations.length)} observations</p>`,
    }),
  )
}
