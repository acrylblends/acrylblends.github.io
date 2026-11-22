/**
 * Accounting: invoices (create, list, mark paid), expenses, and a VAT and income summary for a period, as one feature plugin. `lib/domain.js` (the rules, pure) and `lib/store.js`
 * (one JSON file, written atomically) are the starter's own code from before it was an acrylblends app; this file is the adapter: JSON routes under `/accounting` that the page and the
 * agent call, and the first screen, which is the books themselves (tabs: Invoices, Expenses, VAT & income). `client.js` is the starter's own React UI moved onto the page (same views, tabs,
 * controls, texts and styles; React 18 is served from the app's node_modules).
 *
 * Routes: GET /state, GET /invoices?status=open|paid|all, GET /expenses?from=&to=, GET /summary?period=2026-Q3 (or 2026-10, 2026) or ?from=&to=,
 * POST /invoice {client, description, unitPrice, quantity?, vatRate?, issued?, dueDays?}, POST /invoice-paid {id, paidOn?}, POST /expense {description, amount, vatRate?, category?, date?}.
 * A refused request answers {error} with 422 (a rule said no) or 400 (a bad body). Money is whole cents inside, shown in EUR.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '@acryldev/blends'
import type {} from '@acryldev/instance'
import * as domain from './lib/domain.js'
import { type AccountingStore, fileStore } from './lib/store.js'

export const name = 'accounting'
export const inject = ['router', 'appInstance']

export interface AccountingConfig {
  /** A store for tests; absent, `accounting.json` in the app's home. */
  readonly store?: AccountingStore
  /** What day it is (YYYY-MM-DD), for tests; absent, today in UTC. */
  readonly today?: () => string
}

const escapeHtml = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

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
  // The files of the page: the UI (the starter's own client.js) and React 18's production builds, read where they are installed.
  const require = createRequire(import.meta.url)
  const installed = (spec: string) => join(dirname(require.resolve(`${spec.split('/')[0]}/package.json`)), spec.split('/').slice(1).join('/'))
  const file = (path: string) => readFileSync(path, 'utf8')
  const script = (text: string) => new Response(text, { headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache' } })
  const app = new Acryl()
    .get('/assets/client.js', () => script(file(fileURLToPath(new URL('./client.js', import.meta.url)))))
    .get('/assets/vendor/react.js', () => script(file(installed('react/umd/react.production.min.js'))))
    .get('/assets/vendor/react-dom.js', () => script(file(installed('react-dom/umd/react-dom.production.min.js'))))
    .get('/state', read((state) => domain.view(state, today())))
    .get('/invoices', read((state, query) => domain.listInvoices(state, { status: query('status') })))
    .get('/expenses', read((state, query) => domain.listExpenses(state, { from: query('from'), to: query('to') })))
    .get('/summary', read((state, query) => domain.summary(state, domain.periodRange({ period: query('period'), from: query('from'), to: query('to') }))))
    .post('/invoice', change((state, input) => domain.addInvoice(state, input, today())))
    .post('/invoice-paid', change((state, input) => domain.markPaid(state, Number(input.id), input.paidOn ?? today())))
    .post('/expense', change((state, input) => domain.addExpense(state, input, today())))
  ctx.router.route('/accounting', app)

  // The first screen: the app, to a browser. Any other client falls through to the app's own root (the JSON hello).
  const first = new Acryl().get('/', async (c, next) => {
    if (!(c.req.header('accept') ?? '').includes('text/html')) return next()
    return c.html(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(ctx.appInstance.name)}</title><style>html,body{margin:0}</style></head>
<body><div id="accounting-root"></div>
<script src="accounting/assets/vendor/react.js"></script><script src="accounting/assets/vendor/react-dom.js"></script><script src="accounting/assets/client.js"></script>
</body></html>`)
  })
  ctx.router.route('/', first)
}
