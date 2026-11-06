/**
 * The monitor overview: the grouped endpoint list, the selected monitor's detail with its response-time chart and 90-day bars, the add-monitor form,
 * and the actions that check one now or pause it.
 *
 * Routes (under the shell's prefix): GET /, GET /monitors?monitor, GET /monitors/new, GET /monitors/:id, POST /monitors,
 * POST /monitors/:id/check, POST /monitors/:id/pause.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import {
  type Check,
  historyCounts,
  latencyText,
  type Monitor,
  scheduleText,
  sparkPath,
  uptimeText,
  whenText,
} from '../uptime/index.ts'

export const name = 'monitors'
export const inject = ['uptime', 'shell', 'router']

const escape = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

const dot = (status: string): string => (status === 'up' ? 'up' : status === 'degraded' ? 'slow' : status === 'paused' ? 'slow' : 'down')

export function apply(ctx: Context): void {
  const { uptime, shell } = ctx
  const e = shell.e
  const prefix = shell.prefix

  const row = (monitor: Monitor, selected: boolean): string =>
    `<a href="${shell.href(`/monitors/${encodeURIComponent(monitor.id)}`)}" style="display:block;color:inherit;text-decoration:none"><article${selected ? ' class="selected"' : ''} data-row><i class="${dot(monitor.status)}"></i><div><b>${escape(monitor.name)}</b><small>${escape(scheduleText(monitor))}</small></div><span class="latency${monitor.latencyMs >= 1000 ? ' high' : ''}">${monitor.status === 'paused' ? 'paused' : latencyText(monitor.latencyMs)}</span><strong>${monitor.uptime30d === 0 ? '—' : uptimeText(monitor.uptime30d)}</strong><small>30d uptime</small><b class="dots">···</b></article></a>`

  const chart = (monitor: Monitor): string => {
    const values = monitor.responseTimes.length === 0 ? [0] : monitor.responseTimes
    const max = Math.max(...values, 1)
    const path = sparkPath(values, 600, 145)
    const labels = [0, 6, 12, 18, 23].map((index) => (index === 23 ? 'Now' : `${String(index).padStart(2, '0')}:00`))
    const y = [max, max * 0.75, max * 0.5, max * 0.25, 0].map((value) => latencyText(value))
    return `<div class="u-line"><div class="u-y">${y.map((value) => `<span>${value}</span>`).join('')}</div><svg viewBox="0 0 600 145" preserveAspectRatio="none"><path d="${path}" fill="none" stroke="#59b49b" stroke-width="2.5"/><path d="${path}${path === '' ? '' : ' L600 145 L0 145 Z'}" fill="#59b49b" opacity=".09"/></svg></div><div class="u-x">${labels.map((label) => `<span>${label}</span>`).join('')}</div>`
  }

  const bars = (monitor: Monitor): string => {
    const counts = historyCounts(monitor)
    const items = monitor.history.map((day) => `<i class="${day.state === 'up' ? '' : day.state}" title="${day.day}: ${day.state}"></i>`).join('')
    return `<div class="u-bars">${items === '' ? '<span class="u-empty">No history yet.</span>' : items}</div><footer><span>90 days ago</span><span>Today</span><span>● Operational (${String(counts.up)})</span><span>● Degraded (${String(counts.degraded)})</span><span>● Down (${String(counts.down)})</span></footer>`
  }

  const checks = (monitor: Monitor): string => {
    const items = uptime.checks(monitor.id, 3).map((check: Check) => `<p><i class="${check.result === 'up' ? '' : check.result}"></i> ${check.statusCode === 0 ? (check.result === 'up' ? 'TCP OK' : 'TCP failed') : `${String(check.statusCode)} OK`} <span>${latencyText(check.latencyMs)} · ${escape(whenText(check.checkedAt, uptime.now))}</span></p>`).join('')
    return items === '' ? '<p class="u-empty">No checks yet. Press Check now.</p>' : items
  }

  const detail = (monitor: Monitor): string =>
    `<section class="u-detail"><header><div><span class="u-dot" style="background:${monitor.status === 'up' ? '#42a27c' : monitor.status === 'degraded' ? '#dda34e' : monitor.status === 'paused' ? '#9ca8a5' : '#c96554'}"></span><b>${escape(monitor.name)}</b><small>${monitor.protocol.toUpperCase()} monitor · ID ${escape(monitor.id)}</small></div><a href="${shell.href('/monitors/new')}" style="background:none;color:#94a09d;text-decoration:none">···</a></header><div class="u-detail-kpis"><div><small>RESPONSE TIME</small><b>${monitor.status === 'paused' ? '—' : latencyText(monitor.latencyMs)}</b><span>${monitor.status === 'degraded' ? 'Above the 1 s threshold' : 'From the latest check'}</span></div><div><small>UPTIME (30D)</small><b>${monitor.uptime30d === 0 ? '—' : uptimeText(monitor.uptime30d)}</b><span>${String(uptime.incidents().filter((incident) => incident.monitorId === monitor.id).length)} incidents recorded</span></div></div><div class="u-response"><header><b>Response time</b><small>Last 24 hours</small></header>${chart(monitor)}</div><div class="u-history"><header><b>90-day status history</b><small>Each bar represents one day</small></header>${bars(monitor)}</div><div class="u-last"><b>RECENT CHECKS</b>${checks(monitor)}</div><div class="u-actions" style="display:flex;gap:7px;margin-top:12px;border-top:1px solid #edf0ef;padding-top:12px"><form method="post" action="${shell.href(`/monitors/${encodeURIComponent(monitor.id)}/check`)}"><button style="background:#3c9c7e;color:white;border-radius:4px;padding:7px 10px;font-size:8px">Check now</button></form><form method="post" action="${shell.href(`/monitors/${encodeURIComponent(monitor.id)}/pause`)}"><button style="background:#eef3f2;color:#52645f;border-radius:4px;padding:7px 10px;font-size:8px">${monitor.status === 'paused' ? 'Resume' : 'Pause'}</button></form><a href="${shell.href('/status-page')}" style="font-size:8px;color:#257d69;text-decoration:none;padding:7px 4px">Status page ↗</a></div></section>`

  const page = (requested: string | undefined, notice: string): string => {
    const selected = (requested === undefined ? undefined : uptime.monitor(requested)) ?? uptime.monitors()[0]
    const summary = uptime.summary()
    const groups = uptime.groups().map((group) => {
      const monitors = uptime.monitorsIn(group.id)
      return `<div class="u-group"><b>${escape(group.name).toUpperCase()}</b><span>${String(monitors.length)} monitors</span></div>${monitors.map((monitor) => row(monitor, monitor.id === selected?.id)).join('')}`
    }).join('')
    const tone = summary.down > 0 ? 'down' : 'up'
    return `<header><div><small>NETWORK / AVAILABILITY</small><h1>Monitor overview</h1><p>Checks every 60 seconds · ${selected?.lastCheckedAt === undefined || selected.lastCheckedAt === '' ? 'Not checked yet' : `Last check ${escape(whenText(selected.lastCheckedAt, uptime.now))}`}</p></div><a href="${shell.href('/status-page')}" style="background:white;border:1px solid var(--line);border-radius:4px;padding:8px 10px;font-size:8px;color:#72827f;text-decoration:none">Status page ↗</a></header>${notice}<section class="u-summary"><div class="u-health"><div class="u-ring" style="border-color:${tone === 'up' ? '#5ab99c' : tone === 'degraded' ? '#dda34e' : '#c96554'}"><b>${uptimeText(summary.uptime)}</b></div><div><b>${summary.healthy === summary.monitors ? 'All monitored services are operational' : `${String(summary.healthy)} of ${String(summary.monitors)} monitors healthy`}</b><small>${summary.degraded === 0 && summary.down === 0 ? 'No degraded endpoints' : `${String(summary.degraded)} degraded · ${String(summary.down)} down`}</small><span>Uptime over the last 30 days</span></div></div><div><small>ACTIVE MONITORS</small><b>${String(summary.monitors - uptime.monitors().filter((monitor) => monitor.status === 'paused').length)}</b></div><div><small>OPEN INCIDENTS</small><b class="warn">${String(summary.openIncidents).padStart(2, '0')}</b></div><div><small>AVG. RESPONSE</small><b>${latencyText(summary.averageLatency)}</b></div></section><div class="u-content"><section class="u-list"><header><b>Monitored endpoints</b><div><a href="${shell.href('/monitors/new')}" style="border:1px solid var(--line);background:white;border-radius:4px;padding:6px;font-size:7px;color:#71817e;text-decoration:none">＋ Add</a></div></header>${groups}</section>${selected === undefined ? '<section class="u-detail"><p class="u-empty">No monitors yet. Add one to begin.</p></section>' : detail(selected)}</div>`
  }

  const newPage = (): string => {
    const groups = uptime.groups().map((group) => `<option value="${e(group.id)}">${escape(group.name)}</option>`).join('')
    return `<div class="u-page"><header><div><small>MONITORS / NEW</small><h1>Add monitor</h1><p>A URL or a host:port, checked on its own schedule.</p></div></header><form class="u-form" method="post" action="${shell.href('/monitors')}"><div class="row"><label>NAME<input name="name" required maxlength="120" placeholder="api.example.dev"></label><label>GROUP<select name="groupId">${groups}</select></label></div><div class="row"><label>PROTOCOL<select name="protocol"><option value="https">HTTPS</option><option value="http">HTTP</option><option value="tcp">TCP</option></select></label><label>TARGET<input name="target" required placeholder="api.example.dev or host:5432"></label></div><div class="row"><label>PATH<input name="path" value="/" placeholder="/health"></label><label>EXPECTED STATUS<input name="expectedStatus" value="200" inputmode="numeric"></label></div><div class="row"><label>INTERVAL (seconds)<input name="intervalSeconds" value="60" inputmode="numeric"></label><label>TIMEOUT (ms)<input name="timeoutMs" value="5000" inputmode="numeric"></label></div><div class="actions"><button class="primary">Add monitor</button><a href="${shell.href('/monitors')}">Cancel</a></div></form></div>`
  }

  const app = new Acryl()
    .get('/', (c) => c.html(shell.page({ active: 'monitors', title: 'Monitor overview', crumbs: ['Monitors', 'Overview'], main: page(undefined, shell.notice(c.req.url)) })))
    .get('/monitors', (c) => c.html(shell.page({ active: 'monitors', title: 'Monitor overview', crumbs: ['Monitors', 'Overview'], main: page(c.req.query('monitor'), shell.notice(c.req.url)) })))
    .get('/monitors/new', (c) => c.html(shell.page({ active: 'monitors', title: 'Add monitor', crumbs: ['Monitors', 'New'], main: newPage() })))
    .get('/monitors/:id', (c) => {
      if (uptime.monitor(c.req.param('id')) === undefined) return c.redirect(shell.url('/monitors', { kind: 'error', text: 'That monitor no longer exists.' }), 303)
      return c.html(shell.page({ active: 'monitors', title: 'Monitor', crumbs: ['Monitors', c.req.param('id')], main: page(c.req.param('id'), shell.notice(c.req.url)) }))
    })
    .post('/monitors', async (c) => {
      const form = await c.req.parseBody()
      try {
        const monitor = await uptime.createMonitor({
          name: String(form.name ?? ''),
          target: String(form.target ?? ''),
          protocol: String(form.protocol ?? 'https'),
          path: String(form.path ?? ''),
          intervalSeconds: Number(form.intervalSeconds ?? 60),
          timeoutMs: Number(form.timeoutMs ?? 5000),
          expectedStatus: Number(form.expectedStatus ?? 200),
          groupId: String(form.groupId ?? ''),
        })
        return c.redirect(shell.url(`/monitors/${encodeURIComponent(monitor.id)}`, { kind: 'ok', text: `${monitor.name} was added. Press Check now for its first check.` }), 303)
      } catch (error) {
        return c.redirect(shell.url('/monitors/new', { kind: 'error', text: (error as Error).message }), 303)
      }
    })
    .post('/monitors/:id/check', async (c) => {
      const id = c.req.param('id')
      try {
        const outcome = await uptime.checkNow(id)
        const message = outcome.check.result === 'up'
          ? `${outcome.monitor.name} answered in ${latencyText(outcome.check.latencyMs)}.`
          : `${outcome.monitor.name} is ${outcome.check.result}${outcome.check.error === undefined ? '' : `: ${outcome.check.error}`}.`
        return c.redirect(shell.url(`/monitors/${encodeURIComponent(id)}`, { kind: outcome.check.result === 'up' ? 'ok' : 'error', text: message }), 303)
      } catch (error) {
        return c.redirect(shell.url('/monitors', { kind: 'error', text: (error as Error).message }), 303)
      }
    })
    .post('/monitors/:id/pause', async (c) => {
      const id = c.req.param('id')
      try {
        const monitor = await uptime.togglePause(id)
        return c.redirect(shell.url(`/monitors/${encodeURIComponent(id)}`, { kind: 'ok', text: `${monitor.name} is ${monitor.status === 'paused' ? 'paused' : 'active again'}.` }), 303)
      } catch (error) {
        return c.redirect(shell.url('/monitors', { kind: 'error', text: (error as Error).message }), 303)
      }
    })

  ctx.router.route(prefix === '' ? '/' : prefix, app)
  ctx.effect(() => shell.nav({ id: 'monitors', label: 'Monitors', icon: '◉', path: '/monitors', order: 10 }))
}
