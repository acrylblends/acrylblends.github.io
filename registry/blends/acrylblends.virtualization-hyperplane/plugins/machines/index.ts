/**
 * Virtual machines: the inventory with filters (`/machines`), a machine's detail with its lifecycle actions, snapshots and events
 * (`/machines/:id`), the provisioning form (`/machines/new`) and the routes that start, pause, stop, snapshot and remove. The rules (the lifecycle
 * state machine, capacity guards) are the fleet's; this plugin only reads forms and shows what the fleet answers.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { type Action, type VmState, STATE_LABEL, actionLabel, actionsFor, percent, usageOf } from '../hyperplane/index.ts'
import { escapeHtml, fieldOf, fleetErrorOf, whenLabel, withNotice } from '../fleet-shell/index.ts'

export const name = 'machines'
export const inject = ['router', 'fleet', 'fleetShell']

const STATES: VmState[] = ['running', 'paused', 'stopped', 'provisioning']

function listPage(ctx: Context, url: string): string {
  const shell = ctx.fleetShell
  const fleet = ctx.fleet
  const query = new URL(url, 'http://local').searchParams
  const state = STATES.find((s) => s === query.get('state'))
  const filter = { q: query.get('q') ?? '', hostId: query.get('host') ?? '', os: query.get('os') ?? '', ...(state === undefined ? {} : { state }) }
  const shown = fleet.vms(filter)
  const option = (value: string, label: string, selected: boolean) => `<option value="${escapeHtml(value)}"${selected ? ' selected' : ''}>${escapeHtml(label)}</option>`
  const back = `${shell.href('/machines')}${new URL(url, 'http://local').search}`
  const main = `${shell.header('Virtual machines', `${String(shown.length)} of ${String(fleet.state.vms.length)} machines · search by name, state, OS or address`, `<a class="btn" href="${shell.href('/machines/new')}">＋ Provision VM</a>`)}
<section class="panel"><form class="filters panelhead" method="get" action="${shell.href('/machines')}"><label class="sr" for="q">Search</label><input class="search" id="q" name="q" type="search" value="${escapeHtml(filter.q)}" placeholder="Search machines or IPs…">
<label class="sr" for="host">Host</label><select class="select" id="host" name="host">${option('', 'All hosts', filter.hostId === '')}${fleet.hosts().map((h) => option(h.id, h.name, h.id === filter.hostId)).join('')}</select>
<label class="sr" for="state">State</label><select class="select" id="state" name="state">${option('', 'Any state', state === undefined)}${STATES.map((s) => option(s, STATE_LABEL[s], s === state)).join('')}</select>
<label class="sr" for="os">Operating system</label><select class="select" id="os" name="os">${option('', 'Any OS', filter.os === '')}${fleet.state.images.map((i) => option(i, i, i === filter.os)).join('')}</select>
<button class="chip" type="submit">Filter</button><a class="chip" href="${shell.href('/machines')}">Clear</a></form>
${shell.vmTable(shown, { back })}</section>`
  return shell.page({ active: 'machines', title: 'Virtual machines', main, url })
}

function detailPage(ctx: Context, id: string, url: string): string | undefined {
  const shell = ctx.fleetShell
  const fleet = ctx.fleet
  const vm = fleet.state.vms.find((v) => v.id === id)
  if (vm === undefined) return undefined
  const host = fleet.host(vm.hostId)
  const used = usageOf(fleet.state.vms.filter((v) => v.hostId === host.id))
  const now = fleet.now()
  const post = (path: string, label: string, cls = '') =>
    `<form method="post" action="${shell.href(path)}" style="display:inline"><input type="hidden" name="back" value="${shell.href(`/machines/${encodeURIComponent(vm.id)}`)}"><button class="btn ${cls}" type="submit" style="margin-right:6px">${label}</button></form>`
  const buttons = actionsFor(vm.state).map((a) => post(`/machines/${encodeURIComponent(vm.id)}/${a}`, actionLabel(a, vm.state)))
  const snaps = fleet.snapshots(vm.id)
  const events = fleet.events(8, vm.id)
  const main = `${shell.header(vm.name, `${vm.os} · ${vm.code} · on ${host.name}`, `<span class="state ${vm.state}">● ${STATE_LABEL[vm.state]}</span>`)}
<section class="panel"><div class="panelhead"><h3>Lifecycle</h3><span class="muted">${vm.state === 'provisioning' ? 'Not started yet' : `${String(snaps.length)} ${snaps.length === 1 ? 'snapshot' : 'snapshots'}`}</span></div>
<div>${buttons.join('')}${vm.state === 'provisioning' ? '' : `<form method="post" action="${shell.href(`/machines/${encodeURIComponent(vm.id)}/snapshot`)}" class="filters" style="display:inline-flex;margin-left:6px"><input type="hidden" name="back" value="${shell.href(`/machines/${encodeURIComponent(vm.id)}`)}"><label class="sr" for="label">Snapshot label</label><input class="input" id="label" name="label" placeholder="Snapshot label" maxlength="40"><button class="chip" type="submit">Snapshot</button></form>`}
${vm.state === 'stopped' || vm.state === 'provisioning' ? post(`/machines/${encodeURIComponent(vm.id)}/remove`, 'Remove', 'danger') : ''}</div></section>
<div class="detail"><section class="panel"><div class="panelhead"><h3>Allocation</h3><span class="muted">${escapeHtml(host.name)}</span></div>
<div class="metricgrid"><p><span class="muted">vCPU</span><br><b>${String(vm.vcpu)}</b></p><p><span class="muted">Memory</span><br><b>${String(vm.memoryGb)} GB</b></p><p><span class="muted">Disk</span><br><b>${String(vm.diskGb)} GB</b></p><p><span class="muted">Address</span><br><b>${vm.ip === '' ? 'Pending' : escapeHtml(vm.ip)}</b></p></div>
<div class="resource"><b>Host CPU</b><div class="bar"><i style="width:${String(percent(used.vcpu, host.cores))}%"></i></div><span>${String(percent(used.vcpu, host.cores))}%</span></div>
<div class="resource"><b>Host memory</b><div class="bar"><i style="width:${String(percent(used.memoryGb, host.memoryGb))}%"></i></div><span>${String(percent(used.memoryGb, host.memoryGb))}%</span></div></section>
<section class="panel"><div class="panelhead"><h3>Snapshots</h3><span class="muted">Restore points</span></div>${snaps.length === 0 ? '<div class="empty">No snapshots yet.</div>' : snaps.map((s) => `<div class="snapshot"><span><b>${escapeHtml(s.name)}</b><br><small class="muted">${escapeHtml(whenLabel(s.createdAt, now))} · ${s.sizeGb.toFixed(1)} GB</small></span><span>● Ready</span></div>`).join('')}</section></div>
<section class="panel"><div class="panelhead"><h3>Lifecycle events</h3></div>${events.length === 0 ? '<div class="empty">No events yet.</div>' : events.map((e) => `<div class="snapshot"><span>${escapeHtml(e.text)}</span><span class="muted">${escapeHtml(whenLabel(e.at, now))}</span></div>`).join('')}</section>
<p><a class="chip" href="${shell.href('/machines')}">← All machines</a></p>`
  return shell.page({ active: 'machines', title: vm.name, main, url })
}

function formPage(ctx: Context, url: string, values: Record<string, string>): string {
  const shell = ctx.fleetShell
  const fleet = ctx.fleet
  const option = (value: string, label: string, selected: boolean) => `<option value="${escapeHtml(value)}"${selected ? ' selected' : ''}>${escapeHtml(label)}</option>`
  const used = (id: string) => usageOf(fleet.state.vms.filter((v) => v.hostId === id))
  const main = `${shell.header('Provision a virtual machine', 'It is created in the Provisioning state; start it to give it an address.')}
<section class="panel"><form class="form" method="post" action="${shell.href('/machines')}">
<label class="field">Name<input class="input" name="name" value="${escapeHtml(values.name ?? '')}" required maxlength="40" placeholder="new-workload-01" pattern="[a-zA-Z0-9][a-zA-Z0-9\\-]*"></label>
<label class="field">Host<select class="select" name="hostId">${fleet.hosts().map((h) => option(h.id, `${h.name} · ${String(h.memoryGb - used(h.id).memoryGb)} GB memory free`, h.id === (values.hostId ?? 'hv-north-01'))).join('')}</select></label>
<label class="field">Image<select class="select" name="os">${fleet.state.images.map((i) => option(i, i, i === (values.os ?? 'Ubuntu 24.04'))).join('')}</select></label>
<label class="field">vCPU<input class="input" name="vcpu" type="number" min="1" max="32" value="${escapeHtml(values.vcpu ?? '2')}" required></label>
<label class="field">Memory (GB)<input class="input" name="memoryGb" type="number" min="1" max="256" value="${escapeHtml(values.memoryGb ?? '4')}" required></label>
<label class="field">Disk (GB)<input class="input" name="diskGb" type="number" min="8" max="2000" value="${escapeHtml(values.diskGb ?? '40')}" required></label>
<div class="field wide"><span><button class="btn" type="submit">Provision VM</button> <a class="chip" href="${shell.href('/machines')}">Cancel</a></span></div></form></section>`
  return shell.page({ active: 'machines', title: 'Provision VM', main, url })
}

/** Where to send the person after an action: the page they came from, only when it is a path of this app. */
function backTo(shell: Context['fleetShell'], raw: string | undefined, fallback: string): string {
  if (raw !== undefined && raw.startsWith(shell.prefix === '' ? '/' : shell.prefix) && !raw.startsWith('//') && !raw.includes('\\')) {
    const url = new URL(raw, 'http://local')
    url.searchParams.delete('ok')
    url.searchParams.delete('error')
    return `${url.pathname}${url.search}`
  }
  return fallback
}

