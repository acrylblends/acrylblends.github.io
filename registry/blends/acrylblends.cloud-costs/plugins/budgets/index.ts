/**
 * Budgets, alerts and allocation rules: the budget list with spend and forecast, the alert log and the rules that attribute services to teams.
 *
 * Routes (under the shell's prefix): GET /budgets, POST /budgets, GET /alerts, GET /allocation-rules, POST /allocation-rules.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { euro, FinopsError, number, percent, teamOf, whenText } from '../finops/index.ts'

export const name = 'budgets'
export const inject = ['finops', 'shell', 'router']

export function apply(ctx: Context): void {
  const { finops, shell } = ctx
  const e = shell.e
  const prefix = shell.prefix

  const budgets = (error?: string): string => {
    const rows = finops.budgetRows()
    const list = rows.map((row) => `<tr><td><b>${e(row.budget.name)}</b><small>${row.budget.scope === 'all' ? 'Every service' : `Services matching “${e(row.budget.scope)}”`}</small></td><td>${euro(row.spent)} of ${euro(row.budget.limit)}</td><td><div class="f-progress${row.pct >= row.budget.alertThreshold ? ' warn' : ''}"><i style="width:${String(Math.min(100, Math.round(row.pct)))}%"></i></div>${percent(row.pct)}</td><td>${euro(row.forecast)}</td><td><span class="f-badge ${row.atRisk ? 'duplicate' : 'imported'}">${row.atRisk ? 'at risk' : 'on track'}</span></td></tr>`).join('')
    return `<header><div><small>FINANCE / BUDGETS & ALERTS</small><h1>Budgets & alerts</h1><p>${String(rows.filter((row) => row.atRisk).length)} budgets forecast above their alert threshold.</p></div><a href="${shell.href('/alerts')}" style="border:1px solid var(--line);background:white;border-radius:4px;padding:8px 10px;font-size:8px;color:#677781;text-decoration:none">Alerts (${String(finops.alerts().filter((alert) => alert.status === 'open').length)}) ↗</a></header>${error === undefined ? '' : `<p class="notice error" role="alert">${e(error)}</p>`}<section class="f-section"><header><b>Monthly budgets</b><small>${e(finops.monthLabel)}</small></header><table><thead><tr><th>BUDGET</th><th>SPEND</th><th>USED</th><th>FORECAST</th><th>STATE</th></tr></thead><tbody>${list}</tbody></table></section><form class="f-form" method="post" action="${shell.href('/budgets')}"><h2>Add a budget</h2><p class="hint">A limit and the service it watches (or every service).</p><div class="row"><label>NAME<input name="name" required maxlength="60" placeholder="Data platform"></label><label>SERVICE<input name="scope" maxlength="60" placeholder="storage (empty: every service)"></label></div><div class="row"><label>LIMIT (EUR)<input name="limit" required inputmode="decimal" placeholder="8000"></label><label>ALERT THRESHOLD (%)<input name="alertThreshold" value="80" inputmode="numeric"></label></div><div class="actions"><button class="primary">Add budget</button></div></form>`
  }

  const alerts = (): string => {
    const rows = finops.alerts().map((alert) => {
      const budget = finops.budget(alert.budgetId)
      return `<tr><td><b>${e(budget?.name ?? 'Budget')}</b><small>${e(alert.note)}</small></td><td>${euro(alert.forecast)}</td><td><span class="f-badge ${alert.status === 'open' ? 'duplicate' : 'imported'}">${e(alert.status)}</span></td><td>${e(whenText(alert.triggeredAt, new Date()))}</td></tr>`
    }).join('')
    return `<header><div><small>FINANCE / ALERTS</small><h1>Alerts</h1><p>Budgets that reached their threshold or are forecast above their limit.</p></div><a href="${shell.href('/budgets')}" style="border:1px solid var(--line);background:white;border-radius:4px;padding:8px 10px;font-size:8px;color:#677781;text-decoration:none">Budgets ↗</a></header><section class="f-section"><header><b>Alert log</b><small>${String(finops.alerts().length)} alerts</small></header><table><thead><tr><th>ALERT</th><th>FORECAST</th><th>STATUS</th><th>WHEN</th></tr></thead><tbody>${rows === '' ? '<tr><td colspan="4">No alerts.</td></tr>' : rows}</tbody></table></section>`
  }

  const rules = (error?: string): string => {
    const overview = finops.overview()
    const rows = finops.rules().map((rule) => {
      const services = overview.services.filter((service) => service.service.toLowerCase().includes(rule.service))
      const amount = services.reduce((sum, service) => sum + service.amount, 0)
      return `<tr><td><b>${e(rule.service)}</b></td><td>${e(rule.team)}</td><td>${services.map((service) => e(service.service)).join(', ') || '—'}</td><td>${euro(amount)}</td></tr>`
    }).join('')
    const unallocated = overview.services.filter((service) => teamOf(finops.rules(), service.service) === 'Unallocated').reduce((sum, service) => sum + service.amount, 0)
    return `<header><div><small>FINANCE / ALLOCATION RULES</small><h1>Allocation rules</h1><p>Which team each service's spend belongs to.</p></div></header>${error === undefined ? '' : `<p class="notice error" role="alert">${e(error)}</p>`}<section class="f-section"><header><b>Rules</b><small>${euro(unallocated)} unallocated this month</small></header><table><thead><tr><th>SERVICE MATCH</th><th>TEAM</th><th>SERVICES</th><th>SPEND</th></tr></thead><tbody>${rows === '' ? '<tr><td colspan="4">No rules.</td></tr>' : rows}</tbody></table></section><form class="f-form" method="post" action="${shell.href('/allocation-rules')}"><h2>Add a rule</h2><p class="hint">A service name or part of one, matched ignoring case.</p><div class="row"><label>SERVICE<input name="service" required maxlength="60" placeholder="egress"></label><label>TEAM<input name="team" required maxlength="60" placeholder="Platform"></label></div><div class="actions"><button class="primary">Add rule</button></div></form><p class="f-note">${number(overview.services.length)} services this month · ${euro(overview.spend.monthToDate)} total.</p>`
  }

  const app = new Acryl()
    .get('/budgets', (c) => c.html(shell.page({ active: 'budgets', title: 'Budgets & alerts', crumbs: ['Finance', 'Budgets'], main: budgets(c.req.query('error')) })))
    .post('/budgets', async (c) => {
      const form = await c.req.parseBody()
      try {
        const budget = await finops.createBudget(String(form.name ?? ''), String(form.scope ?? ''), Number(form.limit), Number(form.alertThreshold ?? 80))
        return c.redirect(shell.url('/budgets', { kind: 'ok', text: `${budget.name} was added.` }), 303)
      } catch (error) {
        if (!(error instanceof FinopsError)) throw error
        return c.html(shell.page({ active: 'budgets', title: 'Budgets & alerts', crumbs: ['Finance', 'Budgets'], main: budgets(error.message) }))
      }
    })
    .get('/alerts', (c) => c.html(shell.page({ active: 'budgets', title: 'Alerts', crumbs: ['Finance', 'Alerts'], main: alerts() })))
    .get('/allocation-rules', (c) => c.html(shell.page({ active: 'rules', title: 'Allocation rules', crumbs: ['Finance', 'Allocation rules'], main: rules(c.req.query('error')) })))
    .post('/allocation-rules', async (c) => {
      const form = await c.req.parseBody()
      try {
        const rule = await finops.createRule(String(form.service ?? ''), String(form.team ?? ''))
        return c.redirect(shell.url('/allocation-rules', { kind: 'ok', text: `Spend matching “${rule.service}” now belongs to ${rule.team}.` }), 303)
      } catch (error) {
        if (!(error instanceof FinopsError)) throw error
        return c.html(shell.page({ active: 'rules', title: 'Allocation rules', crumbs: ['Finance', 'Allocation rules'], main: rules(error.message) }))
      }
    })

  ctx.router.route(prefix === '' ? '/' : prefix, app)
  ctx.effect(() => shell.nav({ id: 'budgets', label: 'Budgets & alerts', icon: '◷', path: '/budgets', order: 30, count: () => finops.alerts().filter((alert) => alert.status === 'open').length }))
  ctx.effect(() => shell.nav({ id: 'rules', label: 'Allocation rules', icon: '⇄', path: '/allocation-rules', order: 40 }))
}
