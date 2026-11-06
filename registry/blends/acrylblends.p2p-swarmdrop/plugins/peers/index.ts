/** Swarm peers (aside) and Add demo peer (header): contribution and connection quality of each peer, the selected peer's detail with how many ranges it holds, drop a peer, and the room code. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { RANGES, SLOW_LATENCY_MS, holds, quality, rateLabel } from '../swarmdrop/index.ts'
import { escapeHtml, swarmErrorOf, withNotice } from '../swarm-shell/index.ts'

export const name = 'peers'
export const inject = ['router', 'swarm', 'swarmShell']

export function apply(ctx: Context): void {
  const shell = ctx.swarmShell
  const swarm = ctx.swarm
  const top = (sel: ReturnType<typeof shell.selection>): string => `<form method="post" action="${shell.href(`/rooms/${encodeURIComponent(sel.room.id)}/peers`)}">${shell.hidden(sel)}<button class="btn green" id="addPeer" type="submit">＋ Add demo peer</button></form>`
  const render = (sel: ReturnType<typeof shell.selection>): string => {
    const r = sel.room
    const rows = r.peers.map((p) => `<a class="peer${p.id === sel.peer?.id ? ' sel' : ''}" data-peer="${escapeHtml(p.id)}" href="${shell.hrefFor('/', { room: r.id, peer: p.id })}"><b>${escapeHtml(p.id)}</b><span class="rate">${escapeHtml(rateLabel(p.rate))}</span><span class="${p.latency >= SLOW_LATENCY_MS ? 'warnc' : ''}">${String(p.latency)} ms</span></a>`).join('')
    let detail = ''
    if (sel.peer !== undefined) {
      const p = sel.peer
      const total = r.peers.reduce((n, x) => n + x.rate, 0)
      const held = [...Array(RANGES).keys()].filter((i) => holds(r, p, i)).length
      detail = `<div id="peerdetail" style="margin-top:14px"><h2>${escapeHtml(p.id)}</h2><div class="kv"><span>Connection</span><b class="${quality(p) === 'good' ? 'okc' : quality(p) === 'fair' ? '' : 'warnc'}">${quality(p)}</b></div><div class="kv"><span>Download from peer</span><b>${escapeHtml(rateLabel(p.rate))}</b></div><div class="kv"><span>Upload to peer</span><b>${escapeHtml(rateLabel(Math.round(p.rate / 4)))}</b></div><div class="kv"><span>Share of the swarm rate</span><b>${total === 0 ? '0' : String(Math.round((p.rate / total) * 100))}%</b></div><div class="kv"><span>Ranges held</span><b>${String(held)} of ${String(RANGES)}</b></div><form method="post" action="${shell.href(`/rooms/${encodeURIComponent(r.id)}/peers/${encodeURIComponent(p.id)}/drop`)}" style="margin-top:8px">${shell.hidden(sel)}<button class="btn small" type="submit">Disconnect peer</button></form></div>`
    }
    return `<section class="panel"><h2>Swarm peers</h2><div class="muted">Contribution and connection quality</div><div id="peers">${rows === '' ? '<div class="muted" style="margin-top:10px">No peers connected. Add a demo peer.</div>' : rows}</div>${detail}<div class="codebox"><div class="sub">ROOM CODE</div><b id="roomcode">${escapeHtml(r.code)}</b><div class="sub" style="margin-top:7px">Synthetic code · not a real transfer endpoint</div></div></section>`
  }
  const go = async (c: { redirect(url: string, status: 303): Response }, id: string, work: () => Promise<string>) => {
    const back = shell.hrefFor('/', { room: id })
    try {
      return c.redirect(withNotice(back, 'ok', await work()), 303)
    } catch (error) {
      const refusal = swarmErrorOf(error)
      if (refusal === undefined) throw error
      return c.redirect(withNotice(back, 'error', refusal.message), 303)
    }
  }
  const app = new Acryl()
    .post('/rooms/:id/peers', async (c) => {
      const id = c.req.param('id')
      return go(c, id, async () => `Synthetic peer ${(await swarm.addPeer(id)).id} added to swarm.`)
    })
    .post('/rooms/:id/peers/:peer/drop', async (c) => {
      const id = c.req.param('id')
      return go(c, id, async () => {
        await swarm.dropPeer(id, c.req.param('peer'))
        return `Peer ${c.req.param('peer')} disconnected.`
      })
    })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  ctx.effect(() => shell.side({ id: 'peers-top', column: 'actions', order: 20, render: top }))
  ctx.effect(() => shell.side({ id: 'peers', column: 'aside', order: 10, render }))
}