export function apply(ctx: Context): void {
  const shell = ctx.fleetShell
  const fleet = ctx.fleet
  const done = (c: { redirect(url: string, status: 303): Response }, to: string, text: string) => c.redirect(withNotice(to, 'ok', text), 303)
  const refused = (c: { redirect(url: string, status: 303): Response }, to: string, error: unknown) => {
    const refusal = fleetErrorOf(error)
    if (refusal === undefined) throw error
    return c.redirect(withNotice(to, 'error', refusal.message), 303)
  }
  const app = new Acryl()
    .get('/machines', (c) => c.html(listPage(ctx, c.req.url)))
    .get('/machines/new', (c) => c.html(formPage(ctx, c.req.url, {})))
    .post('/machines', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      const fields = Object.fromEntries(['name', 'hostId', 'os', 'vcpu', 'memoryGb', 'diskGb'].map((k) => [k, fieldOf(body, k)]))
      try {
        const vm = await fleet.provision(fields)
        return done(c, shell.href(`/machines/${encodeURIComponent(vm.id)}`), `${vm.name} is provisioning on ${fleet.host(vm.hostId).name}.`)
      } catch (error) {
        const refusal = fleetErrorOf(error)
        if (refusal === undefined) throw error
        const clean = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)) as Record<string, string>
        const page = formPage(ctx, `/machines/new?error=${encodeURIComponent(refusal.message)}`, clean)
        return c.html(page, 422)
      }
    })
    .get('/machines/:id', (c) => {
      const page = detailPage(ctx, c.req.param('id'), c.req.url)
      return page === undefined ? c.html(shell.page({ active: 'machines', title: 'Not found', main: `${shell.header('No such machine', 'It may have been removed.')}<p><a class="chip" href="${shell.href('/machines')}">← All machines</a></p>` }), 404) : c.html(page)
    })
  for (const action of ['start', 'pause', 'stop'] as Action[]) {
    app.post(`/machines/:id/${action}`, async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      const to = backTo(shell, fieldOf(body, 'back'), shell.href('/machines'))
      try {
        const vm = await fleet.act(c.req.param('id'), action)
        return done(c, to, `${vm.name} is now ${STATE_LABEL[vm.state].toLowerCase()}.`)
      } catch (error) {
        return refused(c, to, error)
      }
    })
  }
  app
    .post('/machines/:id/snapshot', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      const to = backTo(shell, fieldOf(body, 'back'), shell.href('/machines'))
      try {
        const snapshot = await fleet.snapshot(c.req.param('id'), fieldOf(body, 'label'))
        return done(c, to, `Snapshot “${snapshot.name}” created.`)
      } catch (error) {
        return refused(c, to, error)
      }
    })
    .post('/machines/:id/remove', async (c) => {
      try {
        const vm = fleet.vm(c.req.param('id'))
        await fleet.remove(vm.id)
        return done(c, shell.href('/machines'), `${vm.name} removed.`)
      } catch (error) {
        return refused(c, shell.href('/machines'), error)
      }
    })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  ctx.effect(() => shell.nav({ id: 'machines', label: 'Virtual machines', icon: '▣', path: '/machines', order: 20 }))
}
