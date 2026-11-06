/**
 * The FinOps workspace: providers, imports, cost lines, budgets, alerts and allocation rules, and every operation a page may run. Its outside effects
 * (where the state lives, what time it is, how ids are made) come in as adapters.
 */
import {
  type AllocationRule,
  type Alert,
  budgetSpend,
  type Budget,
  type BillingImport,
  type CostLine,
  dailySpend,
  type DaySpend,
  dayNumber,
  dayOf,
  daysInMonth,
  FinopsError,
  type FinopsState,
  monthName,
  monthOf,
  parseBillingCsv,
  percent,
  type Provider,
  providerTotals,
  type ServiceTotal,
  serviceTotals,
  spendOf,
  type Spend,
  stampOf,
} from './domain.ts'
import { seed } from './seed.ts'
import type { Store } from './store.ts'

export interface FinopsAdapters {
  readonly store: Store<FinopsState>
  readonly clock: () => Date
  readonly newId: (kind: string) => string
}

export interface Overview {
  readonly month: string
  readonly monthLabel: string
  readonly spend: Spend
  readonly services: readonly ServiceTotal[]
  readonly days: readonly DaySpend[]
  readonly providers: ReadonlyMap<string, number>
  readonly elapsedDays: number
}

export interface BudgetRow {
  readonly budget: Budget
  readonly spent: number
  readonly pct: number
  readonly forecast: number
  readonly atRisk: boolean
}

export class Finops {
  private state: FinopsState
  private readonly adapters: FinopsAdapters

  private constructor(state: FinopsState, adapters: FinopsAdapters) {
    this.state = state
    this.adapters = adapters
  }

  static async open(adapters: FinopsAdapters): Promise<Finops> {
    const saved = await adapters.store.load()
    return new Finops(saved ?? seed(adapters.clock(), adapters.newId), adapters)
  }

  get today(): string {
    return dayOf(this.adapters.clock())
  }

  get month(): string {
    return monthOf(this.today)
  }

  get monthLabel(): string {
    return monthName(this.month)
  }

  providers(): readonly Provider[] {
    return this.state.providers
  }

  provider(id: string): Provider | undefined {
    return this.state.providers.find((provider) => provider.id === id)
  }

  providerName(id: string): string {
    return this.provider(id)?.name ?? id
  }

  imports(): readonly BillingImport[] {
    return [...this.state.imports].sort((a, b) => b.importedAt.localeCompare(a.importedAt))
  }

  costs(filter: { month?: string; providerId?: string; service?: string; q?: string } = {}): readonly CostLine[] {
    const q = (filter.q ?? '').trim().toLowerCase()
    return this.state.costs
      .filter((line) => filter.month === undefined || monthOf(line.day) === filter.month)
      .filter((line) => filter.providerId === undefined || line.providerId === filter.providerId)
      .filter((line) => filter.service === undefined || line.service === filter.service)
      .filter((line) => q === '' || [line.service, line.account, line.region, line.day].join(' ').toLowerCase().includes(q))
      .sort((a, b) => b.day.localeCompare(a.day) || b.amount - a.amount)
  }

  budgets(): readonly Budget[] {
    return this.state.budgets
  }

  budget(id: string): Budget | undefined {
    return this.state.budgets.find((budget) => budget.id === id)
  }

  alerts(): readonly Alert[] {
    return [...this.state.alerts].sort((a, b) => b.triggeredAt.localeCompare(a.triggeredAt))
  }

  rules(): readonly AllocationRule[] {
    return this.state.rules
  }

  /** The month-to-date spend, forecast, service breakdown and daily stack. */
  overview(month = this.month): Overview {
    const costs = this.costs({ month })
    const monthToDate = Math.round(costs.reduce((total, line) => total + line.amount, 0) * 100) / 100
    const days = daysInMonth(month)
    const elapsedDays = month === this.month ? Math.min(dayNumber(this.today), days) : days
    const global = this.state.budgets.find((budget) => budget.scope === 'all')
    return {
      month,
      monthLabel: monthName(month),
      spend: spendOf(monthToDate, global?.limit ?? 0, elapsedDays, days),
      services: serviceTotals(this.state.costs, month),
      days: dailySpend(this.state.costs, month),
      providers: providerTotals(this.state.costs, month),
      elapsedDays,
    }
  }

