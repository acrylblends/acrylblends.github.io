/**
 * acryl-accounting: invoices (create, list, mark paid), expenses, and a VAT and income summary for a period, grown from the Blank Blueprint as one
 * ordinary Cordis plugin. Plain local data in `<app home>/.acryl/accounting.json`, no external service. Tools the agent calls on the user's behalf,
 * and a page of its own (`/accounting`) that reads and writes the same file through same-origin loopback routes this plugin owns. Remove the plugin
 * and the tools and page go; the data file stays with the project.
 *
 * Surfaces: tui web desktop (tools need no browser; the page needs `webServer`, web/desktop only).
 */
import { isAbsolute, join } from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'
import * as domain from './lib/domain.js'
import { pageHtml } from './lib/page.js'
import { error, finishJson, isLoopbackAddress, isSameOriginLoopbackRequest, parseJsonPostBody, INVALID_BODY } from './lib/http.js'
import { fileStore } from './lib/store.js'

export const name = 'acryl-accounting'
// appInstance: the data belongs to the app, not to the chat's workspace, so the tools and the page both keep it in the app's own home.
export const inject = ['tools', 'webServer', 'appInstance']

const today = () => new Date().toISOString().slice(0, 10)

function resolveCwd(value, appHome) {
  if (value === undefined || value === null || value === '') return appHome
  if (typeof value !== 'string' || !isAbsolute(value)) throw new Error('cwd must be an absolute path')
  return value
}
const storeForCwd = cwd => fileStore(join(cwd, '.acryl', 'accounting.json'))

const text = (_args, value) => [{ type: 'text', text: value }]
const output = { schema: { type: 'string' }, render: text }

/** One use case = one tool: load, apply a domain rule, save, describe the result. The data is the app's own, wherever the chat's workspace is. */
const makeUseCase = openStore => (definition, run) => {
  return defineTool({
    ...definition,
    output,
    async execute(args) {
      const store = openStore()
      try {
        return run(store.load(), args, store)
      } catch (cause) {
        if (cause instanceof domain.AccountingError) throw new Error(cause.message)
        throw cause
      }
    },
  })
}

const money = domain.formatMoney
const list = lines => lines.length === 0 ? '(none)' : lines.join('\n')
const invoiceLine = invoice => {
  const totals = domain.invoiceTotals(invoice)
  return `#${invoice.id} ${invoice.number} ${invoice.client}: ${money(totals.gross)} (net ${money(totals.net)}, VAT ${invoice.vatRate}% ${money(totals.vat)}), issued ${invoice.issued}, due ${invoice.due}, ${invoice.status === 'paid' ? `paid ${invoice.paidOn}` : 'open'}`
}
const expenseLine = expense => `#${expense.id} ${expense.date} ${expense.description} [${expense.category}]: ${money(expense.grossCents)} gross, VAT ${expense.vatRate}% ${money(domain.expenseTotals(expense).vat)}`
const summaryText = result => [
  `Period ${result.label} (${result.from} to ${result.to})`,
  `Invoices issued: ${result.invoices}, expenses: ${result.expenses}`,
  `Revenue (net): ${money(result.revenue)}`,
  `Expenses (net): ${money(result.expensesNet)}`,
  `Profit: ${money(result.profit)}`,
  `Output VAT: ${money(result.outputVat)}`,
  `Input VAT: ${money(result.inputVat)}`,
  `VAT ${result.vatPayable < 0 ? 'refund' : 'payable'}: ${money(Math.abs(result.vatPayable))}`,
  `Received in the period (gross): ${money(result.received)}`,
  `Outstanding at its end (gross): ${money(result.outstanding)}`,
].join('\n')

