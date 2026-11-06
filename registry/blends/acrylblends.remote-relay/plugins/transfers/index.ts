/**
 * File transfer (`/transfer`): the selected session's simulated queue with file metadata and state (queued, ready, running, completed, cancelled),
 * "Queue sample transfer", and the transfer policy. Nothing moves; a job is a state machine a person steps through.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { backTo, escapeHtml, fieldOf, relayErrorOf, withNotice } from '../relay-shell/index.ts'
import { NEXT_STATE, TRANSFER_LABEL, type TransferJob, formatBytes } from '../relay/index.ts'

export const name = 'transfers'
export const inject = ['router', 'relay', 'relayShell']

const NEXT_LABEL: Readonly<Record<string, string>> = { queued: 'Verify', ready: 'Start', running: 'Finish' }

function pageFor(ctx: Context, url: string): string {
  const shell = ctx.relayShell
  const relay = ctx.relay
  const sel = shell.selection(url)
  const session = sel.session
  const live = session !== undefined && relay.status(session) === 'active'
  const back = shell.hrefFor('/transfer', sel)
  const form = (path: string, label: string, cls = 'smallbtn') =>
    `<form method="post" action="${shell.href(path)}"><input type="hidden" name="back" value="${back}"><button class="${cls}" type="submit">${label}</button></form>`
  const row = (job: TransferJob) => {
    const arrow = job.direction === 'up' ? '→' : '←'
    const tone = job.state === 'completed' ? 'badge' : job.state === 'cancelled' ? 'badge bad' : 'status'
    const next = NEXT_STATE[job.state]
    const actions =
      next === undefined
        ? ''
        : `${live ? form(`/transfers/${encodeURIComponent(job.id)}/advance`, NEXT_LABEL[job.state] ?? 'Next') : ''}${form(`/transfers/${encodeURIComponent(job.id)}/cancel`, 'Cancel')}`
    return `<div class="row" data-transfer="${escapeHtml(job.id)}"><span>${escapeHtml(job.name)} ${arrow} ${escapeHtml(job.path)}</span><span style="display:flex;gap:8px;align-items:center"><b class="${tone}">${TRANSFER_LABEL[job.state]} · ${formatBytes(job.bytes)}</b>${actions}</span></div>`
  }
  const jobs = session === undefined ? [] : [...relay.transfers(session.id)].reverse()
  const queue =
    session === undefined
      ? '<div class="empty">Open a session on this connection to queue transfers.</div>'
      : jobs.length === 0
        ? '<div class="empty"><b>The queue is empty.</b><br>Queue a sample transfer.</div>'
        : jobs.map(row).join('')
  const main = `<div class="card"><h3>Transfer queue · simulated</h3>${queue}${live ? `<div style="margin-top:12px"><form method="post" action="${shell.href(`/sessions/${encodeURIComponent(session.id)}/transfers`)}"><input type="hidden" name="back" value="${back}"><button class="smallbtn" id="queue" type="submit">＋ Queue sample transfer</button></form></div>` : ''}</div>
<div class="card"><h3>Transfer policy</h3><div class="row"><span>Checksum verification</span><b>Enabled</b></div><div class="row"><span>Overwrite existing files</span><b>No</b></div><div class="row"><span>Transport</span><b>SSH / SFTP (not connected)</b></div></div>`
  return shell.page({ active: 'transfer', title: 'File transfer', main, url })
}

export function apply(ctx: Context): void {
  const shell = ctx.relayShell
  const relay = ctx.relay
  const refused = (c: { redirect(url: string, status: 303): Response }, to: string, error: unknown) => {
    const refusal = relayErrorOf(error)
    if (refusal === undefined) throw error
    return c.redirect(withNotice(to, 'error', refusal.message), 303)
  }
  const fallback = (sessionId: string) => {
    try {
      return `${shell.href('/transfer')}?profile=${encodeURIComponent(relay.session(sessionId).profileId)}`
    } catch {
      return shell.href('/transfer')
    }
  }
  const app = new Acryl()
    .get('/transfer', (c) => c.html(pageFor(ctx, c.req.url)))
    .post('/sessions/:id/transfers', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      const to = backTo(shell, fieldOf(body, 'back'), fallback(c.req.param('id')))
      try {
        const job = await relay.queueTransfer(c.req.param('id'))
        return c.redirect(withNotice(to, 'ok', `${job.name} queued.`), 303)
      } catch (error) {
        return refused(c, to, error)
      }
    })
  for (const action of ['advance', 'cancel'] as const) {
    app.post(`/transfers/:id/${action}`, async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      const id = c.req.param('id')
      const to = backTo(shell, fieldOf(body, 'back'), shell.href('/transfer'))
      try {
        const job = await (action === 'advance' ? relay.advanceTransfer(id) : relay.cancelTransfer(id))
        return c.redirect(withNotice(to, 'ok', `${job.name} is now ${TRANSFER_LABEL[job.state].toLowerCase()}.`), 303)
      } catch (error) {
        return refused(c, to, error)
      }
    })
  }
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  ctx.effect(() => shell.tab({ id: 'transfer', label: 'File transfer', path: '/transfer', order: 20 }))
}
