/**
 * Incidents, groups and the public status page: the incident log, the groups with their monitors and the create form, and the page a customer reads.
 *
 * Routes (under the shell's prefix): GET /incidents, GET /groups, POST /groups, GET /status-page.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { healthLabel, latencyText, uptimeText, whenText } from '../uptime/index.ts'

export const name = 'incidents'
export const inject = ['uptime', 'shell', 'router']

const escape = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

export function apply(ctx: Context): void {
  const { uptime, shell } = ctx
  const prefix = shell.prefix

  const incidentList = (): string => {
    const rows = uptime.incidents().map((incident) => {
      const monitor = uptime.monitor(incident.monitorId)
      return `<tr><td><b>${escape(monitor?.name ?? 'Monitor')}</b></td><td><span class="u-badge ${incident.severity === 'high' ? 'down' : 'degraded'}">${escape(incident.severity)}</span></td><td>${escape(incident.summary)}</td><td>${escape(whenText(incident.startedAt, uptime.now))}</td><td>${incident.resolvedAt === undefined ? '<span class="u-badge down">open</span>' : `<span class="u-badge up">resolved</span> ${escape(whenText(incident.resolvedAt, uptime.now))}`}</td></tr>`
    }).join('')
    return `<div class="u-page"><header><div><small>MONITORS / INCIDENTS</small><h1>Incidents</h1><p>${String(uptime.incidents(true).length)} open incidents.</p></div><a href="${shell.href('/monitors')}" style="font-size:8px;color:#257d69;text-decoration:none">Back to the monitors ↗</a></header><section class="u-section"><header><b>Incident log</b><small>${String(uptime.incidents().length)} events</small></header><table><thead><tr><th>MONITOR</th><th>SEVERITY</th><th>SUMMARY</th><th>STARTED</th><th>STATE</th></tr></thead><tbody>${rows === '' ? '<tr><td colspan="5">No incidents.</td></tr>' : rows}</tbody></table></section></div>`
  }

  const groups = (error?: string): string => {
    const rows = uptime.groups().map((group) => {
      const monitors = uptime.monitorsIn(group.id)
      return `<tr><td><b>${escape(group.name)}</b></td><td>${String(monitors.length)} monitors</td><td>${monitors.map((monitor) => escape(monitor.name)).join(', ')}</td></tr>`
    }).join('')
    return `<div class="u-page"><header><div><small>MONITORS / GROUPS</small><h1>Groups</h1><p>The groups the monitor list is organised by.</p></div></header>${error === undefined ? '' : `<p class="notice error" role="alert">${escape(error)}</p>`}<section class="u-section"><header><b>Monitor groups</b><small>${String(uptime.groups().length)} groups</small></header><table><thead><tr><th>GROUP</th><th>MONITORS</th><th>ENDPOINTS</th></tr></thead><tbody>${rows}</tbody></table></section><form class="u-form" method="post" action="${shell.href('/groups')}"><h2>Add a group</h2><p class="hint">A group only changes how the list is organised.</p><label>NAME<input name="name" required maxlength="60" placeholder="Databases"></label><div class="actions"><button class="primary">Add group</button></div></form></div>`
  }

  const statusPage = (): string => {
    const summary = uptime.summary()
    const groups = uptime.statusPage().map((entry) => `<section class="u-section"><header><b>${escape(entry.group.name)}</b><small>${String(entry.monitors.length)} monitors</small></header><table><tbody>${entry.monitors.map((monitor) => `<tr><td><b>${escape(monitor.name)}</b></td><td><span class="u-badge ${monitor.status}">${escape(healthLabel(monitor.status))}</span></td><td>${latencyText(monitor.latencyMs)}</td><td>${uptimeText(monitor.uptime30d)}</td><td>${escape(whenText(monitor.lastCheckedAt, uptime.now))}</td></tr>`).join('')}</tbody></table></section>`).join('')
    return `<div class="u-page"><header><div><small>STATUS</small><h1>${summary.down === 0 && summary.degraded === 0 ? 'All systems operational' : summary.down > 0 ? 'Some systems are down' : 'Some systems are degraded'}</h1><p>Uptime over the last 30 days: ${uptimeText(summary.uptime)}.</p></div></header>${groups === '' ? '<p class="u-empty">No monitors on the status page.</p>' : groups}</div>`
  }

  const app = new Acryl()
    .get('/incidents', (c) => c.html(shell.page({ active: 'incidents', title: 'Incidents', crumbs: ['Monitors', 'Incidents'], main: incidentList() })))
    .get('/groups', (c) => c.html(shell.page({ active: 'groups', title: 'Groups', crumbs: ['Monitors', 'Groups'], main: groups(c.req.query('error')) })))
    .post('/groups', async (c) => {
      const form = await c.req.parseBody()
      try {
        const group = await uptime.createGroup(String(form.name ?? ''))
        return c.redirect(shell.url('/groups', { kind: 'ok', text: `“${group.name}” was added.` }), 303)
      } catch (error) {
        return c.html(shell.page({ active: 'groups', title: 'Groups', crumbs: ['Monitors', 'Groups'], main: groups((error as Error).message) }))
      }
    })
    .get('/status-page', (c) => c.html(shell.page({ active: 'status-page', title: 'Status', crumbs: ['Status page'], main: statusPage() })))

  ctx.router.route(prefix === '' ? '/' : prefix, app)
  ctx.effect(() => shell.nav({ id: 'incidents', label: 'Incidents', icon: '⚑', path: '/incidents', order: 20, count: () => uptime.incidents(true).length }))
  ctx.effect(() => shell.nav({ id: 'groups', label: 'Groups', icon: '⌗', path: '/groups', order: 21 }))
  ctx.effect(() => shell.nav({ id: 'status-page', label: 'Status page', icon: '▤', path: '/status-page', order: 30 }))
}
