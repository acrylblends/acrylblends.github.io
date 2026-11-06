/**
 * The request pipeline, the first page (`/`): the selected route's ordered middleware (from the policy in force), a note when a draft is pending, the
 * recent request traces and "Run test request", which simulates a request through the policy and records the trace.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type {} from '../home/index.ts'
import { escapeHtml, gateErrorOf, withNotice } from '../gate-shell/index.ts'
import { clockOf, label, pipelineOf } from '../gatehouse/index.ts'

export const name = 'pipeline'
export const inject = ['router', 'gate', 'gateShell', 'home']

function pageFor(ctx: Context, url: string): string {
  const shell = ctx.gateShell
  const gate = ctx.gate
  const route = shell.selected(url)
  const nodes = pipelineOf(route.policy)
    .map((n) => `<div class="node${n.active ? '' : ' off'}"><b>${escapeHtml(n.name)}</b><small>${escapeHtml(n.note)}</small></div>`)
    .join('<span class="arrow" aria-hidden="true">→</span>')
  const pending = gate.hasPendingDraft(route)
  const traces = gate
    .traces(route.id)
    .map((t) => {
      const tone = t.status >= 400 ? 'bad' : t.status !== 200 ? 'warn' : ''
      const time = Math.abs(gate.now().getTime() - new Date(t.at).getTime()) < 1000 && t.origin === 'test' ? 'now' : clockOf(t.at)
      return `<div class="traceRow" data-trace="${escapeHtml(t.id)}"><span class="time">${time}</span><span>${escapeHtml(t.summary)}</span><b class="code ${tone}">${String(t.status)} · ${String(t.ms)}ms</b></div>`
    })
    .join('')
  const main = `<div class="cap">Request pipeline ${pending ? '<span class="pill warn">DRAFT PENDING</span>' : '<span class="pill">ACTIVE CONFIG</span>'}</div>
<div class="pipeline"><div class="status">Selected route · <span id="path">${escapeHtml(label(route))}</span></div><div class="nodes">${nodes}</div>
<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><div><b>Recent request traces</b><div class="status">Synthetic traffic · last 5 minutes</div></div><form method="post" action="${shell.href(`/routes/${encodeURIComponent(route.id)}/trace`)}"><button id="trace" type="submit">Run test request</button></form></div></div>
<div class="trace" id="traces">${traces === '' ? '<div class="empty">No traces yet. Run a test request.</div>' : traces}</div>`
  return shell.page({ title: label(route), main, url })
}

export function apply(ctx: Context): void {
  const shell = ctx.gateShell
  const gate = ctx.gate
  const app = new Acryl().get('/', (c) => c.html(pageFor(ctx, c.req.url))).post('/routes/:id/trace', async (c) => {
    const id = c.req.param('id')
    const to = `${shell.href('/')}?route=${encodeURIComponent(id)}`
    try {
      const t = await gate.runTest(id)
      return c.redirect(withNotice(to, t.status < 400 ? 'ok' : 'error', `Synthetic request trace added: ${String(t.status)} in ${String(t.ms)} ms${t.status >= 400 ? ` (${t.summary.split(' · ').pop() ?? ''})` : ''}.`), 303)
    } catch (error) {
      const refusal = gateErrorOf(error)
      if (refusal === undefined) throw error
      return c.redirect(withNotice(shell.href('/'), 'error', refusal.message), 303)
    }
  })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  if (shell.prefix !== '') ctx.router.route('/', new Acryl().get(`${shell.prefix}/`, (c) => c.html(pageFor(ctx, c.req.url))))
  ctx.effect(() =>
    ctx.home.widget({
      id: 'pipeline',
      title: 'Gateway',
      render: () => `<p><b>${String(gate.state.routes.length)}</b> routes · <b>${String(gate.state.upstreams.filter((u) => u.up).length)}</b> of ${String(gate.state.upstreams.length)} upstreams up</p>`,
    }),
  )
}
