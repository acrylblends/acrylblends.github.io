/**
 * Order Desk: an order desk for a small business as one feature plugin. Customer emails arrive (dropped into `inbox/`, pasted in the widget, or handed over by the agent); orders
 * reserve stock, a workflow rule sends large ones for approval, shipping writes a delivery note and tells the customer, and stock that arrives releases the orders waiting for it.
 * Everything sent lands in `outbox/` as `.eml` files, every delivery note in `delivery-notes/`, both in the app's home. `lib/domain.js` (the rules, pure), `lib/store.js` (one JSON file,
 * written atomically) and `lib/files.js` (the files beside the data) are the starter's own code from before it was an acrylblends app; this file is the adapter: JSON routes under
 * `/orderdesk` that the page and the agent call, the `inbox/` folder watched by one timer, and the desk as a widget on the first screen.
 *
 * Reads: GET /state, /emails?all=true, /email?id=, /catalog, /orders?stage=, /reorder-suggestions, /outbox?limit=, /document?order= (the delivery note, HTML).
 * Changes (each answers the whole state): POST /email {from, subject?, body}, /email-ignore {id}, /email-reply {emailId, text}, /order {lines, emailId?, customerName?, customerEmail?, note?},
 * /order-approve {id}, /order-ship {id}, /order-cancel {id, reason?}, /message {orderId? | to, subject?, text}, /stock-receive {sku, qty}, /reorder {sku, qty?},
 * /product {sku, name, price, stock?, unit?, reorderAt?, reorderQty?, supplier?}, /workflow {approvalAboveEur?, company?, sender?}, /sample.
 * A refused request answers {error} with 422 (a rule said no, in words the agent can act on) or 400 (a bad body).
 */
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '@acryldev/blends'
import type {} from '../home/index.ts'
import type {} from '@acryldev/instance'
import * as domain from './lib/domain.js'
import { ensureInbox, moveAway, parseEmailFile, pendingEmailFiles, renderDeliveryNote, writeFiles } from './lib/files.js'
import { type OrderDeskStore, fileStore } from './lib/store.js'

export const name = 'orderdesk'
export const inject = ['router', 'home', 'appInstance']

export interface OrderDeskConfig {
  /** A store for tests; absent, `orderdesk.json` in the app's home. */
  readonly store?: OrderDeskStore
  /** What time it is (ISO), for tests; absent, the system clock. */
  readonly now?: () => string
  /** How often `inbox/` is read, in milliseconds (default 3000); 0 reads it once, at start. */
  readonly sweepMs?: number
}

const body = async (request: { json(): Promise<unknown> }): Promise<Record<string, unknown>> => {
  const parsed = await request.json().catch(() => undefined)
  return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
}

type Reply = { json(value: unknown, status?: 200 | 400 | 422): Response; html(value: string): Response | Promise<Response> }

