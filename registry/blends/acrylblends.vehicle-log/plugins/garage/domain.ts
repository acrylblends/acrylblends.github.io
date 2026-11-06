/** Vehicle Log's types and pure rules: the vehicle, services, fuel, expenses, reminders and the running-cost maths. */
export type ServiceType = 'service' | 'repair' | 'tyres' | 'inspection' | 'other'
export type ExpenseCategory = 'insurance' | 'tax' | 'inspection' | 'other'
export type ReminderStatus = 'open' | 'done'

export interface Vehicle {
  readonly id: string
  readonly make: string
  readonly model: string
  readonly year: number
  readonly registration: string
  readonly vinMasked: string
  readonly fuelType: string
  readonly transmission: string
  readonly odometerKm: number
  readonly averageConsumption: number
  readonly currency: string
  readonly fuelUnit: string
  /** Costs from before the app's records, so the lifetime cost per km is complete. */
  readonly openingCost: number
}

export interface ServiceRecord {
  readonly id: string
  readonly vehicleId: string
  readonly date: string
  readonly odometerKm: number
  readonly type: ServiceType
  readonly provider: string
  readonly description: string
  readonly cost: number
  readonly parts: readonly string[]
}

export interface FuelEntry {
  readonly id: string
  readonly vehicleId: string
  readonly date: string
  readonly odometerKm: number
  readonly litres: number
  readonly totalCost: number
}

export interface Expense {
  readonly id: string
  readonly vehicleId: string
  readonly date: string
  readonly category: ExpenseCategory
  readonly amount: number
  readonly note: string
}

export interface Reminder {
  readonly id: string
  readonly vehicleId: string
  readonly title: string
  readonly dueDate?: string
  readonly dueOdometerKm?: number
  readonly status: ReminderStatus
}

export interface GarageState {
  readonly version: 1
  vehicle: Vehicle
  services: ServiceRecord[]
  fuel: FuelEntry[]
  expenses: Expense[]
  reminders: Reminder[]
}

export type GarageErrorCode = 'invalid' | 'not-found' | 'conflict' | 'storage'
export class GarageError extends Error {
  readonly code: GarageErrorCode
  constructor(code: GarageErrorCode, message: string) {
    super(message)
    this.code = code
    this.name = 'GarageError'
  }
}

export const SERVICE_TYPES: readonly ServiceType[] = ['service', 'repair', 'tyres', 'inspection', 'other']
export const EXPENSE_CATEGORIES: readonly ExpenseCategory[] = ['insurance', 'tax', 'inspection', 'other']

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

/** `18 SEP 2026` from `2026-09-18`. */
export function dateLabel(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`)
  return `${String(parsed.getUTCDate()).padStart(2, '0')} ${MONTHS[parsed.getUTCMonth()] ?? ''} ${String(parsed.getUTCFullYear())}`
}

export function monthLabel(month: number): string {
  return MONTHS[month] ?? ''
}

export function money(value: number, currency = '€'): string {
  return `${currency}${value.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

export function money2(value: number, currency = '€'): string {
  return `${currency}${value.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function number(value: number): string {
  return value.toLocaleString('en-GB')
}

export interface CostStats {
  readonly costThisYear: number
  readonly costPerKm: number
  readonly nextServiceKm: number
  readonly totalCost: number
}

export function costsOf(state: GarageState, year: number): CostStats {
  const services = state.services.reduce((sum, record) => sum + record.cost, 0)
  const fuel = state.fuel.reduce((sum, entry) => sum + entry.totalCost, 0)
  const expenses = state.expenses.reduce((sum, expense) => sum + expense.amount, 0)
  const thisYear =
    state.services.filter((record) => record.date.startsWith(String(year))).reduce((sum, record) => sum + record.cost, 0) +
    state.fuel.filter((entry) => entry.date.startsWith(String(year))).reduce((sum, entry) => sum + entry.totalCost, 0) +
    state.expenses.filter((expense) => expense.date.startsWith(String(year))).reduce((sum, expense) => sum + expense.amount, 0)
  const total = state.vehicle.openingCost + services + fuel + expenses
  const next = state.reminders.find((reminder) => reminder.status === 'open' && reminder.dueOdometerKm !== undefined)
  return {
    costThisYear: thisYear,
    costPerKm: state.vehicle.odometerKm === 0 ? 0 : total / state.vehicle.odometerKm,
    nextServiceKm: next?.dueOdometerKm === undefined ? 0 : Math.max(0, next.dueOdometerKm - state.vehicle.odometerKm),
    totalCost: total,
  }
}

/** Twelve monthly totals for the year: services, fuel and expenses. */
export function monthlyCosts(state: GarageState, year: number): number[] {
  const totals = Array.from({ length: 12 }, () => 0)
  const add = (date: string, amount: number): void => {
    if (!date.startsWith(String(year))) return
    const month = Number.parseInt(date.slice(5, 7), 10) - 1
    totals[month] = (totals[month] ?? 0) + amount
  }
  for (const record of state.services) add(record.date, record.cost)
  for (const entry of state.fuel) add(entry.date, entry.totalCost)
  for (const expense of state.expenses) add(expense.date, expense.amount)
  return totals
}

export function cleanDate(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(new Date(`${text}T00:00:00Z`).getTime()))
    throw new GarageError('invalid', 'Enter a date as YYYY-MM-DD.')
  return text
}

export function cleanOdometer(value: unknown): number {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0 || number > 2_000_000) throw new GarageError('invalid', 'The odometer must be between 0 and 2,000,000 km.')
  return Math.round(number)
}

export function cleanPositive(value: unknown, field: string): number {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) throw new GarageError('invalid', `${field} must be a positive number.`)
  return Math.round(number * 100) / 100
}

export function cleanText(value: unknown, field: string, max = 200): string {
  if (typeof value !== 'string' || value.trim() === '') throw new GarageError('invalid', `${field} is required.`)
  return value.trim().slice(0, max)
}

export function cleanServiceType(value: unknown): ServiceType {
  return SERVICE_TYPES.includes(value as ServiceType) ? (value as ServiceType) : 'service'
}

export function cleanCategory(value: unknown): ExpenseCategory {
  return EXPENSE_CATEGORIES.includes(value as ExpenseCategory) ? (value as ExpenseCategory) : 'other'
}

export function cleanParts(value: unknown): string[] {
  if (typeof value !== 'string') return []
  return value.split(',').map((part) => part.trim()).filter((part) => part !== '').slice(0, 8)
}
