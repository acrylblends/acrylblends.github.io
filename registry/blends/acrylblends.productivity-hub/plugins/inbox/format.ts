/**
 * The Inbox page's formatting: escaping, and how long ago a capture was made, in the words a person reads ("30 min ago", "Yesterday, 19:00").
 */

export const esc = (text: string): string =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

const parts = (value: string): { year: number; month: number; day: number; time: string } => {
  const [date = '', time = ''] = value.split('T')
  const [year, month, day] = date.split('-').map(Number)
  return { year: year ?? 0, month: month ?? 1, day: day ?? 1, time }
}

/** `YYYY-MM-DD` of a local time. */
export function dayOf(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value
  return `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** How long ago a capture was made, from the request's now. */
export function capturedLabel(capturedAt: string, now: Date): string {
  const then = new Date(capturedAt)
  const today = dayOf(now)
  const day = dayOf(capturedAt)
  if (day === today) {
    const minutes = Math.round((now.getTime() - then.getTime()) / 60_000)
    if (minutes < 1) return 'Just now'
    if (minutes < 60) return `${String(minutes)} min ago`
    return `${String(Math.floor(minutes / 60))} h ago`
  }
  const { year, month, day: d } = parts(today)
  if (day === dayOf(new Date(year, month - 1, d - 1))) return `Yesterday, ${parts(capturedAt).time.slice(0, 5)}`
  const at = parts(capturedAt)
  return `${String(at.day)} ${MONTHS[at.month - 1] ?? ''}, ${at.time.slice(0, 5)}`
}

/** `today` for the triage form's date input: the day the page is showing. */
export const todayOf = (now: Date): string => dayOf(now)
