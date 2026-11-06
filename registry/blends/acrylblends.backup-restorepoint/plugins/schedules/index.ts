/** Backup schedules (`/schedules`): every workload's backup jobs with their schedule and last run; a job can be paused or resumed, which can put the RPO target at risk. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { rpoMet, whenLabel } from '../restorepoint/index.ts'
import { escapeHtml, opsErrorOf, withNotice } from '../ops-shell/index.ts'

export const name = 'schedules'
export const inject = ['router', 'ops', 'opsShell']

export function apply(ctx: Context): void {
  const shell = ctx.opsShell
  const ops = ctx.ops
  const pageFor = (url: string): string => {
    const sel = shell.selection(url)
    const panels = ops.state.workloads
      .map((w) => {
        const jobs = w.jobs
          .map((j) => `<div class="job" data-job="${escapeHtml(j.id)}"><div>${escapeHtml(j.name)} <small>${escapeHtml(j.schedule)} · last ${escapeHtml(whenLabel(j.lastAt, ops.now()))} · ${escapeHtml(j.lastSize)}</small></div><div><span class="${!j.enabled ? 'muted' : j.status === 'completed' ? 'ok' : j.status === 'lag' ? 'warn' : 'err'}">${!j.enabled ? 'Paused' : j.status === 'completed' ? 'Completed' : (j.note ?? j.status)}</span> <form method="post" action="${shell.href(`/schedules/${encodeURIComponent(w.id)}/${encodeURIComponent(j.id)}/${j.enabled ? 'pause' : 'resume'}`)}" style="display:inline">${shell.hidden({ ...sel, workload: w })}<button class="btn small" type="submit">${j.enabled ? 'Pause' : 'Resume'}</button></form></div></div>`)
          .join('')
        const met = rpoMet(w)
        return `<div class="panel" data-workload="${escapeHtml(w.id)}"><h2>${escapeHtml(w.name)}</h2><div class="sub">RPO target ${String(w.rpoMin)} min · <span class="${met ? 'ok' : 'warn'}">${met ? 'met by the schedule' : 'at risk: schedule paused'}</span></div>${jobs}</div>`
      })
      .join('')
    const main = `<header class="top"><div><div class="crumb">Operations / Backup schedules</div><h1>Backup schedules</h1></div></header>${panels}${shell.notice(url).replace('No restore operation started.', 'Pausing a schedule changes this local demo only.')}`
    return shell.page({ title: 'Backup schedules', main, url, current: 'schedules' })
  }
  const app = new Acryl()
    .get('/schedules', (c) => c.html(pageFor(c.req.url)))
    .post('/schedules/:w/:job/:action', async (c) => {
      const id = c.req.param('w')
      const to = shell.hrefFor('/schedules', { workload: id })
      const action = c.req.param('action')
      try {
        if (action !== 'pause' && action !== 'resume') throw new Error('unknown action')
        const w = await ops.setJobEnabled(id, c.req.param('job'), action === 'resume')
        return c.redirect(withNotice(to, 'ok', `Job ${action === 'resume' ? 'resumed' : 'paused'}${rpoMet(w) ? '.' : '; the RPO target is now at risk.'}`), 303)
      } catch (error) {
        const refusal = opsErrorOf(error)
        if (refusal === undefined) return c.redirect(withNotice(to, 'error', 'Pick pause or resume.'), 303)
        return c.redirect(withNotice(to, 'error', refusal.message), 303)
      }
    })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  ctx.effect(() => shell.nav({ id: 'schedules', label: 'Backup schedules', icon: '◷', path: '/schedules', order: 10 }))
}
