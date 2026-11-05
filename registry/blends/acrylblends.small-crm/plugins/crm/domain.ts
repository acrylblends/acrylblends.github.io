/**
 * Small CRM's types and pure rules: no clock, no disk, no ids made here. The {@link Crm} class (crm.ts) applies them to the saved state.
 */
export const STAGES = ['qualified', 'proposal', 'negotiation', 'won', 'lost'] as const
export type Stage = (typeof STAGES)[number]
/** The four columns of the board; a lost deal leaves the board and stays in the deal's history and the report. */
export const BOARD_STAGES = ['qualified', 'proposal', 'negotiation', 'won'] as const
export const OPEN_STAGES = ['qualified', 'proposal', 'negotiation'] as const

export const STAGE_LABEL: Readonly<Record<Stage, string>> = {
  qualified: 'Qualified',
  proposal: 'Proposal',
  negotiation: 'Negotiation',
  won: 'Won',
  lost: 'Lost',
}

/** The probability a deal gets when it moves into a stage. */
export const STAGE_PROBABILITY: Readonly<Record<Stage, number>> = {
  qualified: 35,
  proposal: 60,
  negotiation: 80,
  won: 100,
  lost: 0,
}

export type ActivityType = 'call' | 'email' | 'meeting' | 'note' | 'proposal' | 'stage'
export const ACTIVITY_TYPES: readonly ActivityType[] = ['call', 'email', 'meeting', 'note', 'proposal', 'stage']
export type Channel = 'Email' | 'Call' | 'Meeting'
export const CHANNELS: readonly Channel[] = ['Email', 'Call', 'Meeting']

export interface Owner {
  readonly id: string
  readonly name: string
  readonly initials: string
  readonly title: string
}

export interface Company {
  readonly id: string
  readonly name: string
  readonly website: string
  readonly industry: string
  /** A tint for the company's identity mark: purple, orange, teal, blue, red, gold or green. */
  readonly tint: string
}

export interface Contact {
  readonly id: string
  /** A contact without a company is an orphan (a freelancer, or someone whose company was not entered yet). */
  readonly companyId?: string
  readonly name: string
  readonly email: string
  readonly role: string
}

export interface Deal {
  readonly id: string
  readonly companyId: string
  readonly contactId?: string
  readonly title: string
  readonly value: number
  readonly currency: 'EUR'
  readonly stage: Stage
  readonly probability: number
  /** Absent while the deal is unassigned. */
  readonly ownerId?: string
  /** YYYY-MM-DD: when the deal is expected to close; for a closed deal, the day it closed. */
  readonly closeDate: string
  readonly lostReason?: string
}

export interface Activity {
  readonly id: string
  readonly dealId: string
  readonly type: ActivityType
  readonly body: string
  /** ISO date-time, local time without a zone: `2026-11-04T14:32`. */
  readonly at: string
  readonly ownerId?: string
}

export interface Task {
  readonly id: string
  readonly dealId: string
  readonly title: string
  readonly channel: Channel
  /** ISO date-time, local time without a zone. */
  readonly dueAt: string
  readonly status: 'open' | 'done'
}

export interface CrmState {
  readonly version: 1
  owners: Owner[]
  companies: Company[]
  contacts: Contact[]
  deals: Deal[]
  activities: Activity[]
  tasks: Task[]
}

/** The ways an operation is refused. `message` is written for the person who typed it. */
export type CrmErrorCode = 'invalid' | 'not-found' | 'conflict'

export class CrmError extends Error {
  readonly code: CrmErrorCode

  constructor(code: CrmErrorCode, message: string) {
    super(message)
    this.code = code
    this.name = 'CrmError'
  }
}

const pad = (n: number): string => String(n).padStart(2, '0')

/** `2026-11-05` for a local date. */
export function dayOf(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** `2026-11-05T08:40` for a local date-time. */
export function stampOf(date: Date): string {
  return `${dayOf(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function isDay(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false
  const [y, m, d] = text.split('-').map(Number) as [number, number, number]
  const date = new Date(y, m - 1, d)
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
}

export function isStamp(text: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text) && isDay(text.slice(0, 10)) && Number(text.slice(11, 13)) < 24 && Number(text.slice(14)) < 60
}

export function addDays(day: string, days: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  return dayOf(new Date(y, m - 1, d + days))
}

export const isOpen = (stage: Stage): boolean => stage !== 'won' && stage !== 'lost'

/** A task is overdue when it is open and its day is before today; it is due today on today's day. */
export function taskState(task: Task, today: string): 'overdue' | 'today' | 'later' | 'done' {
  if (task.status === 'done') return 'done'
  const day = task.dueAt.slice(0, 10)
  return day < today ? 'overdue' : day === today ? 'today' : 'later'
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** `Nov 12` for a day. */
export function shortDay(day: string): string {
  return `${MONTHS[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8, 10))}`
}

/** `Nov 12, 2026` for a day. */
export function longDay(day: string): string {
  return `${shortDay(day)}, ${day.slice(0, 4)}`
}

/** A date-time as people say it next to `today`: `Today, 14:32`, `Yesterday, 14:32`, `Oct 30, 09:10`. */
export function whenText(stamp: string, today: string): string {
  const day = stamp.slice(0, 10)
  const time = stamp.slice(11)
  if (day === today) return `Today, ${time}`
  if (day === addDays(today, -1)) return `Yesterday, ${time}`
  if (day === addDays(today, 1)) return `Tomorrow, ${time}`
  return `${shortDay(day)}, ${time}`
}

/** `€28,000`. */
export function euro(value: number): string {
  return `€${Math.round(value).toLocaleString('en-US')}`
}

/** `€72k`, `€50.5k`: the board's column totals. */
export function euroShort(value: number): string {
  if (value < 1000) return euro(value)
  const k = Math.round(value / 100) / 10
  return `€${Number.isInteger(k) ? k : k.toFixed(1)}k`
}

export function initialsOf(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() ?? '')
  return letters.length <= 1 ? (letters[0] ?? '?') : `${letters[0]}${letters[letters.length - 1]}`
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const isEmail = (text: string): boolean => EMAIL.test(text)

/** A text field as the domain keeps it: trimmed, and refused when it is empty or longer than `max`. */
export function cleanText(value: unknown, label: string, max = 120, required = true): string {
  const text = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
  if (text === '' && required) throw new CrmError('invalid', `${label} is needed.`)
  if (text.length > max) throw new CrmError('invalid', `${label} can be at most ${max} characters.`)
  return text
}

export function cleanValue(value: unknown): number {
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim().replace(/[€,\s]/g, '') : ''
  const number = Number(text)
  if (text === '' || !Number.isFinite(number) || number < 0 || number > 100_000_000)
    throw new CrmError('invalid', 'The deal value must be an amount from 0 to 100,000,000.')
  return Math.round(number)
}

export function cleanDay(value: unknown, label: string): string {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!isDay(text)) throw new CrmError('invalid', `${label} must be a date like 2026-11-14.`)
  return text
}

/** A task's due time: a date alone means 09:00 that day. */
export function cleanStamp(value: unknown, label: string): string {
  const text = typeof value === 'string' ? value.trim() : ''
  if (isDay(text)) return `${text}T09:00`
  if (!isStamp(text)) throw new CrmError('invalid', `${label} must be a date like 2026-11-14 or 2026-11-14T09:00.`)
  return text
}
