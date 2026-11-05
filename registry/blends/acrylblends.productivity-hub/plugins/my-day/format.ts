/**
 * Small formatting helpers for My Day, in the mockup's voice: the long date, the day labels, the note dates and the number words ("Six things on your
 * plate"). The hub stores local times as `YYYY-MM-DDTHH:MM`, so these read that text directly and never convert through another time zone.
 */

export const esc = (text: string): string =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const

const parts = (value: string): { year: number; month: number; day: number; time: string } => {
  const [date = '', time = ''] = value.split('T')
  const [year, month, day] = date.split('-').map(Number)
  return { year: year ?? 0, month: month ?? 1, day: day ?? 1, time }
}

/** The local day of a stored time: `YYYY-MM-DD`. */
export function dayOf(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value
  return `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** `THURSDAY, NOVEMBER 5, 2026`, the eyebrow over the day's title. */
export function longDate(day: string): string {
  const { year, month, day: d } = parts(day)
  const weekday = WEEKDAYS[new Date(year, month - 1, d).getDay()] ?? ''
  return `${weekday}, ${MONTHS[month - 1] ?? ''} ${String(d)}, ${String(year)}`.toUpperCase()
}

/** `Thursday · 5 November`, beside the Today heading. */
export function dayLabel(day: string): string {
  const { year, month, day: d } = parts(day)
  const weekday = WEEKDAYS[new Date(year, month - 1, d).getDay()] ?? ''
  return `${weekday} · ${String(d)} ${MONTHS[month - 1] ?? ''}`
}

/** `OCT 31`: a day short enough for a task's right edge or a note's label. */
export function monthDay(value: string): string {
  const { month, day } = parts(value)
  return `${(MONTHS[month - 1] ?? '').slice(0, 3).toUpperCase()} ${String(day)}`
}

/** `Nov 2`: the title-case short day the week range is written in. */
export function shortDateTitle(value: string): string {
  const { month, day } = parts(value)
  return `${(MONTHS[month - 1] ?? '').slice(0, 3)} ${String(day)}`
}

/** `Nov 2 - 8`, or `Nov 30 - Dec 6` when the week crosses a month. */
export function weekRange(start: string, end: string): string {
  const a = parts(start)
  const b = parts(end)
  return a.month === b.month ? `${shortDateTitle(start)} - ${String(b.day)}` : `${shortDateTitle(start)} - ${shortDateTitle(end)}`
}

/** The day of the month, for the week strip. */
export const dayNumber = (value: string): number => parts(value).day

/** `MON`, the day's three letters in the week strip. */
export const weekdayShort = (value: string): string => (WEEKDAYS[weekdayIndex(value)] ?? '').slice(0, 3).toUpperCase()

/** `Tuesday`, the day's name. */
export const weekdayName = (value: string): string => WEEKDAYS[weekdayIndex(value)] ?? ''

function weekdayIndex(value: string): number {
  const { year, month, day } = parts(value)
  return new Date(year, month - 1, day).getDay()
}

/** `TODAY`, `YESTERDAY`, else `OCT 31`, for a note's updated time. */
export function relativeDay(value: string, today: string): string {
  const day = dayOf(value)
  if (day === today) return 'TODAY'
  const { year, month, day: d } = parts(today)
  const before = new Date(year, month - 1, d - 1)
  if (day === dayOf(before)) return 'YESTERDAY'
  return monthDay(value)
}

/** `11:30` from a stored time. */
export const timeOf = (value: string): string => parts(value).time.slice(0, 5)

/** A task's right-edge label: `OVERDUE`, `TODAY` (the end-of-day default), a time today, or the day. */
export function dueLabel(dueAt: string | undefined, today: string): { text: string; overdue: boolean } {
  if (dueAt === undefined) return { text: '', overdue: false }
  const day = dayOf(dueAt)
  if (day < today) return { text: 'OVERDUE', overdue: true }
  if (day === today) {
    const time = timeOf(dueAt)
    return { text: time === '17:00' ? 'TODAY' : time, overdue: false }
  }
  return { text: monthDay(dueAt), overdue: false }
}

const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'] as const

/** `Six` for the header's count; a number past twelve stays a number. */
export function numberWord(n: number): string {
  return WORDS[n] ?? String(n)
}

/** The first step's words of a note's body, folded to one line: what a card shows before the note is opened. */
export function excerpt(body: string, limit = 160): string {
  const text = body.replace(/\s+/gu, ' ').trim()
  return text.length > limit ? `${text.slice(0, limit).trimEnd()}…` : text
}
