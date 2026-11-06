/**
 * The cost overview: month-to-date spend, the budget gauge, the forecast, the daily spend stacked by provider and the spend by service. It is the
 * app's first screen, so `/` is the same page.
 *
 * Routes (under the shell's prefix): GET /, GET /costs.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { euro, monthName, number, percent } from '../finops/index.ts'

export const name = 'overview'
export const inject = ['finops', 'shell', 'router']

const providerMark = (sourceType: string): string => (sourceType === 'aws' ? 'aws' : sourceType === 'gcp' ? 'G' : 'A')
const providerTint = (sourceType: string): string => (sourceType === 'aws' ? 'aws' : sourceType === 'gcp' ? 'gcp' : 'az')

export function apply(ctx: Context): void {
  const { finops, shell } = ctx
  const e = shell.e
  const prefix = shell.prefix

  const report = (): string => {
    const overview = finops.overview()
    const spend = overview.spend
    const previous = overview.services.reduce((total, service) => total + service.previous, 0)
    const change = previous === 0 ? undefined : ((spend.monthToDate - previous) / previous) * 100
    const month = monthName(overview.month)
    const providers = finops.providers().filter((provider) => provider.connected)
    const maxDay = Math.max(1, ...overview.days.map((day) => day.total))
    const bars = overview.days.map((day) => {
      const stack = providers.map((provider) => {
        const amount = day.byProvider.get(provider.id) ?? 0
        return `<i class="${providerTint(provider.sourceType)}" style="height:${String(Math.round((amount / maxDay) * 100))}%"></i>`
      }).join('')
      return `<div><span>${euro(day.total)}</span>${stack}<small>${new Date(`${day.day}T00:00:00`).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })}</small></div>`
    }).join('')
    const serviceRows = overview.services.map((service) => {
      const provider = finops.provider(service.providerId)
      const budget = finops.budgets().find((item) => item.scope !== 'all' && service.service.toLowerCase().includes(item.scope))
      const row = budget === undefined ? undefined : finops.budgetRows().find((item) => item.budget.id === budget.id)
      const pct = row === undefined || row.budget.limit === 0 ? 0 : Math.min(100, Math.round((service.amount / row.budget.limit) * 100))
      return `<tr><td><b>${e(service.service)}</b><small>${e(provider?.name ?? '')}</small></td><td><i class="${providerTint(provider?.sourceType ?? 'aws')}">${providerMark(provider?.sourceType ?? 'aws')}</i></td><td>${euro(service.amount)}</td><td class="${(service.change ?? 0) >= 0 ? 'rise' : 'fall'}">${service.change === undefined ? '—' : `${service.change >= 0 ? '↑' : '↓'} ${Math.abs(service.change).toFixed(1)}%`}</td><td>${row === undefined ? '—' : `<div class="f-progress${pct >= 90 ? ' warn' : ''}"><i style="width:${String(pct)}%"></i></div><small>${percent(100 * service.amount / Math.max(1, row.budget.limit), 0)} · ${euro(row.budget.limit)}</small>`}</td></tr>`
    }).join('')
    return `<header><div><small>FINANCE / COST OVERVIEW</small><h1>Cloud spend</h1><p>${e(month)} spend across connected providers.</p></div><div><a href="${shell.href('/explorer')}" style="background:white;border:1px solid var(--line);border-radius:4px;padding:8px 10px;font-size:8px;color:#677781;text-decoration:none">EUR ⌄</a> <a href="${shell.href('/costs')}" style="background:white;border:1px solid var(--line);border-radius:4px;padding:8px 10px;font-size:8px;color:#677781;text-decoration:none">This month ⌄</a></div></header><section class="f-hero"><div><small>MONTH-TO-DATE SPEND</small><b>${euro(spend.monthToDate)}</b>${change === undefined ? '' : `<span class="f-change">${change >= 0 ? '↑' : '↓'} ${Math.abs(change).toFixed(1)}% vs last month</span>`}<p>Projected month end <strong>${euro(spend.forecast)}</strong></p></div><div class="f-gauge" style="background:conic-gradient(#ed9a55 0 ${String(Math.min(100, Math.round(spend.usedPct)))}%, #3a4b55 ${String(Math.min(100, Math.round(spend.usedPct)))}% 100%)"><div><b>${percent(spend.usedPct, 0)}</b><small>OF ${euro(spend.budget)} BUDGET</small></div></div><div class="f-forecast"><small>FORECAST</small><b>${euro(spend.forecast)}</b><span style="color:${spend.over <= 0 ? '#8ec7a4' : '#edb07a'}">${spend.over <= 0 ? `${euro(Math.abs(spend.over))} under budget` : `${euro(spend.over)} over budget`}</span><div><i style="width:${String(Math.min(100, Math.round((spend.forecast / Math.max(1, spend.budget)) * 100)))}%"></i></div></div></section><div class="f-chart"><header><div><b>Daily cloud spend</b><small>Actual spend · EUR · ${e(month)}</small></div><div class="f-legend">${providers.map((provider) => `<i class="${providerTint(provider.sourceType)}-dot"></i>${e(provider.sourceType.toUpperCase())}`).join(' ')}</div></header><div class="f-stacked">${bars}</div></div><section class="f-breakdown"><header><b>Spend by service</b><a href="${shell.href('/explorer')}" style="color:#ad6a34;font-size:8px;text-decoration:none">View cost explorer ↗</a></header><table><thead><tr><th>SERVICE</th><th>PROVIDER</th><th>SPEND</th><th>VS LAST MONTH</th><th>BUDGET USED</th></tr></thead><tbody>${serviceRows}</tbody></table></section>`
  }

  const app = new Acryl()
    .get('/', (c) => c.html(shell.page({ active: 'overview', title: 'Cloud spend', crumbs: ['Finance', 'Cost overview'], main: report() })))
    .get('/costs', (c) => c.html(shell.page({ active: 'overview', title: 'Cloud spend', crumbs: ['Finance', 'Cost overview'], main: report() })))

  ctx.router.route(prefix === '' ? '/' : prefix, app)
  ctx.effect(() => shell.nav({ id: 'overview', label: 'Cost overview', icon: '◫', path: '/costs', order: 10 }))
}
