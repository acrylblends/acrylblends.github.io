/**
 * The experiment record: the paper page with its objective, method, measurement cards, chart, observations and audit trail, and the aside with the unit
 * converter, instrument metadata and reproducibility stamp. `/` opens the first experiment; `/experiments/:id` any other.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import {
  cleanUnit,
  cleanValue,
  convert,
  dateText,
  formatNumber,
  LabError,
  type Experiment,
  type Lab,
  type Unit,
} from '../lab/index.ts'
import {
  chart,
  converterCard,
  escapeHtml,
  initialConverter,
  measurements,
  metadataCard,
  observationHtml,
  reproducibilityCard,
  sectionTitle,
  statusStamp,
  type ConverterState,
  type Shell,
} from '../lab-shell/index.ts'

export const name = 'record'
export const inject = ['lab', 'shell', 'router']

function authorOf(experiment: Experiment, lab: Lab): string {
  const notebook = lab.notebook(experiment.notebookId)
  return notebook?.ownerId === 'maya-chen' ? 'Dr. Maya Chen' : 'You'
}

export function apply(ctx: Context): void {
  const lab: Lab = ctx.lab
  const shell: Shell = ctx.shell
  const prefix = shell.prefix

  const render = (experiment: Experiment, url: string, converter: ConverterState): string => {
    const notebook = lab.notebook(experiment.notebookId)
    const observations = lab.observations(experiment.id)
    const audit = lab.audit(experiment.id).slice(0, 4)
    const history = audit
      .map((event) => `<li><time>${escapeHtml(dateText(event.at))}</time><span>${escapeHtml(event.action)} · ${escapeHtml(event.actor)}</span></li>`)
      .join('')
    const paper = `<article class="paper"><div class="paperhead"><small>LAB RECORD · ${escapeHtml(experiment.code)}</small>${statusStamp(experiment.status)}</div><h2>${escapeHtml(experiment.question)}</h2><div class="meta">Author: ${escapeHtml(authorOf(experiment, lab))} &nbsp; · &nbsp; Started ${dateText(experiment.startedAt)} &nbsp; · &nbsp; Protocol ${escapeHtml(experiment.protocolVersion)}</div><div class="section">${sectionTitle(1, 'OBJECTIVE')}<p>${escapeHtml(experiment.objective)}</p></div><div class="section">${sectionTitle(2, 'MATERIALS & METHOD')}<p>${escapeHtml(experiment.method)}</p>${measurements(lab, experiment, shell.href)}</div><div class="section">${sectionTitle(3, 'RESULTS')}${chart(lab, experiment)}</div><div class="section">${sectionTitle(4, 'OBSERVATIONS')}${observations.map(observationHtml).join('')}<form class="form" method="post" action="${shell.href(`/experiments/${encodeURIComponent(experiment.id)}/observations`)}" id="observe"><label class="field"><span>NEW OBSERVATION</span><textarea id="observation-body" name="body" placeholder="What did you see?"></textarea></label><div class="actions"><button class="button" type="submit">Append observation</button><span class="cancel">Append-only: the record keeps every entry.</span></div></form></div><div class="section">${sectionTitle(5, 'AUDIT TRAIL')}<ul class="history">${history}</ul><p style="margin-top:9px"><a href="${shell.href(`/experiments/${encodeURIComponent(experiment.id)}/history`)}" style="color:#236d81;font-size:9px">Full history ↗</a></p></div></article>`
    const aside = `<aside class="aside">${converterCard(converter, experiment, shell.href)}${metadataCard(lab, experiment, shell.href)}${reproducibilityCard()}</aside>`
    const main = `${shell.notice(url)}<div class="top"><div><small>NOTEBOOK ${escapeHtml(notebook?.code ?? '')} / EXPERIMENT ${String(experiment.number).padStart(2, '0')}</small><h1>${escapeHtml(experiment.title)}</h1><p>${escapeHtml(experiment.sampleSeries)}</p></div><div class="tools"><a href="${shell.href(`/data?experimentId=${encodeURIComponent(experiment.id)}`)}">Data table</a><a href="${shell.href(`/experiments/${encodeURIComponent(experiment.id)}/history`)}">History</a><a href="${shell.href(`/experiments/${encodeURIComponent(experiment.id)}/export.json`)}">Export</a><a class="primary" href="#observe">＋ Add observation</a></div></div><div class="cols">${paper}${aside}</div>`
    return shell.page({ title: experiment.title, notebookId: experiment.notebookId, experimentId: experiment.id, main })
  }

  const app = new Acryl()
    .get('/', (c) => {
      const experiment = lab.activeExperiment()
      return c.html(render(experiment, c.req.url, initialConverter(lab, experiment)))
    })
    .get('/experiments/:id', (c) => {
      const experiment = lab.experiment(c.req.param('id'))
      if (experiment === undefined) return c.redirect(shell.url('/', { kind: 'error', text: 'That experiment no longer exists.' }), 303)
      return c.html(render(experiment, c.req.url, initialConverter(lab, experiment)))
    })
    .post('/convert', async (c) => {
      const body = await c.req.parseBody()
      const experiment = lab.experiment(String(body.experimentId ?? '')) ?? lab.activeExperiment()
      let state: ConverterState
      try {
        const value = cleanValue(body.value)
        const from: Unit = cleanUnit(body.from)
        const to: Unit = cleanUnit(body.to)
        state = {
          value: formatNumber(value),
          from,
          to,
          result: `${formatNumber(value)} ${from} = ${formatNumber(convert(value, from, to))} ${to}`,
        }
      } catch (error) {
        if (!(error instanceof LabError)) throw error
        state = { ...initialConverter(lab, experiment), error: error.message }
      }
      return c.html(render(experiment, c.req.url, state))
    })
    .post('/experiments/:id/observations', async (c) => {
      const body = await c.req.parseBody()
      try {
        await lab.addObservation(c.req.param('id'), body.body)
        return c.redirect(shell.url(`/experiments/${encodeURIComponent(c.req.param('id'))}`, { kind: 'ok', text: 'Observation appended to the record.' }), 303)
      } catch (error) {
        return c.redirect(shell.url(`/experiments/${encodeURIComponent(c.req.param('id'))}`, { kind: 'error', text: (error as Error).message }), 303)
      }
    })

  ctx.router.route(prefix === '' ? '/' : prefix, app)
}
