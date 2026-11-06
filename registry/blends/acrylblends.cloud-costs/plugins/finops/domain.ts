/**
 * Cloud Costs' types and pure rules: providers, billing imports, cost lines, budgets and alerts, and the sums a FinOps report needs. No clock, no
 * disk and no ids are made here; the {@link Finops} class applies these rules to the saved state.
 */

export type ProviderSource = 'aws' | 'gcp' | 'azure'

export interface Provider {
  readonly id: string
  readonly name: string
  readonly sourceType: ProviderSource
  /** False for a provider that is listed but has no import yet. */
  readonly connected: boolean
}

export interface BillingImport {
  readonly id: string
  readonly providerId: string
  readonly period: string
  readonly fileName: string
  readonly status: 'imported' | 'duplicate' | 'failed'
  readonly lines: number
  readonly importedAt: string
}

export interface CostLine {
  readonly id: string
  readonly providerId: string
  readonly service: string
  readonly account: string
  readonly region: string
  /** `YYYY-MM-DD`. */
  readonly day: string
  readonly amount: number
  readonly currency: 'EUR'
}

export interface Budget {
  readonly id: string
  readonly name: string
  /** The service whose spend it watches, or `all` for every provider. */
  readonly scope: string
  readonly limit: number
  readonly period: 'monthly'
  /** A share of the limit (0 to 100) at which the budget is at risk. */
  readonly alertThreshold: number
}

export interface Alert {
  readonly id: string
  readonly budgetId: string
  readonly forecast: number
  readonly triggeredAt: string
  readonly status: 'open' | 'resolved'
  readonly note: string
}

export interface AllocationRule {
  readonly id: string
  /** A service name, or a part of one (matched ignoring case). */
  readonly service: string
  readonly team: string
}

export interface FinopsState {
  readonly version: 1
  providers: Provider[]
  imports: BillingImport[]
  costs: CostLine[]
  budgets: Budget[]
  alerts: Alert[]
  rules: AllocationRule[]
}

export type FinopsErrorCode = 'invalid' | 'not-found' | 'conflict'

export class FinopsError extends Error {
  readonly code: FinopsErrorCode

  constructor(code: FinopsErrorCode, message: string) {
    super(message)
    this.code = code
    this.name = 'FinopsError'
  }
}

const pad = (n: number): string => String(n).padStart(2, '0')

