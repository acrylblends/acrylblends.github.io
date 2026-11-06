/** The pilot's logbook: flights, aircraft, endorsements and the hour totals. */
import {
  byClass,
  byDayNight,
  byRole,
  cleanAerodrome,
  cleanDate,
  cleanDuration,
  cleanLandings,
  cleanRole,
  cleanText,
  cleanTime,
  type Aircraft,
  type Endorsement,
  type Flight,
  type FlightStatus,
  type LogbookState,
  LogbookError,
  type LogbookStats,
  statsOf,
} from './domain.ts'
import { seed } from './seed.ts'
import type { Store } from './store.ts'

export interface LogbookAdapters {
  readonly store: Store<LogbookState>
  readonly clock: () => Date
  readonly newId: (kind: string) => string
}

export interface FlightInput {
  readonly date: unknown
  readonly departure: unknown
  readonly arrival: unknown
  readonly aircraftId: unknown
  readonly role: unknown
  readonly takeoffTime: unknown
  readonly landingTime: unknown
  readonly duration: unknown
  readonly dayNight: unknown
  readonly landings: unknown
  readonly remarks: unknown
}

export class Logbook {
  private state: LogbookState
  private readonly adapters: LogbookAdapters

  private constructor(state: LogbookState, adapters: LogbookAdapters) {
    this.state = state
    this.adapters = adapters
  }

  static async open(adapters: LogbookAdapters): Promise<Logbook> {
    const saved = await adapters.store.load()
    return new Logbook(saved ?? seed(adapters.clock(), adapters.newId), adapters)
  }

  get now(): Date {
    return this.adapters.clock()
  }

  pilot(): LogbookState['pilot'] {
    return this.state.pilot
  }

  aircraft(): readonly Aircraft[] {
    return this.state.aircraft
  }

  aircraftOf(id: string): Aircraft | undefined {
    return this.state.aircraft.find((aircraft) => aircraft.id === id)
  }

  flights(filter: { aircraftId?: string; role?: string } = {}): Flight[] {
    return [...this.state.flights]
      .filter((flight) => filter.aircraftId === undefined || flight.aircraftId === filter.aircraftId)
      .filter((flight) => filter.role === undefined || flight.role === filter.role)
      .sort((a, b) => b.date.localeCompare(a.date) || b.takeoffTime.localeCompare(a.takeoffTime))
  }

  flight(id: string): Flight | undefined {
    return this.state.flights.find((flight) => flight.id === id)
  }

  endorsements(): readonly Endorsement[] {
    return this.state.endorsements
  }

  stats(): LogbookStats {
    return statsOf(this.state, this.now)
  }

  experience(): { classes: ReturnType<typeof byClass>; roles: ReturnType<typeof byRole>; dayNight: ReturnType<typeof byDayNight> } {
    return { classes: byClass(this.state), roles: byRole(this.state), dayNight: byDayNight(this.state) }
  }

  async addFlight(input: FlightInput, status: FlightStatus = 'logged'): Promise<Flight> {
    if (this.aircraftOf(String(input.aircraftId ?? '')) === undefined) throw new LogbookError('invalid', 'Choose an aircraft.')
    const flight: Flight = {
      id: this.adapters.newId('flight'),
      date: cleanDate(input.date),
      departure: cleanAerodrome(input.departure, 'Departure'),
      arrival: cleanAerodrome(input.arrival, 'Arrival'),
      aircraftId: String(input.aircraftId),
      role: cleanRole(input.role),
      takeoffTime: cleanTime(input.takeoffTime, 'Takeoff'),
      landingTime: cleanTime(input.landingTime, 'Landing'),
      durationMinutes: cleanDuration(input.duration),
      dayNight: input.dayNight === 'Night' ? 'Night' : 'Day',
      landings: cleanLandings(input.landings),
      remarks: typeof input.remarks === 'string' ? input.remarks.trim().slice(0, 300) : '',
      status,
    }
    return this.commit(() => {
      this.state.flights.push(flight)
      return flight
    })
  }

  async updateDraft(id: string, input: FlightInput): Promise<Flight> {
    const flight = this.flight(id)
    if (flight === undefined) throw new LogbookError('not-found', 'That flight no longer exists.')
    if (flight.status !== 'draft') throw new LogbookError('conflict', 'Only a draft record can be edited.')
    if (this.aircraftOf(String(input.aircraftId ?? '')) === undefined) throw new LogbookError('invalid', 'Choose an aircraft.')
    const next: Flight = {
      ...flight,
      date: cleanDate(input.date),
      departure: cleanAerodrome(input.departure, 'Departure'),
      arrival: cleanAerodrome(input.arrival, 'Arrival'),
      aircraftId: String(input.aircraftId),
      role: cleanRole(input.role),
      takeoffTime: cleanTime(input.takeoffTime, 'Takeoff'),
      landingTime: cleanTime(input.landingTime, 'Landing'),
      durationMinutes: cleanDuration(input.duration),
      dayNight: input.dayNight === 'Night' ? 'Night' : 'Day',
      landings: cleanLandings(input.landings),
      remarks: typeof input.remarks === 'string' ? input.remarks.trim().slice(0, 300) : '',
      status: 'logged',
    }
    return this.commit(() => {
      this.state.flights = this.state.flights.map((item) => (item.id === id ? next : item))
      return next
    })
  }

  private async commit<T>(change: () => T): Promise<T> {
    const snapshot = structuredClone(this.state)
    const result = change()
    try {
      await this.save()
    } catch (error) {
      this.state = snapshot
      throw error
    }
    return result
  }

  private async save(): Promise<void> {
    this.state = { ...this.state, flights: [...this.state.flights] }
    try {
      await this.adapters.store.save(this.state)
    } catch (error) {
      throw new LogbookError('storage', `The logbook could not be saved: ${(error as Error).message}`)
    }
  }
}
