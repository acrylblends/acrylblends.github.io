/**
 * acryl-orderdesk: an order desk for a small business, grown from the Blank Blueprint as one ordinary Cordis plugin.
 * Customer emails arrive (dropped into `inbox/`, pasted in the window, or handed over by the agent); the agent reads them and turns
 * them into orders in any language; orders reserve stock, a workflow rule sends large ones for approval, shipping writes a delivery
 * note and tells the customer, and stock that arrives releases the orders waiting for it. Everything sent lands in `outbox/` as
 * `.eml` files, every delivery note in `delivery-notes/`.
 *
 * Tools the agent calls, and the desk as this app's main surface (`client.js`: the pipeline, the stock, the outbox and the rules,
 * with the agent's conversation beside them), both reading and writing `<app home>/.acryl/orderdesk.json`.
 *
 * Surfaces: tui web desktop (tools need no browser; the surface needs `webServer` and a browser, web/desktop only).
 */
import { join } from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'
import * as domain from './lib/domain.js'
import { ensureInbox, moveAway, parseEmailFile, pendingEmailFiles, renderDeliveryNote, writeFiles } from './lib/files.js'
import { error, finishJson, isSameOriginLoopbackRequest, parseJsonPostBody, INVALID_BODY } from './lib/http.js'
import { fileStore } from './lib/store.js'

export const name = 'acryl-orderdesk'
// appInstance: the data belongs to the app, not to the chat's workspace, so the tools and the surface both keep it in the app's own home.
export const inject = ['tools', 'webServer', 'appInstance']

const text = (_args, value) => [{ type: 'text', text: value }]
const output = { schema: { type: 'string' }, render: text }
const now = () => new Date().toISOString()
const list = items => items.length === 0 ? '(none)' : items.join('\n')

const money = domain.formatMoney
const lineList = order => order.lines.map(l => `${l.qty} x ${l.sku}`).join(', ')
const orderLine = o => `#${o.id} ${o.number} [${o.stage}] ${o.customer.name} <${o.customer.email}>: ${lineList(o)}, ${money(domain.orderTotal(o))} net`
const emailLine = e => `#${e.id} [${e.status}] from ${e.from.name} <${e.from.email}>: "${e.subject}"`
const productLine = p => `${p.sku} ${p.name}: ${money(p.priceCents)} per ${p.unit}; on hand ${p.onHand}, reserved ${p.reserved}, available ${domain.available(p)}${p.onOrder ? `, on order ${p.onOrder}` : ''} (${domain.stockStatus(p)}, reorder at ${p.reorderAt})`

/** What a change did, told from the new state: the order it made or moved and the messages it sent. */
function outcome(before, after, headline) {
  const sent = after.outbox.slice(before.outbox.length).map(m => `  sent ${m.kind} to ${m.to.email}: "${m.subject}"`)
  const moved = after.orders.filter(o => { const was = before.orders.find(b => b.id === o.id); return was && was.stage !== o.stage })
    .map(o => `  ${o.number} is now ${o.stage}`)
  return [headline, ...moved, ...sent].join('\n')
}