export function dayOf(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function stampOf(date: Date): string {
  return `${dayOf(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** `2h ago`, `Yesterday`, `31 Oct`. */
export function whenText(stamp: string, now: Date): string {
  const then = new Date(stamp)
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  if (hours < 48) return 'Yesterday'
  if (then.getFullYear() === now.getFullYear())
    return then.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })
  return then.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' })
}

/** `2026-11` from a day. */
export const monthOf = (day: string): string => day.slice(0, 7)

/** The month's name: `November 2026`. */
export function monthName(month: string): string {
  const [year, number] = month.split('-')
  return new Date(Number(year), Number(number) - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

export function daysInMonth(month: string): number {
  const [year, number] = month.split('-').map(Number)
  return new Date(Number(year), Number(number), 0).getDate()
}

/** The day of the month, 1 to 31. */
export const dayNumber = (day: string): number => Number(day.slice(8, 10))

export function euro(value: number): string {
  const rounded = Math.round(value * 100) / 100
  return `€${new Intl.NumberFormat('en-GB', { minimumFractionDigits: Number.isInteger(rounded) ? 0 : 2, maximumFractionDigits: 2 }).format(rounded)}`
}

export function number(value: number, digits = 0): string {
  return new Intl.NumberFormat('en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)
}

export function percent(value: number, digits = 0): string {
  return `${value.toFixed(digits)}%`
}

/** The month-to-date total, the forecast for the rest of the month, and the share of the budget used. */
export interface Spend {
  readonly monthToDate: number
  readonly forecast: number
  readonly budget: number
  readonly usedPct: number
  readonly over: number
}

export function spendOf(monthToDate: number, budget: number, elapsedDays: number, days: number): Spend {
  const forecast = elapsedDays === 0 ? monthToDate : (monthToDate / elapsedDays) * days
  return {
    monthToDate,
    forecast,
    budget,
    usedPct: budget === 0 ? 0 : (monthToDate / budget) * 100,
    over: forecast - budget,
  }
}

export interface ServiceTotal {
  readonly service: string
  readonly providerId: string
  readonly amount: number
  readonly previous: number
  readonly change: number | undefined
}

/** The spend by service for a month, largest first; `previous` is the month before. */
export function serviceTotals(costs: readonly CostLine[], month: string): ServiceTotal[] {
  const [year, monthNumber] = month.split('-').map(Number)
  const before = `${String(monthNumber === 1 ? Number(year) - 1 : year)}-${pad(monthNumber === 1 ? 12 : Number(monthNumber) - 1)}`
  const totals = new Map<string, { providerId: string; amount: number; previous: number }>()
  for (const line of costs) {
    const key = line.service
    const entry = totals.get(key) ?? { providerId: line.providerId, amount: 0, previous: 0 }
    if (monthOf(line.day) === month) entry.amount += line.amount
    else if (monthOf(line.day) === before) entry.previous += line.amount
    totals.set(key, entry)
  }
  return [...totals.entries()]
    .map(([service, entry]) => ({
      service,
      providerId: entry.providerId,
      amount: Math.round(entry.amount * 100) / 100,
      previous: Math.round(entry.previous * 100) / 100,
      change: entry.previous === 0 ? undefined : ((entry.amount - entry.previous) / entry.previous) * 100,
    }))
    .filter((entry) => entry.amount > 0 || entry.previous > 0)
    .sort((a, b) => b.amount - a.amount)
}

/** The spend per provider for a month. */
export function providerTotals(costs: readonly CostLine[], month: string): Map<string, number> {
  const totals = new Map<string, number>()
  for (const line of costs) if (monthOf(line.day) === month) totals.set(line.providerId, (totals.get(line.providerId) ?? 0) + line.amount)
  return totals
}

/** The spend on each day of a month, one entry per provider, for the stacked chart. */
export interface DaySpend {
  readonly day: string
  readonly byProvider: ReadonlyMap<string, number>
  readonly total: number
}

export function dailySpend(costs: readonly CostLine[], month: string): DaySpend[] {
  const days = new Map<string, Map<string, number>>()
  for (const line of costs) {
    if (monthOf(line.day) !== month) continue
    const byProvider = days.get(line.day) ?? new Map<string, number>()
    byProvider.set(line.providerId, (byProvider.get(line.providerId) ?? 0) + line.amount)
    days.set(line.day, byProvider)
  }
  return [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, byProvider]) => ({ day, byProvider, total: [...byProvider.values()].reduce((sum, value) => sum + value, 0) }))
}

/** A budget's spend in a month: every cost line when the scope is `all`, the matching services otherwise. */
export function budgetSpend(costs: readonly CostLine[], budget: Budget, month: string): number {
  return costs
    .filter((line) => monthOf(line.day) === month && (budget.scope === 'all' || line.service.toLowerCase().includes(budget.scope.toLowerCase())))
    .reduce((total, line) => total + line.amount, 0)
}

/** The team an allocation rule gives a service, or `Unallocated`. */
export function teamOf(rules: readonly AllocationRule[], service: string): string {
  return rules.find((rule) => service.toLowerCase().includes(rule.service.toLowerCase()))?.team ?? 'Unallocated'
}

/** One CSV line as fields (commas inside quotes do not split). */
export function splitCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let quoted = false
  for (let index = 0; index < line.length; index++) {
    const character = line[index]
    if (quoted) {
      if (character === '"' && line[index + 1] === '"') {
        current += '"'
        index++
      } else if (character === '"') quoted = false
      else current += character
    } else if (character === '"') quoted = true
    else if (character === ',') {
      fields.push(current.trim())
      current = ''
    } else current += character
  }
  fields.push(current.trim())
  return fields
}

export interface ParsedLine {
  readonly service: string
  readonly account: string
  readonly region: string
  readonly day: string
  readonly amount: number
}

/** A provider billing export: `service,account,region,day,amount,currency`. @throws with the message the form shows. */
export function parseBillingCsv(text: string): ParsedLine[] {
  const lines = text.replace(/^﻿/u, '').split(/\r?\n/u).filter((line) => line.trim() !== '')
  if (lines.length < 2) throw new FinopsError('invalid', 'The file needs a header and at least one cost line.')
  const headers = splitCsvLine(lines[0] as string).map((header) => header.toLowerCase())
  const index = (name: string): number => headers.indexOf(name)
  for (const required of ['service', 'amount', 'day']) if (index(required) === -1) throw new FinopsError('invalid', `The file has no “${required}” column.`)
  const result: ParsedLine[] = []
  for (const [lineNumber, line] of lines.slice(1).entries()) {
    const fields = splitCsvLine(line)
    const service = fields[index('service')] ?? ''
    const amountText = (fields[index('amount')] ?? '').replace(/[€\s]/gu, '').replace(',', '.')
    const amount = Number(amountText)
    const day = fields[index('day')] ?? ''
    const currency = index('currency') === -1 ? 'EUR' : fields[index('currency')] ?? 'EUR'
    if (service === '') throw new FinopsError('invalid', `Line ${String(lineNumber + 2)} has no service.`)
    if (!Number.isFinite(amount) || amount < 0) throw new FinopsError('invalid', `Line ${String(lineNumber + 2)} has an invalid amount.`)
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(day)) throw new FinopsError('invalid', `Line ${String(lineNumber + 2)} has a day that is not YYYY-MM-DD.`)
    if (currency.toUpperCase() !== 'EUR') throw new FinopsError('invalid', `Line ${String(lineNumber + 2)} is in ${currency}; this workspace reports in EUR.`)
    result.push({ service, account: fields[index('account')] ?? '', region: fields[index('region')] ?? '', day, amount })
  }
  return result
}
