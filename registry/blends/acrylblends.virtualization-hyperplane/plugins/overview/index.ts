/**
 * Cluster overview, the first page (`/`): the four KPIs, the machine inventory (filtered by `?host=` from the host rail and `?q=` search), the
 * resource allocation of the cluster or of the picked host, and the recent snapshots. On the frame's home page it shows the cluster's headline.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type {} from '../home/index.ts'
import { capacityOf, percent, usageOf } from '../hyperplane/index.ts'
import { escapeHtml, whenLabel } from '../fleet-shell/index.ts'

/** How many machines the unfiltered overview lists before it points to the full inventory. */
export const OVERVIEW_ROWS = 6

export const name = 'overview'
export const inject = ['router', 'fleet', 'fleetShell', 'home']

function pageFor(ctx: Context, url: string): string {
  const shell = ctx.fleetShell
  const fleet = ctx.fleet
  const query = new URL(url, 'http://local').searchParams
  const hostParam = query.get('host') ?? ''
  const host = fleet.hosts().find((h) => h.id === hostParam)
  const q = query.get('q') ?? ''
  const all = fleet.state.vms
  const usage = usageOf(all)
  const capacity = capacityOf(fleet.hosts())
  const online = fleet.hosts().length
  const warnings = fleet.hosts().filter((h) => h.health === 'warning').length
  const scope = host === undefined ? all : all.filter((v) => v.hostId === host.id)
  const scopeUsage = usageOf(scope)
  const scopeCap = host === undefined ? capacity : { cores: host.cores, memoryGb: host.memoryGb, ssdGb: host.ssdGb }
  const network = host === undefined ? Math.round(fleet.hosts().reduce((n, h) => n + h.networkPercent, 0) / Math.max(1, online)) : host.networkPercent
  const matching = fleet.vms({ ...(host === undefined ? {} : { hostId: host.id }), q })
  // The overview keeps the inventory short so the allocation below stays in view; a host or a search shows every match.
  const capped = host === undefined && q === '' && matching.length > OVERVIEW_ROWS
  const shown = capped ? matching.slice(0, OVERVIEW_ROWS) : matching
  const cpu = percent(usage.vcpu, capacity.cores)
  const bar = (label: string, value: number) =>
    `<div class="resource"><b>${label}</b><div class="bar" role="img" aria-label="${label} ${String(value)}%"><i${value >= 90 ? ' class="hot"' : ''} style="width:${String(Math.min(100, value))}%"></i></div><span>${String(value)}%</span></div>`
  const now = fleet.now()
  const snaps = fleet
    .snapshots()
    .slice(0, 3)
    .map(
      (s) =>
        `<div class="snapshot"><span><b>${escapeHtml(s.name)}</b><br><small class="muted">${escapeHtml(whenLabel(s.createdAt, now))} · ${s.sizeGb.toFixed(1)} GB</small></span><span>● Ready</span></div>`,
    )
    .join('')
  const back = host === undefined ? shell.href('/') : shell.href(`/?host=${encodeURIComponent(host.id)}`)
  const main = `${shell.header('Cluster overview', `${fleet.state.cluster} · KVM / QEMU · sample environment`)}
<div class="cards">
<div class="kpi"><label>Hosts online</label><strong>${String(online)} / ${String(online)}</strong><small${warnings > 0 ? ' class="warn"' : ''}>${warnings > 0 ? `${String(warnings)} with a warning` : 'All responding'}</small></div>
<div class="kpi"><label>Virtual machines</label><strong id="vmCount">${String(usage.vms)}</strong><small>${String(usage.running)} running</small></div>
<div class="kpi"><label>CPU allocation</label><strong>${String(cpu)}%</strong><small>${cpu > 80 ? 'Above threshold' : 'Within threshold'}</small></div>
<div class="kpi"><label>Memory assigned</label><strong>${String(usage.memoryGb)} GB</strong><small>of ${String(capacity.memoryGb)} GB capacity</small></div></div>
<section class="panel"><div class="panelhead"><h3>Virtual machine inventory <span class="muted" id="hostLabel">· ${host === undefined ? 'all hosts' : escapeHtml(host.name)}</span></h3>
<form method="get" action="${shell.href('/')}" class="filters">${host === undefined ? '' : `<input type="hidden" name="host" value="${escapeHtml(host.id)}">`}<label class="sr" for="search">Search machines</label><input class="search" id="search" name="q" value="${escapeHtml(q)}" placeholder="Search machines or IPs…" type="search"><button class="chip" type="submit">Search</button>${host === undefined && q === '' ? '' : `<a class="chip" href="${shell.href('/')}">Clear</a>`}</form></div>
${shell.vmTable(shown, { back })}${capped && shell.has('machines') ? `<p style="margin:14px 0 0"><a class="chip" href="${shell.href('/machines')}">View all ${String(matching.length)} machines →</a></p>` : ''}</section>
<div class="detail"><section class="panel"><div class="panelhead"><h3>Resource allocation</h3><span class="muted">${host === undefined ? 'Cluster capacity' : `${escapeHtml(host.name)} capacity`}</span></div>
${bar('CPU cores', percent(scopeUsage.vcpu, scopeCap.cores))}${bar('Memory', percent(scopeUsage.memoryGb, scopeCap.memoryGb))}${bar('Local SSD', percent(scopeUsage.diskGb, scopeCap.ssdGb))}${bar('Network', network)}</section>
<section class="panel"><div class="panelhead"><h3>Recent snapshots</h3><span class="muted">Restore points</span></div>${snaps === '' ? '<div class="empty">No snapshots yet.</div>' : snaps}</section></div>
<p class="muted" style="font-size:10px;margin-top:12px">Local sample environment only. No hypervisor connection.</p>`
  return shell.page({ active: 'overview', title: 'Cluster overview', main, url })
}

export function apply(ctx: Context): void {
  const shell = ctx.fleetShell
  const app = new Acryl().get('/', (c) => c.html(pageFor(ctx, c.req.url)))
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  if (shell.prefix !== '') ctx.router.route('/', new Acryl().get(`${shell.prefix}/`, (c) => c.html(pageFor(ctx, c.req.url))))
  ctx.effect(() => shell.nav({ id: 'overview', label: 'Cluster overview', icon: '▦', path: '/', order: 10 }))
  ctx.effect(() =>
    ctx.home.widget({
      id: 'overview',
      title: 'Cluster',
      render: () => {
        const usage = usageOf(ctx.fleet.state.vms)
        return `<p><b>${escapeHtml(ctx.fleet.state.cluster)}</b></p><ul><li>${String(usage.running)} of ${String(usage.vms)} machines running</li><li>${String(usage.memoryGb)} GB memory assigned</li></ul>`
      },
    }),
  )
}
