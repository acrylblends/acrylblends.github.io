/** Retention policies (`/retention`): per workload, how many daily, weekly and monthly points are kept and the RPO target, with the days the policy reaches back. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { horizonDays } from '../restorepoint/index.ts'
import { escapeHtml, fieldOf, opsErrorOf, withNotice } from '../ops-shell/index.ts'

export const name = 'retention'
export const inject = ['router', 'ops', 'opsShell']

export function apply(ctx: Context): void {
  const shell = ctx.opsShell
  const ops = ctx.ops
  const pageFor = (url: string): string => {
    const sel = shell.selection(url)
    const rows = ops.state.workloads
      .map((w) => {
        const f = `f-${w.id}`
        const num = (n: string, v: number, label: string, max: number) => `<input form="${f}" name="${n}" type="number" min="0" max="${String(max)}" value="${String(v)}" aria-label="${escapeHtml(w.name)} ${label}">`
        return `<tr data-workload="${escapeHtml(w.id)}"><td><b>${escapeHtml(w.name)}</b></td><td>${num('daily', w.retention.daily, 'daily points', 90)}</td><td>${num('weekly', w.retention.weekly, 'weekly points', 52)}</td><td>${num('monthly', w.retention.monthly, 'monthly points', 36)}</td><td><input form="${f}" name="rpo" type="number" min="5" max="1440" value="${String(w.rpoMin)}" aria-label="${escapeHtml(w.name)} RPO in minutes"></td><td class="muted">${String(horizonDays(w.retention))} days</td><td><form id="${f}" method="post" action="${shell.href(`/retention/${encodeURIComponent(w.id)}`)}">${shell.hidden({ ...sel, workload: w })}<button class="btn small" type="submit">Save</button></form></td></tr>`
      })
      .join('')
    const main = `<header class="top"><div><div class="crumb">Operations / Retention policies</div><h1>Retention policies</h1></div></header><div class="panel"><h2>Points kept per workload</h2><div class="sub">Daily, weekly and monthly points to keep, and the RPO target in minutes. The horizon is the days the policy reaches back.</div><div class="tablewrap"><table><thead><tr><th>Workload</th><th>Daily</th><th>Weekly</th><th>Monthly</th><th>RPO (min)</th><th>Horizon</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>${shell.notice(url).replace('No restore operation started.', 'Changes are saved to this local demo.')}<div class="note">Demo only. Changing a policy deletes nothing: no backup data exists here.</div></div>`
    return shell.page({ title: 'Retention policies', main, url, current: 'retention' })
  }
  const app = new Acryl()
    .get('/retention', (c) => c.html(pageFor(c.req.url)))
    .post('/retention/:id', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      const id = c.req.param('id')
      const to = shell.hrefFor('/retention', { workload: id })
      try {
        const w = await ops.setRetention(id, { daily: fieldOf(body, 'daily'), weekly: fieldOf(body, 'weekly'), monthly: fieldOf(body, 'monthly'), rpo: fieldOf(body, 'rpo') })
        return c.redirect(withNotice(to, 'ok', `Retention policy saved for ${w.name}.`), 303)
      } catch (error) {
        const refusal = opsErrorOf(error)
        if (refusal === undefined) throw error
        return c.redirect(withNotice(to, 'error', refusal.message), 303)
      }
    })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  ctx.effect(() => shell.nav({ id: 'retention', label: 'Retention policies', icon: '▧', path: '/retention', order: 20 }))
}
