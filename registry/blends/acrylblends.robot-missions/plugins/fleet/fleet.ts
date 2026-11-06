/** The fleet: robots, missions, waypoints, the map and the draft/simulated runs. */
import { clampCell, cleanAction, type FleetState, FleetError, type Mission, type MissionEvent, type Obstacle, type Robot, sequenceOf, stampOf, telemetryOf, type TelemetrySample, type Waypoint } from './domain.ts'
import { seed } from './seed.ts'
import type { Store } from './store.ts'
export interface FleetAdapters { readonly store: Store<FleetState>; readonly clock: () => Date; readonly newId: (kind: string) => string }
export class Fleet {
  private state: FleetState
  private readonly adapters: FleetAdapters
  private constructor(state: FleetState, adapters: FleetAdapters) { this.state = state; this.adapters = adapters }
  static async open(adapters: FleetAdapters): Promise<Fleet> { const saved = await adapters.store.load(); return new Fleet(saved ?? seed(adapters.clock(), adapters.newId), adapters) }
  get now(): Date { return this.adapters.clock() }
  robots(): readonly Robot[] { return this.state.robots }
  robot(id: string): Robot | undefined { return this.state.robots.find((robot) => robot.id === id) }
  missions(): readonly Mission[] { return this.state.missions }
  mission(id: string): Mission | undefined { return this.state.missions.find((mission) => mission.id === id) }
  waypoints(missionId: string): readonly Waypoint[] { return this.state.waypoints.filter((waypoint) => waypoint.missionId === missionId).sort((a, b) => a.sequence - b.sequence) }
  obstacles(): readonly Obstacle[] { return this.state.obstacles }
  events(missionId: string): readonly MissionEvent[] { return [...this.state.events].filter((event) => event.missionId === missionId).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)) }
  telemetrySamples(robotId: string): readonly TelemetrySample[] { return [...this.state.telemetry].filter((sample) => sample.robotId === robotId).sort((a, b) => b.at.localeCompare(a.at)) }
  telemetry(missionId: string): { distance: number; eta: number; obstacles: number; progress: number } {
    const mission = this.mission(missionId)
    return telemetryOf(this.waypoints(missionId), this.state.obstacles, mission?.status ?? 'draft')
  }
  async addWaypoint(missionId: string, x: unknown, y: unknown, action: unknown): Promise<Waypoint> {
    const mission = this.requireMission(missionId)
    if (mission.status === 'done') throw new FleetError('conflict', 'That mission is done; start a new draft.')
    const waypoint: Waypoint = { id: this.adapters.newId('waypoint'), missionId, sequence: sequenceOf(this.waypoints(missionId)), x: clampCell(Number(x), this.state.mapWidth - 1), y: clampCell(Number(y), this.state.mapHeight - 1), action: cleanAction(action) }
    this.state.waypoints.push(waypoint)
    await this.save()
    return waypoint
  }
  async removeWaypoint(missionId: string, waypointId: string): Promise<void> {
    this.requireMission(missionId)
    if (!this.state.waypoints.some((waypoint) => waypoint.id === waypointId && waypoint.missionId === missionId)) throw new FleetError('not-found', 'That waypoint no longer exists.')
    this.state.waypoints = this.state.waypoints.filter((waypoint) => waypoint.id !== waypointId)
    await this.save()
  }
  async moveWaypoint(missionId: string, waypointId: string, direction: 'up' | 'down'): Promise<void> {
    this.requireMission(missionId)
    const ordered = [...this.waypoints(missionId)]
    const index = ordered.findIndex((waypoint) => waypoint.id === waypointId)
    if (index === -1) throw new FleetError('not-found', 'That waypoint no longer exists.')
    const target = direction === 'up' ? index - 1 : index + 1
    if (target < 0 || target >= ordered.length) return
    const swapped = [...ordered]
    const first = swapped[index] as Waypoint
    const second = swapped[target] as Waypoint
    swapped[index] = second
    swapped[target] = first
    const byId = new Map(swapped.map((waypoint, position) => [waypoint.id, { ...waypoint, sequence: position + 1 }]))
    this.state.waypoints = this.state.waypoints.map((waypoint) => byId.get(waypoint.id) ?? waypoint)
    await this.save()
  }

  async saveDraft(missionId: string): Promise<Mission> {
    const mission = this.requireMission(missionId)
    this.event(missionId, 'saved', `Draft saved with ${String(this.waypoints(missionId).length)} waypoints.`)
    await this.save()
    return mission
  }

  /** Run the simulation: the status becomes simulated, progress 100, and the event is kept. Only the simulation changes; no robot moves. */
  async simulate(missionId: string): Promise<Mission> {
    const mission = this.requireMission(missionId)
    if (this.waypoints(missionId).length < 2) throw new FleetError('invalid', 'A mission needs at least two waypoints before it can be simulated.')
    const next: Mission = { ...mission, status: 'simulated' }
    this.state.missions = this.state.missions.map((item) => (item.id === missionId ? next : item))
    this.event(missionId, 'simulated', `Simulation completed over ${String(this.waypoints(missionId).length)} waypoints.`)
    await this.save()
    return next
  }
  async pause(missionId: string): Promise<Mission> {
    const mission = this.requireMission(missionId)
    const next: Mission = { ...mission, status: 'paused' }
    this.state.missions = this.state.missions.map((item) => (item.id === missionId ? next : item))
    this.event(missionId, 'paused', 'Simulation paused; the mission stays paused until resumed or reset.')
    await this.save()
    return next
  }

  async reset(missionId: string): Promise<Mission> {
    const mission = this.requireMission(missionId)
    const next: Mission = { ...mission, status: 'draft' }
    this.state.missions = this.state.missions.map((item) => (item.id === missionId ? next : item))
    this.event(missionId, 'reset', 'Simulation reset to the draft.')
    await this.save()
    return next
  }
  private requireMission(id: string): Mission { const mission = this.mission(id); if (mission === undefined) throw new FleetError('not-found', 'That mission no longer exists.'); return mission }
  private event(missionId: string, type: string, detail: string): void { this.state.events = [...this.state.events, { id: this.adapters.newId('event'), missionId, type, occurredAt: stampOf(this.adapters.clock()), detail }] }
  private async save(): Promise<void> {
    this.state = { ...this.state, robots: [...this.state.robots], missions: [...this.state.missions], waypoints: [...this.state.waypoints], obstacles: [...this.state.obstacles], events: [...this.state.events], telemetry: [...this.state.telemetry] }
    try {
      await this.adapters.store.save(this.state)
    } catch (error) {
      throw new FleetError('storage', `The fleet could not be saved: ${(error as Error).message}`)
    }
  }
}
