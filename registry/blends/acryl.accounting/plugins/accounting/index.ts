/**
 * Accounting: invoices (create, list, mark paid), expenses, and a VAT and income summary for a period, as one feature plugin. `lib/domain.js` (the rules, pure) and `lib/store.js`
 * (one JSON file, written atomically) are the starter's own code from before it was an acrylblends app; this file is the adapter: JSON routes under `/accounting` that the page and the
 * agent call, and the books as a widget on the first screen (tabs: Invoices, Expenses, VAT & income).
 *
 * Routes: GET /state, GET /invoices?status=open|paid|all, GET /expenses?from=&to=, GET /summary?period=2026-Q3 (or 2026-10, 2026) or ?from=&to=,
 * POST /invoice {client, description, unitPrice, quantity?, vatRate?, issued?, dueDays?}, POST /invoice-paid {id, paidOn?}, POST /expense {description, amount, vatRate?, category?, date?}.
 * A refused request answers {error} with 422 (a rule said no) or 400 (a bad body). Money is whole cents inside, shown in EUR.
 */
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '@acryldev/blends'
import type {} from '../home/index.ts'
import type {} from '@acryldev/instance'
import * as domain from './lib/domain.js'
import { type AccountingStore, fileStore } from './lib/store.js'

export const name = 'accounting'
export const inject = ['router', 'home', 'appInstance']

export interface AccountingConfig {
  /** A store for tests; absent, `accounting.json` in the app's home. */
  readonly store?: AccountingStore
  /** What day it is (YYYY-MM-DD), for tests; absent, today in UTC. */
  readonly today?: () => string
}

const body = async (request: { json(): Promise<unknown> }): Promise<Record<string, unknown>> => {
  const parsed = await request.json().catch(() => undefined)
  return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
}

type Reply = { json(value: unknown, status?: 200 | 400 | 422): Response }

