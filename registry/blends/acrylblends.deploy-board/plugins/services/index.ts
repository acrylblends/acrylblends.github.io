/**
 * Services, environments and the full event log: the inventory the deployment board is built from.
 *
 * Routes (under the shell's prefix): GET /services, GET /environments, GET /events.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { stateLabel, whenText } from '../release/index.ts'

export const name = 'services'
export const inject = ['release', 'shell', 'router']

const escape = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

export function apply(ctx: Context): void {
  const { release, shell } = ctx
  const prefix = shell.prefix

  const services = (): string => {
    const rows = release.services().map((service) => {
      const cells = release.environments().map((environment) => {
        const deployment = release.latest(service.id, environment.id)
        return `<td>${deployment === undefined ? '—' : `<b>${escape(deployment.version)}</b><br><span class="r-badge ${deployment.status}">${escape(stateLabel(deployment.status, environment.kind))}</span>`}</td>`
      }).join('')
      return `<tr><td><b>${escape(service.name)}</b><br><small>${escape(service.repository)}</small></td><td>${escape(service.owner)}</td>${cells}</tr>`
    }).join('')
    const headers = release.environments().map((environment) => `<th>${escape(environment.name.toUpperCase())}</th>`).join('')
    return `<div class="r-page"><header><div><small>CONTROL ROOM / SERVICES</small><h1>Services</h1><p>${String(release.services().length)} services, each with its latest deployment per environment.</p></div></header><section class="r-section"><header><b>Service inventory</b><small>Latest deployments</small></header><table><thead><tr><th>SERVICE</th><th>OWNER</th>${headers}</tr></thead><tbody>${rows}</tbody></table></section></div>`
  }

  const environments = (): string => {
    const rows = release.environments().map((environment) => {
      const deployments = release.deployments({ environmentId: environment.id, today: true })
      return `<tr><td><span class="env ${environment.kind}">${environment.kind.toUpperCase()}</span></td><td><b>${escape(environment.name)}</b></td><td>${escape(environment.region)}</td><td>${String(deployments.length)} today</td><td>${String(release.services().length)} services</td></tr>`
    }).join('')
    return `<div class="r-page"><header><div><small>CONTROL ROOM / ENVIRONMENTS</small><h1>Environments</h1><p>The places a release runs.</p></div></header><section class="r-section"><header><b>Environments</b><small>${String(release.environments().length)} environments</small></header><table><thead><tr><th>ENV</th><th>NAME</th><th>REGION</th><th>DEPLOYMENTS</th><th>SERVICES</th></tr></thead><tbody>${rows}</tbody></table></section></div>`
  }

  const events = (): string => {
    const rows = release.events(100).map((event) => `<tr><td>${escape(event.at.slice(0, 16).replace('T', ' '))}</td><td><span class="r-badge">${escape(event.type)}</span></td><td>${escape(event.message)}</td><td>${escape(whenText(event.at, release.now))}</td></tr>`).join('')
    return `<div class="r-page"><header><div><small>OBSERVE / EVENTS</small><h1>Event log</h1><p>Deployments, promotions, rollbacks and incident changes.</p></div></header><section class="r-section"><header><b>Release history</b><small>${String(release.events(100).length)} events</small></header><table><thead><tr><th>WHEN</th><th>TYPE</th><th>MESSAGE</th><th>AGO</th></tr></thead><tbody>${rows === '' ? '<tr><td colspan="4">No events yet.</td></tr>' : rows}</tbody></table></section></div>`
  }

  const app = new Acryl()
    .get('/services', (c) => c.html(shell.page({ active: 'services', title: 'Services', crumbs: ['Control room', 'Services'], main: services() })))
    .get('/environments', (c) => c.html(shell.page({ active: 'environments', title: 'Environments', crumbs: ['Control room', 'Environments'], main: environments() })))
    .get('/events', (c) => c.html(shell.page({ active: 'events', title: 'Event log', crumbs: ['Observe', 'Events'], main: events() })))

  ctx.router.route(prefix === '' ? '/' : prefix, app)
  ctx.effect(() => shell.nav({ id: 'services', label: 'Services', icon: '◉', path: '/services', order: 20, group: 'CONTROL ROOM' }))
  ctx.effect(() => shell.nav({ id: 'environments', label: 'Environments', icon: '⌁', path: '/environments', order: 21, group: 'CONTROL ROOM' }))
  ctx.effect(() => shell.nav({ id: 'events', label: 'Events', icon: '◷', path: '/events', order: 40, group: 'OBSERVE' }))
}
