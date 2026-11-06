/** Asset profile at `/machines/:id`: operating hours, health, open tasks and the service history of one machine. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { longDate, statusLabel, workLabel, type Plant } from '../plant/index.ts'

export const name = 'machines'
export const inject = ['plant', 'shell', 'router']

export function apply(ctx: Context): void {
  const { plant, shell } = ctx
  const e = shell.e
  const prefix = shell.prefix

  const app = new Acryl().get('/machines/:id', (c) => {
    const machine = plant.machine(c.req.param('id'))
    if (machine === undefined) return c.redirect(shell.url('/', { kind: 'error', text: 'That machine no longer exists.' }), 303)
    const open = plant.openOrders(machine.id)
    const history = plant.events(machine.id)
    const tasks = open
      .map(
        (order) =>
          `<a class="schedrow" href="${shell.href(`/work-orders/${encodeURIComponent(order.id)}`)}"><time>${e(longDate(order.scheduledAt))}</time><div><b>${e(order.description)}</b><small>${order.assignedTo === undefined ? 'Unassigned' : `Technician: ${e(order.assignedTo)}`} · ${e(order.code)}</small></div><span class="badge${order.status === 'planned' ? ' green' : ''}">${workLabel(order.status)}</span></a>`,
      )
      .join('')
    const events = history
      .map((event) => `<div class="event"><small>${e(longDate(event.occurredAt.slice(0, 10)))}</small><b>${e(event.summary.split(' · ')[0] ?? '')}</b><p>${e(event.summary.split(' · ').slice(1).join(' · '))}${event.cost > 0 ? ` · €${String(event.cost)}` : ''}${event.parts.length > 0 ? ` · parts: ${e(event.parts.join(', '))}` : ''}</p></div>`)
      .join('')
    const main = `<div class="title"><div><small>ASSET PROFILE / ${e(machine.code)}</small><h1>${e(machine.name)}</h1><p>${e(machine.manufacturer)} · Installed ${e(machine.installedAt.slice(0, 4))}${machine.line === '' ? '' : ` · ${e(machine.line)}`} · ${e(machine.location)}</p></div><a class="btn warn" href="${shell.href(`/work-orders/new?machineId=${encodeURIComponent(machine.id)}`)}">＋ Create work order</a></div><div class="bodygrid" style="grid-template-columns:minmax(0,1fr) 320px"><section class="panel"><div class="machinehero"><small>${statusLabel(machine.status)} · HEALTH INDEX</small><h2>${String(machine.health)} / 100</h2><div class="gauge"><i style="width:${String(machine.health)}%"></i></div></div><div class="specs"><div class="spec"><small>OPERATING HOURS</small><b>${machine.operatingHours.toLocaleString('en-GB')} h</b></div><div class="spec"><small>NEXT SERVICE</small><b>${e(longDate(machine.nextService))}</b></div><div class="spec"><small>LAST DOWNTIME</small><b>${String(machine.lastDowntimeMinutes)} min</b></div><div class="spec"><small>OPEN ORDERS</small><b>${String(open.length)} tasks</b></div></div><div class="ph"><div><h2>Open tasks</h2><small>Work orders that are not closed</small></div></div><div class="sched">${tasks === '' ? '<p class="empty">No open tasks.</p>' : tasks}</div></section><aside class="panel"><div class="ph"><h2>Service history</h2><a class="btn" href="${shell.href('/')}">Back to control</a></div><div class="events">${events === '' ? '<p class="empty">No history yet.</p>' : events}</div></aside></div>`
    return c.html(shell.page({ active: 'control', title: machine.name, main }))
  })

  ctx.router.route(prefix === '' ? '/' : prefix, app)
}
