/** Instance profile (side column): software, policy, peers, last handshake and identity assertion of the open instance, its trust relationship, the peering actions it allows (reversible), the handshake and its peer list. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { POLICIES, RELATION_LABEL, TRANSITIONS, type RelationAction, ago, peersOf } from '../federary/index.ts'
import { backTo, escapeHtml, fedErrorOf, fieldOf, postButton, withNotice } from '../fed-shell/index.ts'

export const name = 'profile'
export const inject = ['router', 'fed', 'fedShell']

export function apply(ctx: Context): void {
  const shell = ctx.fedShell
  const fed = ctx.fed
  const render = (sel: ReturnType<typeof shell.selection>): string => {
    const i = sel.instance
    const now = fed.now()
    const back = shell.hrefFor('/', i.id)
    const assertion = { valid: ['Valid', 'ok'], expired: ['Expired', 'errc'], unsigned: ['Unsigned', 'warnc'] }[i.assertion]
    const actions = i.primary === true ? '' : (Object.entries(TRANSITIONS) as [RelationAction, (typeof TRANSITIONS)[RelationAction]][]).filter(([, t]) => t.from.includes(i.relation)).map(([a, t]) => postButton(shell, `/instances/${encodeURIComponent(i.id)}/act`, back, { action: a }, t.label, a === 'block' ? 'danger' : '', `data-action="${a}"`)).join('')
    const handshake = i.primary === true || i.relation === 'blocked' ? '' : postButton(shell, `/instances/${encodeURIComponent(i.id)}/handshake`, back, {}, 'Run handshake', '', 'id="handshake"')
    const peers = peersOf(fed.state, i.id).map((p) => `<a class="chip" href="${shell.hrefFor('/', p.id)}" data-peer="${escapeHtml(p.id)}">${escapeHtml(p.id)}</a>`).join(' ')
    return `<section class="panel" id="profile"><h2 id="peerTitle">${escapeHtml(i.id)}</h2><div class="muted" id="peerSub">${i.primary === true ? 'Primary instance · fictional demo node' : 'Selected instance · fictional demo node'}</div><div class="peer"><span>Software</span><b>${escapeHtml(i.software)} ${escapeHtml(i.version)}</b></div><div class="peer"><span>Policy</span><b>${escapeHtml(POLICIES[i.policy].label)}</b></div><div class="peer"><span>Peers</span><b>${String(i.inbound)} inbound · ${String(i.outbound)} outbound</b></div><div class="peer"><span>Last handshake</span><b>${escapeHtml(ago(i.handshakeAt, now))}</b></div><div class="peer"><span>Identity assertion</span><b class="${assertion[1]}">${assertion[0]}</b></div>${i.primary === true ? '' : `<div class="peer"><span>Relationship</span><b id="relation">${escapeHtml(RELATION_LABEL[i.relation])}</b></div>`}<div class="trust"><h3>Trust relationship</h3><p>${escapeHtml(POLICIES[i.policy].text)}</p></div><div class="btnrow">${actions}${handshake}</div>${peers === '' ? '' : `<div class="muted" style="margin-top:12px">Linked with</div><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">${peers}</div>`}</section>`
  }
  const go = async (c: { redirect(url: string, status: 303): Response }, back: string, work: () => Promise<string>) => {
    try {
      return c.redirect(withNotice(back, 'ok', await work()), 303)
    } catch (error) {
      const refusal = fedErrorOf(error)
      if (refusal === undefined) throw error
      return c.redirect(withNotice(back, 'error', refusal.message), 303)
    }
  }
  const app = new Acryl()
    .post('/instances/:id/act', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      const id = c.req.param('id')
      const back = backTo(shell, fieldOf(body, 'back'), shell.hrefFor('/', id))
      return go(c, back, async () => {
        const d = await fed.act(id, fieldOf(body, 'action'))
        return `${TRANSITIONS[d.action as RelationAction].label}: ${id} is now ${RELATION_LABEL[d.after.relation ?? 'unpeered'].toLowerCase()}. Demo decision recorded; you can undo it.`
      })
    })
    .post('/instances/:id/handshake', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      const id = c.req.param('id')
      const back = backTo(shell, fieldOf(body, 'back'), shell.hrefFor('/', id))
      return go(c, back, async () => {
        await fed.handshake(id)
        return `Identity handshake with ${id} completed.`
      })
    })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  ctx.effect(() => shell.side({ id: 'profile', column: 'side', order: 10, render }))
}
