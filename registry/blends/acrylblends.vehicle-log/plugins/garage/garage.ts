/** The garage service: the vehicle, services, fuel, expenses and reminders, and the running-cost operations. */
import {
  cleanCategory,
  cleanDate,
  cleanOdometer,
  cleanParts,
  cleanPositive,
  cleanServiceType,
  cleanText,
  costsOf,
  type CostStats,
  type Expense,
  type FuelEntry,
  type GarageState,
  GarageError,
  monthlyCosts,
  type Reminder,
  type ServiceRecord,
  type ServiceType,
  type Vehicle,
} from './domain.ts'
import { seed } from './seed.ts'
import type { Store } from './store.ts'

export interface GarageAdapters {
  readonly store: Store<GarageState>
  readonly clock: () => Date
  readonly newId: (kind: string) => string
}

export class Garage {
  private state: GarageState
  private readonly adapters: GarageAdapters

  private constructor(state: GarageState, adapters: GarageAdapters) {
    this.state = state
    this.adapters = adapters
  }

  static async open(adapters: GarageAdapters): Promise<Garage> {
    const saved = await adapters.store.load()
    return new Garage(saved ?? seed(adapters.clock(), adapters.newId), adapters)
  }

  get now(): Date {
    return this.adapters.clock()
  }

  vehicle(): Vehicle {
    return this.state.vehicle
  }

  services(filter: { type?: ServiceType } = {}): readonly ServiceRecord[] {
    return [...this.state.services].filter((record) => filter.type === undefined || record.type === filter.type).sort((a, b) => b.date.localeCompare(a.date))
  }

  fuelEntries(): readonly FuelEntry[] {
    return [...this.state.fuel].sort((a, b) => b.date.localeCompare(a.date))
  }

  expenses(): readonly Expense[] {
    return [...this.state.expenses].sort((a, b) => b.date.localeCompare(a.date))
  }

  reminders(): readonly Reminder[] {
    return this.state.reminders
  }

  costs(): CostStats {
    return costsOf(this.state, this.now.getUTCFullYear())
  }

  months(): number[] {
    return monthlyCosts(this.state, this.now.getUTCFullYear())
  }

  async addService(input: { date: unknown; odometerKm: unknown; type: unknown; provider: unknown; description: unknown; cost: unknown; parts?: unknown }): Promise<ServiceRecord> {
    const odometer = cleanOdometer(input.odometerKm)
    if (odometer < this.state.vehicle.odometerKm - 5_000) throw new GarageError('invalid', 'A service odometer cannot be far below the current odometer.')
    const record: ServiceRecord = {
      id: this.adapters.newId('service'),
      vehicleId: this.state.vehicle.id,
      date: cleanDate(input.date),
      odometerKm: odometer,
      type: cleanServiceType(input.type),
      provider: cleanText(input.provider, 'Provider', 80),
      description: cleanText(input.description, 'Description', 200),
      cost: cleanPositive(input.cost, 'Cost'),
      parts: cleanParts(input.parts),
    }
    return this.commit(() => {
      this.state.services.push(record)
      if (odometer > this.state.vehicle.odometerKm) this.state.vehicle = { ...this.state.vehicle, odometerKm: odometer }
      return record
    })
  }

  async addFuel(input: { date: unknown; odometerKm: unknown; litres: unknown; totalCost: unknown }): Promise<FuelEntry> {
    const entry: FuelEntry = {
      id: this.adapters.newId('fuel'),
      vehicleId: this.state.vehicle.id,
      date: cleanDate(input.date),
      odometerKm: cleanOdometer(input.odometerKm),
      litres: cleanPositive(input.litres, 'Litres'),
      totalCost: cleanPositive(input.totalCost, 'Total cost'),
    }
    return this.commit(() => {
      this.state.fuel.push(entry)
      if (entry.odometerKm > this.state.vehicle.odometerKm) this.state.vehicle = { ...this.state.vehicle, odometerKm: entry.odometerKm }
      return entry
    })
  }

  async addExpense(input: { date: unknown; category: unknown; amount: unknown; note: unknown }): Promise<Expense> {
    const expense: Expense = {
      id: this.adapters.newId('expense'),
      vehicleId: this.state.vehicle.id,
      date: cleanDate(input.date),
      category: cleanCategory(input.category),
      amount: cleanPositive(input.amount, 'Amount'),
      note: cleanText(input.note, 'Note', 160),
    }
    return this.commit(() => {
      this.state.expenses.push(expense)
      return expense
    })
  }

  async updateOdometer(value: unknown): Promise<Vehicle> {
    const odometer = cleanOdometer(value)
    if (odometer < this.state.vehicle.odometerKm) throw new GarageError('invalid', 'The odometer cannot go backwards.')
    return this.commit(() => {
      this.state.vehicle = { ...this.state.vehicle, odometerKm: odometer }
      return this.state.vehicle
    })
  }

  async completeReminder(id: string): Promise<Reminder> {
    const reminder = this.state.reminders.find((item) => item.id === id)
    if (reminder === undefined) throw new GarageError('not-found', 'That reminder no longer exists.')
    if (reminder.status === 'done') throw new GarageError('conflict', 'That reminder is already complete.')
    const next: Reminder = { ...reminder, status: 'done' }
    return this.commit(() => {
      this.state.reminders = this.state.reminders.map((item) => (item.id === id ? next : item))
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
    this.state = { ...this.state, services: [...this.state.services], fuel: [...this.state.fuel], expenses: [...this.state.expenses], reminders: [...this.state.reminders] }
    try {
      await this.adapters.store.save(this.state)
    } catch (error) {
      throw new GarageError('storage', `The garage could not be saved: ${(error as Error).message}`)
    }
  }
}
