import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import { createApp, readManifest } from '../src/app.ts'
import type { FleetState } from '../plugins/fleet/domain.ts'
import { pinnedInstance } from '../plugins/instance/index.ts'
import { noticeOf, NOW, projectRoot, withApp } from './support.ts'

const scratch = join(projectRoot, '.acrylblends', 'test')
mkdirSync(scratch, { recursive: true })

test('the first page is the mockup planner: fleet, map, waypoints, telemetry and controls', () =>
  withApp(async (app) => {
    const page = await app.page('/')
    assert.equal(page.status, 200)
    assert.match(page.html, /MOTION <i>OPS<\/i>/)
    assert.match(page.html, /FLEET \/ MISSION PLANNER \/ DEMO FACILITY/)
    assert.match(page.html, /SIMULATION READY/)
    for (const label of ['ROBOT FLEET / 05', 'MISSIONS', 'Mission map', 'MISSION WAYPOINTS', 'MISSION TELEMETRY', 'SELECTED ROBOT']) {
      assert.match(page.html, new RegExp(label))
    }
    assert.match(page.html, /AMR-07 · Atlas/)
    assert.match(page.html, /Warehouse replenishment/)
    assert.match(page.html, /Simulate mission/)
    assert.match(page.html, /Pause/)
    assert.match(page.html, /Reset/)
    assert.match(page.html, /FACILITY MAP \/ LAYER: OCCUPANCY \+ ROUTE/)
    assert.match(page.html, /Start \/ staging/)
    assert.match(page.html, /13\.6 m/)
    assert.match(page.html, /02:16/)
    assert.doesNotMatch(page.html, /https?:\/\//)
  }))

test('waypoints add, reorder and remove through the planner routes', () =>
  withApp(async (app) => {
    const mission = app.root.fleet.missions().find((item) => item.status === 'draft')
    assert.ok(mission !== undefined)
    const before = app.root.fleet.waypoints(mission.id).length
    const added = await app.post(`/missions/${mission.id}/waypoints`, { x: '10', y: '10', action: 'New stop' })
    assert.equal(added.status, 303)
    assert.equal(noticeOf(added).kind, 'ok')
    assert.equal(app.root.fleet.waypoints(mission.id).length, before + 1)
    const waypoint = app.root.fleet.waypoints(mission.id).find((item) => item.action === 'New stop')
    assert.ok(waypoint !== undefined)
    const moved = await app.post(`/missions/${mission.id}/waypoints/${waypoint.id}/move`, { direction: 'up' })
    assert.equal(noticeOf(moved).kind, 'ok')
    assert.equal(app.root.fleet.waypoints(mission.id).find((item) => item.id === waypoint.id)?.sequence, before)
    const removed = await app.post(`/missions/${mission.id}/waypoints/${waypoint.id}/delete`, {})
    assert.equal(noticeOf(removed).kind, 'ok')
    assert.equal(app.root.fleet.waypoints(mission.id).length, before)
    const invalid = await app.post(`/missions/${mission.id}/waypoints`, { x: '1', y: '1', action: '' })
    assert.equal(noticeOf(invalid).kind, 'error')
  }))

test('simulation runs, pauses, saves the draft and resets with distinct statuses', () =>
  withApp(async (app) => {
    const mission = app.root.fleet.missions().find((item) => item.status === 'draft')
    assert.ok(mission !== undefined)
    const saved = await app.post(`/missions/${mission.id}/save`, {})
    assert.equal(noticeOf(saved).kind, 'ok')
    assert.equal(app.root.fleet.events(mission.id)[0]?.type, 'saved')
    const paused = await app.post(`/missions/${mission.id}/pause`, {})
    assert.equal(app.root.fleet.mission(mission.id)?.status, 'paused')
    const simulated = await app.post(`/missions/${mission.id}/simulate`, {})
    assert.equal(noticeOf(simulated).kind, 'ok')
    assert.equal(app.root.fleet.mission(mission.id)?.status, 'simulated')
    const reset = await app.post(`/missions/${mission.id}/reset`, {})
    assert.equal(app.root.fleet.mission(mission.id)?.status, 'draft')
  }))

test('the robot detail shows battery, pose, mode and telemetry samples', () =>
  withApp(async (app) => {
    const robot = app.root.fleet.robots()[0]
    assert.ok(robot !== undefined)
    const page = await app.page(`/robots/${robot.id}`)
    assert.equal(page.status, 200)
    assert.match(page.html, /ROBOT \/ AMR-07 · Atlas/)
    assert.match(page.html, /BATTERY 82%/)
    assert.match(page.html, /TELEMETRY HISTORY/)
    assert.equal((page.html.match(/<tr>/g) ?? []).length >= 6, true)
  }))

test('mission history lists every mission and the failed simulation event', () =>
  withApp(async (app) => {
    const page = await app.page('/missions')
    assert.equal(page.status, 200)
    assert.match(page.html, /Mission history/)
    assert.match(page.html, /Night sweep/)
    assert.match(page.html, /FAILED/)
    assert.match(page.html, /battery dropped below/)
    assert.match(page.html, /EVENT LOG/)
  }))

test('health, 404, prefix and the manifest work', async () => {
  await withApp(async (app) => {
    assert.equal((await app.page('/health')).status, 200)
    assert.equal((await app.page('/nope')).status, 404)
    assert.deepEqual(readManifest().plugins.map((row) => row.id), ['router', 'home', 'fleet', 'fleet-shell', 'history', 'missions', 'robots', 'extensions', 'server', 'acryl-door'])
  })
  await withApp(
    async (app) => {
      const response = await app.root.router.request('/app', { headers: { accept: 'text/html' } })
      assert.equal(response.status, 200)
      assert.match(await response.text(), /href="\/app\/missions/)
    },
    { prefix: '/app' },
  )
})

test('switching history off keeps the planner working', async () => {
  const manifest = readManifest()
  const without = { ...manifest, plugins: manifest.plugins.map((row) => (row.id === 'history' ? { ...row, disabled: true } : row)) }
  const home = await mkdtemp(join(scratch, 'app-test-off-history-'))
  let ids = 0
  const app = await createApp(pinnedInstance(home, { root: projectRoot }), {
    listen: false,
    manifest: without,
    overrides: { fleet: { clock: () => NOW, newId: (kind: string) => `${kind}-${++ids}` } },
  })
  try {
    assert.equal((await app.root.router.request('/missions')).status, 404)
    assert.equal((await app.root.router.request('/', { headers: { accept: 'text/html' } })).status, 200)
  } finally {
    await app.stop()
    await rm(home, { recursive: true, force: true })
  }
})

test('a failed save reports the error instead of success', async () => {
  const broken = {
    load: async (): Promise<FleetState | undefined> => undefined,
    save: async (): Promise<void> => {
      throw new Error('disk full')
    },
  }
  await withApp(
    async (app) => {
      const mission = app.root.fleet.missions().find((item) => item.status === 'draft')
      assert.ok(mission !== undefined)
      const response = await app.post(`/missions/${mission.id}/simulate`, {})
      assert.equal(response.status, 303)
      assert.equal(noticeOf(response).kind, 'error')
      assert.match(noticeOf(response).text, /disk full/)
    },
    { overrides: { fleet: { store: broken } } },
  )
})
