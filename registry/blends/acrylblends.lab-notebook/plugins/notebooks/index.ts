/** Notebooks: the list at `/notebooks` and the create form at `/notebooks/new`, with the notebook code and project validated. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { LabError, type Lab } from '../lab/index.ts'
import { escapeHtml, pageHead, type Shell } from '../lab-shell/index.ts'

export const name = 'notebooks'
export const inject = ['lab', 'shell', 'router']

interface Values {
  readonly code: string
  readonly title: string
  readonly project: string
}

export function apply(ctx: Context): void {
  const lab: Lab = ctx.lab
  const shell: Shell = ctx.shell
  const prefix = shell.prefix

  const form = (url: string, values: Values, error?: string): string => {
    const main = `<div class="page">${shell.notice(url)}${pageHead({ kicker: 'NOTEBOOKS / NEW', title: 'New notebook', text: 'A notebook groups experiments under one project and code.', action: `<a class="button" href="${shell.href('/notebooks')}">All notebooks</a>` })}${error === undefined ? '' : `<p class="notice error" role="alert">${escapeHtml(error)}</p>`}<form class="form" method="post" action="${shell.href('/notebooks/new')}"><div class="formgrid"><label class="field"><span>CODE</span><input name="code" value="${escapeHtml(values.code)}" placeholder="M-042" required></label><label class="field"><span>PROJECT</span><input name="project" value="${escapeHtml(values.project)}" placeholder="Materials / Batch 04"></label></div><label class="field"><span>TITLE</span><input name="title" value="${escapeHtml(values.title)}" placeholder="Materials Research" required></label><div class="actions"><button class="button" type="submit">Create notebook</button><a class="cancel" href="${shell.href('/notebooks')}">Cancel</a></div></form></div>`
    return shell.page({ title: 'New notebook', main })
  }

  const app = new Acryl()
    .get('/notebooks', (c) => {
      const cards = lab
        .notebooks()
        .map((notebook) => {
          const experiments = lab.experiments(notebook.id)
          const items = experiments
            .slice(0, 4)
            .map((experiment) => `<li><a href="${shell.href(`/experiments/${encodeURIComponent(experiment.id)}`)}">${String(experiment.number).padStart(2, '0')} · ${escapeHtml(experiment.title)}</a></li>`)
            .join('')
          const first = experiments[0]
          const open =
            first === undefined
              ? `<a href="${shell.href(`/experiments/new?notebookId=${encodeURIComponent(notebook.id)}`)}">Start an experiment ↗</a>`
              : `<a href="${shell.href(`/experiments/${encodeURIComponent(first.id)}`)}">Open the notebook ↗</a>`
          return `<article class="notebookcard"><b>${escapeHtml(notebook.title)}</b><small>NOTEBOOK ${escapeHtml(notebook.code)} · ${String(experiments.length)} EXPERIMENTS</small><p>${escapeHtml(notebook.project)}</p>${open}<ul>${items}</ul></article>`
        })
        .join('')
      const main = `<div class="page">${shell.notice(c.req.url)}${pageHead({ kicker: 'LIBRARY / NOTEBOOKS', title: 'Notebooks', text: 'Three notebooks, 23 experiments. Open a notebook to see its records.', action: `<a class="button" href="${shell.href('/notebooks/new')}">＋ New notebook</a>` })}<div class="notebookgrid">${cards}</div></div>`
      return c.html(shell.page({ title: 'Notebooks', main }))
    })
    .get('/notebooks/new', (c) => c.html(form(c.req.url, { code: '', title: '', project: '' })))
    .post('/notebooks/new', async (c) => {
      const body = await c.req.parseBody()
      const values: Values = { code: String(body.code ?? ''), title: String(body.title ?? ''), project: String(body.project ?? '') }
      try {
        const notebook = await lab.addNotebook(values)
        return c.redirect(shell.url('/notebooks', { kind: 'ok', text: `Notebook ${notebook.code} created.` }), 303)
      } catch (error) {
        if (!(error instanceof LabError)) throw error
        return c.html(form(c.req.url, values, error.message))
      }
    })

  ctx.router.route(prefix === '' ? '/' : prefix, app)
}
