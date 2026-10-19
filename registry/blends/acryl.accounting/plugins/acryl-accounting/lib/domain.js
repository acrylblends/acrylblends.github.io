/**
 * Accounting domain: invoices (create, list, mark paid), expenses, and a VAT and income summary for a period. Pure functions
 * on plain data, no I/O. Money is kept in whole cents so sums never drift; a VAT rate is a whole percent (Austria: 20, 13, 10, 0).
 * VAT follows the invoice date and the expense date (accrual), the way a VAT return is filed. This is bookkeeping support, not tax advice.
 */

export class AccountingError extends Error {
  constructor(message) {
    super(message)
    this.name = 'AccountingError'
  }
}

export const VAT_RATES = [20, 13, 10, 0]
export const CURRENCY = 'EUR'

export function emptyState() {
  return { invoices: [], expenses: [], nextInvoice: 1, nextExpense: 1 }
}

const DAY = /^\d{4}-\d{2}-\d{2}$/u

export function requireDay(day, what = 'day') {
  if (typeof day !== 'string' || !DAY.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00Z`)) || new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day) {
    throw new AccountingError(`${what} "${String(day)}" is not a day in YYYY-MM-DD form`)
  }
  return day
}

export function addDays(day, days) {
  const date = new Date(`${requireDay(day)}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function requireText(value, what) {
  if (typeof value !== 'string' || value.trim() === '') throw new AccountingError(`${what} is required`)
  return value.trim()
}

function requireRate(rate) {
  const value = rate === undefined || rate === null || rate === '' ? 20 : Number(rate)
  if (!VAT_RATES.includes(value)) throw new AccountingError(`VAT rate ${String(rate)} is not one of ${VAT_RATES.join(', ')}`)
  return value
}

/** An amount typed as 12.5, "12,50" or "1 200.00" becomes whole cents; it must be a positive number with at most two decimals. */
export function toCents(amount, what = 'amount') {
  const text = String(amount ?? '').trim().replace(/\s/gu, '').replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/u.test(text)) throw new AccountingError(`${what} "${String(amount)}" is not a money amount such as 120.50`)
  const cents = Math.round(Number(text) * 100)
  if (cents <= 0) throw new AccountingError(`${what} must be more than zero`)
  return cents
}

export function formatMoney(cents) {
  const sign = cents < 0 ? '-' : ''
  const whole = Math.floor(Math.abs(cents) / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/gu, ',')
  return `${CURRENCY} ${sign}${whole}.${String(Math.abs(cents) % 100).padStart(2, '0')}`
}

const vatOf = (netCents, rate) => Math.round(netCents * rate / 100)

/** Net, VAT and gross of an invoice, from its lines. */
export function invoiceTotals(invoice) {
  const net = invoice.lines.reduce((sum, line) => sum + Math.round(line.quantity * line.unitCents), 0)
  const vat = vatOf(net, invoice.vatRate)
  return { net, vat, gross: net + vat }
}

/** An expense is entered at its gross amount; its net and VAT are split out by the rate. */
export function expenseTotals(expense) {
  const net = Math.round(expense.grossCents * 100 / (100 + expense.vatRate))
  return { net, vat: expense.grossCents - net, gross: expense.grossCents }
}

function linesFrom(input) {
  const raw = Array.isArray(input.lines) && input.lines.length > 0
    ? input.lines
    : [{ description: input.description, quantity: input.quantity, unitPrice: input.unitPrice }]
  return raw.map((line, index) => {
    const quantity = line.quantity === undefined || line.quantity === '' ? 1 : Number(line.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0) throw new AccountingError(`line ${index + 1}: quantity must be more than zero`)
    return { description: requireText(line.description, `line ${index + 1}: description`), quantity, unitCents: toCents(line.unitPrice, `line ${index + 1}: unit price`) }
  })
}

export function addInvoice(state, input, today) {
  const issued = requireDay(input.issued ?? today, 'issue date')
  const due = input.due === undefined || input.due === '' ? addDays(issued, Number(input.dueDays ?? 14)) : requireDay(input.due, 'due date')
  if (due < issued) throw new AccountingError('the due date cannot be before the issue date')
  const sameYear = state.invoices.filter(invoice => invoice.issued.slice(0, 4) === issued.slice(0, 4)).length
  const invoice = {
    id: state.nextInvoice,
    number: `${issued.slice(0, 4)}-${String(sameYear + 1).padStart(4, '0')}`,
    client: requireText(input.client, 'the client'),
    issued,
    due,
    lines: linesFrom(input),
    vatRate: requireRate(input.vatRate),
    status: 'open',
    paidOn: null,
  }
  return { ...state, invoices: [...state.invoices, invoice], nextInvoice: state.nextInvoice + 1 }
}

export function markPaid(state, id, paidOn) {
  const invoice = state.invoices.find(candidate => candidate.id === id)
  if (invoice === undefined) throw new AccountingError(`no invoice #${id}`)
  if (invoice.status === 'paid') throw new AccountingError(`invoice ${invoice.number} is already paid`)
  const day = requireDay(paidOn, 'payment date')
  if (day < invoice.issued) throw new AccountingError(`invoice ${invoice.number} was issued on ${invoice.issued}, so it cannot be paid on ${day}`)
  return { ...state, invoices: state.invoices.map(candidate => candidate.id === id ? { ...candidate, status: 'paid', paidOn: day } : candidate) }
}

export function addExpense(state, input, today) {
  const expense = {
    id: state.nextExpense,
    date: requireDay(input.date ?? today, 'expense date'),
    description: requireText(input.description, 'the description'),
    category: input.category === undefined || String(input.category).trim() === '' ? 'general' : String(input.category).trim(),
    grossCents: toCents(input.amount, 'amount'),
    vatRate: requireRate(input.vatRate),
  }
  return { ...state, expenses: [...state.expenses, expense], nextExpense: state.nextExpense + 1 }
}

export function listInvoices(state, { status } = {}) {
  if (status !== undefined && status !== 'all' && status !== 'open' && status !== 'paid') throw new AccountingError('status is open, paid or all')
  return state.invoices.filter(invoice => status === undefined || status === 'all' || invoice.status === status)
}

export function listExpenses(state, { from, to } = {}) {
  return state.expenses.filter(expense => (from === undefined || expense.date >= from) && (to === undefined || expense.date <= to))
}

/** `2026-Q3`, `2026-10`, `2026` or an explicit from/to become a first and last day. */
export function periodRange({ period, from, to }) {
  if (from !== undefined || to !== undefined) {
    const first = requireDay(from, 'from')
    const last = requireDay(to, 'to')
    if (last < first) throw new AccountingError('the period ends before it starts')
    return { from: first, to: last, label: `${first} to ${last}` }
  }
  const text = String(period ?? '').trim()
  let match = /^(\d{4})-Q([1-4])$/iu.exec(text)
  if (match) {
    const start = (Number(match[2]) - 1) * 3
    return { from: `${match[1]}-${String(start + 1).padStart(2, '0')}-01`, to: lastDayOf(Number(match[1]), start + 3), label: `${match[1]} Q${match[2]}` }
  }
  match = /^(\d{4})-(\d{2})$/u.exec(text)
  if (match && Number(match[2]) >= 1 && Number(match[2]) <= 12) return { from: `${match[1]}-${match[2]}-01`, to: lastDayOf(Number(match[1]), Number(match[2])), label: text }
  match = /^(\d{4})$/u.exec(text)
  if (match) return { from: `${match[1]}-01-01`, to: `${match[1]}-12-31`, label: text }
  throw new AccountingError(`period "${text}" is not a quarter (2026-Q3), a month (2026-10), a year (2026) or a from and to day`)
}

function lastDayOf(year, month) {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
}

/**
 * The VAT return and the income picture for a period. Output VAT is on the invoices issued in it, input VAT on the expenses dated in it;
 * their difference is what is payable (a negative number is a refund). Revenue and expenses are net; received counts invoices paid in it;
 * outstanding is every open invoice issued up to its last day, gross.
 */
export function summary(state, range) {
  const issued = state.invoices.filter(invoice => invoice.issued >= range.from && invoice.issued <= range.to)
  const spent = state.expenses.filter(expense => expense.date >= range.from && expense.date <= range.to)
  const sum = (items, field, totals) => items.reduce((total, item) => total + totals(item)[field], 0)
  const revenue = sum(issued, 'net', invoiceTotals)
  const outputVat = sum(issued, 'vat', invoiceTotals)
  const expensesNet = sum(spent, 'net', expenseTotals)
  const inputVat = sum(spent, 'vat', expenseTotals)
  const received = state.invoices
    .filter(invoice => invoice.status === 'paid' && invoice.paidOn >= range.from && invoice.paidOn <= range.to)
    .reduce((total, invoice) => total + invoiceTotals(invoice).gross, 0)
  const outstanding = state.invoices
    .filter(invoice => invoice.issued <= range.to && !(invoice.status === 'paid' && invoice.paidOn <= range.to))
    .reduce((total, invoice) => total + invoiceTotals(invoice).gross, 0)
  return {
    from: range.from, to: range.to, label: range.label ?? `${range.from} to ${range.to}`,
    invoices: issued.length, expenses: spent.length,
    revenue, outputVat, expensesNet, inputVat,
    vatPayable: outputVat - inputVat,
    profit: revenue - expensesNet,
    received, outstanding,
  }
}

/** The state as the page and the tools show it: every invoice and expense with its totals and whether it is overdue. */
export function view(state, today) {
  return {
    currency: CURRENCY,
    today,
    vatRates: VAT_RATES,
    invoices: state.invoices.map(invoice => ({ ...invoice, ...invoiceTotals(invoice), overdue: invoice.status === 'open' && invoice.due < today })),
    expenses: state.expenses.map(expense => ({ ...expense, ...expenseTotals(expense) })),
  }
}
