/** The mission planner: the fleet rail, the facility map, the waypoint editor and the simulation controls. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { FleetError, statusLabel, telemetryOf, timeText } from '../fleet/index.ts'
const escape = (text: string): string => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
export const name = 'missions'
export const inject = ['fleet', 'shell', 'router']
export function apply(ctx: Context): void {
  const { fleet, shell } = ctx
  const e = shell.e
  const prefix = shell.prefix
  const page = (missionId: string | undefined, robotId: string | undefined, url: string): string => {
    const mission = (missionId === undefined ? undefined : fleet.mission(missionId)) ?? fleet.missions()[0]
    const robot = (robotId === undefined ? undefined : fleet.robot(robotId)) ?? (mission === undefined ? fleet.robots()[0] : fleet.robot(mission.robotId)) ?? fleet.robots()[0]
    const waypoints = mission === undefined ? [] : fleet.waypoints(mission.id)
    const telemetry = mission === undefined ? telemetryOf([], fleet.obstacles(), 'draft') : fleet.telemetry(mission.id)
    const width = 800
    const height = 560
    const px = (x: number): number => (x / 32) * width
    const py = (y: number): number => (y / 24) * height
    const route = waypoints.map((waypoint, index) => `${index === 0 ? 'M' : 'L'}${px(waypoint.x).toFixed(0)} ${py(waypoint.y).toFixed(0)}`).join(' ')
    const obstacles = fleet.obstacles().map((obstacle) => `<rect x="${String(px(obstacle.x))}" y="${String(py(obstacle.y))}" width="${String(px(obstacle.w))}" height="${String(py(obstacle.h))}" rx="4" fill="#9d4e43" stroke="#e07969"/>`).join('')
    const racks: readonly { x: number; y: number; w: number; h: number; label: string }[] = [
      { x: 2, y: 3, w: 5, h: 4, label: 'RACK A1' }, { x: 8, y: 3, w: 5, h: 4, label: 'RACK A2' },
      { x: 14, y: 3, w: 5, h: 4, label: 'RACK A3' }, { x: 21, y: 3, w: 7, h: 4, label: 'PACKING' },
      { x: 2, y: 16, w: 5, h: 4, label: 'RACK B1' }, { x: 8, y: 16, w: 5, h: 4, label: 'RACK B2' },
      { x: 14, y: 16, w: 5, h: 4, label: 'RACK B3' }, { x: 21, y: 16, w: 7, h: 4, label: 'CHARGING' },
    ]
    const rackArt = racks.map((rack) => `<rect x="${String(px(rack.x))}" y="${String(py(rack.y))}" width="${String(px(rack.w))}" height="${String(py(rack.h))}" fill="#24353b" stroke="#3a525a" stroke-width="2"/><text x="${String(px(rack.x + 0.8))}" y="${String(py(rack.y + 2))}" fill="#6b838a" font-size="10" font-family="monospace" opacity=".8">${rack.label}</text>`).join('')
    const points = waypoints.map((waypoint) => `<circle cx="${String(px(waypoint.x))}" cy="${String(py(waypoint.y))}" r="9" fill="#e3b46e" stroke="#fff" stroke-width="2"><title>${escape(waypoint.action)}</title></circle>`).join('')
    const pin = robot === undefined ? '' : `<circle cx="${String(px(robot.poseX))}" cy="${String(py(robot.poseY))}" r="17" fill="#174b4a" stroke="#5ce3d1" stroke-width="2"/><text x="${String(px(robot.poseX))}" y="${String(py(robot.poseY) + 4)}" text-anchor="middle" fill="#b4fff4" font-size="10" font-family="monospace">${escape((robot.name.match(/^([A-Z])[A-Z]*-0*(\d+)/u) ?? ['', 'R', '1']).slice(1, 3).join(''))}</text>`
    const fleets = fleet.robots().map((item) => `<a class="robot${item.id === robot?.id ? ' active' : ''}" href="${shell.href(`/robots/${encodeURIComponent(item.id)}${mission === undefined ? '' : `?mission=${encodeURIComponent(mission.id)}`}`)}" style="text-decoration:none"><span class="dot" style="color:${item.status === 'idle' ? '#d2a05b' : '#5ce3d1'}">● ${item.status.toUpperCase()}</span><strong>${escape(item.name)}</strong><small>${escape(item.model)} · Battery ${String(item.batteryPct)}%</small></a>`).join('')
    const missions = fleet.missions().map((item) => `<a class="mrow" href="${shell.href(`/missions/${encodeURIComponent(item.id)}`)}" style="text-decoration:none">${escape(item.name)} <b>${statusLabel(item.status)}</b></a>`).join('')
    const waypointRows = waypoints.map((waypoint) => `<div class="waypoint"><b>${String(waypoint.sequence).padStart(2, '0')}</b> ${escape(waypoint.action)} <span class="order">${waypoint.sequence === 1 ? '✓' : waypoint.sequence === 2 ? '→' : String(waypoint.sequence).padStart(2, '0')}</span>${mission === undefined ? '' : `<form method="post" action="${shell.href(`/missions/${encodeURIComponent(mission.id)}/waypoints/${encodeURIComponent(waypoint.id)}/move`)}" style="display:inline"><input type="hidden" name="direction" value="up"><button style="background:none;color:#8ea4ab;border:0;font-size:8px" aria-label="Move waypoint up">↑</button></form><form method="post" action="${shell.href(`/missions/${encodeURIComponent(mission.id)}/waypoints/${encodeURIComponent(waypoint.id)}/move`)}" style="display:inline"><input type="hidden" name="direction" value="down"><button style="background:none;color:#8ea4ab;border:0;font-size:8px" aria-label="Move waypoint down">↓</button></form><form method="post" action="${shell.href(`/missions/${encodeURIComponent(mission.id)}/waypoints/${encodeURIComponent(waypoint.id)}/delete`)}" style="display:inline"><button style="background:none;color:#e07969;border:0;font-size:8px" aria-label="Delete waypoint">✕</button></form>`}</div>`).join('')
    const main = `${shell.notice(url)}<div class="shell"><aside class="side left"><div class="label">ROBOT FLEET / ${String(fleet.robots().length).padStart(2, '0')}</div>${fleets}<div class="mission"><div class="label">MISSIONS</div>${missions}</div></aside><main class="center"><div class="centerhead"><div><h1>Mission map</h1><p>Warehouse simulation · Grid 32 × 24 · Scale 0.5 m / cell</p></div><div class="controls">${mission === undefined ? '' : `<form method="post" action="${shell.href(`/missions/${encodeURIComponent(mission.id)}/reset`)}" style="display:inline"><button>↺ Reset</button></form><form method="post" action="${shell.href(`/missions/${encodeURIComponent(mission.id)}/save`)}" style="display:inline"><button>Save draft</button></form><a class="btn" href="#add-waypoint" style="display:inline-block">＋ Add waypoint</a><form method="post" action="${shell.href(`/missions/${encodeURIComponent(mission.id)}/pause`)}" style="display:inline"><button>Ⅱ Pause</button></form><form method="post" action="${shell.href(`/missions/${encodeURIComponent(mission.id)}/simulate`)}" style="display:inline"><button class="run">▶ Simulate mission</button></form>`}</div></div><div class="mapframe"><div class="maphead">FACILITY MAP / LAYER: OCCUPANCY + ROUTE</div><div class="legend"><span><i style="background:#52dbc7"></i>Robot</span><span><i style="background:#e4b466"></i>Waypoint</span><span><i style="background:#e36e5c"></i>Obstacle</span><span><i style="background:#5c97e6"></i>Route</span></div><svg class="map" viewBox="0 0 800 560" aria-label="Mission map"><defs><pattern id="grid" width="25" height="25" patternUnits="userSpaceOnUse"><path d="M25 0H0V25" fill="none" stroke="#283d46" stroke-width="1"/></pattern></defs><rect width="800" height="560" fill="#111e25"/><rect width="800" height="560" fill="url(#grid)"/>${rackArt}${obstacles}${route === '' ? '' : `<path d="${route}" stroke="#5d99ea" stroke-width="4" stroke-dasharray="9 6" fill="none" stroke-linecap="round"/>`}${points}${pin}</svg></div>${mission === undefined ? '<p class="empty">No mission selected.</p>' : `<form class="form" id="add-waypoint" method="post" action="${shell.href(`/missions/${encodeURIComponent(mission.id)}/waypoints`)}"><h2>Add waypoint</h2><div style="display:grid;grid-template-columns:80px 80px 1fr;gap:8px"><label>X<input name="x" inputmode="numeric" value="12"></label><label>Y<input name="y" inputmode="numeric" value="12"></label><label>ACTION<input name="action" required placeholder="Pickup at aisle A2"></label></div><div class="actions"><button class="primary">＋ Add waypoint</button></div></form><form class="form" method="post" action="${shell.href(`/missions/${encodeURIComponent(mission.id)}/simulate`)}"><div class="actions"><button class="primary">▶ Simulate mission</button></div></form>`}</main><aside class="side right"><section class="sidecard"><h3>SELECTED ROBOT</h3><div class="kv"><span>Unit</span><b>${escape(robot?.name ?? '—')}</b></div><div class="kv"><span>Battery</span><b>${String(robot?.batteryPct ?? 0)}%</b></div><div class="kv"><span>Pose</span><b>X ${String(robot?.poseX ?? 0)} · Y ${String(robot?.poseY ?? 0)}</b></div><div class="kv"><span>Mode</span><b>${escape(robot?.mode ?? '—')}</b></div></section><section class="sidecard"><h3>MISSION WAYPOINTS</h3>${waypointRows === '' ? '<p class="empty">No waypoints yet.</p>' : waypointRows}</section><section class="sidecard"><h3>MISSION TELEMETRY</h3><div class="telemetry"><div><small>DISTANCE</small><strong>${String(telemetry.distance)} m</strong></div><div><small>EST. TIME</small><strong>${timeText(telemetry.eta)}</strong></div><div><small>OBSTACLES</small><strong>${String(telemetry.obstacles).padStart(2, '0')}</strong></div><div><small>PROGRESS</small><strong>${String(telemetry.progress)}%</strong></div></div></section><p style="font-size:8px;color:#83959c;padding:0 12px">Simulation only. No robot is moved by this app; drafts, simulated and executed runs are marked separately.</p></aside></div>`
    return shell.page({ active: 'mission', title: mission?.name ?? 'Mission planner', main })
  }
  const app = new Acryl()
    .get('/', (c) => c.html(page(undefined, undefined, c.req.url)))
    .get('/missions/:id', (c) => {
      if (fleet.mission(c.req.param('id')) === undefined) return c.redirect(shell.url('/', { kind: 'error', text: 'That mission no longer exists.' }), 303)
      return c.html(page(c.req.param('id'), c.req.query('robot'), c.req.url))
    })
    .post('/missions/:id/waypoints', async (c) => {
      const form = await c.req.parseBody()
      try {
        await fleet.addWaypoint(c.req.param('id'), form.x, form.y, form.action)
        return c.redirect(shell.url(`/missions/${encodeURIComponent(c.req.param('id'))}`, { kind: 'ok', text: 'Waypoint added.' }), 303)
      } catch (error) {
        return c.redirect(shell.url(`/missions/${encodeURIComponent(c.req.param('id'))}`, { kind: 'error', text: (error as Error).message }), 303)
      }
    })
    .post('/missions/:id/waypoints/:wid/delete', async (c) => {
      try {
        await fleet.removeWaypoint(c.req.param('id'), c.req.param('wid'))
        return c.redirect(shell.url(`/missions/${encodeURIComponent(c.req.param('id'))}`, { kind: 'ok', text: 'Waypoint removed.' }), 303)
      } catch (error) {
        return c.redirect(shell.url(`/missions/${encodeURIComponent(c.req.param('id'))}`, { kind: 'error', text: (error as Error).message }), 303)
      }
    })
    .post('/missions/:id/waypoints/:wid/move', async (c) => {
      const form = await c.req.parseBody()
      try {
        await fleet.moveWaypoint(c.req.param('id'), c.req.param('wid'), form.direction === 'up' ? 'up' : 'down')
        return c.redirect(shell.url(`/missions/${encodeURIComponent(c.req.param('id'))}`, { kind: 'ok', text: 'Waypoint reordered.' }), 303)
      } catch (error) {
        return c.redirect(shell.url(`/missions/${encodeURIComponent(c.req.param('id'))}`, { kind: 'error', text: (error as Error).message }), 303)
      }
    })
    .post('/missions/:id/save', async (c) => {
      try {
        const mission = await fleet.saveDraft(c.req.param('id'))
        return c.redirect(shell.url(`/missions/${encodeURIComponent(mission.id)}`, { kind: 'ok', text: 'Draft saved.' }), 303)
      } catch (error) {
        return c.redirect(shell.url(`/missions/${encodeURIComponent(c.req.param('id'))}`, { kind: 'error', text: (error as Error).message }), 303)
      }
    })
    .post('/missions/:id/pause', async (c) => {
      try {
        await fleet.pause(c.req.param('id'))
        return c.redirect(shell.url(`/missions/${encodeURIComponent(c.req.param('id'))}`, { kind: 'ok', text: 'Simulation paused.' }), 303)
      } catch (error) {
        return c.redirect(shell.url(`/missions/${encodeURIComponent(c.req.param('id'))}`, { kind: 'error', text: (error as Error).message }), 303)
      }
    })
    .post('/missions/:id/simulate', async (c) => {
      try {
        await fleet.simulate(c.req.param('id'))
        return c.redirect(shell.url(`/missions/${encodeURIComponent(c.req.param('id'))}`, { kind: 'ok', text: 'Simulation completed; no robot was moved.' }), 303)
      } catch (error) {
        if (!(error instanceof FleetError)) throw error
        return c.redirect(shell.url(`/missions/${encodeURIComponent(c.req.param('id'))}`, { kind: 'error', text: error.message }), 303)
      }
    })
    .post('/missions/:id/reset', async (c) => {
      try {
        await fleet.reset(c.req.param('id'))
        return c.redirect(shell.url(`/missions/${encodeURIComponent(c.req.param('id'))}`, { kind: 'ok', text: 'Simulation reset.' }), 303)
      } catch (error) {
        return c.redirect(shell.url(`/missions/${encodeURIComponent(c.req.param('id'))}`, { kind: 'error', text: (error as Error).message }), 303)
      }
    })
  ctx.router.route(prefix === '' ? '/' : prefix, app)
}
