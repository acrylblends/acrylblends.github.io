/** Expenses at `/expenses`: the fuel, service and other cost breakdown, the lists and the add form. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { dateLabel, EXPENSE_CATEGORIES, GarageError, money, money2, type Garage } from '../garage/index.ts'
import type { Shell } from '../garage-shell/index.ts'

export const name = 'expenses'
export const inject = ['garage', 'shell', 'router']

export function apply(ctx: Context): void {
  const { garage, shell } = ctx
  const e = shell.e
  const prefix = shell.prefix

  const app = new Acryl()
    .get('/expenses', (c) => {
      const vehicle = garage.vehicle()
      const services = garage.services()
      const fuel = garage.fuelEntries()
      const other = garage.expenses()
      const costs = garage.costs()
      const serviceTotal = services.reduce((sum, record) => sum + record.cost, 0)
      const fuelTotal = fuel.reduce((sum, entry) => sum + entry.totalCost, 0)
      const byCategory = EXPENSE_CATEGORIES.map((category) => ({ category, total: other.filter((expense) => expense.category === category).reduce((sum, expense) => sum + expense.amount, 0) }))
      const rows = [
        ...services.map((record) => ({ date: record.date, html: `<div class="entry"><time>${e(dateLabel(record.date))}</time><div><b>${e(record.description)}</b><small>Service · ${e(record.provider)}</small></div><div class="cost">${e(money(record.cost, vehicle.currency))}</div></div>` })),
        ...fuel.map((entry) => ({ date: entry.date, html: `<div class="entry"><time>${e(dateLabel(entry.date))}</time><div><b>Fuel fill-up</b><small>${entry.litres.toFixed(1)} L · ${entry.odometerKm.toLocaleString('en-GB')} km</small></div><div class="cost">${e(money2(entry.totalCost, vehicle.currency))}</div></div>` })),
        ...other.map((expense) => ({ date: expense.date, html: `<div class="entry"><time>${e(dateLabel(expense.date))}</time><div><b>${e(expense.category)}</b><small>${e(expense.note)}</small></div><div class="cost">${e(money(expense.amount, vehicle.currency))}</div></div>` })),
      ]
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((row) => row.html)
        .join('')
      const breakdown = [{ label: 'Service', total: serviceTotal }, { label: 'Fuel', total: fuelTotal }, ...byCategory.map((row) => ({ label: row.category, total: row.total }))]
        .map((row) => `<div class="bill"><span>${e(row.label)}</span><b>${e(money(row.total, vehicle.currency))}</b></div>`)
        .join('')
      const main = `${shell.notice(c.req.url)}<div class="head"><div><small>GARAGE / EXPENSES</small><h1>Expenses</h1><p>Fuel, service, insurance, tax and inspection · lifetime ${e(money2(costs.costPerKm))} per km</p></div><a class="btn" href="${shell.href('/services/new')}">＋ Add service record</a></div><div class="maincols"><section><section class="panel"><div class="ph"><div><h3>Cost breakdown</h3><small>Recorded and opening costs</small></div></div><div style="padding:4px 16px 12px">${breakdown}</div></section><section class="panel"><div class="ph"><div><h3>All expenses</h3><small>Services, fuel and other costs</small></div></div><div class="timeline">${rows}</div></section></section><aside><section class="panel"><div class="ph"><div><h3>Add an expense</h3><small>Insurance, tax, inspection or other</small></div></div><form class="fuel" method="post" action="${shell.href('/expenses')}"><label>DATE<input name="date" type="date" value="${garage.now.toISOString().slice(0, 10)}" required></label><label>CATEGORY<select name="category">${EXPENSE_CATEGORIES.map((value) => `<option value="${value}">${value}</option>`).join('')}</select></label><label>AMOUNT (${e(vehicle.currency)})<input name="amount" type="number" step="0.01" required></label><label>NOTE<input name="note" placeholder="Annual comprehensive cover" required></label><button type="submit">Save expense</button></form></section><section class="panel"><div class="ph"><div><h3>Cost this year</h3><small>Service + fuel + insurance</small></div></div><div style="padding:4px 16px 12px"><div class="bill"><span>Total</span><b>${e(money(costs.costThisYear, vehicle.currency))}</b></div><div class="bill"><span>Lifetime cost</span><b>${e(money(costs.totalCost, vehicle.currency))}</b></div><div class="bill"><span>Cost per km</span><b>${e(money2(costs.costPerKm, vehicle.currency))}</b></div></div></section></aside></div>`
      return c.html(shell.page({ active: 'expenses', title: 'Expenses', main }))
    })
    .post('/expenses', async (c) => {
      const body = await c.req.parseBody()
      try {
        await garage.addExpense({ date: body.date, category: body.category, amount: body.amount, note: body.note })
        return c.redirect(shell.url('/expenses', { kind: 'ok', text: 'Expense added.' }), 303)
      } catch (error) {
        if (!(error instanceof GarageError)) throw error
        return c.redirect(shell.url('/expenses', { kind: 'error', text: error.message }), 303)
      }
    })

  ctx.router.route(prefix === '' ? '/' : prefix, app)
  ctx.effect(() => shell.nav({ id: 'expenses', label: 'Expenses', icon: '', path: '/expenses', order: 30 }))
}
