/** Robot Missions' types and pure rules: robots, missions, waypoints, the facility map and the simulated telemetry. */
export type RobotStatus = 'online' | 'idle' | 'offline'
export type MissionStatus = 'draft' | 'active' | 'queued' | 'simulated' | 'done' | 'failed' | 'paused'
export interface Robot { readonly id: string; readonly name: string; readonly model: string; readonly status: RobotStatus; readonly batteryPct: number; readonly poseX: number; readonly poseY: number; readonly mode: string }
export interface Waypoint { readonly id: string; readonly missionId: string; readonly sequence: number; readonly x: number; readonly y: number; readonly action: string }
export interface Mission { readonly id: string; readonly name: string; readonly robotId: string; readonly status: MissionStatus; readonly createdAt: string }
export interface Obstacle { readonly id: string; readonly x: number; readonly y: number; readonly w: number; readonly h: number }
export interface MissionEvent { readonly id: string; readonly missionId: string; readonly type: string; readonly occurredAt: string; readonly detail: string }
export interface TelemetrySample { readonly id: string; readonly robotId: string; readonly at: string; readonly batteryPct: number; readonly x: number; readonly y: number; readonly mode: string }

export interface FleetState { readonly version: 1; readonly mapWidth: number; readonly mapHeight: number; robots: Robot[]; missions: Mission[]; waypoints: Waypoint[]; obstacles: Obstacle[]; events: MissionEvent[]; telemetry: TelemetrySample[] }
export type FleetErrorCode = 'invalid' | 'not-found' | 'conflict' | 'storage'
export class FleetError extends Error { readonly code: FleetErrorCode; constructor(code: FleetErrorCode, message: string) { super(message); this.code = code; this.name = 'FleetError' } }
const pad = (n: number): string => String(n).padStart(2, '0')
export const dayOf = (date: Date): string => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
export const stampOf = (date: Date): string => `${dayOf(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`
export const clampCell = (value: number, max: number): number => Math.min(max, Math.max(0, Math.round(value)))
/** Mission status as the right rail and the list show it. */
export function statusLabel(status: MissionStatus): string { return status === 'active' ? 'Active' : status === 'draft' ? 'Draft' : status === 'queued' ? 'Queued' : status === 'simulated' ? 'Simulated' : status === 'failed' ? 'Failed' : status === 'paused' ? 'Paused' : 'Done' }
/** The path length in grid cells between consecutive waypoints. */
export function pathLength(waypoints: readonly Waypoint[]): number {
  let total = 0
  for (let index = 1; index < waypoints.length; index++) {
    const a = waypoints[index - 1] as Waypoint
    const b = waypoints[index] as Waypoint
    total += Math.hypot(b.x - a.x, b.y - a.y)
  }
  return total
}
/** 0.5 m per cell at 0.1 m/s, in minutes. */
export function etaMinutes(length: number): number { return Math.round((length * 0.5) / 0.1 / 60 * 100) / 100 }
/** `02:14` from minutes. */
export function timeText(minutes: number): string { const seconds = Math.max(0, Math.round(minutes * 60)); return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}` }
export function sequenceOf(waypoints: readonly Waypoint[]): number { return waypoints.reduce((max, waypoint) => Math.max(max, waypoint.sequence), 0) + 1 }
export function cleanAction(value: unknown): string { if (typeof value !== 'string' || value.trim() === '') throw new FleetError('invalid', 'The waypoint action is required.'); return value.trim().slice(0, 80) }
export function telemetryOf(waypoints: readonly Waypoint[], obstacles: readonly Obstacle[], status: MissionStatus): { distance: number; eta: number; obstacles: number; progress: number } {
  const length = pathLength(waypoints)
  return { distance: Math.round(length * 0.5 * 10) / 10, eta: etaMinutes(length), obstacles: obstacles.length, progress: status === 'simulated' || status === 'done' ? 100 : 0 }
}
