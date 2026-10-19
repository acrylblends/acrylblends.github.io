import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as d from '../lib/domain.js'

const TODAY = '2026-10-19'
const base = () => d.emptyState()

test('money is whole cents: 12,50 and 12.5 are the same, and bad amounts are refused', () => {
  assert.equal(d.toCents('12,50'), 1250)
  assert.equal(d.toCents(12.5), 1250)
  assert.equal(d.toCents('1 200.00'), 120000)
  for (const bad of ['', 'abc', '1.234', '-5', 0, '0.00']) assert.throws(() => d.toCents(bad), d.AccountingError)
  assert.equal(d.formatMoney(123456), 'EUR 1,234.56')
  assert.equal(d.formatMoney(-5), 'EUR -0.05')
})

test('an invoice gets a yearly number, a due date and totals with VAT', () => {
  let state = d.addInvoice(base(), { client: 'Acme', description: 'Consulting', quantity: 10, unitPrice: '95', issued: '2026-10-01' }, TODAY)
  state = d.addInvoice(state, { client: 'Beta', description: 'Design', unitPrice: '300', vatRate: 10, issued: '2026-10-05', dueDays: 30 }, TODAY)
  const [first, second] = state.invoices
  assert.equal(first.number, '2026-0001')
  assert.equal(second.number, '2026-0002')
  assert.equal(first.due, '2026-10-15')
  assert.equal(second.due, '2026-11-04')
  assert.deepEqual(d.invoiceTotals(first), { net: 95000, vat: 19000, gross: 114000 })
  assert.deepEqual(d.invoiceTotals(second), { net: 30000, vat: 3000, gross: 33000 })
  assert.equal(base().invoices.length, 0)
})

test('invoice numbers restart each year', () => {
  let state = d.addInvoice(base(), { client: 'A', description: 'x', unitPrice: '1', issued: '2025-12-31' }, TODAY)
  state = d.addInvoice(state, { client: 'B', description: 'x', unitPrice: '1', issued: '2026-01-02' }, TODAY)
  assert.deepEqual(state.invoices.map(invoice => invoice.number), ['2025-0001', '2026-0001'])
})

test('an invalid invoice is refused with a reason', () => {
  const bad = input => () => d.addInvoice(base(), { client: 'A', description: 'x', unitPrice: '1', ...input }, TODAY)
  assert.throws(bad({ client: ' ' }), /client is required/)
  assert.throws(bad({ description: '' }), /description is required/)
  assert.throws(bad({ vatRate: 19 }), /VAT rate 19/)
  assert.throws(bad({ issued: '2026-13-01' }), /not a day/)
  assert.throws(bad({ issued: '2026-02-30' }), /not a day/)
  assert.throws(bad({ issued: '2026-10-10', due: '2026-10-01' }), /before the issue date/)
  assert.throws(bad({ quantity: 0 }), /quantity must be more than zero/)
})

test('marking an invoice paid records the day, and cannot be done twice or before it was issued', () => {
  let state = d.addInvoice(base(), { client: 'A', description: 'x', unitPrice: '100', issued: '2026-10-01' }, TODAY)
  assert.throws(() => d.markPaid(state, 9, TODAY), /no invoice #9/)
  assert.throws(() => d.markPaid(state, 1, '2026-09-30'), /cannot be paid on/)
  state = d.markPaid(state, 1, '2026-10-10')
  assert.equal(state.invoices[0].status, 'paid')
  assert.equal(state.invoices[0].paidOn, '2026-10-10')
  assert.throws(() => d.markPaid(state, 1, TODAY), /already paid/)
  assert.equal(d.listInvoices(state, { status: 'open' }).length, 0)
  assert.equal(d.listInvoices(state, { status: 'paid' }).length, 1)
  assert.throws(() => d.listInvoices(state, { status: 'late' }), /status is open/)
})

test('an expense is entered gross and split into net and VAT', () => {
  const state = d.addExpense(base(), { description: 'Laptop', amount: '1200', vatRate: 20, date: '2026-10-03', category: 'equipment' }, TODAY)
  assert.deepEqual(d.expenseTotals(state.expenses[0]), { net: 100000, vat: 20000, gross: 120000 })
  const none = d.addExpense(base(), { description: 'Train', amount: '50', vatRate: 0 }, TODAY)
  assert.equal(none.expenses[0].date, TODAY)
  assert.equal(none.expenses[0].category, 'general')
  assert.deepEqual(d.expenseTotals(none.expenses[0]), { net: 5000, vat: 0, gross: 5000 })
})

test('periods: a quarter, a month, a year and explicit days', () => {
  assert.deepEqual(d.periodRange({ period: '2026-Q3' }), { from: '2026-07-01', to: '2026-09-30', label: '2026 Q3' })
  assert.equal(d.periodRange({ period: '2026-02' }).to, '2026-02-28')
  assert.equal(d.periodRange({ period: '2024-02' }).to, '2024-02-29')
  assert.deepEqual(d.periodRange({ period: '2026' }).to, '2026-12-31')
  assert.equal(d.periodRange({ from: '2026-10-01', to: '2026-10-31' }).label, '2026-10-01 to 2026-10-31')
  assert.throws(() => d.periodRange({ period: 'soon' }), /not a quarter/)
  assert.throws(() => d.periodRange({ from: '2026-10-31', to: '2026-10-01' }), /ends before/)
})

test('the summary: output VAT on invoices issued, input VAT on expenses, payable is the difference', () => {
  let state = d.addInvoice(base(), { client: 'Acme', description: 'Consulting', quantity: 10, unitPrice: '100', issued: '2026-10-01' }, TODAY)
  state = d.addInvoice(state, { client: 'Beta', description: 'Design', unitPrice: '500', vatRate: 10, issued: '2026-10-20' }, TODAY)
  state = d.addInvoice(state, { client: 'Old', description: 'Earlier', unitPrice: '999', issued: '2026-06-15' }, TODAY)
  state = d.markPaid(state, 1, '2026-10-12')
  state = d.addExpense(state, { description: 'Laptop', amount: '600', vatRate: 20, date: '2026-10-03' }, TODAY)
  state = d.addExpense(state, { description: 'Old cost', amount: '240', vatRate: 20, date: '2026-05-03' }, TODAY)
  const october = d.summary(state, d.periodRange({ period: '2026-10' }))
  assert.equal(october.invoices, 2)
  assert.equal(october.revenue, 100000 + 50000)
  assert.equal(october.outputVat, 20000 + 5000)
  assert.equal(october.expensesNet, 50000)
  assert.equal(october.inputVat, 10000)
  assert.equal(october.vatPayable, 25000 - 10000)
  assert.equal(october.profit, 150000 - 50000)
  assert.equal(october.received, 120000)
  assert.equal(october.outstanding, 55000 + 119880)
})

test('a period with more input than output VAT gives a negative payable, a refund', () => {
  const state = d.addExpense(base(), { description: 'Server', amount: '1200', vatRate: 20, date: '2026-10-02' }, TODAY)
  assert.equal(d.summary(state, d.periodRange({ period: '2026-10' })).vatPayable, -20000)
})

test('the view marks an open invoice past its due date as overdue', () => {
  let state = d.addInvoice(base(), { client: 'A', description: 'x', unitPrice: '10', issued: '2026-09-01', dueDays: 14 }, TODAY)
  state = d.addInvoice(state, { client: 'B', description: 'x', unitPrice: '10', issued: '2026-10-15', dueDays: 14 }, TODAY)
  assert.deepEqual(d.view(state, TODAY).invoices.map(invoice => invoice.overdue), [true, false])
})
