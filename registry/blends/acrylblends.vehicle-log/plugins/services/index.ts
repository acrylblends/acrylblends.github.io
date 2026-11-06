/** Service history at `/services` with a type filter, and the add form at `/services/new`. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { dateLabel, GarageError, money, SERVICE_TYPES, type Garage, type ServiceType } from '../garage/index.ts'
import type { Shell } from '../garage-shell/index.ts'

export const name = 'services'
export const inject = ['garage', 'shell', 'router']

export function apply(ctx: Context): void {
  const { garage, shell } = ctx
  const e = shell.e
  const prefix = shell.prefix

  const app = new Acryl()
    .get('/services', (c) => {
      const typeText = c.req.query('type')
      const type = SERVICE_TYPES.includes(typeText as ServiceType) ? (typeText as ServiceType) : undefined
      const vehicle = garage.vehicle()
      const records = garage.services(type === undefined ? {} : { type })
      const filters = [{ value: undefined, label: 'All' }, ...SERVICE_TYPES.map((value) => ({ value, label: value }))]
        .map((filter) => `<a class="tool${type === filter.value ? ' active' : ''}" href="${shell.href('/services')}${filter.value === undefined ? '' : `?type=${filter.value}`}">${filter.label}</a>`)
        .join('')
      const rows = records
        .map((record) => `<div class="entry"><time>${e(dateLabel(record.date))}</time><div><b>${e(record.description)}</b><small>${e(record.provider)} · ${record.odometerKm.toLocaleString('en-GB')} km${record.parts.length === 0 ? '' : ` · parts: ${e(record.parts.join(', '))}`}</small></div><div class="cost">${e(money(record.cost, vehicle.currency))}</div></div>`)
        .join('')
      const main = `${shell.notice(c.req.url)}<div class="head"><div><small>GARAGE / SERVICE HISTORY</small><h1>Service history</h1><p>Recorded work and vehicle events · ${String(records.length)} entries</p></div><a class="btn primary" href="${shell.href('/services/new')}">＋ Add service record</a></div><div class="filters" style="display:flex;gap:6px;margin-top:14px">${filters}</div><section class="panel"><div class="timeline">${rows === '' ? '<p class="empty">No service records match.</p>' : rows}</div></section>`
      return c.html(shell.page({ active: 'services', title: 'Service history', main }))
    })
    .get('/services/new', (c) => {
      const vehicle = garage.vehicle()
      const main = `<div class="head"><div><small>GARAGE / NEW SERVICE RECORD</small><h1>Add service record</h1><p>Record what was done, where, at which odometer and what it cost.</p></div><a class="btn" href="${shell.href('/services')}">Back to history</a></div><form class="panel fuel" style="max-width:640px" method="post" action="${shell.href('/services')}"><label>DATE<input name="date" type="date" value="${garage.now.toISOString().slice(0, 10)}" required></label><label>ODOMETER (KM)<input name="odometerKm" type="number" value="${String(vehicle.odometerKm)}" required></label><label>TYPE<select name="type">${SERVICE_TYPES.map((value) => `<option value="${value}">${value}</option>`).join('')}</select></label><label>PROVIDER<input name="provider" placeholder="Autohaus West" required></label><label>DESCRIPTION<input name="description" placeholder="Annual service · Oil and filters" required></label><label>COST (${e(vehicle.currency)})<input name="cost" type="number" step="0.01" required></label><label>PARTS<input name="parts" placeholder="oil filter, oil"></label><button type="submit">Save service record</button></form>`
      return c.html(shell.page({ active: 'services', title: 'Add service record', main }))
    })
    .post('/services', async (c) => {
      const body = await c.req.parseBody()
      try {
        await garage.addService({ date: body.date, odometerKm: body.odometerKm, type: body.type, provider: body.provider, description: body.description, cost: body.cost, parts: body.parts })
        return c.redirect(shell.url('/services', { kind: 'ok', text: 'Service record added.' }), 303)
      } catch (error) {
        if (!(error instanceof GarageError)) throw error
        return c.redirect(shell.url('/services/new', { kind: 'error', text: error.message }), 303)
      }
    })

  ctx.router.route(prefix === '' ? '/' : prefix, app)
  ctx.effect(() => shell.nav({ id: 'services', label: 'Maintenance', icon: '', path: '/services', order: 20 }))
}
