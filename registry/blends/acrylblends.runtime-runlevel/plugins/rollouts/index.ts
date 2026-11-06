/**
 * Rollout history (`/rollouts`): past and draft rollouts, and the form that prepares one: a process and a target runtime version, checked against the
 * compatibility rules (blocked or not-newer targets are refused; a review verdict is allowed and leaves the process degraded until restarted). A
 * draft is run, discarded, or (once succeeded) rolled back.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { backTo, escapeHtml, fieldOf, runErrorOf, withNotice } from '../run-shell/index.ts'
import { ROLLOUT_LABEL, ruleFor, whenLabel } from '../runlevel/index.ts'

export const name = 'rollouts'
export const inject = ['router', 'desk', 'runShell']

function pageFor(ctx: Context, url: string): string {
  const shell = ctx.runShell
  const desk = ctx.desk
  const sel = shell.selection(url)
  const query = new URL(url, 'http://local').searchParams
  const open = query.get('prepare') === '1'
  const now = desk.now()
  const back = shell.hrefFor('/rollouts', { hostId: sel.host.id })
  const form = (id: string, action: string, label: string) =>
    `<form class="inline" method="post" action="${shell.href(`/rollouts/${encodeURIComponent(id)}/${action}`)}"><input type="hidden" name="back" value="${escapeHtml(back)}"><button class="btn small" type="submit">${label}</button></form>`
  const events = desk
    .rollouts()
    .map((r) => {
      const tone = r.state === 'succeeded' ? 'good' : r.state === 'rolled-back' ? 'warn' : 'muted'
      const actions = r.state === 'draft' ? `${form(r.id, 'run', 'Run rollout')} ${form(r.id, 'discard', 'Discard')}` : r.state === 'succeeded' ? form(r.id, 'rollback', 'Roll back') : ''
      return `<div class="event" data-rollout="${escapeHtml(r.id)}"><small>${escapeHtml(whenLabel(r.at, now))}</small><div><b>${escapeHtml(r.family)} ${escapeHtml(r.version)}</b><br><small>${escapeHtml(r.processId)} · ${escapeHtml(r.hostId)} · from ${escapeHtml(r.from)}</small></div><span><span class="${tone}">${ROLLOUT_LABEL[r.state]}</span> ${actions}</span></div>`
    })
    .join('')
  const options = desk.state.processes.map((p) => `<option value="${escapeHtml(p.id)}"${p.id === (query.get('process') ?? sel.process?.id) ? ' selected' : ''}>${escapeHtml(p.name)} · ${escapeHtml(p.family)} ${escapeHtml(p.version)} · ${escapeHtml(p.hostId)}</option>`).join('')
  const main = `<div id="tab-history"><div class="sectiontitle">Recent rollouts</div>
<form class="form" id="prepare" method="post" action="${shell.href('/rollouts')}"${open ? '' : ' hidden'}><input type="hidden" name="back" value="${escapeHtml(back)}"><label class="field">Process<select class="input" name="processId">${options}</select></label><label class="field">Target version<input class="input" name="version" placeholder="22.12.0" required maxlength="20" value="${escapeHtml(query.get('version') ?? '')}"></label><button class="btn primary" type="submit">Prepare rollout draft</button></form>
<div class="history">${events === '' ? '<div class="empty">No rollouts yet.</div>' : events}</div></div>`
  return shell.page({ active: 'rollouts', title: 'Rollout history', main, url })
}

export function apply(ctx: Context): void {
  const shell = ctx.runShell
  const desk = ctx.desk
  const refused = (c: { redirect(url: string, status: 303): Response }, to: string, error: unknown) => {
    const refusal = runErrorOf(error)
    if (refusal === undefined) throw error
    return c.redirect(withNotice(to, 'error', refusal.message), 303)
  }
  const app = new Acryl().get('/rollouts', (c) => c.html(pageFor(ctx, c.req.url))).post('/rollouts', async (c) => {
    const body = (await c.req.parseBody()) as Record<string, unknown>
    const to = backTo(shell, fieldOf(body, 'back'), shell.href('/rollouts'))
    const processId = fieldOf(body, 'processId') ?? ''
    const version = fieldOf(body, 'version')
    try {
      const r = await desk.prepareRollout(processId, version)
      const process = desk.process(processId)
      const verdict = ruleFor(desk.state.rules, process, r.version)?.verdict
      return c.redirect(withNotice(to, 'ok', `Rollout draft created locally: ${process.name} ${r.from} → ${r.version}${verdict === 'review' ? ' (compatibility needs review)' : ''}.`), 303)
    } catch (error) {
      const [path = to] = to.split('#')
      const draft = new URL(path, 'http://local')
      draft.searchParams.set('prepare', '1')
      draft.searchParams.set('process', processId)
      draft.searchParams.set('version', version ?? '')
      return refused(c, `${draft.pathname}${draft.search}#prepare`, error)
    }
  })
  for (const action of ['run', 'rollback', 'discard'] as const) {
    app.post(`/rollouts/:id/${action}`, async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      const id = c.req.param('id')
      const to = backTo(shell, fieldOf(body, 'back'), shell.href('/rollouts'))
      try {
        if (action === 'run') {
          const r = await desk.runRollout(id)
          return c.redirect(withNotice(to, 'ok', `${r.processId} rolled out to ${r.version}.`), 303)
        }
        if (action === 'rollback') {
          const r = await desk.rollBack(id)
          return c.redirect(withNotice(to, 'ok', `${r.processId} rolled back to ${r.from}.`), 303)
        }
        await desk.discardRollout(id)
        return c.redirect(withNotice(to, 'ok', 'Rollout draft discarded.'), 303)
      } catch (error) {
        return refused(c, to, error)
      }
    })
  }
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  ctx.effect(() => shell.tab({ id: 'rollouts', label: 'Rollout history', path: '/rollouts', order: 30 }))
}
