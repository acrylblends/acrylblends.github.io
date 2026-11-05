/**
 * The Productivity Hub's domain: spaces (projects), tasks, notes, calendar events and the inbox, as plain immutable data, and the rules over them
 * (what is due today, what is overdue, which events overlap, what a valid input is). Pure: no clock, no disk; the caller passes `now`.
 *
 * Times are ISO strings in the server's local time zone, read and compared through {@link Date}; a calendar day is `YYYY-MM-DD`.
 */

export type Id = string

/** A space's colour: its dot in the sidebar, its notes' pastel and its events' bar. */
export const PROJECT_COLORS = ['sage', 'amber', 'sky', 'violet', 'rose'] as const
export type ProjectColor = (typeof PROJECT_COLORS)[number]

/** A space: a project or an area of life that tasks, notes and events belong to. */
export interface Project {
  readonly id: Id
  readonly name: string
  readonly color: ProjectColor
}

export const TASK_STATUSES = ['open', 'done'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export const PRIORITIES = ['low', 'normal', 'high'] as const
export type Priority = (typeof PRIORITIES)[number]

/** One step of a task (the daily focus shows how many are done). */
export interface Step {
  readonly title: string
  readonly done: boolean
}

export interface Task {
  readonly id: Id
  readonly title: string
  readonly status: TaskStatus
  /** When it is due; absent for a task without a date (it is then never "today" or overdue). */
  readonly dueAt?: string
  readonly priority: Priority
  readonly projectId?: Id
  readonly estimateMinutes?: number
  /** The note it came from or belongs to: the note editor lists its linked tasks. */
  readonly noteId?: Id
  readonly steps: readonly Step[]
  /** When it was completed; set exactly while the status is `done`. */
  readonly completedAt?: string
}

export interface Note {
  readonly id: Id
  readonly title: string
  readonly body: string
  readonly updatedAt: string
  readonly projectId?: Id
  readonly tags: readonly string[]
}

/** Which calendar an event is on: a meeting with people, a focus block, or something personal. */
export const CALENDARS = ['meeting', 'focus', 'personal'] as const
export type CalendarId = (typeof CALENDARS)[number]

export interface CalendarEvent {
  readonly id: Id
  readonly title: string
  readonly startAt: string
  readonly endAt: string
  readonly calendarId: CalendarId
  /** A short second line: who, or what the block is for. */
  readonly detail?: string
  readonly projectId?: Id
}

/** A quick capture not yet triaged into a task or a note. */
export interface InboxItem {
  readonly id: Id
  readonly text: string
  readonly capturedAt: string
}

/** The one task the person chose to move forward today. */
export interface DailyFocus {
  readonly date: string
  readonly taskId: Id
}

/** Everything the hub keeps; what the store saves and loads. */
export interface HubState {
  readonly version: 1
  readonly projects: readonly Project[]
  readonly tasks: readonly Task[]
  readonly notes: readonly Note[]
  readonly events: readonly CalendarEvent[]
  readonly inbox: readonly InboxItem[]
  readonly focus?: DailyFocus
}

/** A rule the input broke, or a thing that is not there; routes answer 400 and 404 for them. */
export class HubError extends Error {
  readonly code: 'invalid' | 'not-found'
  constructor(code: 'invalid' | 'not-found', message: string) {
    super(message)
    this.name = 'HubError'
    this.code = code
  }
}

const pad = (n: number): string => String(n).padStart(2, '0')

/** The calendar day of a time, in local time: `YYYY-MM-DD`. */
export function dayOf(time: Date | string): string {
  const d = typeof time === 'string' ? new Date(time) : time
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** A local time as the ISO-like string the hub stores (`2026-11-05T09:30`), so a day's events read the same in every time zone they are shown in. */
export function localTime(d: Date): string {
  return `${dayOf(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Local midnight of a day (`YYYY-MM-DD`). */
export function startOfDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  return new Date(y, m - 1, d)
}

/** The day `days` after `day` (negative: before). */
export function addDays(day: string, days: number): string {
  const d = startOfDay(day)
  d.setDate(d.getDate() + days)
  return dayOf(d)
}

/** The Monday of the week `day` is in. */
export function weekStart(day: string): string {
  const offset = (startOfDay(day).getDay() + 6) % 7
  return addDays(day, -offset)
}

/** The seven days of the week `day` is in, Monday first. */
export function weekDays(day: string): string[] {
  const monday = weekStart(day)
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

/** How many minutes an event lasts. */
export function durationMinutes(event: Pick<CalendarEvent, 'startAt' | 'endAt'>): number {
  return Math.round((new Date(event.endAt).getTime() - new Date(event.startAt).getTime()) / 60_000)
}

/** Whether two time ranges share any minute; touching ends (one ends at 10:00, the next starts at 10:00) do not overlap. */
export function rangesOverlap(
  a: Pick<CalendarEvent, 'startAt' | 'endAt'>,
  b: Pick<CalendarEvent, 'startAt' | 'endAt'>,
): boolean {
  return new Date(a.startAt) < new Date(b.endAt) && new Date(b.startAt) < new Date(a.endAt)
}

/** The events a candidate would overlap, earliest first (the candidate itself, by id, never counts). */
export function overlapsWith(
  events: readonly CalendarEvent[],
  candidate: Pick<CalendarEvent, 'startAt' | 'endAt'> & { readonly id?: Id },
): CalendarEvent[] {
  return events
    .filter((event) => event.id !== candidate.id && rangesOverlap(event, candidate))
    .sort(byStart)
}

/** Every pair of events that overlap, as id pairs, each pair once. */
export function overlappingPairs(events: readonly CalendarEvent[]): [Id, Id][] {
  const sorted = [...events].sort(byStart)
  const pairs: [Id, Id][] = []
  for (let i = 0; i < sorted.length; i += 1)
    for (let j = i + 1; j < sorted.length; j += 1) {
      const a = sorted[i] as CalendarEvent
      const b = sorted[j] as CalendarEvent
      if (new Date(b.startAt) >= new Date(a.endAt)) break
      pairs.push([a.id, b.id])
    }
  return pairs
}

export const byStart = (a: CalendarEvent, b: CalendarEvent): number =>
  new Date(a.startAt).getTime() - new Date(b.startAt).getTime()

/** The events of one day, earliest first. */
export function eventsOn(events: readonly CalendarEvent[], day: string): CalendarEvent[] {
  return events.filter((event) => dayOf(event.startAt) === day).sort(byStart)
}

/** An open task whose due day is before today. */
export function isOverdue(task: Task, now: Date): boolean {
  return task.status === 'open' && task.dueAt !== undefined && dayOf(task.dueAt) < dayOf(now)
}

/** An open task due today. */
export function isDueToday(task: Task, now: Date): boolean {
  return task.status === 'open' && task.dueAt !== undefined && dayOf(task.dueAt) === dayOf(now)
}

/** Overdue first, then by due time, then by priority; a task without a date last. */
export function taskOrder(a: Task, b: Task): number {
  const due = (t: Task) => (t.dueAt === undefined ? Number.POSITIVE_INFINITY : new Date(t.dueAt).getTime())
  const rank = { high: 0, normal: 1, low: 2 } as const
  return due(a) - due(b) || rank[a.priority] - rank[b.priority] || a.title.localeCompare(b.title)
}

/** What My Day lists: the open tasks due today or overdue, focus task excluded, in {@link taskOrder}. */
export function nextActions(state: HubState, now: Date): Task[] {
  const focus = focusTask(state, now)
  return state.tasks
    .filter((task) => task.id !== focus?.id && (isDueToday(task, now) || isOverdue(task, now)))
    .sort(taskOrder)
}

/** The tasks completed on the day of `now`. */
export function completedToday(state: HubState, now: Date): Task[] {
  return state.tasks.filter(
    (task) => task.status === 'done' && task.completedAt !== undefined && dayOf(task.completedAt) === dayOf(now),
  )
}

/** Today's focus task, when one is set for today and still exists. */
export function focusTask(state: HubState, now: Date): Task | undefined {
  if (state.focus === undefined || state.focus.date !== dayOf(now)) return undefined
  return state.tasks.find((task) => task.id === state.focus?.taskId)
}

/** The notes, most recently changed first. */
export function recentNotes(state: HubState, limit = Number.POSITIVE_INFINITY): Note[] {
  return [...state.notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit)
}

/** A case-insensitive match of `query` in any of the texts; an empty query matches everything. */
export function matches(query: string | undefined, ...texts: readonly (string | undefined)[]): boolean {
  const q = (query ?? '').trim().toLowerCase()
  return q === '' || texts.some((text) => (text ?? '').toLowerCase().includes(q))
}

// Validation: each returns the cleaned value or throws HubError('invalid', <a sentence the page can show>).

export const LIMITS = { title: 200, capture: 500, body: 20_000, tags: 12, estimate: 24 * 60 } as const

const article = (word: string): string => (/^[aeiou]/iu.test(word) ? 'An' : 'A')

export function cleanTitle(value: unknown, what = 'title'): string {
  const text = typeof value === 'string' ? value.trim().replace(/\s+/gu, ' ') : ''
  if (text === '') throw new HubError('invalid', `${article(what)} ${what} is needed.`)
  if (text.length > LIMITS.title) throw new HubError('invalid', `${article(what)} ${what} is at most ${LIMITS.title} characters.`)
  return text
}

export function cleanCapture(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : ''
  if (text === '') throw new HubError('invalid', 'Write something to capture.')
  if (text.length > LIMITS.capture) throw new HubError('invalid', `A capture is at most ${LIMITS.capture} characters.`)
  return text
}

/** A time the person typed (`2026-11-05T09:30`, or a full ISO string); absent or empty is undefined. */
export function cleanTime(value: unknown, what: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const date = typeof value === 'string' ? new Date(value) : undefined
  if (date === undefined || Number.isNaN(date.getTime())) throw new HubError('invalid', `${what} is not a date and time.`)
  return localTime(date)
}

/** A due date: a day (`2026-11-05`, due at the end of it, 17:00) or a time. */
export function cleanDue(value: unknown): string | undefined {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value)) return `${value}T17:00`
  return cleanTime(value, 'The due date')
}

export function cleanEstimate(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(n) || n <= 0 || n > LIMITS.estimate)
    throw new HubError('invalid', `An estimate is a whole number of minutes from 1 to ${LIMITS.estimate}.`)
  return n
}

export function cleanPriority(value: unknown): Priority {
  if (value === undefined || value === null || value === '') return 'normal'
  if ((PRIORITIES as readonly unknown[]).includes(value)) return value as Priority
  throw new HubError('invalid', `A priority is one of ${PRIORITIES.join(', ')}.`)
}

export function cleanCalendar(value: unknown): CalendarId {
  if (value === undefined || value === null || value === '') return 'meeting'
  if ((CALENDARS as readonly unknown[]).includes(value)) return value as CalendarId
  throw new HubError('invalid', `A calendar is one of ${CALENDARS.join(', ')}.`)
}

export function cleanTags(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : []
  const tags = [...new Set(raw.map((tag) => String(tag).trim().toLowerCase().replace(/^#/u, '')).filter((tag) => tag !== ''))]
  if (tags.length > LIMITS.tags) throw new HubError('invalid', `A note has at most ${LIMITS.tags} tags.`)
  return tags
}

export function cleanBody(value: unknown): string {
  const text = typeof value === 'string' ? value.replace(/\r\n/gu, '\n') : ''
  if (text.length > LIMITS.body) throw new HubError('invalid', `A note is at most ${LIMITS.body} characters.`)
  return text
}