export function apply(ctx: Context, config: AccountingConfig = {}): void {
  const store = config.store ?? fileStore(join(ctx.appInstance.home, 'accounting.json'))
  const today = config.today ?? (() => new Date().toISOString().slice(0, 10))
  const refused = (c: Reply, cause: unknown) => c.json({ error: (cause as Error).message }, cause instanceof domain.AccountingError ? 422 : 400)
  const change = (run: (state: domain.AccountingState, input: Record<string, unknown>) => domain.AccountingState) =>
    async (c: Reply & { req: { json(): Promise<unknown> } }) => {
      try {
        const next = run(store.load(), await body(c.req))
        store.save(next)
        return c.json(domain.view(next, today()))
      } catch (cause) {
        return refused(c, cause)
      }
    }
  const read = (run: (state: domain.AccountingState, query: (key: string) => string | undefined) => unknown) =>
    (c: Reply & { req: { query(key: string): string | undefined } }) => {
      try {
        return c.json(run(store.load(), (key) => c.req.query(key)))
      } catch (cause) {
        return refused(c, cause)
      }
    }
  const app = new Acryl()
    .get('/state', read((state) => domain.view(state, today())))
    .get('/invoices', read((state, query) => domain.listInvoices(state, { status: query('status') })))
    .get('/expenses', read((state, query) => domain.listExpenses(state, { from: query('from'), to: query('to') })))
    .get('/summary', read((state, query) => domain.summary(state, domain.periodRange({ period: query('period'), from: query('from'), to: query('to') }))))
    .post('/invoice', change((state, input) => domain.addInvoice(state, input, today())))
    .post('/invoice-paid', change((state, input) => domain.markPaid(state, Number(input.id), input.paidOn ?? today())))
    .post('/expense', change((state, input) => domain.addExpense(state, input, today())))
  ctx.router.route('/accounting', app)

  ctx.effect(() =>
    ctx.home.widget({
      id: 'accounting',
      title: 'Accounting',
      render: () => `<div id="accounting" data-test="accounting">
<style>#accounting nav{display:flex;gap:.5rem;margin:.5rem 0}#accounting nav button[aria-selected=true]{font-weight:700}#accounting table{width:100%;border-collapse:collapse;font-size:.9rem}#accounting th,#accounting td{text-align:left;padding:.3rem .4rem;border-bottom:1px solid #8884}#accounting .n{text-align:right;font-variant-numeric:tabular-nums}#accounting form{display:flex;flex-wrap:wrap;gap:.4rem;margin:.6rem 0}#accounting form input,#accounting form select{max-width:9rem}#accounting .late td{color:#c92a2a}#accounting .cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(11rem,1fr));gap:.6rem}#accounting .card{border:1px solid #8884;border-radius:.5rem;padding:.5rem}#accounting .card b{display:block;font-size:1.2rem}</style>
<nav role="tablist"><button type="button" role="tab" data-tab="invoices" aria-selected="true">Invoices</button><button type="button" role="tab" data-tab="expenses" aria-selected="false">Expenses</button><button type="button" role="tab" data-tab="summary" aria-selected="false">VAT &amp; income</button></nav>
<p id="accounting-error" role="alert" hidden></p>
<section id="accounting-invoices"></section><section id="accounting-expenses" hidden></section><section id="accounting-summary" hidden></section>
</div>
<script type="module">
  const url = (path) => 'accounting/' + path
  const esc = (value) => { const node = document.createElement('span'); node.textContent = String(value ?? ''); return node.innerHTML }
  const money = (cents) => (cents < 0 ? '-' : '') + '€' + (Math.abs(cents) / 100).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const error = document.getElementById('accounting-error')
  async function call(path, payload) {
    const response = await fetch(url(path), payload === undefined ? undefined : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
    const data = await response.json()
    if (!response.ok) { error.textContent = data.error; error.hidden = false; return undefined }
    error.hidden = true
    return data
  }
  const rates = (name) => '<select name="' + name + '">' + [20, 13, 10, 0].map((r) => '<option value="' + r + '">' + r + '%</option>').join('') + '</select>'
  const formData = (form) => Object.fromEntries([...new FormData(form)].filter(([, v]) => v !== ''))
  let state
  function draw() {
    const rows = [...state.invoices].reverse().map((i) => '<tr class="' + (i.overdue ? 'late' : '') + '"><td>' + esc(i.number) + '</td><td>' + esc(i.client) + '</td><td>' + esc(i.due) + '</td><td class="n">' + money(i.net) + '</td><td class="n">' + money(i.vat) + '</td><td class="n">' + money(i.gross) + '</td><td>' + (i.status === 'paid' ? 'paid ' + esc(i.paidOn) : i.overdue ? 'overdue' : 'open') + '</td><td>' + (i.status === 'open' ? '<button type="button" data-paid="' + i.id + '">Mark paid</button>' : '') + '</td></tr>').join('')
    document.getElementById('accounting-invoices').innerHTML = '<form id="accounting-invoice-form"><input name="client" placeholder="Client" required> <input name="description" placeholder="Description" required> <input name="quantity" type="number" min="0.01" step="any" value="1" aria-label="Quantity"> <input name="unitPrice" placeholder="Unit price (net, EUR)" inputmode="decimal" required> ' + rates('vatRate') + ' <input name="issued" type="date" aria-label="Issued"> <input name="dueDays" type="number" min="0" value="14" aria-label="Due in days"> <button type="submit">Create invoice</button></form><table><thead><tr><th>No.</th><th>Client</th><th>Due</th><th class="n">Net</th><th class="n">VAT</th><th class="n">Gross</th><th>Status</th><th></th></tr></thead><tbody>' + (rows || '<tr><td colspan="8"><em>No invoices yet.</em></td></tr>') + '</tbody></table>'
    const spent = [...state.expenses].reverse().map((x) => '<tr><td>' + esc(x.date) + '</td><td>' + esc(x.description) + '</td><td>' + esc(x.category) + '</td><td class="n">' + money(x.net) + '</td><td class="n">' + money(x.vat) + '</td><td class="n">' + money(x.gross) + '</td></tr>').join('')
    document.getElementById('accounting-expenses').innerHTML = '<form id="accounting-expense-form"><input name="description" placeholder="Description" required> <input name="category" placeholder="Category"> <input name="amount" placeholder="Amount paid (gross, EUR)" inputmode="decimal" required> ' + rates('vatRate') + ' <input name="date" type="date" aria-label="Date"> <button type="submit">Add expense</button></form><table><thead><tr><th>Date</th><th>Description</th><th>Category</th><th class="n">Net</th><th class="n">VAT</th><th class="n">Gross</th></tr></thead><tbody>' + (spent || '<tr><td colspan="6"><em>No expenses yet.</em></td></tr>') + '</tbody></table>'
  }
  async function summary() {
    const year = state.today.slice(0, 4)
    const box = document.getElementById('accounting-summary')
    const from = box.querySelector('[name=from]')?.value || year + '-01-01'
    const to = box.querySelector('[name=to]')?.value || year + '-12-31'
    const s = await call('summary?from=' + from + '&to=' + to)
    if (!s) return
    const card = (k, v, sub) => '<div class="card"><small>' + k + '</small><b>' + v + '</b><small>' + sub + '</small></div>'
    box.innerHTML = '<p><label>From <input name="from" type="date" value="' + from + '"></label> <label>To <input name="to" type="date" value="' + to + '"></label></p><div class="cards">' + card(s.vatPayable < 0 ? 'VAT refund' : 'VAT payable', money(Math.abs(s.vatPayable)), 'output ' + money(s.outputVat) + ' minus input ' + money(s.inputVat)) + card('Revenue (net)', money(s.revenue), s.invoices + ' invoice(s) issued') + card('Expenses (net)', money(s.expensesNet), s.expenses + ' expense(s)') + card('Profit', money(s.profit), 'revenue minus expenses') + card('Received', money(s.received), 'paid in the period, gross') + card('Outstanding', money(s.outstanding), 'unpaid at the end, gross') + '</div>'
  }
  async function load() { const next = await call('state'); if (next) { state = next; draw() } }
  const root = document.getElementById('accounting')
  root.addEventListener('click', async (event) => {
    const tab = event.target.closest('[data-tab]')
    if (tab) {
      for (const button of root.querySelectorAll('[data-tab]')) button.setAttribute('aria-selected', String(button === tab))
      for (const name of ['invoices', 'expenses', 'summary']) document.getElementById('accounting-' + name).hidden = name !== tab.dataset.tab
      if (tab.dataset.tab === 'summary') summary()
    }
    const paid = event.target.closest('[data-paid]')
    if (paid) { const next = await call('invoice-paid', { id: Number(paid.dataset.paid) }); if (next) { state = next; draw() } }
  })
  root.addEventListener('change', (event) => { if (event.target.closest('#accounting-summary')) summary() })
  root.addEventListener('submit', async (event) => {
    event.preventDefault()
    const path = event.target.id === 'accounting-invoice-form' ? 'invoice' : 'expense'
    const next = await call(path, formData(event.target))
    if (next) { state = next; draw() }
  })
  load()
</script>`,
    }),
  )
}
