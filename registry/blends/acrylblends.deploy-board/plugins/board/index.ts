/**
 * The deployment board: the environment columns with each service's latest deployment, the day's numbers, the event timeline and the incident rail.
 * It is the app's first screen, so `/` is the board. The same plugin queues a deployment and promotes or rolls one back.
 *
 * Routes (under the shell's prefix): GET /, GET /deployments, GET /deployments/new, POST /deployments,
 * POST /deployments/:id/promote, GET and POST /deployments/:id/rollback.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import {
  type Deployment,
  durationText,
  type Environment,
  type Release,
  ReleaseError,
  stateClass,
  stateLabel,
  whenText,
} from '../release/index.ts'

export const name = 'board'
export const inject = ['release', 'shell', 'router']

const escape = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

const dotClass = (type: string): string => (type === 'incident' ? 'red' : type === 'promote' || type === 'rollback' ? 'blue' : 'green')

export function apply(ctx: Context): void {
  const { release, shell } = ctx
  const e = shell.e
  const prefix = shell.prefix

  const card = (release: Release, serviceId: string, environment: Environment, deployment: Deployment | undefined): string => {
    const service = release.service(serviceId)
    if (deployment === undefined)
      return `<article><div><b>${escape(service?.name ?? '')}</b><span class="ok">No deploy yet</span></div><small>Nothing has been deployed here.</small></article>`
    const problem = deployment.status === 'failed' ? ' problem' : ''
    const failure = deployment.status === 'failed' && shell.has('incidents')
      ? `<a href="${shell.href('/incidents')}" style="display:inline-block;font-size:7px;background:#fff0ec;color:#b45949;padding:5px 7px;border-radius:3px;margin-top:6px;text-decoration:none">View failure ↗</a>`
      : ''
    const promote = environment.kind !== 'prod' && deployment.status === 'succeeded'
      ? `<form method="post" action="${shell.href(`/deployments/${encodeURIComponent(deployment.id)}/promote`)}" style="display:inline"><button style="font-size:7px;background:#eef5f1;color:#33785f;padding:5px 7px;border-radius:3px;margin-top:6px">Promote ↗</button></form>`
      : ''
    const rollbackLink = environment.kind === 'prod'
      ? `<a href="${shell.href(`/deployments/${encodeURIComponent(deployment.id)}/rollback`)}" style="display:inline-block;font-size:7px;background:#f6efe2;color:#946e30;padding:5px 7px;border-radius:3px;margin-top:6px;text-decoration:none">Roll back</a>`
      : ''
    return `<article${problem}><div><b>${escape(service?.name ?? '')}</b><span class="${stateClass(deployment.status)}">● ${escape(stateLabel(deployment.status, environment.kind))}</span></div><strong>${escape(deployment.version)}</strong><small>${escape(deployment.commit)}</small><footer>${escape(deployment.actor)} · ${escape(whenText(deployment.startedAt, release.now))}${deployment.durationSeconds === 0 ? '' : ` · ${durationText(deployment.durationSeconds)}`}</footer>${failure}${promote}${rollbackLink}</article>`
  }

  const board = (): string => {
    const stats = release.stats()
    const columns = release.board().map((column) => `<div class="r-col"><header><span class="env ${column.environment.kind}">${column.environment.kind.toUpperCase()}</span><b>${escape(column.environment.name)}</b><small>${String(column.cards.length)} services</small></header>${column.cards.map((entry) => card(release, entry.service.id, column.environment, entry.deployment)).join('')}</div>`).join('')
    const events = release.events(3).map((event) => `<div class="r-event"><i class="${dotClass(event.type)}"></i><time>${escape(event.at.slice(11, 19))}</time><b>${escape(event.message)}</b><small>${escape(event.type)}</small></div>`).join('')
    return `<header><div><small>RELEASE OPERATIONS / LIVE</small><h1>Deployment board</h1><p>Track release health across environments and services.</p></div><div class="r-header-actions"><a href="${shell.href('/events')}" style="background:white;border:1px solid var(--line);padding:7px 9px;border-radius:4px;font-size:7px;color:#70808a;text-decoration:none">Last 24 hours ⌄</a> <a href="${shell.href('/events')}" style="background:white;border:1px solid var(--line);padding:7px 9px;border-radius:4px;font-size:7px;color:#70808a;text-decoration:none">Export log ↓</a></div></header><div class="r-strip"><div><small>DEPLOYMENTS TODAY</small><b>${String(stats.today)}</b><span>${String(stats.succeeded)} successful · ${String(stats.failed)} failed</span></div><div><small>SUCCESS RATE</small><b class="good">${stats.successRate.toFixed(1)}%</b><span>of finished deployments</span></div><div><small>ACTIVE INCIDENTS</small><b class="bad">${String(stats.activeIncidents).padStart(2, '0')}</b><span>${release.incidents('open').length} open · ${release.incidents('acknowledged').length} acknowledged</span></div><div><small>AVG. LEAD TIME</small><b>${durationText(stats.averageSeconds)}</b><span>Finished deployments today</span></div></div><section class="r-board"><header><b>Environment releases</b><div class="r-key"><i class="success"></i> Deployed <i class="building"></i> Building <i class="failed"></i> Failed</div></header><div class="r-columns">${columns}</div></section><section class="r-events"><header><b>Release & incident timeline</b><a href="${shell.href('/events')}" style="color:#578e77;font-size:7px;text-decoration:none">Full history ↗</a></header>${events}`
  }

  const rail = (): string => {
    if (!shell.has('incidents')) return ''
    const incidents = release.incidents().filter((incident) => incident.status !== 'resolved')
    const cards = incidents.map((incident) => {
      const service = release.service(incident.serviceId)
      const environment = release.environment(incident.environmentId)
      return `<article class="${incident.severity === 'high' ? 'high' : 'medium'}"><small>● ${incident.severity.toUpperCase()} · ${escape(incident.number)}</small><b>${escape(incident.summary)}</b><p>${escape(service?.name ?? '')} · ${escape(environment?.name ?? '')}</p><div>${escape(incident.timeline[incident.timeline.length - 1]?.text ?? '')}</div><footer>Opened ${escape(whenText(incident.openedAt, release.now))} · Assigned to ${escape(incident.assignee)}</footer><a href="${shell.href(`/incidents/${encodeURIComponent(incident.id)}`)}" style="display:block;text-align:center;background:${incident.severity === 'high' ? '#a95e50' : '#f6efe2'};color:${incident.severity === 'high' ? 'white' : '#946e30'};border-radius:3px;padding:7px;margin-top:9px;font-size:7px;text-decoration:none">Investigate incident</a></article>`
    }).join('')
    return `<aside class="r-incidents"><header><b>Active incidents</b><span>${String(incidents.length).padStart(2, '0')} OPEN</span></header>${cards === '' ? '<p class="r-empty">No active incidents.</p>' : cards}<div class="r-runbook"><b>Suggested runbook</b><p>1. Inspect latest deployment diff<br/>2. Check health logs<br/>3. Roll back only after approval</p><a href="${shell.href('/incidents')}" style="color:#4b8d6d;font-size:7px;text-decoration:none">Open runbook ↗</a></div></aside>`
  }

  const newPage = (): string => {
    const services = release.services().map((service) => `<option value="${e(service.id)}">${escape(service.name)}</option>`).join('')
    const environments = release.environments().map((environment) => `<option value="${e(environment.id)}">${escape(environment.name)}</option>`).join('')
    return `<div class="r-page"><header><div><small>RELEASE OPERATIONS / NEW DEPLOYMENT</small><h1>New deployment</h1><p>Queue a build and deploy for a service and environment.</p></div></header><form class="r-form" method="post" action="${shell.href('/deployments')}"><div class="row"><label>SERVICE<select name="serviceId">${services}</select></label><label>ENVIRONMENT<select name="environmentId">${environments}</select></label></div><div class="row"><label>VERSION<input name="version" required maxlength="60" placeholder="v2.19.0"></label><label>COMMIT<input name="commit" required placeholder="8a31fc2"></label></div><label>ACTOR<input name="actor" maxlength="60" value="Alex M."></label><div class="actions"><button class="primary">Queue deployment</button><a href="${shell.href('/deployments')}">Cancel</a></div></form></div>`
  }

  const rollbackPage = (id: string): string | undefined => {
    const deployment = release.deployment(id)
    if (deployment === undefined) return undefined
    const previous = release.previousOf(deployment)
    if (previous === undefined) return undefined
    const service = release.service(deployment.serviceId)
    const environment = release.environment(deployment.environmentId)
    return `<div class="r-page"><header><div><small>RELEASE OPERATIONS / ROLLBACK</small><h1>Roll back ${escape(service?.name ?? '')}?</h1><p>${escape(environment?.name ?? '')} moves from ${escape(deployment.version)} back to ${escape(previous.version)}. The rollback is queued and needs approval before it runs.</p></div></header><form class="r-form" method="post" action="${shell.href(`/deployments/${encodeURIComponent(deployment.id)}/rollback`)}"><div class="actions"><button class="primary">Queue rollback to ${escape(previous.version)}</button><a href="${shell.href('/deployments')}">Keep ${escape(deployment.version)}</a></div></form></div>`
  }

  const app = new Acryl()
    .get('/', (c) => c.html(shell.page({ active: 'board', title: 'Deployment board', crumbs: ['Production operations', 'Deployments'], main: board(), aside: rail() })))
    .get('/deployments', (c) => c.html(shell.page({ active: 'board', title: 'Deployment board', crumbs: ['Production operations', 'Deployments'], main: board(), aside: rail() })))
    .get('/deployments/new', (c) => c.html(shell.page({ active: 'board', title: 'New deployment', crumbs: ['Deployments', 'New'], main: newPage() })))
    .post('/deployments', async (c) => {
      const form = await c.req.parseBody()
      try {
        const deployment = await release.queue({
          serviceId: String(form.serviceId ?? ''),
          environmentId: String(form.environmentId ?? ''),
          version: String(form.version ?? ''),
          commit: String(form.commit ?? ''),
          actor: String(form.actor ?? ''),
        })
        return c.redirect(shell.url('/deployments', { kind: 'ok', text: `${deployment.version} was queued (${deployment.commit}).` }), 303)
      } catch (error) {
        if (!(error instanceof ReleaseError)) throw error
        return c.redirect(shell.url('/deployments/new', { kind: 'error', text: error.message }), 303)
      }
    })
    .post('/deployments/:id/promote', async (c) => {
      try {
        const deployment = await release.promote(c.req.param('id'))
        const environment = release.environment(deployment.environmentId)
        return c.redirect(shell.url('/deployments', { kind: 'ok', text: `${deployment.version} was promoted to ${environment?.name ?? 'the next environment'}.` }), 303)
      } catch (error) {
        if (!(error instanceof ReleaseError)) throw error
        return c.redirect(shell.url('/deployments', { kind: 'error', text: error.message }), 303)
      }
    })
    .get('/deployments/:id/rollback', (c) => {
      const main = rollbackPage(c.req.param('id'))
      if (main === undefined) return c.redirect(shell.url('/deployments', { kind: 'error', text: 'There is no earlier version to roll back to.' }), 303)
      return c.html(shell.page({ active: 'board', title: 'Roll back', crumbs: ['Deployments', 'Rollback'], main }))
    })
    .post('/deployments/:id/rollback', async (c) => {
      try {
        const deployment = await release.rollback(c.req.param('id'))
        return c.redirect(shell.url('/deployments', { kind: 'ok', text: `Rollback to ${deployment.version} was queued.` }), 303)
      } catch (error) {
        if (!(error instanceof ReleaseError)) throw error
        return c.redirect(shell.url('/deployments', { kind: 'error', text: error.message }), 303)
      }
    })

  ctx.router.route(prefix === '' ? '/' : prefix, app)
  ctx.effect(() => shell.nav({ id: 'board', label: 'Deployments', icon: '▦', path: '/deployments', order: 10 }))
}
