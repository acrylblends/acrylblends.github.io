/**
 * Incidents: the queue with severity and state, one incident in full with its timeline, and the acknowledge/resolve actions.
 *
 * Routes (under the shell's prefix): GET /incidents, GET /incidents/:id, POST /incidents/:id/ack, POST /incidents/:id/resolve.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { ReleaseError, whenText } from '../release/index.ts'

export const name = 'incidents'
export const inject = ['release', 'shell', 'router']

export function apply(ctx: Context): void {
  const { release, shell } = ctx
  const e = shell.e
  const prefix = shell.prefix

  const list = (): string => {
    const rows = release.incidents().map((incident) => {
      const service = release.service(incident.serviceId)
      const environment = release.environment(incident.environmentId)
      return `<tr><td><a href="${shell.href(`/incidents/${encodeURIComponent(incident.id)}`)}"><b>${e(incident.number)}</b></a></td><td><span class="r-badge ${incident.severity === 'high' ? 'failed' : incident.severity === 'medium' ? 'building' : ''}">${e(incident.severity)}</span></td><td>${e(incident.summary)}</td><td>${e(service?.name ?? '')} · ${e(environment?.name ?? '')}</td><td>${e(incident.assignee)}</td><td><span class="r-badge ${incident.status === 'resolved' ? 'succeeded' : incident.status === 'open' ? 'failed' : 'building'}">${e(incident.status)}</span></td><td>${e(whenText(incident.openedAt, release.now))}</td></tr>`
    }).join('')
    return `<div class="r-page"><header><div><small>RELEASE OPERATIONS / INCIDENTS</small><h1>Incidents</h1><p>${String(release.incidents().filter((incident) => incident.status !== 'resolved').length)} active incidents.</p></div><a href="${shell.href('/deployments')}" style="font-size:8px;color:#33785f;text-decoration:none">Back to the board ↗</a></header><section class="r-section"><header><b>Incident queue</b><small>${String(release.incidents().length)} total</small></header><table><thead><tr><th>NUMBER</th><th>SEVERITY</th><th>SUMMARY</th><th>SERVICE</th><th>ASSIGNEE</th><th>STATUS</th><th>OPENED</th></tr></thead><tbody>${rows === '' ? '<tr><td colspan="7">No incidents.</td></tr>' : rows}</tbody></table></section></div>`
  }

  const detail = (id: string): string | undefined => {
    const incident = release.incident(id)
    if (incident === undefined) return undefined
    const service = release.service(incident.serviceId)
    const environment = release.environment(incident.environmentId)
    const timeline = incident.timeline.map((item) => `<article><i class="${incident.severity === 'high' ? 'red' : 'blue'}"></i><time>${e(item.at.slice(11, 16))}</time><b>${e(item.text)}</b></article>`).join('')
    const actions = incident.status === 'resolved'
      ? '<p class="r-empty">This incident is resolved.</p>'
      : `<div class="actions">${incident.status === 'open' ? `<form method="post" action="${shell.href(`/incidents/${encodeURIComponent(incident.id)}/ack`)}" style="display:inline"><button class="primary">Acknowledge</button></form>` : ''}<form method="post" action="${shell.href(`/incidents/${encodeURIComponent(incident.id)}/resolve`)}" style="display:inline"><button>Resolve</button></form></div>`
    return `<div class="r-page"><header><div><small>RELEASE OPERATIONS / ${e(incident.number)}</small><h1>${e(incident.summary)}</h1><p>${e(service?.name ?? '')} · ${e(environment?.name ?? '')} · ${e(incident.severity)} · ${e(incident.status)}</p></div><a href="${shell.href('/incidents')}" style="font-size:8px;color:#33785f;text-decoration:none">All incidents ↗</a></header><section class="r-section"><header><b>Timeline</b><small>Opened ${e(whenText(incident.openedAt, release.now))} · assigned to ${e(incident.assignee)}</small></header><div class="r-timeline" style="padding:10px 15px">${timeline}</div></section><form class="r-form" method="post" action="${shell.href(`/incidents/${encodeURIComponent(incident.id)}/resolve`)}">${actions}</form></div>`
  }

  const app = new Acryl()
    .get('/incidents', (c) => c.html(shell.page({ active: 'incidents', title: 'Incidents', crumbs: ['Control room', 'Incidents'], main: list() })))
    .get('/incidents/:id', (c) => {
      const main = detail(c.req.param('id'))
      if (main === undefined) return c.redirect(shell.url('/incidents', { kind: 'error', text: 'That incident no longer exists.' }), 303)
      return c.html(shell.page({ active: 'incidents', title: 'Incident', crumbs: ['Control room', 'Incidents', c.req.param('id')], main }))
    })
    .post('/incidents/:id/ack', async (c) => {
      try {
        await release.acknowledge(c.req.param('id'))
        return c.redirect(shell.url(`/incidents/${encodeURIComponent(c.req.param('id'))}`, { kind: 'ok', text: 'The incident is acknowledged.' }), 303)
      } catch (error) {
        if (!(error instanceof ReleaseError)) throw error
        return c.redirect(shell.url(`/incidents/${encodeURIComponent(c.req.param('id'))}`, { kind: 'error', text: error.message }), 303)
      }
    })
    .post('/incidents/:id/resolve', async (c) => {
      try {
        await release.resolve(c.req.param('id'))
        return c.redirect(shell.url(`/incidents/${encodeURIComponent(c.req.param('id'))}`, { kind: 'ok', text: 'The incident is resolved.' }), 303)
      } catch (error) {
        if (!(error instanceof ReleaseError)) throw error
        return c.redirect(shell.url(`/incidents/${encodeURIComponent(c.req.param('id'))}`, { kind: 'error', text: error.message }), 303)
      }
    })

  ctx.router.route(prefix === '' ? '/' : prefix, app)
  ctx.effect(() => shell.nav({ id: 'incidents', label: 'Incidents', icon: '⚑', path: '/incidents', order: 30, count: () => release.incidents().filter((incident) => incident.status !== 'resolved').length }))
}
