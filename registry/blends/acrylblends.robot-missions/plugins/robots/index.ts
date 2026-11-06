/** Robot detail at `/robots/:id`: battery, pose, mode, telemetry history and the missions assigned to the unit. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { statusLabel, type Fleet } from '../fleet/index.ts'

export const name = 'robots'
export const inject = ['fleet', 'shell', 'router']

export function apply(ctx: Context): void {
  const { fleet, shell } = ctx
  const e = shell.e
  const prefix = shell.prefix

  const app = new Acryl().get('/robots/:id', (c) => {
    const robot = fleet.robot(c.req.param('id'))
    if (robot === undefined) return c.redirect(shell.url('/', { kind: 'error', text: 'That robot no longer exists.' }), 303)
    const samples = fleet.telemetrySamples(robot.id)
    const missions = fleet.missions().filter((mission) => mission.robotId === robot.id)
    const rows = samples
      .map((sample) => `<tr><td>${e(sample.at.slice(0, 16).replace('T', ' '))}</td><td>${String(sample.batteryPct)}%</td><td>X ${String(sample.x)} · Y ${String(sample.y)}</td><td>${e(sample.mode)}</td></tr>`)
      .join('')
    const missionRows = missions
      .map((mission) => `<a class="mrow" href="${shell.href(`/missions/${encodeURIComponent(mission.id)}`)}">${e(mission.name)} <b>${statusLabel(mission.status)}</b></a>`)
      .join('')
    const main = `<div class="center" style="max-width:1100px;margin:0 auto"><div class="centerhead"><div><div class="label" style="margin:0 0 6px">ROBOT / ${e(robot.name)}</div><h1>${e(robot.name)}</h1><p>${e(robot.model)} · ${e(robot.mode)} · ${robot.status.toUpperCase()}</p></div><a class="btn" href="${shell.href('/')}">Back to the planner</a></div><div class="sidecard" style="margin-top:16px"><h3>TELEMETRY · BATTERY ${String(robot.batteryPct)}%</h3><div class="telemetry"><div><small>POSE</small><strong>X ${String(robot.poseX)} · Y ${String(robot.poseY)}</strong></div><div><small>MODE</small><strong>${e(robot.mode)}</strong></div><div><small>SAMPLES</small><strong>${String(samples.length)}</strong></div><div><small>MISSIONS</small><strong>${String(missions.length)}</strong></div></div></div><div class="sidecard"><h3>TELEMETRY HISTORY</h3><table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left;padding:7px;font-size:7px;color:#78919a">AT</th><th style="text-align:left;padding:7px;font-size:7px;color:#78919a">BATTERY</th><th style="text-align:left;padding:7px;font-size:7px;color:#78919a">POSE</th><th style="text-align:left;padding:7px;font-size:7px;color:#78919a">MODE</th></tr></thead><tbody>${rows === '' ? '<tr><td colspan="4"><p class="empty">No telemetry samples yet.</p></td></tr>' : rows}</tbody></table></div><div class="sidecard"><h3>MISSIONS</h3>${missionRows === '' ? '<p class="empty">No missions assigned.</p>' : missionRows}</div><p style="font-size:8px;color:#83959c">Simulation only. Telemetry is seeded sample data; this app does not connect to a robot controller.</p></div>`
    return c.html(shell.page({ active: 'mission', title: robot.name, main }))
  })

  ctx.router.route(prefix === '' ? '/' : prefix, app)
}
