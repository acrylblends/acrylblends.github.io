/** The maintenance control room at `/`: metrics, the equipment register with a status filter, upcoming work and the selected asset panel. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { longDate, shortDate, statusLabel, workLabel, type Machine, type Plant } from '../plant/index.ts'

export const name = 'control'
export const inject = ['plant', 'shell', 'router']

export function apply(ctx: Context): void {
  const { plant, shell } = ctx
  const e = shell.e
  const prefix = shell.prefix

  const app = new Acryl().get('/', (c) => {
    const status = c.req.query('status')
    const filter = status === 'running' || status === 'service_due' || status === 'fault' ? status : undefined
    const machines = plant.machines().filter((machine) => filter === undefined || machine.status === filter)
    const requested = c.req.query('machine')
    const selected = (requested === undefined ? undefined : plant.machine(requested)) ?? machines[0] ?? plant.machines()[0]
    const stats = plant.stats()
    const today = plant.now.toISOString().slice(0, 10)
    const upcoming = plant.openOrders().filter((order) => order.scheduledAt >= today).slice(0, 5)
    const open = selected === undefined ? [] : plant.openOrders(selected.id)
    const history = selected === undefined ? [] : plant.events(selected.id)
    const statusOptions = [
      ['', 'All assets'],
      ['running', 'Running'],
      ['service_due', 'Service due'],
      ['fault', 'Fault'],
    ]
      .map(([value, label]) => `<option value="${value}"${(value === '' && filter === undefined) || value === filter ? ' selected' : ''}>${label}</option>`)
      .join('')
    const rows = machines
      .map(
        (machine: Machine) =>
          `<a class="machine${machine.id === selected?.id ? ' active' : ''}" href="${shell.href(`/?machine=${encodeURIComponent(machine.id)}${filter === undefined ? '' : `&status=${filter}`}`)}"><span style="color:${machine.status === 'running' ? '#83c59d' : machine.status === 'fault' ? '#e58b74' : '#e4ad60'}">● ${statusLabel(machine.status)}</span><b>${e(machine.name)}</b><small>${e(machine.type)}${machine.line === '' ? '' : ` · ${e(machine.line)}`} · ${e(machine.code)}</small></a>`,
      )
      .join('')
    const schedule = upcoming
      .map((order) => {
        const machine = plant.machine(order.machineId)
        return `<a class="schedrow" href="${shell.href(`/work-orders/${encodeURIComponent(order.id)}`)}"><time>${e(shortDate(order.scheduledAt))}</time><div><b>${e(order.description)}</b><small>${e(machine?.name ?? '')} · ${order.assignedTo === undefined ? 'Unassigned' : `Technician: ${e(order.assignedTo)}`}</small></div><span class="badge${order.status === 'planned' ? ' green' : ''}">${order.assignedTo === undefined ? 'UNASSIGNED' : order.status === 'planned' ? 'PLANNED' : 'DUE'}</span></a>`
      })
      .join('')
    const panel =
      selected === undefined
        ? ''
        : `<aside class="panel"><div class="machinehero"><small>SELECTED ASSET / ${e(selected.code)}</small><h2><a href="${shell.href(`/machines/${encodeURIComponent(selected.id)}`)}">${e(selected.name)}</a></h2><p>${e(selected.manufacturer)} · Installed ${e(selected.installedAt.slice(0, 4))}${selected.line === '' ? '' : ` · ${e(selected.line)}`}</p><div style="display:flex;justify-content:space-between;margin-top:15px;font-size:8px;color:#a7b0a6"><span>HEALTH INDEX</span><b>${String(selected.health)} / 100</b></div><div class="gauge"><i style="width:${String(selected.health)}%"></i></div></div><div class="specs"><div class="spec"><small>OPERATING HOURS</small><b>${selected.operatingHours.toLocaleString('en-GB')} h</b></div><div class="spec"><small>NEXT SERVICE</small><b>${e(shortDate(selected.nextService))}</b></div><div class="spec"><small>LAST DOWNTIME</small><b>${String(selected.lastDowntimeMinutes)} min</b></div><div class="spec"><small>OPEN ORDERS</small><b>${String(open.length)} tasks</b></div></div><div class="ph"><h2>Recent history</h2><a class="btn" href="${shell.href(`/machines/${encodeURIComponent(selected.id)}`)}">Full profile ↗</a></div><div class="events">${history.length === 0 ? '<p class="empty">No history yet.</p>' : history.slice(0, 3).map((event) => `<div class="event"><small>${e(longDate(event.occurredAt.slice(0, 10)))}</small><b>${e(event.summary.split(' · ')[0] ?? '')}</b><p>${e(event.summary.split(' · ').slice(1).join(' · '))}</p></div>`).join('')}</div></aside>`
    const main = `${shell.notice(c.req.url)}<div class="title"><div><small>ASSET RELIABILITY / MAINTENANCE OPERATIONS</small><h1>Maintenance control</h1><p>Preventive work, equipment history and downtime in one operational view.</p></div><a class="btn warn" href="${shell.href(`/work-orders/new${selected === undefined ? '' : `?machineId=${encodeURIComponent(selected.id)}`}`)}">＋ Create work order</a></div><section class="stats"><article class="stat"><label>OPEN WORK ORDERS</label><strong>${String(stats.open)}</strong><small>${String(stats.awaitingParts)} awaiting parts</small></article><article class="stat"><label>OVERDUE PM TASKS</label><strong style="color:#e6ae63">${String(stats.overdue).padStart(2, '0')}</strong><small>Across ${String(stats.linesOverdue)} production lines</small></article><article class="stat"><label>DOWNTIME · MTD</label><strong>${(stats.downtimeMinutes / 60).toFixed(1)} <small>hrs</small></strong><small style="color:#83c59d">↓ 11% month over month</small></article><article class="stat"><label>ASSET AVAILABILITY</label><strong>${stats.availability.toFixed(1)}%</strong><small>Target ≥ 95%</small></article></section><div class="bodygrid"><section class="panel register"><div class="ph"><div><h2>Equipment register</h2><small>${String(plant.machines().length)} assets</small></div><form method="get" action="${shell.href('/')}" style="margin:0"><label class="selectwrap"><select name="status" aria-label="Filter assets by status" onchange="this.form.submit()">${statusOptions}</select></label></form></div>${rows}</section><section class="panel"><div class="ph"><div><h2>Upcoming maintenance</h2><small>Planned work · next 14 days</small></div><a class="btn" href="${shell.href('/work-orders/new')}">Calendar ↗</a></div><div class="sched">${schedule}</div></section>${panel}</div>`
    return c.html(shell.page({ active: 'control', title: 'Maintenance control', main }))
  })

  ctx.router.route(prefix === '' ? '/' : prefix, app)
  ctx.effect(() => shell.nav({ id: 'control', label: 'Control', icon: '', path: '/', order: 10 }))
}
