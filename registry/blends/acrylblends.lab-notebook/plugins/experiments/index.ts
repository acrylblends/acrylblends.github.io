/** Experiments: the create form at `/experiments/new`, the audit history at `/experiments/:id/history` and the record export at `/experiments/:id/export.json`. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { LabError, stampOf, stampText, type Lab } from '../lab/index.ts'
import { escapeHtml, pageHead, type Shell } from '../lab-shell/index.ts'

export const name = 'experiments'
export const inject = ['lab', 'shell', 'router']

interface Values {
  readonly notebookId: string
  readonly title: string
  readonly objective: string
  readonly method: string
  readonly protocolVersion: string
}

export function apply(ctx: Context): void {
  const lab: Lab = ctx.lab
  const shell: Shell = ctx.shell
  const prefix = shell.prefix

  const form = (url: string, values: Values, error?: string): string => {
    const options = lab
      .notebooks()
      .map((notebook) => `<option value="${escapeHtml(notebook.id)}"${notebook.id === values.notebookId ? ' selected' : ''}>${escapeHtml(notebook.title)} (${escapeHtml(notebook.code)})</option>`)
      .join('')
    const main = `<div class="page">${shell.notice(url)}${pageHead({ kicker: 'NOTEBOOKS / NEW EXPERIMENT', title: 'Create experiment', text: 'A record starts with the question, the objective and the method. Measurements and observations are appended later.', action: `<a class="button" href="${shell.href('/')}">Back to the record</a>` })}${error === undefined ? '' : `<p class="notice error" role="alert">${escapeHtml(error)}</p>`}<form class="form" method="post" action="${shell.href('/experiments/new')}"><div class="formgrid"><label class="field"><span>NOTEBOOK</span><select name="notebookId">${options}</select></label><label class="field"><span>PROTOCOL VERSION</span><input name="protocolVersion" value="${escapeHtml(values.protocolVersion)}" placeholder="v1.0"></label></div><label class="field"><span>TITLE</span><input name="title" value="${escapeHtml(values.title)}" placeholder="Polymer tensile test"></label><label class="field"><span>OBJECTIVE</span><textarea name="objective" placeholder="What should this experiment establish?">${escapeHtml(values.objective)}</textarea></label><label class="field"><span>METHOD</span><textarea name="method" placeholder="How will it be run?">${escapeHtml(values.method)}</textarea></label><div class="actions"><button class="button" type="submit">Create experiment</button><a class="cancel" href="${shell.href('/')}">Cancel</a></div></form></div>`
    return shell.page({ title: 'Create experiment', notebookId: values.notebookId, main })
  }

  const app = new Acryl()
    .get('/experiments/new', (c) => {
      const requested = c.req.query('notebookId')
      const notebook = lab.notebook(requested ?? '') ?? lab.notebooks()[0]
      return c.html(
        form(c.req.url, {
          notebookId: notebook?.id ?? '',
          title: '',
          objective: '',
          method: '',
          protocolVersion: 'v1.0',
        }),
      )
    })
    .post('/experiments/new', async (c) => {
      const body = await c.req.parseBody()
      const values: Values = {
        notebookId: String(body.notebookId ?? ''),
        title: String(body.title ?? ''),
        objective: String(body.objective ?? ''),
        method: String(body.method ?? ''),
        protocolVersion: String(body.protocolVersion ?? ''),
      }
      try {
        const experiment = await lab.addExperiment(values)
        return c.redirect(shell.url(`/experiments/${encodeURIComponent(experiment.id)}`, { kind: 'ok', text: `Experiment ${experiment.code} created.` }), 303)
      } catch (error) {
        if (!(error instanceof LabError)) throw error
        return c.html(form(c.req.url, values, error.message))
      }
    })
    .get('/experiments/:id/history', (c) => {
      const experiment = lab.experiment(c.req.param('id'))
      if (experiment === undefined) return c.redirect(shell.url('/', { kind: 'error', text: 'That experiment no longer exists.' }), 303)
      const events = lab
        .audit(experiment.id)
        .map((event) => `<li><time>${escapeHtml(stampText(event.at))}</time><span>${escapeHtml(event.action)} · ${escapeHtml(event.actor)}</span></li>`)
        .join('')
      const main = `<div class="page">${shell.notice(c.req.url)}${pageHead({ kicker: `AUDIT / ${experiment.code}`, title: 'History', text: `Every append to ${experiment.title}, newest first. Entries are never edited.`, action: `<a class="button" href="${shell.href(`/experiments/${encodeURIComponent(experiment.id)}`)}">Back to the record</a>` })}<ul class="history">${events}</ul></div>`
      return c.html(shell.page({ title: `${experiment.title} history`, notebookId: experiment.notebookId, experimentId: experiment.id, main }))
    })
    .get('/experiments/:id/export.json', (c) => {
      const experiment = lab.experiment(c.req.param('id'))
      if (experiment === undefined) return c.redirect(shell.url('/', { kind: 'error', text: 'That experiment no longer exists.' }), 303)
      c.header('content-disposition', `attachment; filename="${experiment.code.toLowerCase()}-record.json"`)
      return c.json({ ...lab.exportRecord(experiment.id), exportedAt: stampOf(lab.now) })
    })

  ctx.router.route(prefix === '' ? '/' : prefix, app)
}
