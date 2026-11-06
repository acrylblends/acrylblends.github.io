/** Route registry (left column): every route with its upstream and traffic, picking one selects it everywhere (`?route=`); "Add route" registers one with the default policy. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { escapeHtml, fieldOf, gateErrorOf, withNotice } from '../gate-shell/index.ts'
import { METHODS, compact, label } from '../gatehouse/index.ts'

export const name = 'routes'
export const inject = ['router', 'gate', 'gateShell']

export function apply(ctx: Context): void {
  const shell = ctx.gateShell
  const gate = ctx.gate
  const render = (selected: ReturnType<typeof shell.selected>, url: string): string => {
    const open = new URL(url, 'http://local').searchParams.get('add') === '1'
    const rows = gate.state.routes
      .map((r) => `<a class="route${r.id === selected.id ? ' active' : ''}" href="${shell.hrefFor('/', r)}"${r.id === selected.id ? ' aria-current="true"' : ''} data-route="${escapeHtml(r.id)}"><b>${escapeHtml(label(r))}</b><small>${escapeHtml(r.policy.upstreamId)} · ${compact(r.reqPerMin)} req/min</small></a>`)
      .join('')
    const upstreams = gate.state.upstreams.map((u) => `<option value="${escapeHtml(u.id)}">${escapeHtml(u.id)}</option>`).join('')
    const methods = METHODS.map((m) => `<option>${m}</option>`).join('')
    return `<div class="cap">Route registry <span class="status">${String(gate.state.routes.length)} routes</span></div><div class="routes" id="routes">${rows}</div>
<form class="routes" id="add-route" method="post" action="${shell.href('/routes')}"${open ? '' : ' hidden'}><div class="field"><label class="l" for="method">Method</label><select id="method" name="method">${methods}</select></div><div class="field"><label class="l" for="path">Path</label><input id="path" type="text" name="path" placeholder="/v1/refunds" required maxlength="100"></div><div class="field"><label class="l" for="upstreamId">Upstream</label><select id="upstreamId" name="upstreamId">${upstreams}</select></div><div class="field"><label class="l" for="timeoutMs">Timeout (ms)</label><input id="timeoutMs" type="number" name="timeoutMs" value="2500" min="10" max="60000"></div><button class="primary" type="submit">Register route</button></form>`
  }
  const app = new Acryl().post('/routes', async (c) => {
    const body = (await c.req.parseBody()) as Record<string, unknown>
    const fields = Object.fromEntries(['method', 'path', 'upstreamId', 'timeoutMs'].map((k) => [k, fieldOf(body, k)]))
    try {
      const route = await gate.addRoute(fields)
      return c.redirect(withNotice(shell.hrefFor('/', route), 'ok', `${label(route)} registered with the default policy.`), 303)
    } catch (error) {
      const refusal = gateErrorOf(error)
      if (refusal === undefined) throw error
      return c.redirect(withNotice(`${shell.href('/')}?add=1#add-route`, 'error', refusal.message), 303)
    }
  })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  ctx.effect(() => shell.side({ id: 'routes', column: 'left', order: 10, render }))
}