export function apply(ctx) {
  const home = () => ctx.appInstance.home
  const storeOf = () => fileStore(join(home(), '.acryl', 'orderdesk.json'))

  /** Load, apply one domain change, save, write the new files. The one way anything changes. */
  function change(run) {
    const store = storeOf()
    const before = store.load()
    const after = run(before)
    store.save(after)
    writeFiles(home(), after)
    return { before, after }
  }

  // A broken business rule reaches the agent as a plain error message it can act on ("there is no product TEA-1K; the catalog has ...").
  const tool = (definition, execute) => defineTool({ ...definition, output, async execute(args) {
    try {
      return execute(args ?? {})
    } catch (cause) {
      if (cause instanceof domain.OrderDeskError) throw new Error(cause.message)
      throw cause
    }
  } })
  const read = () => storeOf().load()

  const tools = [
    tool({ name: 'orderdesk_inbox', description: 'List the customer emails waiting in the inbox (new ones; all=true for handled ones too).', parameters: { all: { type: 'boolean', description: 'Include handled emails' } } },
      args => list((args.all === true ? read().emails : domain.inbox(read())).map(emailLine))),
    tool({ name: 'orderdesk_email_read', description: 'Read one email in full, to turn it into an order or answer it.', parameters: { id: { type: 'number', required: true, description: 'Email number' } } },
      args => { const e = read().emails.find(x => x.id === Number(args.id)); if (!e) throw new domain.OrderDeskError(`there is no email ${args.id}`); return `${emailLine(e)}\nReceived ${e.received}\n\n${e.body}` }),
    tool({ name: 'orderdesk_catalog', description: 'The products: SKU, name, price, stock on hand, reserved and available. Use the SKUs when making an order.', parameters: {} },
      () => list(read().products.map(productLine))),
    tool({ name: 'orderdesk_order_create', description: 'Create an order, from an email (its sender is the customer) or directly. Reserves stock if available, else backorders it; large orders wait for approval. Sends the customer a confirmation.', parameters: {
      lines: { type: 'string', required: true, description: 'Order lines as SKU x quantity, comma separated, e.g. "ESP-1K x6, FIL-1K x2". Map what the customer wrote to the catalog SKUs.' },
      emailId: { type: 'number', description: 'The email this order comes from' },
      customerName: { type: 'string', description: 'Customer name (only for an order without an email, or to correct it)' },
      customerEmail: { type: 'string', description: 'Customer email address (required without an email)' },
      note: { type: 'string', description: 'Anything to keep with the order (delivery wishes, the customer\'s reference)' },
    } }, args => { const r = change(s => domain.createOrder(s, args, now())); const o = r.after.orders.at(-1); return outcome(r.before, r.after, `Created ${orderLine(o)}`) }),
    tool({ name: 'orderdesk_orders', description: 'List orders, optionally of one stage: approval, ready, backorder, shipped, cancelled.', parameters: { stage: { type: 'string', description: 'Only this stage' } } },
      args => list(read().orders.filter(o => !args.stage || o.stage === args.stage).map(orderLine))),
    tool({ name: 'orderdesk_order_approve', description: 'Approve an order that is above the approval limit, so it can ship.', parameters: { id: { type: 'number', required: true, description: 'Order number (#id)' } } },
      args => { const r = change(s => domain.approveOrder(s, Number(args.id), now())); return outcome(r.before, r.after, `Approved order ${args.id}`) }),
    tool({ name: 'orderdesk_order_ship', description: 'Ship a ready order: takes the stock out, writes the delivery note, tells the customer.', parameters: { id: { type: 'number', required: true, description: 'Order number (#id)' } } },
      args => { const r = change(s => domain.shipOrder(s, Number(args.id), now())); const o = r.after.orders.find(x => x.id === Number(args.id)); return outcome(r.before, r.after, `Shipped ${o.number}; delivery note delivery-notes/${o.deliveryNote}.html`) }),
    tool({ name: 'orderdesk_order_cancel', description: 'Cancel an open order (releases its reserved stock) and tell the customer.', parameters: { id: { type: 'number', required: true, description: 'Order number (#id)' }, reason: { type: 'string', description: 'Why, for the customer' } } },
      args => { const r = change(s => domain.cancelOrder(s, Number(args.id), args.reason, now())); return outcome(r.before, r.after, `Cancelled order ${args.id}`) }),
    tool({ name: 'orderdesk_email_reply', description: 'Answer an email that is not an order (a question, a request you cannot fill) and mark it answered.', parameters: { emailId: { type: 'number', required: true, description: 'Email number' }, text: { type: 'string', required: true, description: 'The reply, without greeting or signature (both are added)' } } },
      args => { const r = change(s => domain.replyToEmail(s, args, now())); return outcome(r.before, r.after, `Answered email ${args.emailId}`) }),
    tool({ name: 'orderdesk_message', description: 'Write to a customer: about an order (answers a question about it, a delivery date, a delay) or to any address. Greeting and signature are added.', parameters: {
      orderId: { type: 'number', description: 'The order it is about (#id); it goes to that order\'s customer' }, to: { type: 'string', description: 'Or an address, "Name <email>"' },
      subject: { type: 'string', description: 'Subject (default: Your order SO-...)' }, text: { type: 'string', required: true, description: 'The message, without greeting or signature' },
    } }, args => { const r = change(s => domain.messageCustomer(s, args, now())); const m = r.after.outbox.at(-1); return `Sent to ${m.to.email}: "${m.subject}"` }),
    tool({ name: 'orderdesk_email_ignore', description: 'Mark an email as needing nothing (spam, a thank-you).', parameters: { id: { type: 'number', required: true, description: 'Email number' } } },
      args => { change(s => domain.ignoreEmail(s, Number(args.id))); return `Ignored email ${args.id}` }),
    tool({ name: 'orderdesk_stock_receive', description: 'Book stock that arrived. Backorders waiting for it are reserved and their customers told.', parameters: { sku: { type: 'string', required: true, description: 'SKU' }, qty: { type: 'number', required: true, description: 'How many arrived' } } },
      args => { const r = change(s => domain.receiveStock(s, args, now())); return outcome(r.before, r.after, `Received ${args.qty} x ${String(args.sku).toUpperCase()}`) }),
    tool({ name: 'orderdesk_reorder', description: 'Send the supplier a purchase order for a product (the suggested quantity if none is given). orderdesk_reorder_suggestions lists what is low.', parameters: { sku: { type: 'string', required: true, description: 'SKU' }, qty: { type: 'number', description: 'How many to order' } } },
      args => { const r = change(s => domain.reorder(s, args, now())); return outcome(r.before, r.after, `Purchase order for ${String(args.sku).toUpperCase()}`) }),
    tool({ name: 'orderdesk_reorder_suggestions', description: 'What to buy: products whose stock, after what backorders are owed and what is already on order, is at or below the reorder point, with a suggested quantity.', parameters: {} },
      () => list(domain.reorderSuggestions(read()).map(s => `${s.sku} ${s.name}: available ${s.available}, owed to backorders ${s.owed}, reorder at ${s.reorderAt}, suggest ${s.qty}`))),
    tool({ name: 'orderdesk_product_add', description: 'Add a product to the catalog.', parameters: {
      sku: { type: 'string', required: true, description: 'SKU, e.g. TEA-250' }, name: { type: 'string', required: true, description: 'Product name' },
      price: { type: 'string', required: true, description: 'Net unit price in EUR, e.g. 12.50' }, stock: { type: 'number', description: 'Stock on hand now' },
      unit: { type: 'string', description: 'bag, piece, set, ...' }, reorderAt: { type: 'number', description: 'Reorder when available falls to this' },
      reorderQty: { type: 'number', description: 'Usual quantity to reorder' }, supplier: { type: 'string', description: 'Supplier as "Name <email>"' },
    } }, args => { const r = change(s => domain.addProduct(s, args)); return `Added ${productLine(r.after.products.at(-1))}` }),
    tool({ name: 'orderdesk_workflow', description: 'Change the workflow rules: the approval limit (orders above it wait for a person), the company name and sender address on every message.', parameters: {
      approvalAboveEur: { type: 'string', description: 'Approval limit in EUR, net, e.g. 1000' }, company: { type: 'string', description: 'Company name' }, sender: { type: 'string', description: 'Sender email address' },
    } }, args => { const r = change(s => domain.setWorkflow(s, args)); const w = r.after.workflow; return `Rules: orders above ${money(w.approvalAboveCents)} need approval; messages are sent as ${w.company} <${w.sender}>` }),
    tool({ name: 'orderdesk_outbox', description: 'The latest messages the desk sent (confirmations, shipping notices, replies, purchase orders).', parameters: { limit: { type: 'number', description: 'How many (default 10)' } } },
      args => list(read().outbox.slice(-(Number(args.limit) || 10)).map(m => `#${m.id} ${m.at.slice(0, 16)} ${m.kind} to ${m.to.email}: "${m.subject}"`))),
    tool({ name: 'orderdesk_sample_load', description: 'Load the sample business (a coffee roaster: catalog, suppliers, four customer emails) into an empty desk.', parameters: {} },
      () => { const r = change(s => domain.loadSample(s, now())); return `Loaded ${r.after.workflow.company}: ${r.after.products.length} products, ${r.after.emails.length} emails in the inbox` }),
  ]
  for (const t of tools) ctx.effect(() => ctx.tools.register(t), `acryl-orderdesk: ${t.name}`)

  // The drop folder: an email file in `inbox/` becomes an inbox email within a few seconds; the file moves to `inbox/imported/`
  // (or `inbox/rejected/` when it is not an email). One timer, owned by this plugin's lifetime.
  ctx.effect(() => {
    ensureInbox(home())
    const sweep = () => {
      for (const { file, raw } of pendingEmailFiles(home())) {
        try {
          change(s => domain.receiveEmail(s, parseEmailFile(raw), now()))
          moveAway(file, 'imported')
        } catch {
          moveAway(file, 'rejected')
        }
      }
    }
    sweep()
    const timer = setInterval(() => { try { sweep() } catch {} }, 3000)
    return () => clearInterval(timer)
  }, 'acryl-orderdesk: inbox folder')

  // The data routes the surface calls: same-origin fetches from the app's own page, loopback only.
  const webOrigin = () => ctx.webServer.origin ?? `http://127.0.0.1:${String(ctx.webServer.port)}`
  const view = state => ({ ...state, pipeline: domain.pipeline(state), stats: domain.stats(state), suggestions: domain.reorderSuggestions(state), home: home() })
  const api = (path, method, run) => ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: `/api/acryl-orderdesk/${path}`,
    handler: async (req, res) => {
      if (req.method !== method) return finishJson(res, 405, error('method not allowed'), method)
      if (!isSameOriginLoopbackRequest(req, webOrigin(), method !== 'GET')) return finishJson(res, 403, error('forbidden'))
      const body = method === 'GET' ? Object.fromEntries(new URL(req.url, 'http://x').searchParams) : await parseJsonPostBody(req, res)
      if (body === INVALID_BODY) return
      try {
        const result = run(body)
        if (typeof result === 'string') {
          res.statusCode = 200
          res.setHeader('content-type', 'text/html; charset=utf-8')
          res.setHeader('cache-control', 'no-store')
          res.setHeader('x-content-type-options', 'nosniff')
          return res.end(result)
        }
        finishJson(res, 200, view(result ?? read()))
      } catch (cause) {
        finishJson(res, cause instanceof domain.OrderDeskError ? 422 : 400, error(cause.message))
      }
    },
  }), `acryl-orderdesk: ${path} route`)

  const mutate = run => body => change(s => run(s, body)).after
  api('state', 'GET', () => undefined)
  api('document', 'GET', q => {
    const state = read()
    const order = state.orders.find(o => o.id === Number(q.order) && o.stage === 'shipped')
    if (!order) throw new domain.OrderDeskError(`order ${q.order} has no delivery note`)
    return renderDeliveryNote(order, state.workflow)
  })
  api('email', 'POST', mutate((s, b) => domain.receiveEmail(s, b, now())))
  api('email-ignore', 'POST', mutate((s, b) => domain.ignoreEmail(s, Number(b.id))))
  api('order', 'POST', mutate((s, b) => domain.createOrder(s, b, now())))
  api('order-approve', 'POST', mutate((s, b) => domain.approveOrder(s, Number(b.id), now())))
  api('order-ship', 'POST', mutate((s, b) => domain.shipOrder(s, Number(b.id), now())))
  api('order-cancel', 'POST', mutate((s, b) => domain.cancelOrder(s, Number(b.id), b.reason, now())))
  api('stock-receive', 'POST', mutate((s, b) => domain.receiveStock(s, b, now())))
  api('reorder', 'POST', mutate((s, b) => domain.reorder(s, b, now())))
  api('product', 'POST', mutate((s, b) => domain.addProduct(s, b)))
  api('workflow', 'POST', mutate((s, b) => domain.setWorkflow(s, b)))
  api('sample', 'POST', mutate(s => domain.loadSample(s, now())))
}
