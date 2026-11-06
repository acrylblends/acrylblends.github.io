/** Work orders: the create form at `/work-orders/new` and the detail at `/work-orders/:id` with assign, schedule, start and a dated close-out. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { longDate, PlantError, priorityLabel, workLabel, type Plant } from '../plant/index.ts'

export const name = 'work-orders'
export const inject = ['plant', 'shell', 'router']

interface Values {
  readonly machineId: string
  readonly kind: string
  readonly priority: string
  readonly description: string
  readonly scheduledAt: string
  readonly assignedTo: string
  readonly parts: string
}

export function apply(ctx: Context): void {
  const { plant, shell } = ctx
  const e = shell.e
  const prefix = shell.prefix

  const form = (url: string, values: Values, error?: string): string => {
    const machines = plant
      .machines()
      .map((machine) => `<option value="${e(machine.id)}"${machine.id === values.machineId ? ' selected' : ''}>${e(machine.name)} (${e(machine.code)})</option>`)
      .join('')
    const main = `${shell.notice(url)}<div class="title"><div><small>MAINTENANCE / NEW WORK ORDER</small><h1>Create work order</h1><p>Plan the work, the technician and the parts. The close-out comes later with a dated note.</p></div><a class="btn" href="${shell.href('/')}">Back to control</a></div>${error === undefined ? '' : `<p class="notice error" role="alert">${e(error)}</p>`}<form class="form" method="post" action="${shell.href('/work-orders')}"><label>MACHINE<select name="machineId">${machines}</select></label><label>KIND<select name="kind"><option value="pm"${values.kind === 'pm' ? ' selected' : ''}>Preventive maintenance</option><option value="repair"${values.kind === 'repair' ? ' selected' : ''}>Repair</option></select></label><label>PRIORITY<select name="priority">${['high', 'medium', 'low'].map((value) => `<option value="${value}"${value === values.priority ? ' selected' : ''}>${value}</option>`).join('')}</select></label><label>FAULT / WORK DESCRIPTION<textarea name="description" required rows="3" placeholder="What is wrong or what is planned">${e(values.description)}</textarea></label><label>SCHEDULED DATE<input name="scheduledAt" type="date" value="${e(values.scheduledAt)}"></label><label>TECHNICIAN (OPTIONAL)<input name="assignedTo" maxlength="80" value="${e(values.assignedTo)}" placeholder="L. Weber"></label><label>PARTS (COMMA SEPARATED)<input name="parts" maxlength="160" value="${e(values.parts)}" placeholder="filter kit, seal kit"></label><div class="actions"><button class="primary" type="submit">Create work order</button></div></form>`
    return shell.page({ title: 'Create work order', main })
  }

  const detail = (id: string, url: string): string | undefined => {
    const order = plant.workOrder(id)
    if (order === undefined) return undefined
    const machine = plant.machine(order.machineId)
    const open = order.status !== 'done'
    const checklist = order.checklist.map((item) => `<li class="${item.done ? 'done' : ''}">${item.done ? '✓' : '○'} ${e(item.label)}</li>`).join('')
    const parts = order.parts.length === 0 ? '<p class="empty" style="padding:0">No parts requested.</p>' : order.parts.map((part) => `<span class="tag">${e(part)}</span>`).join('')
    const actions = open
      ? `<form class="form" method="post" action="${shell.href(`/work-orders/${encodeURIComponent(order.id)}/assign`)}"><h2>Assign a technician</h2><label>TECHNICIAN<input name="technician" required maxlength="80" value="${e(order.assignedTo ?? '')}"></label><div class="actions"><button class="primary">Assign</button></div></form><form class="form" method="post" action="${shell.href(`/work-orders/${encodeURIComponent(order.id)}/schedule`)}"><h2>Reschedule</h2><label>DATE<input name="scheduledAt" type="date" required value="${e(order.scheduledAt)}"></label><div class="actions"><button class="primary">Save date</button></div></form><form class="form" method="post" action="${shell.href(`/work-orders/${encodeURIComponent(order.id)}/start`)}"><h2>Start the work</h2><p class="hint">Marks the first checklist step and the order as in progress.</p><div class="actions"><button class="primary">Start work</button></div></form><form class="form" method="post" action="${shell.href(`/work-orders/${encodeURIComponent(order.id)}/close`)}"><h2>Close with a dated note</h2><label>CLOSE-OUT NOTE<textarea name="note" required rows="3" placeholder="What was done and what was verified"></textarea></label><label>DOWNTIME (minutes)<input name="downtimeMinutes" inputmode="numeric" value="0"></label><label>PARTS USED<input name="parts" maxlength="160" placeholder="Optional, comma separated"></label><div class="actions"><button class="primary" type="submit">Close work order</button></div></form>`
      : `<div class="form"><h2>Closed</h2><p class="hint">${e(order.closedNote ?? '')} · ${order.closedAt === undefined ? '' : e(longDate(order.closedAt.slice(0, 10)))}</p><p class="hint">Downtime recorded: ${String(order.downtimeMinutes)} minutes.</p></div>`
    const main = `${shell.notice(url)}<div class="title"><div><small>MAINTENANCE / WORK ORDER ${e(order.code)}</small><h1>${e(order.description)}</h1><p><a href="${shell.href(`/machines/${encodeURIComponent(order.machineId)}`)}">${e(machine?.name ?? '')}</a> · ${e(workLabel(order.status))} · scheduled ${e(longDate(order.scheduledAt))}</p></div><a class="btn" href="${shell.href(`/machines/${encodeURIComponent(order.machineId)}`)}">Back to the asset</a></div><div class="bodygrid" style="grid-template-columns:minmax(0,1fr) 320px"><section class="panel"><div class="ph"><div><h2>${order.kind === 'pm' ? 'Preventive maintenance' : 'Repair'}</h2><small>${e(priorityLabel(order.priority))} priority · ${e(order.assignedTo ?? 'Unassigned')}</small></div><span class="badge${order.status === 'planned' ? ' green' : ''}">${workLabel(order.status)}</span></div><div class="specs"><div class="spec"><small>ASSET</small><b>${e(machine?.name ?? '')}</b></div><div class="spec"><small>SCHEDULED</small><b>${e(longDate(order.scheduledAt))}</b></div><div class="spec"><small>TECHNICIAN</small><b>${e(order.assignedTo ?? 'Unassigned')}</b></div><div class="spec"><small>DOWNTIME</small><b>${String(order.downtimeMinutes)} min</b></div></div><div class="ph"><h2>Parts</h2></div><div style="padding:0 14px 14px">${parts}</div><div class="ph"><h2>Checklist</h2><small>${String(order.checklist.filter((item) => item.done).length)} / ${String(order.checklist.length)} done</small></div><div style="padding:0 14px 14px"><ul class="checklist">${checklist}</ul></div></section><aside class="panel"><div class="ph"><h2>Actions</h2></div><div style="padding:0 14px 14px">${actions}</div></aside></div>`
    return shell.page({ title: order.description, main })
  }

  const app = new Acryl()
    .get('/work-orders/new', (c) => {
      const machine = plant.machine(c.req.query('machineId') ?? '') ?? plant.machines()[0]
      return c.html(
        form(c.req.url, {
          machineId: machine?.id ?? '',
          kind: 'pm',
          priority: 'medium',
          description: '',
          scheduledAt: plant.now.toISOString().slice(0, 10),
          assignedTo: '',
          parts: '',
        }),
      )
    })
    .post('/work-orders', async (c) => {
      const body = await c.req.parseBody()
      const values: Values = {
        machineId: String(body.machineId ?? ''),
        kind: body.kind === 'repair' ? 'repair' : 'pm',
        priority: String(body.priority ?? 'medium'),
        description: String(body.description ?? ''),
        scheduledAt: String(body.scheduledAt ?? ''),
        assignedTo: String(body.assignedTo ?? ''),
        parts: String(body.parts ?? ''),
      }
      try {
        const order = await plant.createWorkOrder({ ...values, kind: values.kind === 'repair' ? 'repair' : 'pm' })
        return c.redirect(shell.url(`/work-orders/${encodeURIComponent(order.id)}`, { kind: 'ok', text: `${order.code} created.` }), 303)
      } catch (error) {
        if (!(error instanceof PlantError)) throw error
        return c.html(form(c.req.url, values, error.message))
      }
    })
    .get('/work-orders/:id', (c) => {
      const main = detail(c.req.param('id'), c.req.url)
      if (main === undefined) return c.redirect(shell.url('/', { kind: 'error', text: 'That work order no longer exists.' }), 303)
      return c.html(main)
    })
    .post('/work-orders/:id/assign', async (c) => {
      const form = await c.req.parseBody()
      try {
        await plant.assign(c.req.param('id'), String(form.technician ?? ''))
        return c.redirect(shell.url(`/work-orders/${encodeURIComponent(c.req.param('id'))}`, { kind: 'ok', text: 'Technician assigned.' }), 303)
      } catch (error) {
        return c.redirect(shell.url(`/work-orders/${encodeURIComponent(c.req.param('id'))}`, { kind: 'error', text: (error as Error).message }), 303)
      }
    })
    .post('/work-orders/:id/schedule', async (c) => {
      const form = await c.req.parseBody()
      try {
        await plant.schedule(c.req.param('id'), form.scheduledAt)
        return c.redirect(shell.url(`/work-orders/${encodeURIComponent(c.req.param('id'))}`, { kind: 'ok', text: 'Schedule saved.' }), 303)
      } catch (error) {
        return c.redirect(shell.url(`/work-orders/${encodeURIComponent(c.req.param('id'))}`, { kind: 'error', text: (error as Error).message }), 303)
      }
    })
    .post('/work-orders/:id/start', async (c) => {
      try {
        await plant.start(c.req.param('id'))
        return c.redirect(shell.url(`/work-orders/${encodeURIComponent(c.req.param('id'))}`, { kind: 'ok', text: 'Work started.' }), 303)
      } catch (error) {
        return c.redirect(shell.url(`/work-orders/${encodeURIComponent(c.req.param('id'))}`, { kind: 'error', text: (error as Error).message }), 303)
      }
    })
    .post('/work-orders/:id/close', async (c) => {
      const form = await c.req.parseBody()
      try {
        await plant.close(c.req.param('id'), { note: String(form.note ?? ''), downtimeMinutes: Number(form.downtimeMinutes ?? 0), parts: String(form.parts ?? '') })
        return c.redirect(shell.url(`/work-orders/${encodeURIComponent(c.req.param('id'))}`, { kind: 'ok', text: 'Work order closed and added to the history.' }), 303)
      } catch (error) {
        return c.redirect(shell.url(`/work-orders/${encodeURIComponent(c.req.param('id'))}`, { kind: 'error', text: (error as Error).message }), 303)
      }
    })

  ctx.router.route(prefix === '' ? '/' : prefix, app)
}