  /** Every budget with its spend and forecast for a month, the global one first. */
  budgetRows(month = this.month): BudgetRow[] {
    const days = daysInMonth(month)
    const elapsedDays = month === this.month ? Math.min(dayNumber(this.today), days) : days
    return this.state.budgets.map((budget) => {
      const spent = Math.round(budgetSpend(this.state.costs, budget, month) * 100) / 100
      const forecast = elapsedDays === 0 ? spent : (spent / elapsedDays) * days
      return {
        budget,
        spent,
        pct: budget.limit === 0 ? 0 : (spent / budget.limit) * 100,
        forecast,
        atRisk: budget.limit > 0 && forecast > (budget.limit * budget.alertThreshold) / 100,
      }
    })
  }

  /** The share of a budget used, as the bars show it. */
  usedText(row: BudgetRow): string {
    return `${percent(row.pct)} · €${new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 }).format(row.budget.limit)}`
  }

  /**
   * Import a provider export: `service,account,region,day,amount,currency`. The same file for the same provider and period is a duplicate: it is
   * recorded with that status and adds no lines.
   */
  async importBilling(providerId: string, fileName: string, text: string): Promise<{ import: BillingImport; duplicate: boolean }> {
    const provider = this.provider(providerId)
    if (provider === undefined) throw new FinopsError('not-found', 'That provider no longer exists.')
    const parsed = parseBillingCsv(text)
    const period = monthOf(parsed[0]?.day ?? this.today)
    if (parsed.some((line) => monthOf(line.day) !== period)) throw new FinopsError('invalid', 'A file may only cover one billing month.')
    const name = fileName.trim() === '' ? `${provider.sourceType}-${period}.csv` : fileName.trim()
    const duplicate = this.state.imports.find((item) => item.providerId === providerId && item.period === period && item.fileName === name && item.status === 'imported')
    if (duplicate !== undefined) {
      const record: BillingImport = {
        id: this.adapters.newId('import'),
        providerId,
        period,
        fileName: name,
        status: 'duplicate',
        lines: 0,
        importedAt: stampOf(this.adapters.clock()),
      }
      this.state.imports.push(record)
      await this.save()
      return { import: record, duplicate: true }
    }
    const lines: CostLine[] = parsed.map((line) => ({
      id: this.adapters.newId('cost'),
      providerId,
      service: line.service,
      account: line.account,
      region: line.region,
      day: line.day,
      amount: line.amount,
      currency: 'EUR',
    }))
    this.state.costs.push(...lines)
    const record: BillingImport = {
      id: this.adapters.newId('import'),
      providerId,
      period,
      fileName: name,
      status: 'imported',
      lines: lines.length,
      importedAt: stampOf(this.adapters.clock()),
    }
    this.state.imports.push(record)
    await this.save()
    return { import: record, duplicate: false }
  }

  async createBudget(name: string, scope: string, limit: number, alertThreshold: number): Promise<Budget> {
    const clean = name.trim()
    if (clean === '') throw new FinopsError('invalid', 'The budget needs a name.')
    if (!Number.isFinite(limit) || limit <= 0) throw new FinopsError('invalid', 'The limit must be a positive amount.')
    if (!Number.isFinite(alertThreshold) || alertThreshold < 1 || alertThreshold > 100) throw new FinopsError('invalid', 'The alert threshold is 1 to 100.')
    if (this.state.budgets.some((budget) => budget.name.toLowerCase() === clean.toLowerCase()))
      throw new FinopsError('conflict', `A budget named “${clean}” already exists.`)
    const budget: Budget = {
      id: this.adapters.newId('budget'),
      name: clean,
      scope: scope.trim() === '' ? 'all' : scope.trim().toLowerCase(),
      limit,
      period: 'monthly',
      alertThreshold,
    }
    this.state.budgets.push(budget)
    await this.save()
    return budget
  }

  async createRule(service: string, team: string): Promise<AllocationRule> {
    const cleanService = service.trim().toLowerCase()
    const cleanTeam = team.trim()
    if (cleanService === '') throw new FinopsError('invalid', 'The rule needs a service.')
    if (cleanTeam === '') throw new FinopsError('invalid', 'The rule needs a team.')
    if (this.state.rules.some((rule) => rule.service === cleanService))
      throw new FinopsError('conflict', `A rule for “${cleanService}” already exists.`)
    const rule: AllocationRule = { id: this.adapters.newId('rule'), service: cleanService, team: cleanTeam }
    this.state.rules.push(rule)
    await this.save()
    return rule
  }

  private async save(): Promise<void> {
    this.state = {
      ...this.state,
      providers: [...this.state.providers],
      imports: [...this.state.imports],
      costs: [...this.state.costs],
      budgets: [...this.state.budgets],
      alerts: [...this.state.alerts],
      rules: [...this.state.rules],
    }
    await this.adapters.store.save(this.state)
  }
}
