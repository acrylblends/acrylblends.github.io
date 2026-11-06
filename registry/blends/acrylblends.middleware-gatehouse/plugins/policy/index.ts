/**
 * Route policy (right column): the selected route's upstream target, timeout, rate limit and middleware layers as a draft. "Save route policy" keeps
 * the draft, "Apply to pipeline" makes it the policy in force, and "Discard draft" drops it. The pipeline only changes on apply.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { escapeHtml, fieldOf, gateErrorOf, withNotice } from '../gate-shell/index.ts'
import { LAYER_LABEL, type Layers, label } from '../gatehouse/index.ts'

export const name = 'policy'
export const inject = ['router', 'gate', 'gateShell']

export function apply(ctx: Context): void {
  const shell = ctx.gateShell
  const gate = ctx.gate
  const render = (route: ReturnType<typeof shell.selected>): string => {
    const p = gate.editing(route)
    const options = gate.state.upstreams.map((u) => `<option value="${escapeHtml(u.id)}"${u.id === p.upstreamId ? ' selected' : ''}>${escapeHtml(u.id)}</option>`).join('')
    const toggles = (Object.keys(LAYER_LABEL) as (keyof Layers)[])
      .map((k) => `<label class="toggle">${LAYER_LABEL[k]} <input type="checkbox" name="${k}"${p.layers[k] ? ' checked' : ''}></label>`)
      .join('')
    const pending = gate.hasPendingDraft(route)
    const id = encodeURIComponent(route.id)
    return `<div class="cap">Route policy ${route.draft === undefined ? '' : `<span class="pill warn">${pending ? 'DRAFT' : 'DRAFT = ACTIVE'}</span>`}</div>
<form class="inspector" method="post" action="${shell.href(`/routes/${id}/draft`)}"><h2 id="inspect">${escapeHtml(label(route))}</h2><div class="status">Route ID · ${escapeHtml(route.id)}</div>
<div class="field"><label class="l" for="target">Upstream target</label><select id="target" name="upstreamId">${options}</select></div>
<div class="field"><label class="l" for="timeout">Timeout (ms)</label><input id="timeout" name="timeoutMs" type="number" min="10" max="60000" value="${String(p.timeoutMs)}"></div>
<div class="field"><label class="l" for="rate">Rate limit (requests / min)</label><input id="rate" name="rateLimitPerMin" type="number" min="1" max="100000" value="${String(p.rateLimitPerMin)}"></div>
<div class="field"><span class="l" style="display:block;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.7px;margin-bottom:6px">Middleware layers</span>${toggles}</div>
<button class="primary" style="width:100%" id="save" type="submit">Save route policy</button></form>
<div class="inspector" style="padding-top:0"><div class="row">${pending ? `<form method="post" action="${shell.href(`/routes/${id}/apply`)}"><button class="small" id="apply" type="submit">Apply to pipeline</button></form>` : ''}${route.draft === undefined ? '' : `<form method="post" action="${shell.href(`/routes/${id}/discard`)}"><button class="small" type="submit">Discard draft</button></form>`}</div></div>`
  }
  const refused = (c: { redirect(url: string, status: 303): Response }, to: string, error: unknown) => {
    const refusal = gateErrorOf(error)
    if (refusal === undefined) throw error
    return c.redirect(withNotice(to, 'error', refusal.message), 303)
  }
  const at = (id: string) => `${shell.href('/')}?route=${encodeURIComponent(id)}`
  const app = new Acryl()
    .post('/routes/:id/draft', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      const id = c.req.param('id')
      const fields = Object.fromEntries(['upstreamId', 'timeoutMs', 'rateLimitPerMin', 'jwt', 'rateLimit', 'logging', 'cache'].map((k) => [k, fieldOf(body, k)]))
      try {
        const route = await gate.saveDraft(id, fields)
        return c.redirect(withNotice(at(id), 'ok', gate.hasPendingDraft(route) ? 'Route policy saved to the local draft. Apply it to change the pipeline.' : 'Route policy saved; it matches the active policy.'), 303)
      } catch (error) {
        return refused(c, at(id), error)
      }
    })
    .post('/routes/:id/apply', async (c) => {
      const id = c.req.param('id')
      try {
        const route = await gate.applyDraft(id)
        return c.redirect(withNotice(at(id), 'ok', `${label(route)} now runs the new policy.`), 303)
      } catch (error) {
        return refused(c, at(id), error)
      }
    })
    .post('/routes/:id/discard', async (c) => {
      const id = c.req.param('id')
      try {
        await gate.discardDraft(id)
        return c.redirect(withNotice(at(id), 'ok', 'Draft discarded.'), 303)
      } catch (error) {
        return refused(c, at(id), error)
      }
    })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  ctx.effect(() => shell.side({ id: 'policy', column: 'right', order: 10, render }))
}
