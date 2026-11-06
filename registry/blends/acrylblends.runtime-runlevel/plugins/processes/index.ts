/**
 * Processes, the first tab (`/`): the selected host's managed processes with runtime, version, status and Restart. A restart is a state machine:
 * Running, Restarting, back to Running; "Complete restart" is the local confirmation. On the frame's home page it shows the degraded processes.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type {} from '../home/index.ts'
import { backTo, escapeHtml, fieldOf, runErrorOf, withNotice } from '../run-shell/index.ts'
import { STATUS_LABEL } from '../runlevel/index.ts'

export const name = 'processes'
export const inject = ['router', 'desk', 'runShell', 'home']

const BADGE: Record<string, string> = { running: 'badge', degraded: 'badge yellow', restarting: 'badge yellow', stopped: 'badge red' }

function pageFor(ctx: Context, url: string): string {
  const shell = ctx.runShell
  const desk = ctx.desk
  const sel = shell.selection(url)
  const back = shell.hrefFor('/', { hostId: sel.host.id, ...(sel.process === undefined ? {} : { processId: sel.process.id }) })
  const form = (id: string, action: string, label: string) =>
    `<form class="inline" method="post" action="${shell.href(`/processes/${encodeURIComponent(id)}/${action}`)}"><input type="hidden" name="back" value="${escapeHtml(back)}"><button class="btn small" type="submit" data-action="${action}">${label}</button></form>`
  const rows = desk
    .processes(sel.host.id)
    .map((p) => {
      const action = p.status === 'restarting' ? form(p.id, 'complete', 'Complete restart') : form(p.id, 'restart', 'Restart')
      const selected = sel.process?.id === p.id
      return `<tr data-process="${escapeHtml(p.id)}"${selected ? ' aria-current="true"' : ''}><td><a href="${shell.hrefFor('/', { hostId: sel.host.id, processId: p.id })}"><b>${escapeHtml(p.name)}</b></a></td><td>${escapeHtml(p.family)}</td><td>${escapeHtml(p.version)}</td><td><span class="${BADGE[p.status] ?? 'badge'}">${STATUS_LABEL[p.status]}</span>${p.restarts > 0 ? ` <small class="muted">${String(p.restarts)}×</small>` : ''}</td><td>${action}</td></tr>`
    })
    .join('')
  const events = desk
    .events(4)
    .map((e) => `<div class="event" style="grid-template-columns:1fr"><span>${escapeHtml(e.text)}</span></div>`)
    .join('')
  const main = `<div id="tab-processes"><div class="sectiontitle">Managed ${sel.host.kind === 'module' ? 'modules' : 'processes'}</div>
<div class="scroll"><table class="table"><thead><tr><th scope="col">${sel.host.kind === 'module' ? 'Module' : 'Process'}</th><th scope="col">Runtime</th><th scope="col">Version</th><th scope="col">Status</th><th scope="col">Action</th></tr></thead><tbody>${rows}</tbody></table></div>
<div class="sectiontitle">Lifecycle log</div>${events === '' ? '<div class="empty">Nothing yet.</div>' : events}</div>`
  return shell.page({ active: 'processes', title: `${sel.host.id} processes`, main, url })
}

export function apply(ctx: Context): void {
  const shell = ctx.runShell
  const desk = ctx.desk
  const handle = (action: 'restart' | 'complete') =>
    async (c: { req: { param(n: string): string; parseBody(): Promise<Record<string, unknown>> }; redirect(url: string, status: 303): Response }) => {
      const body = await c.req.parseBody()
      const id = c.req.param('id')
      const to = backTo(shell, fieldOf(body, 'back'), shell.href('/'))
      try {
        const p = action === 'restart' ? await desk.restart(id) : await desk.finishRestart(id)
        return c.redirect(withNotice(to, 'ok', action === 'restart' ? `Restart requested for ${p.name} (simulation only).` : `${p.name} restarted and healthy.`), 303)
      } catch (error) {
        const refusal = runErrorOf(error)
        if (refusal === undefined) throw error
        return c.redirect(withNotice(to, 'error', refusal.message), 303)
      }
    }
  const app = new Acryl().get('/', (c) => c.html(pageFor(ctx, c.req.url))).post('/processes/:id/restart', handle('restart')).post('/processes/:id/complete', handle('complete'))
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  if (shell.prefix !== '') ctx.router.route('/', new Acryl().get(`${shell.prefix}/`, (c) => c.html(pageFor(ctx, c.req.url))))
  ctx.effect(() => shell.tab({ id: 'processes', label: 'Processes', path: '/', order: 10 }))
  ctx.effect(() =>
    ctx.home.widget({
      id: 'processes',
      title: 'Runtime desk',
      render: () => {
        const sick = desk.state.processes.filter((p) => p.status !== 'running')
        return `<p><b>${String(desk.state.processes.length)}</b> managed processes on ${String(desk.state.hosts.length)} hosts</p>${sick.length === 0 ? '<p>All running.</p>' : `<ul>${sick.map((p) => `<li>${escapeHtml(p.name)} · ${STATUS_LABEL[p.status]}</li>`).join('')}</ul>`}`
      },
    }),
  )
}
