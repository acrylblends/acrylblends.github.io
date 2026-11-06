/** Mission history at `/missions`: every mission with its status, robot and waypoint count, plus the simulation event log. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { statusLabel, type Fleet } from '../fleet/index.ts'

export const name = 'history'
export const inject = ['fleet', 'shell', 'router']

export function apply(ctx: Context): void {
  const { fleet, shell } = ctx
  const e = shell.e
  const prefix = shell.prefix

  const app = new Acryl().get('/missions', (c) => {
    const missions = fleet.missions()
    const rows = missions
      .map((mission) => {
        const robot = fleet.robot(mission.robotId)
        const waypoints = fleet.waypoints(mission.id).length
        return `<tr><td><a href="${shell.href(`/missions/${encodeURIComponent(mission.id)}`)}"><strong>${e(mission.name)}</strong></a><small>${e(mission.createdAt.slice(0, 10))}</small></td><td>${e(robot?.name ?? '')}</td><td>${String(waypoints)}</td><td><span class="badge${mission.status === 'simulated' || mission.status === 'done' ? ' green' : ''}">${statusLabel(mission.status).toUpperCase()}</span></td><td><a href="${shell.href(`/missions/${encodeURIComponent(mission.id)}`)}">Open planner ↗</a></td></tr>`
      })
      .join('')
    const events = missions
      .flatMap((mission) => fleet.events(mission.id).map((event) => ({ event, mission })))
      .sort((a, b) => b.event.occurredAt.localeCompare(a.event.occurredAt))
      .slice(0, 20)
      .map(({ event, mission }) => `<li><time>${e(event.occurredAt.slice(0, 16).replace('T', ' '))}</time><span><b>${e(mission.name)}</b> · ${e(event.type)} · ${e(event.detail)}</span></li>`)
      .join('')
    const main = `<div class="center" style="max-width:1150px;margin:0 auto"><div class="centerhead"><div><div class="label" style="margin:0 0 6px">FLEET / MISSION HISTORY</div><h1>Mission history</h1><p>${String(missions.length)} missions · simulations and their event logs</p></div><a class="btn" href="${shell.href('/')}">Back to the planner</a></div><div class="sidecard" style="margin-top:16px"><table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left;padding:8px;font-size:7px;color:#78919a">MISSION</th><th style="text-align:left;padding:8px;font-size:7px;color:#78919a">ROBOT</th><th style="text-align:left;padding:8px;font-size:7px;color:#78919a">WAYPOINTS</th><th style="text-align:left;padding:8px;font-size:7px;color:#78919a">STATUS</th><th></th></tr></thead><tbody>${rows}</tbody></table></div><div class="sidecard"><h3>EVENT LOG</h3><ul class="history">${events === '' ? '<li><span>No events yet.</span></li>' : events}</ul></div><p style="font-size:8px;color:#83959c">Simulation only. Completed and failed runs are simulation records, not physical executions.</p></div>`
    return c.html(shell.page({ active: 'mission', title: 'Mission history', main }))
  })

  ctx.router.route(prefix === '' ? '/' : prefix, app)
}
