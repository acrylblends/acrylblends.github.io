/**
 * Order Desk: an order desk for a small business as one feature plugin. Customer emails arrive (dropped into `inbox/`, pasted in the widget, or handed over by the agent); orders
 * reserve stock, a workflow rule sends large ones for approval, shipping writes a delivery note and tells the customer, and stock that arrives releases the orders waiting for it.
 * Everything sent lands in `outbox/` as `.eml` files, every delivery note in `delivery-notes/`, both in the app's home. `lib/domain.js` (the rules, pure), `lib/store.js` (one JSON file,
 * written atomically) and `lib/files.js` (the files beside the data) are the starter's own code from before it was an acrylblends app; this file is the adapter: JSON routes under
 * `/orderdesk` that the page and the agent call, the `inbox/` folder watched by one timer, and the first screen, which is the desk itself. `client.js` is the starter's own React UI moved onto the
 * page (same views, tabs, controls, texts and styles; React 18 is served from the app's node_modules).
 *
 * Reads: GET /state, /emails?all=true, /email?id=, /catalog, /orders?stage=, /reorder-suggestions, /outbox?limit=, /document?order= (the delivery note, HTML).
 * Changes (each answers the whole state): POST /email {from, subject?, body}, /email-ignore {id}, /email-reply {emailId, text}, /order {lines, emailId?, customerName?, customerEmail?, note?},
 * /order-approve {id}, /order-ship {id}, /order-cancel {id, reason?}, /message {orderId? | to, subject?, text}, /stock-receive {sku, qty}, /reorder {sku, qty?},
 * /product {sku, name, price, stock?, unit?, reorderAt?, reorderQty?, supplier?}, /workflow {approvalAboveEur?, company?, sender?}, /sample.
 * A refused request answers {error} with 422 (a rule said no, in words the agent can act on) or 400 (a bad body).
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '@acryldev/blends'
import type {} from '@acryldev/instance'
import * as domain from './lib/domain.js'
import { ensureInbox, moveAway, parseEmailFile, pendingEmailFiles, renderDeliveryNote, writeFiles } from './lib/files.js'
import { type OrderDeskStore, fileStore } from './lib/store.js'

export const name = 'orderdesk'
export const inject = ['router', 'appInstance']

export interface OrderDeskConfig {
  /** A store for tests; absent, `orderdesk.json` in the app's home. */
  readonly store?: OrderDeskStore
  /** What time it is (ISO), for tests; absent, the system clock. */
  readonly now?: () => string
  /** How often `inbox/` is read, in milliseconds (default 3000); 0 reads it once, at start. */
  readonly sweepMs?: number
}

const escapeHtml = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

const body = async (request: { json(): Promise<unknown> }): Promise<Record<string, unknown>> => {
  const parsed = await request.json().catch(() => undefined)
  return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
}

type Reply = { json(value: unknown, status?: 200 | 400 | 422): Response; html(value: string): Response | Promise<Response> }

