/** Response inspector (right column): the last response (status, timing, JSON body, headers) from the local fixture API, and "Reset fixtures". */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { escapeHtml, highlight, withNotice } from '../orbit-shell/index.ts'
import type {} from '../orbit/index.ts'

export const name = 'response'
export const inject = ['router', 'orbit', 'orbitShell']

export function apply(ctx: Context): void {
  const shell = ctx.orbitShell
  const orbit = ctx.orbit
  const render = (endpoint: ReturnType<typeof shell.endpointOf>): string => {
    const last = orbit.state.last
    const tone = last === undefined ? '' : last.status < 400 ? 'status-ok' : 'status-bad'
    const body = last === undefined ? '// Send a test request to inspect\n// the example response payload.' : highlight(last.body)
    return `<div class="cap">Response <span class="${tone || 'muted'}" id="resstatus">${last === undefined ? '—' : `${String(last.status)} ${escapeHtml(last.statusText)}`}</span></div><div class="response"><div class="responsebar"><span id="reslabel">${last === undefined ? 'No request sent' : `${last.method} ${escapeHtml(last.path)}`}</span><span class="muted" id="restime">${last === undefined ? '—' : `${String(last.ms)} ms · fixture`}</span></div>
<pre class="code" id="result" style="min-height:265px">${last === undefined ? escapeHtml(body) : body}</pre>
<div style="margin-top:13px;font-size:11px;color:var(--muted);text-transform:uppercase">Response headers</div>
<pre class="code" style="min-height:80px;padding:10px">${last === undefined ? 'content-type: application/json\nx-request-id: —' : `content-type: application/json\nx-request-id: ${escapeHtml(last.requestId)}`}</pre>
<form method="post" action="${shell.href('/reset')}" style="margin-top:12px"><input type="hidden" name="endpoint" value="${escapeHtml(endpoint.id)}"><button class="btn small" type="submit">Reset fixtures</button></form></div>`
  }
  const app = new Acryl().post('/reset', async (c) => {
    const body = (await c.req.parseBody()) as Record<string, unknown>
    const id = typeof body.endpoint === 'string' ? body.endpoint : ''
    await orbit.reset()
    return c.redirect(withNotice(shell.hrefFor('/', id), 'ok', 'Fixture data and the last response were reset.'), 303)
  })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  ctx.effect(() => shell.side({ id: 'response', column: 'right', order: 10, render }))
}
