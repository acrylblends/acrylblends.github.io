/** The fleet a new install starts with: four robots, four missions, five waypoints and three obstacles. */
import type { FleetState, Mission, MissionEvent, Obstacle, Robot, TelemetrySample, Waypoint } from './domain.ts'
import { stampOf } from './domain.ts'
export function seed(now: Date, newId: (kind: string) => string): FleetState {
  const at = (hoursAgo: number): string => stampOf(new Date(now.getTime() - hoursAgo * 3_600_000))
  const robots: Robot[] = [
    { id: newId('robot'), name: 'AMR-07 · Atlas', model: 'Autonomous mobile robot', status: 'online', batteryPct: 82, poseX: 4, poseY: 12, mode: 'Autonomous' },
    { id: newId('robot'), name: 'AMR-12 · Nova', model: 'Autonomous mobile robot', status: 'online', batteryPct: 64, poseX: 10, poseY: 6, mode: 'Autonomous' },
    { id: newId('robot'), name: 'ARM-02 · Delta', model: 'Pick-and-place arm', status: 'idle', batteryPct: 100, poseX: 22, poseY: 14, mode: 'Manual' },
    { id: newId('robot'), name: 'DRN-01 · Scout', model: 'Indoor drone', status: 'online', batteryPct: 91, poseX: 16, poseY: 20, mode: 'Autonomous' },
    { id: newId('robot'), name: 'AMR-03 · Comet', model: 'Autonomous mobile robot', status: 'offline', batteryPct: 47, poseX: 28, poseY: 2, mode: 'Charging' },
  ]
  const missions: Mission[] = [
    { id: newId('mission'), name: 'Warehouse replenishment', robotId: robots[0]!.id, status: 'active', createdAt: at(20) },
    { id: newId('mission'), name: 'Zone B inspection', robotId: robots[3]!.id, status: 'draft', createdAt: at(30) },
    { id: newId('mission'), name: 'Return to charging', robotId: robots[2]!.id, status: 'queued', createdAt: at(40) },
    { id: newId('mission'), name: 'Aisle 4 pickup', robotId: robots[1]!.id, status: 'done', createdAt: at(60) },
    { id: newId('mission'), name: 'Night sweep', robotId: robots[3]!.id, status: 'failed', createdAt: at(90) },
  ]
  const first = missions[0] as Mission
  const waypoints: Waypoint[] = [
    { id: newId('waypoint'), missionId: first.id, sequence: 1, x: 4, y: 12, action: 'Start / staging' },
    { id: newId('waypoint'), missionId: first.id, sequence: 2, x: 11, y: 12, action: 'Aisle A2 / pickup' },
    { id: newId('waypoint'), missionId: first.id, sequence: 3, x: 11, y: 8, action: 'Cross aisle C' },
    { id: newId('waypoint'), missionId: first.id, sequence: 4, x: 18, y: 8, action: 'Packing station' },
    { id: newId('waypoint'), missionId: first.id, sequence: 5, x: 25, y: 14, action: 'Drop-off point' },
  ]
  const obstacles: Obstacle[] = [
    { id: newId('obstacle'), x: 7, y: 9, w: 2, h: 2 },
    { id: newId('obstacle'), x: 20, y: 10, w: 2, h: 2 },
    { id: newId('obstacle'), x: 14, y: 16, w: 2, h: 1 },
  ]
  const failed = missions[4] as Mission
  waypoints.push(
    { id: newId('waypoint'), missionId: missions[1]!.id, sequence: 1, x: 3, y: 20, action: 'Zone B entry' },
    { id: newId('waypoint'), missionId: missions[1]!.id, sequence: 2, x: 16, y: 20, action: 'Inspect rack B2' },
    { id: newId('waypoint'), missionId: missions[1]!.id, sequence: 3, x: 28, y: 20, action: 'Exit zone B' },
    { id: newId('waypoint'), missionId: failed.id, sequence: 1, x: 16, y: 20, action: 'Night sweep start' },
    { id: newId('waypoint'), missionId: failed.id, sequence: 2, x: 8, y: 16, action: 'Aisle B3 scan' },
    { id: newId('waypoint'), missionId: failed.id, sequence: 3, x: 4, y: 6, action: 'Charging bay return' },
  )
  const events: MissionEvent[] = [
    { id: newId('event'), missionId: first.id, type: 'created', occurredAt: at(20), detail: 'Mission drafted for AMR-07.' },
    { id: newId('event'), missionId: failed.id, type: 'created', occurredAt: at(90), detail: 'Night sweep drafted for DRN-01.' },
    { id: newId('event'), missionId: failed.id, type: 'failed', occurredAt: at(88), detail: 'Simulation stopped: battery dropped below the 20% reserve at waypoint 02.' },
    { id: newId('event'), missionId: missions[3]!.id, type: 'completed', occurredAt: at(59), detail: 'Simulation completed; the physical run was not performed.' },
  ]
  const telemetry: TelemetrySample[] = robots.flatMap((robot, index) => Array.from({ length: 5 }, (_, sample) => ({ id: newId('telemetry'), robotId: robot.id, at: at(index * 1.5 + sample * 0.5), batteryPct: Math.max(10, robot.batteryPct + sample * 2), x: robot.poseX, y: robot.poseY, mode: robot.mode })))
  return { version: 1, mapWidth: 32, mapHeight: 24, robots, missions, waypoints, obstacles, events, telemetry }
}
