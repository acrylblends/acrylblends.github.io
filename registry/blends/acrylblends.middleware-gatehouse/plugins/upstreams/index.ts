/** Upstream services (left column, under the routes): address and latency, and a switch that marks a service down so the pipeline can be seen failing. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { escapeHtml, fieldOf, gateErrorOf, withNotice } from '../gate-shell/index.ts'
import type {} from '../gatehouse/index.ts'

export const name = 'upstreams'
export const inject = ['router', 'gate', 'gateShell']


export function apply(ctx: Context): void {
  const shell = ctx.gateShell
  const gate = ctx.gate
  const render = (selected: ReturnType<typeof shell.selected>): string => {
    const rows = gate.state.upstreams
      .map(
        (u) =>
          `<div class="route${u.up ? '' : ' down'}" data-upstream="${escapeHtml(u.id)}"><b>${u.up ? '●' : '○'} ${escapeHtml(u.id)}</b><small>${escapeHtml(u.address)} · ${u.up ? `${String(u.latencyMs)} ms` : 'unreachable'}</small><form method="post" action="${shell.href(`/upstreams/${encodeURIComponent(u.id)}/${u.up ? 'down' : 'up'}`)}" style="margin-top:6px"><input type="hidden" name="route" value="${escapeHtml(selected.id)}"><button class="small" type="submit">Mark ${u.up ? 'down' : 'up'}</button></form></div>`,
      )
      .join('')
    return `<div class="cap">Upstream services</div><div class="routes">${rows}</div>`
  }
  const app = new Acryl()
  for (const state of ['up', 'down'] as const) {
    app.post(`/upstreams/:id/${state}`, async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      const route = fieldOf(body, 'route')
      const to = route === undefined ? shell.href('/') : `${shell.href('/')}?route=${encodeURIComponent(route)}`
      try {
        await gate.setUpstream(c.req.param('id'), state === 'up')
        return c.redirect(withNotice(to, 'ok', `${c.req.param('id')} is marked ${state}.`), 303)
      } catch (error) {
        const refusal = gateErrorOf(error)
        if (refusal === undefined) throw error
        return c.redirect(withNotice(to, 'error', refusal.message), 303)
      }
    })
  }
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  ctx.effect(() => shell.side({ id: 'upstreams', column: 'left', order: 20, render }))
}
