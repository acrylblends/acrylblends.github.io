/** Chunk availability (main column): the range map (verified, in flight, not received; click a range to inspect it), the range inspector, and the controls: pause or resume, advance the simulation one step, run the integrity check. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { RANGES, availability, holds, rangeHash, rangeLabel, span, stateAt } from '../swarmdrop/index.ts'
import { escapeHtml, swarmErrorOf, withNotice } from '../swarm-shell/index.ts'

export const name = 'chunks'
export const inject = ['router', 'swarm', 'swarmShell']

export function apply(ctx: Context): void {
  const shell = ctx.swarmShell
  const swarm = ctx.swarm
  const render = (sel: ReturnType<typeof shell.selection>, url: string): string => {
    const r = sel.room
    const tiles = Array.from({ length: RANGES }, (_, i) => {
      const st = stateAt(r, i)
      const cls = `chunk${st === 'v' ? ' done' : st === 'f' ? ' pending' : ''}${sel.range === i ? ' sel' : ''}${st === 'm' && availability(r, i) === 0 ? ' rare' : ''}`
      return `<a class="${cls}" data-range="${String(i)}" href="${shell.hrefFor('/', { room: r.id, range: i })}" title="Range ${rangeLabel(i)}" aria-label="Range ${rangeLabel(i)}: ${st === 'v' ? 'verified' : st === 'f' ? 'in flight' : 'not received'}"></a>`
    }).join('')
    let detail = ''
    if (sel.range !== undefined) {
      const i = sel.range
      const [a, b] = span(i)
      const st = stateAt(r, i)
      const have = r.peers.filter((p) => holds(r, p, i))
      detail = `<div class="kv col2" id="range"><b>Range ${rangeLabel(i)} · chunks ${String(a)}–${String(b)}</b><span class="muted">${st === 'v' ? 'Verified locally' : st === 'f' ? 'In flight' : 'Not received'} · SHA-256 fixture ${escapeHtml(rangeHash(r, i).slice(0, 16))}…</span><span class="muted">${have.length === 0 ? 'No connected peer holds this range.' : `Held by ${have.map((p) => escapeHtml(p.id)).join(', ')}`} · ${String(availability(r, i))} can send it now</span></div>`
    }
    const base = `/rooms/${encodeURIComponent(r.id)}`
    const post = (action: string, label: string, cls: string, id: string) => `<form method="post" action="${shell.href(`${base}/${action}`)}">${shell.hidden(sel)}<button class="btn ${cls}" id="${id}" type="submit">${label}</button></form>`
    const done = r.completedAt !== undefined
    return `<section class="panel"><h2>Chunk availability</h2><div class="muted">Each tile represents one range of the manifest. Green means verified locally.</div><div class="chunks" id="chunks">${tiles}</div><div class="legend"><span><i style="background:var(--accent)"></i>Verified</span><span><i style="background:var(--warn)"></i>In flight</span><span><i style="background:var(--chunk)"></i>Not received</span><span><i style="box-shadow:inset 0 0 0 2px var(--err)"></i>No peer has it</span></div>${detail}<div class="controls">${done ? '' : post('pause', r.paused ? '▶ Resume transfer' : 'Ⅱ Pause transfer', 'green', 'pause')}${done ? '' : post('advance', 'Advance simulation', '', 'advance')}${post('verify', 'Run integrity check', '', 'verify')}</div>${shell.notice(url)}</section>`
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
    .post('/rooms/:id/pause', async (c) => {
      const id = c.req.param('id')
      return go(c, id, async () => ((await swarm.setPaused(id, !swarm.room(id).paused)).paused ? 'Transfer paused locally.' : 'Transfer resumed in local simulation.'))
    })
    .post('/rooms/:id/advance', async (c) => {
      const id = c.req.param('id')
      return go(c, id, async () => {
        const r = await swarm.advance(id)
        if (r.complete) return 'Transfer complete. Run the integrity check to get the receipt.'
        if (r.stalled) return 'Stalled: no connected peer holds the remaining ranges. Add a peer.'
        return `Step done: ${String(r.verified.length)} verified, ${String(r.started.length)} requested${r.failed.length === 0 ? '' : `, ${String(r.failed.length)} failed verification and will be requested again`}.`
      })
    })
    .post('/rooms/:id/verify', async (c) => {
      const id = c.req.param('id')
      return go(c, id, async () => {
        const check = await swarm.verify(id)
        return check.result === 'passed' ? `Integrity check complete: ${check.detail}` : `Integrity check ${check.result}: ${check.detail}`
      })
    })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  ctx.effect(() => shell.side({ id: 'chunks', column: 'main', order: 10, render }))
}
