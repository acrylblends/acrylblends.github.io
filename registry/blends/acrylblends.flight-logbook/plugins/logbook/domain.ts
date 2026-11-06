/** Flight Logbook's types and pure rules: the pilot, aircraft, flights, endorsements and the hour totals. */
export type Role = 'PIC' | 'Dual' | 'Instructor'
export type DayNight = 'Day' | 'Night'
export type FlightStatus = 'logged' | 'draft'

export interface Pilot {
  readonly id: string
  readonly name: string
  readonly licenceType: string
  /** PIC hours from before the app's records, so the experience total is complete. */
  readonly openingPicMinutes: number
}

export interface Aircraft {
  readonly id: string
  readonly type: string
  readonly registration: string
  readonly class: 'SEP' | 'MEP'
  readonly operator: string
}

export interface Flight {
  readonly id: string
  readonly date: string
  readonly departure: string
  readonly arrival: string
  readonly aircraftId: string
  readonly role: Role
  readonly takeoffTime: string
  readonly landingTime: string
  readonly durationMinutes: number
  readonly dayNight: DayNight
  readonly landings: number
  readonly remarks: string
  readonly status: FlightStatus
}

export interface Endorsement {
  readonly id: string
  readonly class: string
  readonly issuedAt: string
  readonly expiresAt: string
}

export interface LogbookState {
  readonly version: 1
  pilot: Pilot
  aircraft: Aircraft[]
  flights: Flight[]
  endorsements: Endorsement[]
}

export type LogbookErrorCode = 'invalid' | 'not-found' | 'conflict' | 'storage'
export class LogbookError extends Error {
  readonly code: LogbookErrorCode
  constructor(code: LogbookErrorCode, message: string) {
    super(message)
    this.code = code
    this.name = 'LogbookError'
  }
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

export function dateLabel(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`)
  return `${String(parsed.getUTCDate()).padStart(2, '0')} ${MONTHS[parsed.getUTCMonth()] ?? ''} ${String(parsed.getUTCFullYear())}`
}

export function shortDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`)
  return `${String(parsed.getUTCDate()).padStart(2, '0')} ${(MONTHS[parsed.getUTCMonth()] ?? '').charAt(0)}${(MONTHS[parsed.getUTCMonth()] ?? '').slice(1).toLowerCase()}`
}

/** `486:35` from minutes. */
export function hoursText(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes))
  return `${String(Math.floor(safe / 60))}:${String(safe % 60).padStart(2, '0')}`
}

export interface LogbookStats {
  readonly totalMinutes: number
  readonly yearMinutes: number
  readonly yearFlights: number
  readonly picMinutes: number
  readonly last90Minutes: number
  readonly nextCheck?: string
}

export function statsOf(state: LogbookState, now: Date): LogbookStats {
  const year = String(now.getUTCFullYear())
  const end = now.getTime()
  const start90 = end - 90 * 86_400_000
  const flights = state.flights.filter((flight) => flight.status === 'logged')
  const pic = flights.filter((flight) => flight.role === 'PIC').reduce((sum, flight) => sum + flight.durationMinutes, 0) + state.pilot.openingPicMinutes
  const endorsement = [...state.endorsements].sort((a, b) => a.expiresAt.localeCompare(b.expiresAt))[0]
  return {
    totalMinutes: flights.reduce((sum, flight) => sum + flight.durationMinutes, 0),
    yearMinutes: flights.filter((flight) => flight.date.startsWith(year)).reduce((sum, flight) => sum + flight.durationMinutes, 0),
    yearFlights: flights.filter((flight) => flight.date.startsWith(year)).length,
    picMinutes: pic,
    last90Minutes: flights
      .filter((flight) => {
        const at = new Date(`${flight.date}T12:00:00Z`).getTime()
        return at >= start90 && at <= end
      })
      .reduce((sum, flight) => sum + flight.durationMinutes, 0),
    ...(endorsement === undefined ? {} : { nextCheck: endorsement.expiresAt }),
  }
}

export function byClass(state: LogbookState): { label: string; minutes: number; flights: number }[] {
  return ['SEP', 'MEP'].map((label) => {
    const flights = state.flights.filter((flight) => flight.status === 'logged' && state.aircraft.find((aircraft) => aircraft.id === flight.aircraftId)?.class === label)
    return { label, minutes: flights.reduce((sum, flight) => sum + flight.durationMinutes, 0), flights: flights.length }
  })
}

export function byRole(state: LogbookState): { label: string; minutes: number }[] {
  return (['PIC', 'Dual', 'Instructor'] as Role[]).map((label) => ({ label, minutes: state.flights.filter((flight) => flight.status === 'logged' && flight.role === label).reduce((sum, flight) => sum + flight.durationMinutes, 0) }))
}

export function byDayNight(state: LogbookState): { label: string; minutes: number }[] {
  return (['Day', 'Night'] as DayNight[]).map((label) => ({ label, minutes: state.flights.filter((flight) => flight.status === 'logged' && flight.dayNight === label).reduce((sum, flight) => sum + flight.durationMinutes, 0) }))
}

export function cleanText(value: unknown, field: string, max = 200): string {
  if (typeof value !== 'string' || value.trim() === '') throw new LogbookError('invalid', `${field} is required.`)
  return value.trim().slice(0, max)
}

export function cleanDate(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(new Date(`${text}T00:00:00Z`).getTime())) throw new LogbookError('invalid', 'Enter the date as YYYY-MM-DD.')
  return text
}

export function cleanAerodrome(value: unknown, field: string): string {
  const text = typeof value === 'string' ? value.trim().toUpperCase() : ''
  if (!/^[A-Z]{3,4}$/.test(text)) throw new LogbookError('invalid', `${field} is a 3 or 4 letter aerodrome code.`)
  return text
}

export function cleanTime(value: unknown, field: string): string {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) throw new LogbookError('invalid', `${field} looks like 09:14.`)
  return text
}

export function cleanDuration(value: unknown): number {
  const text = typeof value === 'string' ? value.trim() : ''
  const match = /^(\d{1,2}):([0-5]\d)$/.exec(text)
  if (match === null) throw new LogbookError('invalid', 'The duration looks like 1:12.')
  const minutes = Number(match[1]) * 60 + Number(match[2])
  if (minutes <= 0 || minutes > 14 * 60) throw new LogbookError('invalid', 'The duration must be between 1 minute and 14 hours.')
  return minutes
}

export function cleanRole(value: unknown): Role {
  return value === 'Dual' || value === 'Instructor' ? value : 'PIC'
}

export function cleanLandings(value: unknown): number {
  const number = Number(value)
  if (!Number.isInteger(number) || number < 0 || number > 20) throw new LogbookError('invalid', 'Landings must be a whole number between 0 and 20.')
  return number
}
