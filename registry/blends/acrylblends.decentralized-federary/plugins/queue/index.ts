/** Federation requests (side column and masthead): inbound requests to approve, hold or block, and outbound ones to withdraw; a request a trust rule would stop says so. "Review peer request" jumps to the first inbound one. */
import type { Context } from '@deepseek-ai/cordis'
import { approvalBlock } from '../federary/index.ts'
import { escapeHtml, postButton } from '../fed-shell/index.ts'

export const name = 'queue'
export const inject = ['fed', 'fedShell']

export function apply(ctx: Context): void {
  const shell = ctx.fedShell
  const fed = ctx.fed
  const top = (sel: ReturnType<typeof shell.selection>): string => {
    const first = fed.state.instances.find((i) => i.relation === 'pending-in')
    return first === undefined ? `<span class="btn" aria-disabled="true" id="invite">No requests to review</span>` : `<a class="btn primary" id="invite" href="${shell.hrefFor('/', sel.instance.id, { request: first.id })}#requests">＋ Review peer request</a>`
  }
  const render = (sel: ReturnType<typeof shell.selection>): string => {
    const s = fed.state
    const back = (id: string) => shell.hrefFor('/', id)
    const inbound = s.instances.filter((i) => i.relation === 'pending-in')
    const outbound = s.instances.filter((i) => i.relation === 'pending-out')
    const act = (id: string, action: string, label: string, cls = '') => postButton(shell, `/instances/${encodeURIComponent(id)}/act`, back(id), { action }, label, cls, `data-action="${action}"`)
    const rows = inbound
      .map((i) => {
        const blocked = approvalBlock(s, i)
        return `<div class="queue${i.id === sel.request ? ' hl' : ''}" data-request="${escapeHtml(i.id)}"><span aria-hidden="true">◉</span><span class="grow"><a href="${shell.hrefFor('/', i.id)}">${escapeHtml(i.id)}</a>${blocked === undefined ? '' : `<br><span class="chip err" title="${escapeHtml(blocked)}">stopped by a trust rule</span>`}</span>${act(i.id, 'approve', 'Approve')}${act(i.id, 'hold', 'Hold')}${act(i.id, 'block', 'Block', 'danger')}</div>`
      })
      .join('')
    const out = outbound.map((i) => `<div class="queue" data-outbound="${escapeHtml(i.id)}"><span aria-hidden="true">◌</span><span class="grow"><a href="${shell.hrefFor('/', i.id)}">${escapeHtml(i.id)}</a><br><span class="muted">Awaiting reply</span></span>${act(i.id, 'withdraw', 'Withdraw')}</div>`).join('')
    return `<section class="panel" id="requests"><h2>Incoming federation requests</h2>${rows === '' ? '<div class="muted" style="margin-top:8px">No incoming requests.</div>' : rows}${out === '' ? '' : `<h2 style="margin-top:16px">Outgoing requests</h2>${out}`}</section>`
  }
  ctx.effect(() => shell.side({ id: 'queue-top', column: 'actions', order: 20, render: top }))
  ctx.effect(() => shell.side({ id: 'queue', column: 'side', order: 20, render }))
}