export function apply(ctx: Context, config: OrderDeskConfig = {}): void {
  const home = ctx.appInstance.home
  const store = config.store ?? fileStore(join(home, 'orderdesk.json'))
  const now = config.now ?? (() => new Date().toISOString())
  const view = (state: domain.OrderDeskState) => ({ ...state, pipeline: domain.pipeline(state), stats: domain.stats(state), suggestions: domain.reorderSuggestions(state) })
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
  const app = new Acryl()
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

  ctx.effect(() =>
    ctx.home.widget({
      id: 'orderdesk',
      title: 'Order desk',
      render: () => `<div id="orderdesk" data-test="orderdesk">
<style>#orderdesk nav{display:flex;gap:.5rem;margin:.5rem 0}#orderdesk nav button[aria-selected=true]{font-weight:700}#orderdesk table{width:100%;border-collapse:collapse;font-size:.88rem}#orderdesk th,#orderdesk td{text-align:left;padding:.3rem .4rem;border-bottom:1px solid #8884;vertical-align:top}#orderdesk .n{text-align:right;font-variant-numeric:tabular-nums}#orderdesk .stats{display:flex;flex-wrap:wrap;gap:.5rem;margin:.4rem 0}#orderdesk .stats span{border:1px solid #8884;border-radius:.4rem;padding:.2rem .5rem}#orderdesk form{display:flex;flex-wrap:wrap;gap:.4rem;margin:.5rem 0}#orderdesk textarea{width:100%;min-height:4rem}#orderdesk .low{color:#e67700}#orderdesk .out{color:#c92a2a}#orderdesk h4{margin:.8rem 0 .3rem}</style>
<div class="stats" id="orderdesk-stats"></div>
<nav role="tablist"><button type="button" role="tab" data-tab="pipeline" aria-selected="true">Orders</button><button type="button" role="tab" data-tab="inbox" aria-selected="false">Inbox</button><button type="button" role="tab" data-tab="stock" aria-selected="false">Stock</button><button type="button" role="tab" data-tab="outbox" aria-selected="false">Sent &amp; rules</button></nav>
<p id="orderdesk-error" role="alert" hidden></p>
<section id="orderdesk-pipeline"></section><section id="orderdesk-inbox" hidden></section><section id="orderdesk-stock" hidden></section><section id="orderdesk-outbox" hidden></section>
</div>
<script type="module">
  const url = (path) => 'orderdesk/' + path
  const esc = (value) => { const node = document.createElement('span'); node.textContent = String(value ?? ''); return node.innerHTML }
  const money = (cents) => '€' + (cents / 100).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const error = document.getElementById('orderdesk-error')
  const root = document.getElementById('orderdesk')
  async function call(path, payload) {
    const response = await fetch(url(path), payload === undefined ? undefined : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
    const data = await response.json()
    if (!response.ok) { error.textContent = data.error; error.hidden = false; return undefined }
    error.hidden = true
    return data
  }
  let state
  const formData = (form) => Object.fromEntries([...new FormData(form)].filter(([, v]) => v !== ''))
  const lines = (order) => order.lines.map((l) => l.qty + ' x ' + esc(l.sku)).join(', ')
  const orderRow = (o, actions) => '<tr data-order="' + o.id + '"><td>' + esc(o.number) + '</td><td>' + esc(o.customer.name) + '</td><td>' + lines(o) + '</td><td class="n">' + money(o.lines.reduce((s, l) => s + l.qty * l.priceCents, 0)) + '</td><td>' + actions + '</td></tr>'
  function draw() {
    const s = state.stats
    document.getElementById('orderdesk-stats').innerHTML = ['newEmails:new emails', 'toApprove:to approve', 'toShip:to ship', 'backorders:backorders', 'lowStock:low stock'].map((k) => '<span>' + s[k.split(':')[0]] + ' ' + k.split(':')[1] + '</span>').join('') + '<span>' + money(s.openValueCents) + ' open</span>'
    const p = state.pipeline
    const section = (title, orders, actions) => '<h4>' + title + ' (' + orders.length + ')</h4>' + (orders.length ? '<table><tbody>' + orders.map((o) => orderRow(o, actions(o))).join('') + '</tbody></table>' : '<p><em>None.</em></p>')
    document.getElementById('orderdesk-pipeline').innerHTML =
      section('Waiting for approval', p.approval, (o) => '<button type="button" data-approve="' + o.id + '">Approve</button> <button type="button" data-cancel="' + o.id + '">Cancel</button>') +
      section('Ready to ship', p.ready, (o) => '<button type="button" data-ship="' + o.id + '">Ship</button> <button type="button" data-cancel="' + o.id + '">Cancel</button>') +
      section('Backordered', p.backorder, (o) => '<button type="button" data-cancel="' + o.id + '">Cancel</button>') +
      section('Shipped', p.shipped, (o) => '<a href="orderdesk/document?order=' + o.id + '" target="_blank">Delivery note</a>') +
      '<h4>New order</h4><form id="orderdesk-order-form"><input name="lines" placeholder="ESP-1K x6, FIL-1K x2" required size="28"> <input name="customerName" placeholder="Customer"> <input name="customerEmail" type="email" placeholder="customer@email" required> <button type="submit">Create order</button></form>'
    document.getElementById('orderdesk-inbox').innerHTML = '<h4>Inbox (' + p.inbox.length + ')</h4>' + (p.inbox.map((e) => '<div class="mail" data-email="' + e.id + '"><b>' + esc(e.subject) + '</b> from ' + esc(e.from.name) + ' &lt;' + esc(e.from.email) + '&gt;<pre style="white-space:pre-wrap">' + esc(e.body) + '</pre><button type="button" data-ignore="' + e.id + '">Ignore</button></div>').join('') || '<p><em>No new emails. Drop a .eml or .txt file into the inbox/ folder, or paste one below.</em></p>') + '<h4>Paste an email</h4><form id="orderdesk-email-form"><input name="from" placeholder="Name &lt;email&gt;" required> <input name="subject" placeholder="Subject"> <textarea name="body" placeholder="The email" required></textarea> <button type="submit">Add to inbox</button></form>' + (state.products.length === 0 ? '<p><button type="button" data-sample>Load the sample business</button></p>' : '')
    document.getElementById('orderdesk-stock').innerHTML = '<table><thead><tr><th>SKU</th><th>Product</th><th class="n">Price</th><th class="n">On hand</th><th class="n">Reserved</th><th class="n">Available</th></tr></thead><tbody>' + (state.products.map((x) => { const a = x.onHand - x.reserved; return '<tr><td>' + esc(x.sku) + '</td><td>' + esc(x.name) + '</td><td class="n">' + money(x.priceCents) + '</td><td class="n">' + x.onHand + '</td><td class="n">' + x.reserved + '</td><td class="n ' + (a <= 0 ? 'out' : a <= x.reorderAt ? 'low' : '') + '">' + a + '</td></tr>' }).join('') || '<tr><td colspan="6"><em>No products yet.</em></td></tr>') + '</tbody></table>' + (state.suggestions.length ? '<h4>Suggested reorders</h4><ul>' + state.suggestions.map((g) => '<li>' + esc(g.sku) + ': available ' + g.available + ', suggest ' + g.qty + ' <button type="button" data-reorder="' + esc(g.sku) + '" data-qty="' + g.qty + '">Order</button></li>').join('') + '</ul>' : '') + '<h4>Receive stock</h4><form id="orderdesk-receive-form"><input name="sku" placeholder="SKU" required> <input name="qty" type="number" min="1" placeholder="Quantity" required> <button type="submit">Receive</button></form><h4>Add a product</h4><form id="orderdesk-product-form"><input name="sku" placeholder="SKU" required> <input name="name" placeholder="Name" required> <input name="price" placeholder="Net price EUR" required> <input name="stock" type="number" min="0" placeholder="In stock"> <input name="reorderAt" type="number" min="0" placeholder="Reorder at"> <button type="submit">Add</button></form>'
    const w = state.workflow
    document.getElementById('orderdesk-outbox').innerHTML = '<h4>Sent</h4>' + (state.outbox.slice(-10).reverse().map((m) => '<div>' + esc(m.at.slice(0, 16).replace('T', ' ')) + ' <b>' + esc(m.kind) + '</b> to ' + esc(m.to.email) + ': ' + esc(m.subject) + '</div>').join('') || '<p><em>Nothing sent yet.</em></p>') + '<h4>Rules</h4><p>Orders above ' + money(w.approvalAboveCents) + ' need approval. Messages go out as ' + esc(w.company) + ' &lt;' + esc(w.sender) + '&gt;.</p><form id="orderdesk-workflow-form"><input name="approvalAboveEur" placeholder="Approval limit EUR"> <input name="company" placeholder="Company"> <input name="sender" placeholder="Sender email"> <button type="submit">Save rules</button></form>'
  }
  const apply = async (path, payload) => { const next = await call(path, payload); if (next) { state = next; draw() } }
  root.addEventListener('click', (event) => {
    const t = event.target
    for (const [attr, path] of [['approve', 'order-approve'], ['ship', 'order-ship'], ['cancel', 'order-cancel'], ['ignore', 'email-ignore']]) {
      const hit = t.closest('[data-' + attr + ']')
      if (hit) { apply(path, { id: Number(hit.dataset[attr]) }); return }
    }
    const reorder = t.closest('[data-reorder]')
    if (reorder) { apply('reorder', { sku: reorder.dataset.reorder, qty: Number(reorder.dataset.qty) }); return }
    if (t.closest('[data-sample]')) { apply('sample', {}); return }
    const tab = t.closest('[data-tab]')
    if (tab) {
      for (const button of root.querySelectorAll('[data-tab]')) button.setAttribute('aria-selected', String(button === tab))
      for (const name of ['pipeline', 'inbox', 'stock', 'outbox']) document.getElementById('orderdesk-' + name).hidden = name !== tab.dataset.tab
    }
  })
  const forms = { 'orderdesk-order-form': 'order', 'orderdesk-email-form': 'email', 'orderdesk-receive-form': 'stock-receive', 'orderdesk-product-form': 'product', 'orderdesk-workflow-form': 'workflow' }
  root.addEventListener('submit', (event) => { event.preventDefault(); const path = forms[event.target.id]; if (path) apply(path, formData(event.target)) })
  async function poll() {
    if (root.contains(document.activeElement) && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return
    const next = await call('state')
    if (next && JSON.stringify(next) !== JSON.stringify(state)) { state = next; draw() }
  }
  await poll()
  setInterval(poll, 2000)
</script>`,
    }),
  )
}
