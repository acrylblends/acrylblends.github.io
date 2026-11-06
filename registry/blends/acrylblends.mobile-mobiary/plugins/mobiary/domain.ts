/**
 * Mobiary's domain: journal entries (notes, voice memos, photos), the daily focus with its small goals, the home-screen widgets and the preferences
 * (compact mode, quiet notifications and quiet hours). Pure functions and plain data; the {@link Journal} in journal.ts applies them to the saved state
 * and the screens only read what it returns.
 *
 * Voice memos and photos are placeholders: nothing is recorded and no camera is used.
 */

export type EntryKind = 'note' | 'voice' | 'photo'

export interface Entry {
  readonly id: string
  readonly title: string
  readonly kind: EntryKind
  readonly at: string
}

export interface Goal {
  readonly id: string
  readonly text: string
  readonly done: boolean
}

export type WidgetId = 'focus' | 'quick' | 'moments'

export interface Preferences {
  /** Smaller type and spacing in the device preview. */
  readonly compact: boolean
  /** Only the reminders you choose. */
  readonly quiet: boolean
  /** `22:00`. */
  readonly quietFrom: string
  /** `08:00`. */
  readonly quietTo: string
}

export interface JournalState {
  readonly version: 1
  readonly name: string
  readonly focus: string
  readonly goals: readonly Goal[]
  readonly widgets: Readonly<Record<WidgetId, boolean>>
  readonly preferences: Preferences
  readonly entries: readonly Entry[]
}

export class JournalError extends Error {
  override readonly name = 'JournalError'
  readonly code: 'invalid' | 'not-found' | 'conflict'
  constructor(code: 'invalid' | 'not-found' | 'conflict', message: string) {
    super(message)
    this.code = code
  }
}

export const KIND_LABEL: Readonly<Record<EntryKind, string>> = { note: 'Quick note', voice: 'Voice memo', photo: 'Photo' }
export const KIND_ICON: Readonly<Record<EntryKind, string>> = { note: '✎', voice: '◖', photo: '▧' }
export const KIND_WORD: Readonly<Record<EntryKind, string>> = { note: 'Note', voice: 'Voice', photo: 'Photo' }

export const WIDGETS: readonly { id: WidgetId; name: string; hint: string }[] = [
  { id: 'focus', name: 'Daily focus', hint: 'One intention for today' },
  { id: 'quick', name: 'Quick capture', hint: 'Note, voice and photo buttons' },
  { id: 'moments', name: 'Recent moments', hint: 'Last three saved entries' },
]

export const MAX_TITLE = 80
export const MAX_ENTRIES = 200

// ---- display ------------------------------------------------------------------------------------------------------------------------------------

/** Good morning, afternoon or evening by the hour. */
export const greeting = (now: Date): string => (now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening')

/** `THURSDAY, 5 NOVEMBER`. */
export const dateLabel = (now: Date): string => `${now.toLocaleDateString('en-GB', { weekday: 'long' })}, ${String(now.getDate())} ${now.toLocaleDateString('en-GB', { month: 'long' })}`.toUpperCase()

/** `Today`, `Yesterday`, `Sunday` (within the last week), or `Nov 2`. */
export function dayLabel(iso: string, now: Date): string {
  const at = new Date(iso)
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((day(now) - day(at)) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return at.toLocaleDateString('en-US', { weekday: 'long' })
  return at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** The line under an entry: `Today · Quick note`. */
export const subtitleOf = (e: Entry, now: Date): string => `${dayLabel(e.at, now)} · ${KIND_LABEL[e.kind]}`

export const progressOf = (goals: readonly Goal[]): { done: number; total: number; percent: number } => {
  const done = goals.filter((g) => g.done).length
  return { done, total: goals.length, percent: goals.length === 0 ? 0 : Math.round((done / goals.length) * 100) }
}

// ---- input checks -----------------------------------------------------------------------------------------------------------------------------

export function parseTitle(raw: string | undefined): string {
  const title = (raw ?? '').trim().replace(/\s+/g, ' ')
  if (title === '') throw new JournalError('invalid', 'Write a few words first.')
  if (title.length > MAX_TITLE) throw new JournalError('invalid', `A moment is at most ${String(MAX_TITLE)} characters.`)
  return title
}

export function parseKind(raw: string | undefined): EntryKind {
  if (raw === 'note' || raw === 'voice' || raw === 'photo') return raw
  throw new JournalError('invalid', 'Pick note, voice or photo.')
}

export function parseTime(raw: string | undefined, label: string): string {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(raw ?? '')) throw new JournalError('invalid', `${label} is a time like 22:00.`)
  return raw ?? ''
}