export function apply(ctx) {
  const useCase = makeUseCase(() => storeForCwd(ctx.appInstance.home))
  const tools = [
    useCase({ name: 'invoice_create', description: 'Create an invoice for a client with one line. VAT rate is 20, 13, 10 or 0 (default 20). Issue date defaults to today and the due date to 14 days later.', parameters: {
      client: { type: 'string', required: true, description: 'Who is invoiced' },
      description: { type: 'string', required: true, description: 'What the line is for' },
      unitPrice: { type: 'string', required: true, description: 'Net price per unit, e.g. 95 or 95.50' },
      quantity: { type: 'number', description: 'Units (default 1)' },
      vatRate: { type: 'number', description: 'VAT percent: 20, 13, 10 or 0' },
      issued: { type: 'string', description: 'Issue day, YYYY-MM-DD' },
      dueDays: { type: 'number', description: 'Days until due (default 14)' },
    } }, (state, args, store) => { const next = domain.addInvoice(state, args, today()); store.save(next); return `Created ${invoiceLine(next.invoices.at(-1))}` }),
    useCase({ name: 'invoice_list', description: 'List invoices: status open, paid or all (default all).', parameters: { status: { type: 'string', description: 'open, paid or all' } } },
      (state, args) => list(domain.listInvoices(state, { status: args.status }).map(invoiceLine))),
    useCase({ name: 'invoice_mark_paid', description: 'Mark an invoice paid on a day (default today).', parameters: {
      id: { type: 'number', required: true, description: 'Invoice number as shown by invoice_list (#id)' },
      paidOn: { type: 'string', description: 'Payment day, YYYY-MM-DD' },
    } }, (state, args, store) => { const next = domain.markPaid(state, Number(args.id), args.paidOn ?? today()); store.save(next); return `Paid: ${invoiceLine(next.invoices.find(invoice => invoice.id === Number(args.id)))}` }),
    useCase({ name: 'expense_add', description: 'Record an expense at its gross amount (the VAT is split out by the rate). Date defaults to today.', parameters: {
      description: { type: 'string', required: true, description: 'What was bought' },
      amount: { type: 'string', required: true, description: 'Gross amount paid, e.g. 120 or 119.90' },
      vatRate: { type: 'number', description: 'VAT percent: 20, 13, 10 or 0' },
      category: { type: 'string', description: 'A category, e.g. equipment' },
      date: { type: 'string', description: 'Day, YYYY-MM-DD' },
    } }, (state, args, store) => { const next = domain.addExpense(state, args, today()); store.save(next); return `Recorded ${expenseLine(next.expenses.at(-1))}` }),
    useCase({ name: 'expense_list', description: 'List expenses, optionally between two days.', parameters: { from: { type: 'string', description: 'First day, YYYY-MM-DD' }, to: { type: 'string', description: 'Last day, YYYY-MM-DD' } } },
      (state, args) => list(domain.listExpenses(state, { from: args.from, to: args.to }).map(expenseLine))),
    useCase({ name: 'vat_summary', description: 'VAT and income summary for a period: a quarter (2026-Q3), a month (2026-10), a year (2026), or from and to days. Output VAT minus input VAT is what is payable.', parameters: {
      period: { type: 'string', description: 'Quarter 2026-Q3, month 2026-10 or year 2026' },
      from: { type: 'string', description: 'First day, YYYY-MM-DD' },
      to: { type: 'string', description: 'Last day, YYYY-MM-DD' },
    } }, (state, args) => summaryText(domain.summary(state, domain.periodRange(args)))),
  ]
  for (const tool of tools) ctx.effect(() => ctx.tools.register(tool), `acryl-accounting: ${tool.name}`)

  const origin = `http://127.0.0.1:${ctx.webServer.port ?? ''}`
  const webOrigin = () => ctx.webServer.origin ?? origin

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/accounting',
    handler: (req, res) => {
      if (!isLoopbackAddress(req.socket.remoteAddress)) { res.statusCode = 403; res.end(); return }
      if (req.method !== 'GET') { res.statusCode = 405; res.setHeader('allow', 'GET'); res.end(); return }
      res.statusCode = 200
      res.setHeader('content-type', 'text/html; charset=utf-8')
      res.setHeader('cache-control', 'no-store')
      res.end(pageHtml())
    },
  }), 'acryl-accounting: page')

  const api = (path, method, run) => ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: `/api/acryl-accounting/${path}`,
    handler: async (req, res) => {
      if (req.method !== method) return finishJson(res, 405, error('method not allowed'), method)
      if (!isSameOriginLoopbackRequest(req, webOrigin(), method !== 'GET')) return finishJson(res, 403, error('forbidden'))
      const body = method === 'GET' ? {} : await parseJsonPostBody(req, res)
      if (body === INVALID_BODY) return
      try {
        const query = Object.fromEntries(new URL(req.url ?? '', webOrigin()).searchParams)
        const store = storeForCwd(resolveCwd(body?.cwd ?? query.cwd, ctx.appInstance.home))
        finishJson(res, 200, run(store, body, query))
      } catch (cause) {
        finishJson(res, cause instanceof domain.AccountingError ? 422 : 400, error(cause.message))
      }
    },
  }), `acryl-accounting: ${path} route`)

  api('state', 'GET', store => domain.view(store.load(), today()))
  api('summary', 'GET', (store, _body, query) => domain.summary(store.load(), domain.periodRange(query)))
  api('invoice', 'POST', (store, body) => { const next = domain.addInvoice(store.load(), body, today()); store.save(next); return domain.view(next, today()) })
  api('invoice-paid', 'POST', (store, body) => { const next = domain.markPaid(store.load(), Number(body.id), body.paidOn ?? today()); store.save(next); return domain.view(next, today()) })
  api('expense', 'POST', (store, body) => { const next = domain.addExpense(store.load(), body, today()); store.save(next); return domain.view(next, today()) })
}
