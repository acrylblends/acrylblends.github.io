/** The vehicle profile at `/`: the hero, running-cost metrics, service history, cost trend, fuel entry, odometer and reminders. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { dateLabel, GarageError, money, money2, monthLabel, number, type Garage } from '../garage/index.ts'
import type { Shell } from '../garage-shell/index.ts'

export const name = 'profile'
export const inject = ['garage', 'shell', 'router']

function chartPath(values: readonly number[], width = 650, height = 150): string {
  const max = Math.max(...values, 1)
  const step = width / Math.max(1, values.length - 1)
  return values.map((value, index) => `${index === 0 ? 'M' : 'L'}${(index * step).toFixed(0)} ${(height - (value / max) * (height - 20)).toFixed(0)}`).join(' ')
}

export function apply(ctx: Context): void {
  const { garage, shell } = ctx
  const e = shell.e
  const prefix = shell.prefix

  const app = new Acryl()
    .get('/', (c) => {
      const vehicle = garage.vehicle()
      const costs = garage.costs()
      const months = garage.months()
      const services = garage.services().slice(0, 4)
      const reminders = garage.reminders()
      const entries = services
        .map((record) => `<div class="entry"><time>${e(dateLabel(record.date))}</time><div><b>${e(record.description.split(' · ')[0] ?? record.description)}</b><small>${e(record.description.split(' · ').slice(1).join(' · '))}${record.description.includes(' · ') ? ' · ' : ''}${e(record.provider)}</small></div><div class="cost">${e(money(record.cost, vehicle.currency))}</div></div>`)
        .join('')
      const reminderRows = reminders
        .map((reminder) => {
          const due = reminder.dueOdometerKm === undefined ? (reminder.dueDate === undefined ? '' : new Date(`${reminder.dueDate}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })) : `${reminder.dueOdometerKm.toLocaleString('en-GB')} km`
          return `<div class="bill"><span>${e(reminder.title)} <small style="color:#8b979b;font-size:8px;display:block;margin-top:2px">${e(due)}${reminder.status === 'done' ? ' · complete' : ''}</small></span>${reminder.status === 'done' ? '<b>Done</b>' : `<form method="post" action="${shell.href(`/reminders/${encodeURIComponent(reminder.id)}/done`)}"><button style="border:0;background:#eef3f1;color:#2f6d55;border-radius:4px;padding:5px 7px;font-size:8px">Mark done</button></form>`}</div>`
        })
        .join('')
      const main = `${shell.notice(c.req.url)}<div class="head"><div><small>GARAGE / VEHICLE PROFILE</small><h1>Vehicle logbook</h1><p>Keep service history, running costs and upcoming maintenance together.</p></div><a class="btn primary" href="${shell.href('/services/new')}">＋ Add service record</a></div><section class="hero"><div class="carart"><div class="carlabel">VEHICLE / PROFILE 001</div><div class="car"></div><div class="wheel one"></div><div class="wheel two"></div></div><div class="vehicleinfo"><small>${String(vehicle.year)} · ${e(vehicle.fuelType.toUpperCase())} · ${e(vehicle.transmission.toUpperCase())}</small><h2>${e(vehicle.make)} ${e(vehicle.model)}</h2><p>Registration: ${e(vehicle.registration)} · VIN ending ${e(vehicle.vinMasked.slice(-4))}</p><div class="specrow"><div><b>${number(vehicle.odometerKm)} km</b><small>ODOMETER</small></div><div><b>${vehicle.averageConsumption.toFixed(1)} ${e(vehicle.fuelUnit)}/100</b><small>AVG. CONSUMPTION</small></div><div><b>05/2027</b><small>INSPECTION DUE</small></div></div></div></section><div class="maincols"><section><div class="metrics"><article class="metric"><small>COST THIS YEAR</small><strong>${e(money(costs.costThisYear))}</strong><span>Service + fuel + insurance</span></article><article class="metric"><small>COST / KM</small><strong>${e(money2(costs.costPerKm))}</strong><span>Lifetime average</span></article><article class="metric"><small>NEXT SERVICE</small><strong style="font-size:17px">${number(costs.nextServiceKm)} km</strong><span>Oil and filter change</span></article></div><section class="panel"><div class="ph"><div><h3>Service history</h3><small>Recorded work and vehicle events</small></div><a class="btn" href="${shell.href('/services')}">View all</a></div><div class="timeline">${entries}</div></section><section class="panel"><div class="ph"><div><h3>Running cost trend</h3><small>Monthly expenses · current year</small></div><a class="btn" href="${shell.href('/expenses')}">By category⌄</a></div><div class="chart"><svg viewBox="0 0 650 150" preserveAspectRatio="none"><g stroke="#edf0f0"><path d="M0 30H650M0 70H650M0 110H650"/></g><path d="${chartPath(months)}" fill="none" stroke="#de684b" stroke-width="2.5"/></svg><div class="chartleg">${[0, 2, 4, 6, 8, 10].map((month) => `<span>${monthLabel(month)}</span>`).join('')}</div></div></section></section><aside><section class="panel"><div class="ph"><div><h3>Log fuel fill-up</h3><small>Quick expense entry</small></div></div><form class="fuel" method="post" action="${shell.href('/fuel')}"><label>DATE<input name="date" type="date" value="${garage.now.toISOString().slice(0, 10)}" required></label><label>ODOMETER (KM)<input name="odometerKm" type="number" value="${String(vehicle.odometerKm)}" required></label><label>LITRES<input name="litres" type="number" step="0.1" required></label><label>TOTAL COST (${e(vehicle.currency)})<input name="totalCost" type="number" step="0.01" required></label><button type="submit">Save fuel entry</button></form><form class="fuel odometer" method="post" action="${shell.href('/odometer')}"><label>UPDATE ODOMETER (KM)<input name="odometerKm" type="number" value="${String(vehicle.odometerKm)}" required></label><button type="submit">Update odometer</button></form></section><section class="panel"><div class="ph"><h3>Upcoming reminders</h3></div><div style="padding:0 15px 12px">${reminderRows}</div></section></aside></div>`
      return c.html(shell.page({ active: 'vehicles', title: 'Vehicle logbook', main }))
    })
    .post('/fuel', async (c) => {
      const body = await c.req.parseBody()
      try {
        await garage.addFuel({ date: body.date, odometerKm: body.odometerKm, litres: body.litres, totalCost: body.totalCost })
        return c.redirect(shell.url('/', { kind: 'ok', text: 'Fuel entry added to the vehicle history.' }), 303)
      } catch (error) {
        if (!(error instanceof GarageError)) throw error
        return c.redirect(shell.url('/', { kind: 'error', text: error.message }), 303)
      }
    })
    .post('/odometer', async (c) => {
      const body = await c.req.parseBody()
      try {
        await garage.updateOdometer(body.odometerKm)
        return c.redirect(shell.url('/', { kind: 'ok', text: 'Odometer updated.' }), 303)
      } catch (error) {
        return c.redirect(shell.url('/', { kind: 'error', text: (error as Error).message }), 303)
      }
    })
    .post('/reminders/:id/done', async (c) => {
      try {
        await garage.completeReminder(c.req.param('id'))
        return c.redirect(shell.url('/', { kind: 'ok', text: 'Reminder marked complete.' }), 303)
      } catch (error) {
        return c.redirect(shell.url('/', { kind: 'error', text: (error as Error).message }), 303)
      }
    })

  ctx.router.route(prefix === '' ? '/' : prefix, app)
  ctx.effect(() => shell.nav({ id: 'vehicles', label: 'My vehicles', icon: '', path: '/', order: 10 }))
}
