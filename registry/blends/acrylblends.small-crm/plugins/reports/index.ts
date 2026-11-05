/**
 * The pipeline report: value and weighted value per stage, open pipeline per owner (unassigned included), win rate and average deal size.
 *
 * Routes (under the shell's prefix): GET /reports.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'

export const name = 'reports'
export const inject = ['crm', 'shell', 'router']

export function apply(ctx: Context): void {
  const { crm, shell } = ctx
  const { euro } = crm.kit
  const e = shell.e
  const prefix = shell.prefix

  const app = new Acryl().get('/reports', (c) => {
    const r = crm.report()
    const top = Math.max(1, ...r.stages.map((s) => s.value))
    const stages = r.stages.map((s) => `<tr><td>${e(s.label)}</td><td>${s.count}</td><td>${euro(s.value)}</td><td>${euro(s.weighted)}</td><td style="width:35%"><div class="bar"><i style="width:${Math.round((s.value / top) * 100)}%"></i></div></td></tr>`).join('')
    const owners = r.byOwner.map((o) => `<tr><td><div class="who">${shell.avatar(o.owner ?? undefined)}<span>${o.owner === null ? 'Unassigned' : e(o.owner.name)}</span></div></td><td>${o.count}</td><td>${euro(o.value)}</td></tr>`).join('')
    const main = `${shell.header({ eyebrow: 'Sales / Reports', title: 'Pipeline report', lead: 'Where the value sits, and who carries it.' })}<div class="totals"><div><span class="kicker">Open pipeline</span><b>${euro(r.open.value)}</b></div><div><span class="kicker">Weighted</span><b>${euro(r.open.weighted)}</b></div><div><span class="kicker">Win rate</span><b class="green">${r.winRate === null ? 'n/a' : `${r.winRate}%`}</b></div><div><span class="kicker">Average deal</span><b>${r.averageDeal === null ? 'n/a' : euro(r.averageDeal)}</b></div></div><section class="panel"><h2>By stage</h2><table><thead><tr><th>Stage</th><th>Deals</th><th>Value</th><th>Weighted</th><th></th></tr></thead><tbody>${stages}</tbody></table></section><section class="panel"><h2>Open pipeline by owner</h2><table><thead><tr><th>Owner</th><th>Deals</th><th>Value</th></tr></thead><tbody>${owners}</tbody></table></section>`
    return c.html(shell.page({ active: 'reports', title: 'Pipeline report', main }))
  })

  ctx.router.route(prefix === '' ? '/' : prefix, app)
  ctx.effect(() => shell.nav({ id: 'reports', label: 'Reports', icon: '▤', path: '/reports', order: 50 }))
}