export function apply(ctx: Context, config: OrderDeskConfig = {}): void {
  const home = ctx.appInstance.home
  const store = config.store ?? fileStore(join(home, 'orderdesk.json'))
  const now = config.now ?? (() => new Date().toISOString())
  const view = (state: domain.OrderDeskState) => ({ ...state, pipeline: domain.pipeline(state), stats: domain.stats(state), suggestions: domain.reorderSuggestions(state), home })
  /** Load, apply one domain change, save, write the new files. The one way anything changes. */
  const change = (run: (state: domain.OrderDeskState) => domain.OrderDeskState) => {
    const next = run(store.load())
    store.save(next)
    writeFiles(home, next)
    return next
  }
  const refused = (c: Reply, cause: unknown) => c.json({ error: (cause as Error).message }, cause instanceof domain.OrderDeskError ? 422 : 400)
  const post = (run: (state: domain.OrderDeskState, input: Record<string, unknown>) => domain.OrderDeskState) =>
    async (c: Reply & { req: { json(): Promise<unknown> } }) => {
      try {
        const input = await body(c.req)
        return c.json(view(change((state) => run(state, input))))
      } catch (cause) {
        return refused(c, cause)
      }
    }
  const read = (run: (state: domain.OrderDeskState, query: (key: string) => string | undefined) => unknown) =>
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
    .get('/state', read((state) => view(state)))
    .get('/emails', read((state, query) => (query('all') === 'true' ? state.emails : domain.inbox(state))))
    .get('/email', read((state, query) => {
      const email = state.emails.find((candidate) => candidate.id === Number(query('id')))
      if (email === undefined) throw new domain.OrderDeskError(`there is no email ${String(query('id'))}`)
      return email
    }))
    .get('/catalog', read((state) => state.products.map((product) => ({ ...product, available: domain.available(product), status: domain.stockStatus(product) }))))
    .get('/orders', read((state, query) => state.orders.filter((order) => !query('stage') || order.stage === query('stage'))))
    .get('/reorder-suggestions', read((state) => domain.reorderSuggestions(state)))
    .get('/outbox', read((state, query) => state.outbox.slice(-(Number(query('limit')) || 10))))
    .get('/document', (c: Reply & { req: { query(key: string): string | undefined } }) => {
      try {
        const state = store.load()
        const order = state.orders.find((candidate) => candidate.id === Number(c.req.query('order')) && candidate.stage === 'shipped')
        if (order === undefined) throw new domain.OrderDeskError(`order ${String(c.req.query('order'))} has no delivery note`)
        return c.html(renderDeliveryNote(order, state.workflow))
      } catch (cause) {
        return refused(c, cause)
      }
    })
    .post('/email', post((state, input) => domain.receiveEmail(state, input, now())))
    .post('/email-ignore', post((state, input) => domain.ignoreEmail(state, Number(input.id))))
    .post('/email-reply', post((state, input) => domain.replyToEmail(state, input, now())))
    .post('/order', post((state, input) => domain.createOrder(state, input, now())))
    .post('/order-approve', post((state, input) => domain.approveOrder(state, Number(input.id), now())))
    .post('/order-ship', post((state, input) => domain.shipOrder(state, Number(input.id), now())))
    .post('/order-cancel', post((state, input) => domain.cancelOrder(state, Number(input.id), input.reason, now())))
    .post('/message', post((state, input) => domain.messageCustomer(state, input, now())))
    .post('/stock-receive', post((state, input) => domain.receiveStock(state, input, now())))
    .post('/reorder', post((state, input) => domain.reorder(state, input, now())))
    .post('/product', post((state, input) => domain.addProduct(state, input)))
    .post('/workflow', post((state, input) => domain.setWorkflow(state, input)))
    .post('/sample', post((state) => domain.loadSample(state, now())))
  ctx.router.route('/orderdesk', app)

  // The drop folder: an email file in `inbox/` becomes an inbox email within a few seconds; the file moves to `inbox/imported/` (or `inbox/rejected/` when it is not an email).
  // One timer, owned by this plugin's lifetime.
  ctx.effect(() => {
    ensureInbox(home)
    const sweep = () => {
      for (const { file, raw } of pendingEmailFiles(home)) {
        try {
          change((state) => domain.receiveEmail(state, parseEmailFile(raw), now()))
          moveAway(file, 'imported')
        } catch {
          moveAway(file, 'rejected')
        }
      }
    }
    sweep()
    const every = config.sweepMs ?? 3000
    if (every <= 0) return () => {}
    const timer = setInterval(() => {
      try {
        sweep()
      } catch {
        // A folder that cannot be read this time is read again at the next sweep.
      }
    }, every)
    return () => clearInterval(timer)
  })

  // The first screen: the desk, to a browser. Any other client falls through to the app's own root (the JSON hello).
  const first = new Acryl().get('/', async (c, next) => {
    if (!(c.req.header('accept') ?? '').includes('text/html')) return next()
    return c.html(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(ctx.appInstance.name)}</title><style>html,body{margin:0}</style></head>
<body><div id="orderdesk-root"></div>
<script src="orderdesk/assets/vendor/react.js"></script><script src="orderdesk/assets/vendor/react-dom.js"></script><script src="orderdesk/assets/client.js"></script>
</body></html>`)
  })
  ctx.router.route('/', first)
}
