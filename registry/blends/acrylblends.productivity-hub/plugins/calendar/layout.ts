/**
 * Where events sit in the week grid: their top and height from their minutes, and side-by-side lanes for events that overlap, so two events at the
 * same time are both readable instead of one covering the other. Pure.
 */
import type { CalendarEvent } from '../productivity-hub/index.ts'

export interface Placed {
  readonly event: CalendarEvent
  /** Minutes from the grid's first hour. */
  readonly top: number
  readonly height: number
  readonly lane: number
  /** How many lanes its cluster of overlapping events uses. */
  readonly lanes: number
}

const minutesOf = (time: string): number => {
  const d = new Date(time)
  return d.getHours() * 60 + d.getMinutes()
}

/** The hours the grid shows: 08:00 to 19:00, widened to hold every event. */
export function hourRange(events: readonly CalendarEvent[]): { readonly from: number; readonly to: number } {
  let from = 8
  let to = 19
  for (const event of events) {
    from = Math.min(from, Math.floor(minutesOf(event.startAt) / 60))
    const end = new Date(event.endAt)
    const endHour = new Date(event.startAt).getDate() === end.getDate() ? Math.ceil(minutesOf(event.endAt) / 60) : 24
    to = Math.max(to, endHour)
  }
  return { from, to }
}

/** One day's events placed: overlapping ones share their cluster's lanes, the earliest on the left. */
export function placeDay(events: readonly CalendarEvent[], fromHour: number): Placed[] {
  const sorted = [...events].sort((a, b) => minutesOf(a.startAt) - minutesOf(b.startAt) || minutesOf(b.endAt) - minutesOf(a.endAt))
  const placed: Placed[] = []
  let cluster: { event: CalendarEvent; lane: number }[] = []
  let clusterEnd = -1
  const flush = () => {
    const lanes = Math.max(1, ...cluster.map((c) => c.lane + 1))
    for (const { event, lane } of cluster) {
      const start = minutesOf(event.startAt)
      const sameDay = new Date(event.startAt).getDate() === new Date(event.endAt).getDate()
      const end = sameDay ? minutesOf(event.endAt) : 24 * 60
      placed.push({ event, top: start - fromHour * 60, height: Math.max(end - start, 20), lane, lanes })
    }
    cluster = []
  }
  for (const event of sorted) {
    const start = minutesOf(event.startAt)
    if (start >= clusterEnd && cluster.length > 0) flush()
    const laneEnds = new Map<number, number>()
    for (const c of cluster) laneEnds.set(c.lane, Math.max(laneEnds.get(c.lane) ?? 0, minutesOf(c.event.endAt)))
    let lane = 0
    while ((laneEnds.get(lane) ?? -1) > start) lane += 1
    cluster.push({ event, lane })
    clusterEnd = Math.max(clusterEnd, new Date(event.startAt).getDate() === new Date(event.endAt).getDate() ? minutesOf(event.endAt) : 24 * 60)
  }
  if (cluster.length > 0) flush()
  return placed
}
