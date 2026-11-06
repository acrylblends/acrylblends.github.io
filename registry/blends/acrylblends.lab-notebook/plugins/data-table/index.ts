/**
 * The data table at `/data`: every sample-level measurement of an experiment, a formulation filter, an append form and the CSV export at `/data.csv`.
 * The series averages stay in the record; this table is the specimen-level evidence.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { formatNumber, LabError, stampText, type Lab } from '../lab/index.ts'
import { escapeHtml, pageHead, type Shell } from '../lab-shell/index.ts'

export const name = 'data-table'
export const inject = ['lab', 'shell', 'router']

interface Values {
  readonly sampleId: string
  readonly formulation: string
  readonly parameter: string
  readonly value: string
  readonly unit: string
}

const EMPTY: Values = { sampleId: '', formulation: 'A', parameter: 'Tensile strength', value: '', unit: 'MPa' }

function valuesFrom(form: Record<string, unknown>): Values {
  const text = (key: keyof Values): string => (typeof form[key] === 'string' ? (form[key] as string) : EMPTY[key])
  return {
    sampleId: text('sampleId'),
    formulation: text('formulation'),
    parameter: text('parameter'),
    value: text('value'),
    unit: text('unit'),
  }
}

export function apply(ctx: Context): void {
  const lab: Lab = ctx.lab
  const shell: Shell = ctx.shell
  const prefix = shell.prefix

  const render = (url: string, experimentId: string, formulation: string, values: Values, error?: string): string => {
    const experiment = lab.experiment(experimentId) ?? lab.activeExperiment()
    const rows = lab
      .measurements(experiment.id, { kind: 'sample', ...(formulation === '' ? {} : { formulation }) })
      .map(
        (measurement) =>
          `<tr><td><b>${escapeHtml(measurement.sampleId)}</b></td><td>${escapeHtml(measurement.formulation)}</td><td>${escapeHtml(measurement.parameter)}</td><td>${formatNumber(measurement.value)}</td><td>${escapeHtml(measurement.unit)}</td><td>${escapeHtml(stampText(measurement.measuredAt))}</td></tr>`,
      )
      .join('')
    const filters = ['', 'A', 'B', 'C']
      .map((key) => {
        const label = key === '' ? 'All' : `Formulation ${key}`
        const target = `${shell.href('/data')}?experimentId=${encodeURIComponent(experiment.id)}${key === '' ? '' : `&formulation=${key}`}`
        return `<a class="tool${formulation === key ? ' active' : ''}" href="${target}">${label}</a>`
      })
      .join('')
    const table =
      rows === ''
        ? `<div class="empty"><b>No measurements match.</b><span>Try another formulation or append the first row.</span></div>`
        : `<table class="table"><thead><tr><th>SAMPLE</th><th>FORMULATION</th><th>PARAMETER</th><th>VALUE</th><th>UNIT</th><th>MEASURED</th></tr></thead><tbody>${rows}</tbody></table>`
    const main = `<div class="page">${shell.notice(url)}${pageHead({ kicker: `DATA / ${experiment.code}`, title: 'Data table', text: `${experiment.title}: sample-level measurements, append-only.`, action: `<a class="button" href="${shell.href(`/data.csv?experimentId=${encodeURIComponent(experiment.id)}`)}">Export CSV</a> <a class="button" href="${shell.href(`/experiments/${encodeURIComponent(experiment.id)}`)}">Back to the record</a>` })}<div class="tools" style="margin-bottom:12px">${filters}</div>${error === undefined ? '' : `<p class="notice error" role="alert">${escapeHtml(error)}</p>`}${table}<h2 style="font:500 19px Georgia,serif;margin:26px 0 8px">Append a measurement</h2><form class="form" method="post" action="${shell.href(`/experiments/${encodeURIComponent(experiment.id)}/measurements`)}"><div class="formgrid"><label class="field"><span>SAMPLE ID</span><input name="sampleId" value="${escapeHtml(values.sampleId)}" placeholder="C-06" required></label><label class="field"><span>FORMULATION</span><select name="formulation">${['A', 'B', 'C'].map((key) => `<option${key === values.formulation ? ' selected' : ''}>${key}</option>`).join('')}</select></label><label class="field"><span>PARAMETER</span><input name="parameter" value="${escapeHtml(values.parameter)}" placeholder="Tensile strength"></label><label class="field"><span>VALUE</span><input name="value" type="number" step="any" value="${escapeHtml(values.value)}" placeholder="58.7"></label><label class="field"><span>UNIT</span><select name="unit">${['MPa', 'bar', 'psi'].map((unit) => `<option${unit === values.unit ? ' selected' : ''}>${unit}</option>`).join('')}</select></label></div><div class="actions"><button class="button" type="submit">Append measurement</button><span class="cancel">Append-only: existing rows are never rewritten.</span></div></form></div>`
    return shell.page({ title: 'Data table', notebookId: experiment.notebookId, experimentId: experiment.id, main })
  }

  const app = new Acryl()
    .get('/data', (c) => {
      const experimentId = c.req.query('experimentId') ?? lab.activeExperiment().id
      const formulation = (c.req.query('formulation') ?? '').toUpperCase()
      return c.html(render(c.req.url, experimentId, ['A', 'B', 'C'].includes(formulation) ? formulation : '', EMPTY))
    })
    .get('/data.csv', (c) => {
      const experimentId = c.req.query('experimentId') ?? lab.activeExperiment().id
      const experiment = lab.experiment(experimentId)
      if (experiment === undefined) return c.redirect(shell.url('/data', { kind: 'error', text: 'That experiment no longer exists.' }), 303)
      return c.body(lab.csv(experiment.id), 200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${experiment.code.toLowerCase()}-measurements.csv"` })
    })
    .post('/experiments/:id/measurements', async (c) => {
      const values = valuesFrom(await c.req.parseBody())
      try {
        await lab.addMeasurement(c.req.param('id'), values)
        return c.redirect(shell.url(`/data?experimentId=${encodeURIComponent(c.req.param('id'))}`, { kind: 'ok', text: `Measurement appended for ${values.sampleId}.` }), 303)
      } catch (error) {
        if (!(error instanceof LabError)) throw error
        return c.html(render(c.req.url, c.req.param('id'), '', values, error.message))
      }
    })

  ctx.router.route(prefix === '' ? '/' : prefix, app)
}
