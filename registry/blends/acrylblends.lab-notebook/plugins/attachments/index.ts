/** Attachments: the experiment's files at `/experiments/:id/attachments`, with the add form and its type and size validation. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { LabError, type Lab } from '../lab/index.ts'
import { attachmentHtml, escapeHtml, pageHead, type Shell } from '../lab-shell/index.ts'

export const name = 'attachments'
export const inject = ['lab', 'shell', 'router']

interface Values {
  readonly filename: string
  readonly mimeType: string
  readonly sizeBytes: string
}

export function apply(ctx: Context): void {
  const lab: Lab = ctx.lab
  const shell: Shell = ctx.shell
  const prefix = shell.prefix

  const render = (url: string, experimentId: string, values: Values, error?: string): string => {
    const experiment = lab.experiment(experimentId)
    if (experiment === undefined) return ''
    const files = lab.attachments(experiment.id)
    const list =
      files.length === 0
        ? `<div class="empty"><b>No attachments yet.</b><span>Add the first file for this experiment.</span></div>`
        : files.map(attachmentHtml).join('')
    const main = `<div class="page">${shell.notice(url)}${pageHead({ kicker: `RECORD / ${experiment.code}`, title: 'Attachments', text: `Files kept with ${experiment.title}. Types and sizes are recorded, not guessed.`, action: `<a class="button" href="${shell.href(`/experiments/${encodeURIComponent(experiment.id)}`)}">Back to the record</a>` })}${error === undefined ? '' : `<p class="notice error" role="alert">${escapeHtml(error)}</p>`}${list}<h2 style="font:500 19px Georgia,serif;margin:26px 0 8px">Add an attachment</h2><form class="form" method="post" action="${shell.href(`/experiments/${encodeURIComponent(experiment.id)}/attachments`)}"><div class="formgrid"><label class="field"><span>FILE NAME</span><input name="filename" value="${escapeHtml(values.filename)}" placeholder="specimen-d-fracture.jpg" required></label><label class="field"><span>TYPE</span><select name="mimeType">${['image/jpeg', 'image/png', 'image/webp', 'text/csv', 'application/pdf'].map((type) => `<option${type === values.mimeType ? ' selected' : ''}>${type}</option>`).join('')}</select></label></div><label class="field"><span>SIZE (BYTES)</span><input name="sizeBytes" type="number" min="1" max="50000000" value="${escapeHtml(values.sizeBytes)}" placeholder="1200000"></label><div class="actions"><button class="button" type="submit">Add attachment</button><span class="cancel">The file record is metadata only in this demo.</span></div></form></div>`
    return shell.page({ title: 'Attachments', notebookId: experiment.notebookId, experimentId: experiment.id, main })
  }

  const app = new Acryl()
    .get('/experiments/:id/attachments', (c) => {
      const experiment = lab.experiment(c.req.param('id'))
      if (experiment === undefined) return c.redirect(shell.url('/', { kind: 'error', text: 'That experiment no longer exists.' }), 303)
      return c.html(render(c.req.url, experiment.id, { filename: '', mimeType: 'image/jpeg', sizeBytes: '' }))
    })
    .post('/experiments/:id/attachments', async (c) => {
      const body = await c.req.parseBody()
      const values: Values = {
        filename: String(body.filename ?? ''),
        mimeType: String(body.mimeType ?? 'image/jpeg'),
        sizeBytes: String(body.sizeBytes ?? ''),
      }
      try {
        const attachment = await lab.addAttachment(c.req.param('id'), values)
        return c.redirect(shell.url(`/experiments/${encodeURIComponent(c.req.param('id'))}/attachments`, { kind: 'ok', text: `${attachment.filename} added.` }), 303)
      } catch (error) {
        if (!(error instanceof LabError)) throw error
        return c.html(render(c.req.url, c.req.param('id'), values, error.message))
      }
    })

  ctx.router.route(prefix === '' ? '/' : prefix, app)
}
