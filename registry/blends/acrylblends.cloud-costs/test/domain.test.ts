import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  budgetSpend,
  dailySpend,
  daysInMonth,
  euro,
  Finops,
  FinopsError,
  monthName,
  parseBillingCsv,
  serviceTotals,
  spendOf,
  splitCsvLine,
  teamOf,
} from '../plugins/finops/index.ts'
import type { FinopsState } from '../plugins/finops/domain.ts'
import { memoryStore } from '../plugins/finops/store.ts'
import { seed } from '../plugins/finops/seed.ts'
import { NOW, withApp } from './support.ts'

const newId = (kind: string): string => `${kind}-${Math.random().toString(36).slice(2, 8)}`

test('a CSV line splits outside quotes, and a billing file needs service, day and amount', () => {
  assert.deepEqual(splitCsvLine('a,"b, c",d'), ['a', 'b, c', 'd'])
  const lines = parseBillingCsv('service,account,region,day,amount,currency\nCompute / EC2,prod,eu-central-1,2026-11-01,320.10,EUR')
  assert.deepEqual(lines, [{ service: 'Compute / EC2', account: 'prod', region: 'eu-central-1', day: '2026-11-01', amount: 320.1 }])
  assert.throws(() => parseBillingCsv('service,day\nEC2,2026-11-01'), /no “amount” column/)
  assert.throws(() => parseBillingCsv('service,day,amount\nEC2,01/11/2026,1'), /not YYYY-MM-DD/)
  assert.throws(() => parseBillingCsv('service,day,amount,currency\nEC2,2026-11-01,1,USD'), /in USD/)
})

test('months have their real names and lengths', () => {
  assert.equal(monthName('2026-11'), 'November 2026')
  assert.equal(daysInMonth('2026-11'), 30)
  assert.equal(daysInMonth('2026-02'), 28)
})

test('money reads with and without cents', () => {
  assert.equal(euro(18462.8), '€18,462.80')
  assert.equal(euro(25000), '€25,000')
})

test('the forecast and the budget use are computed from the elapsed days', () => {
  const spend = spendOf(18_462.8, 25_000, 6, 30)
  assert.equal(Math.round(spend.forecast), 92_314)
  assert.equal(Math.round(spend.usedPct), 74)
  assert.equal(spend.over > 0, true)
})

test('the seed has the mockup spend, services, budgets, alerts and rules', () => {
  const state = seed(NOW, newId)
  const month = state.costs.filter((line) => line.day.startsWith('2026-11'))
  const total = Math.round(month.reduce((sum, line) => sum + line.amount, 0) * 100) / 100
  assert.equal(total, 18_462.8)
  const services = serviceTotals(state.costs, '2026-11')
  assert.equal(services[0]?.service, 'Compute / EC2')
  assert.equal(services[0]?.amount, 6420.2)
  assert.ok(services[0]?.change !== undefined && Math.abs((services[0].change ?? 0) - 14.2) < 0.1)
  assert.equal(services[3]?.service, 'Network egress')
  assert.equal(dailySpend(state.costs, '2026-11').length, 6)
  assert.equal(state.budgets.length, 5)
  assert.equal(state.alerts.filter((alert) => alert.status === 'open').length, 2)
  const global = state.budgets.find((budget) => budget.scope === 'all')
  assert.ok(global !== undefined)
  assert.equal(Math.round(budgetSpend(state.costs, global, '2026-11')), 18_463)
  assert.equal(teamOf(state.rules, 'Compute / EC2'), 'Platform')
  assert.equal(teamOf(state.rules, 'Network egress'), 'Unallocated')
})

async function open(): Promise<Finops> {
  let ids = 0
  return Finops.open({ store: memoryStore(), clock: () => NOW, newId: (kind) => `${kind}-${++ids}` })
}

test('the overview sums the month, forecasts it and rows the budgets', async () => {
  const finops = await open()
  const overview = finops.overview()
  assert.equal(overview.month, '2026-11')
  assert.equal(overview.spend.monthToDate, 18_462.8)
  assert.equal(overview.elapsedDays, 6)
  assert.equal(overview.days.length, 6)
  const rows = finops.budgetRows()
  assert.equal(rows.length, 5)
  assert.equal(rows[0]?.budget.scope, 'all')
  assert.equal(rows[0]?.atRisk, true)
  assert.equal(finops.alerts().length, 2)
})

test('an import adds its lines, and the same file for the same month is a duplicate', async () => {
  let ids = 0
  const store = memoryStore<FinopsState>()
  const finops = await Finops.open({ store, clock: () => NOW, newId: (kind) => `${kind}-${++ids}` })
  const provider = finops.providers().find((item) => item.sourceType === 'aws')
  assert.ok(provider !== undefined)
  const text = 'service,account,region,day,amount,currency\nNew service,prod-aws,eu-central-1,2026-11-07,123.45,EUR'
  const first = await finops.importBilling(provider.id, 'aws-extra.csv', text)
  assert.equal(first.duplicate, false)
  assert.equal(first.import.lines, 1)
  assert.equal(finops.overview().spend.monthToDate, 18_586.25)
  const again = await finops.importBilling(provider.id, 'aws-extra.csv', text)
  assert.equal(again.duplicate, true)
  assert.equal(again.import.status, 'duplicate')
  assert.equal(finops.overview().spend.monthToDate, 18_586.25)
  await assert.rejects(finops.importBilling(provider.id, '', 'service,day,amount\nA,2026-11-01,1\nB,2026-12-01,1'), /one billing month/)
})

test('a budget and a rule are validated and saved', async () => {
  const finops = await open()
  const budget = await finops.createBudget('Data platform', 'logging', 8_000, 80)
  assert.equal(budget.scope, 'logging')
  await assert.rejects(finops.createBudget('data platform', 'logging', 1, 80), (error: unknown) => error instanceof FinopsError && error.code === 'conflict')
  await assert.rejects(finops.createBudget('Bad', 'x', 0, 80), /positive amount/)
  const rule = await finops.createRule('Egress', 'Network')
  assert.equal(rule.team, 'Network')
  assert.equal(teamOf(finops.rules(), 'Network egress'), 'Network')
})

test('the workspace the pages see is the seed', () =>
  withApp(async (app) => {
    assert.equal(app.root.finops.overview().spend.monthToDate, 18_462.8)
  }))
