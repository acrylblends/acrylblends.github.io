import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  etaMinutes,
  Fleet,
  FleetError,
  clampCell,
  pathLength,
  statusLabel,
  telemetryOf,
  timeText,
  type FleetState,
} from '../plugins/fleet/index.ts'
import { seed } from '../plugins/fleet/seed.ts'
import { memoryStore } from '../plugins/fleet/store.ts'
import { NOW } from './support.ts'

const ids = (): ((kind: string) => string) => {
  let next = 0
  return (kind) => `${kind}-${String(++next)}`
}

async function open(): Promise<Fleet> {
  return Fleet.open({ store: memoryStore<FleetState>(), clock: () => NOW, newId: ids() })
}

test('the seed is the mockup fleet: five robots, five missions, waypoints, obstacles and telemetry', () => {
  const state = seed(NOW, ids())
  assert.equal(state.robots.length, 5)
  assert.equal(state.missions.length, 5)
  assert.equal(state.obstacles.length, 3)
  assert.equal(state.telemetry.length, 25)
  assert.deepEqual(state.missions.map((mission) => mission.status), ['active', 'draft', 'queued', 'done', 'failed'])
  assert.equal(state.waypoints.filter((waypoint) => waypoint.missionId === state.missions[0]?.id).length, 5)
  assert.equal(state.events.filter((event) => event.type === 'failed').length, 1)
  assert.equal(state.robots[4]?.status, 'offline')
})

test('route telemetry is deterministic and UTC-safe', () => {
  const state = seed(NOW, ids())
  const first = state.missions[0] as (typeof state.missions)[number]
  const waypoints = state.waypoints.filter((waypoint) => waypoint.missionId === first.id)
  const length = pathLength(waypoints)
  assert.equal(length.toFixed(2), '27.22')
  const telemetry = telemetryOf(waypoints, state.obstacles, 'draft')
  assert.equal(telemetry.distance, 13.6)
  assert.equal(telemetry.obstacles, 3)
  assert.equal(telemetry.progress, 0)
  assert.equal(timeText(etaMinutes(length)), '02:16')
  assert.equal(statusLabel('failed'), 'Failed')
  assert.equal(statusLabel('paused'), 'Paused')
  assert.equal(clampCell(40, 31), 31)
})

test('waypoints add, clamp, remove and reorder with a persisted sequence', async () => {
  const fleet = await open()
  const mission = fleet.missions().find((item) => item.status === 'draft')
  assert.ok(mission !== undefined)
  const before = fleet.waypoints(mission.id).length
  const added = await fleet.addWaypoint(mission.id, 40, -5, 'New inspection point')
  assert.equal(added.x, 31)
  assert.equal(added.y, 0)
  assert.equal(fleet.waypoints(mission.id).length, before + 1)
  await assert.rejects(fleet.addWaypoint(mission.id, 1, 1, ''), /action/)
  await fleet.moveWaypoint(mission.id, added.id, 'up')
  const moved = fleet.waypoints(mission.id).find((waypoint) => waypoint.id === added.id)
  assert.equal(moved?.sequence, before)
  await fleet.removeWaypoint(mission.id, added.id)
  assert.equal(fleet.waypoints(mission.id).length, before)
  await assert.rejects(fleet.removeWaypoint(mission.id, 'missing'), /no longer exists/)
})

test('simulate, pause, save draft and reset are distinct states with events', async () => {
  const fleet = await open()
  const mission = fleet.missions().find((item) => item.status === 'draft')
  assert.ok(mission !== undefined)
  await fleet.saveDraft(mission.id)
  assert.equal(fleet.events(mission.id)[0]?.type, 'saved')
  await fleet.pause(mission.id)
  assert.equal(fleet.mission(mission.id)?.status, 'paused')
  const simulated = await fleet.simulate(mission.id)
  assert.equal(simulated.status, 'simulated')
  assert.equal(fleet.telemetry(mission.id).progress, 100)
  const reset = await fleet.reset(mission.id)
  assert.equal(reset.status, 'draft')
  const empty = fleet.missions().find((item) => fleet.waypoints(item.id).length === 0)
  if (empty !== undefined) await assert.rejects(fleet.simulate(empty.id), /two waypoints/)
})

test('a robot keeps its telemetry samples and its missions', async () => {
  const fleet = await open()
  const robot = fleet.robots()[0]
  assert.ok(robot !== undefined)
  assert.equal(fleet.telemetrySamples(robot.id).length, 5)
  assert.equal(fleet.missions().filter((mission) => mission.robotId === robot.id).length >= 1, true)
})

test('a failed save is an error', async () => {
  const broken = await Fleet.open({
    store: {
      load: async () => undefined,
      save: async () => {
        throw new Error('disk full')
      },
    },
    clock: () => NOW,
    newId: ids(),
  })
  const mission = broken.missions()[0]
  assert.ok(mission !== undefined)
  await assert.rejects(broken.addWaypoint(mission.id, 5, 5, 'x'), (error: unknown) => error instanceof Error && /disk full/.test(error.message))
})
