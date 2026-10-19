/**
 * The order desk's domain: customer emails become orders, orders reserve stock, a workflow rule decides which orders need approval,
 * shipping writes a delivery note and tells the customer, and stock that arrives releases the orders waiting for it. Pure, no I/O, no
 * framework: everything works on plain data, so it is tested without ACRYL, and the store, the files and the tools are thin adapters.
 *
 * Ubiquitous language:
 * - an Email is a message from a customer in the Inbox; the agent reads it and turns it into an Order, answers it, or ignores it.
 * - a Product is a stock-keeping unit (SKU) with stock On hand; Reserved stock belongs to accepted orders; Available = on hand - reserved.
 * - an Order moves through Stages: `approval` (stock reserved, waits for a person because it is above the approval limit), `ready` (stock
 *   reserved, can ship), `backorder` (waits for stock, nothing reserved), `shipped`, `cancelled`.
 * - the Outbox holds every message the desk sends: order confirmations, backorder notices, shipping notices, replies, purchase orders.
 * - a Delivery note is the document that goes with a shipment.
 * Money is whole cents (net, EUR). Every change takes `now` (ISO-8601) so it is deterministic in tests.
 */

const MAX_TEXT = 4000
const SKU = /^[A-Z0-9][A-Z0-9-]{0,23}$/u

export const STAGES = ['approval', 'ready', 'backorder', 'shipped', 'cancelled']
const OPEN_STAGES = new Set(['approval', 'ready', 'backorder'])

export class OrderDeskError extends Error {}

export function emptyState() {
  return {
    nextId: 1,
    nextOrder: 1001,
    workflow: { company: 'My company', sender: 'orders@my-company.example', approvalAboveCents: 100000 },
    products: [],
    emails: [],
    orders: [],
    outbox: [],
  }
}

// ---- values --------------------------------------------------------------------------------------------------------------------

function text(value, field, max = 200) {
  const s = typeof value === 'string' ? value.trim() : ''
  if (s === '') throw new OrderDeskError(`${field} is required`)
  if (s.length > max) throw new OrderDeskError(`${field} is too long (max ${max})`)
  return s
}

function optionalText(value, max = 200) {
  if (value === undefined || value === null) return ''
  const s = String(value).trim()
  if (s.length > max) throw new OrderDeskError(`text is too long (max ${max})`)
  return s
}

function count(value, field) {
  const n = typeof value === 'string' ? Number(value.trim()) : value
  if (!Number.isInteger(n) || n <= 0 || n > 1_000_000) throw new OrderDeskError(`${field} must be a whole number above 0`)
  return n
}

function wholeOrZero(value, field) {
  if (value === undefined || value === null || value === '') return 0
  const n = typeof value === 'string' ? Number(value.trim()) : value
  if (!Number.isInteger(n) || n < 0 || n > 1_000_000) throw new OrderDeskError(`${field} must be a whole number, 0 or more`)
  return n
}

/** "24", "24.5", "24,50", "1 200.00" -> cents. */
export function toCents(value) {
  const raw = typeof value === 'number' ? value.toFixed(2) : String(value ?? '').replace(/[\s€]/gu, '').replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/u.test(raw)) throw new OrderDeskError(`"${String(value)}" is not an amount (use e.g. 24.50)`)
  const [whole, fraction = ''] = raw.split('.')
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (cents <= 0) throw new OrderDeskError('an amount must be above 0')
  return cents
}

export function formatMoney(cents) {
  const sign = cents < 0 ? '-' : ''
  const a = Math.abs(cents)
  return `EUR ${sign}${Math.floor(a / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/gu, ',')}.${String(a % 100).padStart(2, '0')}`
}

function sku(value) {
  const s = typeof value === 'string' ? value.trim().toUpperCase() : ''
  if (!SKU.test(s)) throw new OrderDeskError(`"${String(value)}" is not a SKU (letters, digits and dashes, e.g. ESP-1K)`)
  return s
}

/** "Maria Huber <maria@example.com>" or "maria@example.com" -> { name, email }. */
export function parseAddress(value) {
  const s = text(value, 'the sender', 320)
  const angle = /^(.*?)\s*<([^<>\s]+@[^<>\s]+)>$/u.exec(s)
  const email = (angle ? angle[2] : s).toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/u.test(email)) throw new OrderDeskError(`"${s}" is not an email address`)
  const name = angle && angle[1].replace(/^"|"$/gu, '').trim() !== '' ? angle[1].replace(/^"|"$/gu, '').trim() : email.split('@')[0]
  return { name, email }
}

const time = now => {
  if (typeof now !== 'string' || Number.isNaN(Date.parse(now))) throw new OrderDeskError('now must be an ISO-8601 time')
  return new Date(now).toISOString()
}

// ---- products and stock --------------------------------------------------------------------------------------------------------

export const available = product => product.onHand - product.reserved

export function stockStatus(product) {
  const a = available(product)
  if (a <= 0) return 'out'
  if (a <= product.reorderAt) return 'low'
  return 'ok'
}

function productOf(state, code) {
  const found = state.products.find(p => p.sku === code)
  if (!found) throw new OrderDeskError(`there is no product ${code}; the catalog has ${state.products.map(p => p.sku).join(', ') || 'no products yet'}`)
  return found
}

export function addProduct(state, input) {
  const code = sku(input.sku)
  if (state.products.some(p => p.sku === code)) throw new OrderDeskError(`product ${code} already exists`)
  const supplier = input.supplier ? parseAddress(input.supplier) : null
  const product = {
    sku: code,
    name: text(input.name, 'the product name'),
    unit: optionalText(input.unit, 40) || 'piece',
    priceCents: toCents(input.price),
    onHand: wholeOrZero(input.onHand ?? input.stock, 'stock on hand'),
    reserved: 0,
    onOrder: 0,
    reorderAt: wholeOrZero(input.reorderAt, 'the reorder point'),
    reorderQty: wholeOrZero(input.reorderQty, 'the reorder quantity'),
    supplier,
  }
  return { ...state, products: [...state.products, product] }
}

/** How many of a product the backorders are waiting for. */
export function backlog(state, code) {
  return state.orders.filter(o => o.stage === 'backorder').reduce((sum, o) => sum + o.lines.filter(l => l.sku === code).reduce((n, l) => n + l.qty, 0), 0)
}

/**
 * What to buy: a product whose stock, after what backorders are owed and counting what is already on order, is at or below its reorder
 * point. The suggestion covers the backlog and brings the stock back above the reorder point, at least the usual reorder quantity.
 */
export function reorderSuggestions(state) {
  return state.products
    .map(p => ({ p, owed: backlog(state, p.sku), position: available(p) + p.onOrder - backlog(state, p.sku) }))
    .filter(({ p, position }) => position <= p.reorderAt)
    .map(({ p, owed, position }) => ({ sku: p.sku, name: p.name, available: available(p), owed, reorderAt: p.reorderAt, qty: Math.max(p.reorderQty, p.reorderAt + 1 - position) }))
}

// ---- emails -------------------------------------------------------------------------------------------------------------------

export function receiveEmail(state, input, now) {
  const at = time(now)
  const from = parseAddress(input.from)
  const email = {
    id: state.nextId,
    from,
    subject: optionalText(input.subject, 300) || '(no subject)',
    body: text(input.body, 'the email body', MAX_TEXT),
    received: input.received && !Number.isNaN(Date.parse(input.received)) ? new Date(input.received).toISOString() : at,
    status: 'new',
    orderId: null,
  }
  return { ...state, nextId: state.nextId + 1, emails: [...state.emails, email] }
}

function emailOf(state, id) {
  const found = state.emails.find(e => e.id === id)
  if (!found) throw new OrderDeskError(`there is no email ${id}`)
  return found
}

function openEmail(state, id) {
  const email = emailOf(state, id)
  if (email.status !== 'new') throw new OrderDeskError(`email ${id} is already handled (${email.status})`)
  return email
}

const withEmail = (state, id, patch) => ({ ...state, emails: state.emails.map(e => e.id === id ? { ...e, ...patch } : e) })

export const inbox = state => state.emails.filter(e => e.status === 'new')

// ---- outbox -------------------------------------------------------------------------------------------------------------------

function send(state, message, at) {
  const entry = { id: state.nextId, at, ...message }
  return { ...state, nextId: state.nextId + 1, outbox: [...state.outbox, entry] }
}

const signature = state => `\n\nKind regards,\n${state.workflow.company}\n${state.workflow.sender}`
const lineText = line => `  ${String(line.qty).padStart(4)} x ${line.name} (${line.sku})  ${formatMoney(line.qty * line.priceCents)}`

export function replyToEmail(state, input, now) {
  const at = time(now)
  const email = openEmail(state, Number(input.emailId))
  const body = text(input.text, 'the reply', MAX_TEXT)
  const next = send(state, { kind: 'reply', to: email.from, subject: `Re: ${email.subject}`, body: `Hello ${email.from.name},\n\n${body}${signature(state)}`, orderId: null, emailId: email.id }, at)
  return withEmail(next, email.id, { status: 'answered' })
}

/** Writes to a customer: about an order (it goes to the order's customer and is kept with the order), or to any address. */
export function messageCustomer(state, input, now) {
  const at = time(now)
  const order = input.orderId === undefined || input.orderId === null || input.orderId === '' ? null : orderOf(state, Number(input.orderId))
  const to = order ? order.customer : input.to ? parseAddress(input.to) : (() => { throw new OrderDeskError('say who to write to: an order or an email address') })()
  const subject = optionalText(input.subject, 300) || (order ? `Your order ${order.number}` : '')
  if (subject === '') throw new OrderDeskError('a subject is required')
  const body = text(input.text, 'the message', MAX_TEXT)
  let next = send(state, { kind: 'message', to, subject, body: `Hello ${to.name},\n\n${body}${signature(state)}`, orderId: order ? order.id : null }, at)
  if (order) next = withOrder(next, order.id, {}, `wrote to the customer: "${subject}"`, at)
  return next
}

export function ignoreEmail(state, id) {
  openEmail(state, id)
  return withEmail(state, id, { status: 'ignored' })
}

// ---- orders -------------------------------------------------------------------------------------------------------------------

/** "ESP-1K x6, FIL-1K 2; flt-100 x 2" -> [{ sku, qty }], merging repeated SKUs. */
export function parseLines(value) {
  const parts = Array.isArray(value) ? value : String(value ?? '').split(/[,;\n]+/u)
  const merged = new Map()
  for (const part of parts) {
    const piece = typeof part === 'string' ? part.trim() : part
    if (piece === '' || piece === undefined) continue
    let code, qty
    if (typeof piece === 'object') { code = piece.sku; qty = piece.qty }
    else {
      const skuFirst = /^([A-Za-z][A-Za-z0-9-]*)\s*(?:[x×*:=]\s*)?(\d+)$/u.exec(piece)   // ESP-1K x6, ESP-1K 6
      const qtyFirst = /^(\d+)\s*(?:[x×*]\s*)?([A-Za-z][A-Za-z0-9-]*)$/u.exec(piece)     // 6 x ESP-1K, 6 ESP-1K
      if (skuFirst) { code = skuFirst[1]; qty = skuFirst[2] }
      else if (qtyFirst) { code = qtyFirst[2]; qty = qtyFirst[1] }
      else throw new OrderDeskError(`"${piece}" is not an order line (use SKU x quantity, e.g. ESP-1K x6)`)
    }
    const s = sku(code)
    merged.set(s, (merged.get(s) ?? 0) + count(qty, `the quantity of ${s}`))
  }
  if (merged.size === 0) throw new OrderDeskError('an order needs at least one line (SKU x quantity)')
  return [...merged].map(([code, qty]) => ({ sku: code, qty }))
}

export const orderTotal = order => order.lines.reduce((sum, line) => sum + line.qty * line.priceCents, 0)

function orderOf(state, id) {
  const found = state.orders.find(o => o.id === id)
  if (!found) throw new OrderDeskError(`there is no order ${id}`)
  return found
}

const fits = (state, lines) => lines.every(line => available(productOf(state, line.sku)) >= line.qty)

function reserve(state, lines, sign) {
  return { ...state, products: state.products.map(p => {
    const line = lines.find(l => l.sku === p.sku)
    return line ? { ...p, reserved: p.reserved + sign * line.qty } : p
  }) }
}

const acceptedStage = (state, order) => orderTotal(order) > state.workflow.approvalAboveCents ? 'approval' : 'ready'

function withOrder(state, id, patch, note, at) {
  return { ...state, orders: state.orders.map(o => o.id === id ? { ...o, ...patch, history: [...o.history, { at, stage: patch.stage ?? o.stage, note }] } : o) }
}

function confirmation(state, order, at) {
  const lines = order.lines.map(lineText).join('\n')
  if (order.stage === 'backorder') {
    const short = order.lines.filter(l => available(productOf(state, l.sku)) < l.qty).map(l => l.name).join(', ')
    return send(state, { kind: 'backorder', to: order.customer, subject: `Order ${order.number} received - waiting for stock`, orderId: order.id,
      body: `Hello ${order.customer.name},\n\nthank you for your order ${order.number}:\n\n${lines}\n\nTotal (net): ${formatMoney(orderTotal(order))}\n\nWe are waiting for new stock of ${short}. We reserve your order as soon as it arrives and let you know.${signature(state)}` }, at)
  }
  return send(state, { kind: 'confirmation', to: order.customer, subject: `Order ${order.number} confirmed`, orderId: order.id,
    body: `Hello ${order.customer.name},\n\nthank you, we have reserved your order ${order.number}:\n\n${lines}\n\nTotal (net): ${formatMoney(orderTotal(order))}\n\nWe let you know when it ships.${signature(state)}` }, at)
}

/**
 * Creates an Order, from an Email (the customer is its sender unless given) or directly (a phone order: customer required).
 * Reserves the stock when all of it is available (stage `ready`, or `approval` above the limit), else stage `backorder`.
 * Sends the customer a confirmation or a backorder notice.
 */
export function createOrder(state, input, now) {
  const at = time(now)
  const emailId = input.emailId === undefined || input.emailId === null || input.emailId === '' ? null : Number(input.emailId)
  const email = emailId === null ? null : openEmail(state, emailId)
  const customer = input.customerEmail
    ? parseAddress(input.customerName ? `${String(input.customerName).trim()} <${String(input.customerEmail).trim()}>` : input.customerEmail)
    : email?.from ?? (() => { throw new OrderDeskError('a customer email address is required for an order without an email') })()
  const lines = parseLines(input.lines).map(line => {
    const product = productOf(state, line.sku)
    return { sku: product.sku, name: product.name, qty: line.qty, priceCents: product.priceCents }
  })
  const draft = { id: state.nextId, number: `SO-${state.nextOrder}`, customer, emailId, lines, note: optionalText(input.note, 500), created: at, stage: 'backorder', history: [] }
  const stage = fits(state, lines) ? acceptedStage(state, draft) : 'backorder'
  const order = { ...draft, stage, history: [{ at, stage, note: email ? `from email ${email.id}: "${email.subject}"` : 'entered directly' }] }
  let next = { ...state, nextId: state.nextId + 1, nextOrder: state.nextOrder + 1, orders: [...state.orders, order] }
  if (stage !== 'backorder') next = reserve(next, lines, +1)
  next = confirmation(next, order, at)
  if (email) next = withEmail(next, email.id, { status: 'order', orderId: order.id })
  return next
}

export function approveOrder(state, id, now) {
  const at = time(now)
  const order = orderOf(state, id)
  if (order.stage !== 'approval') throw new OrderDeskError(`order ${order.number} does not need approval (it is ${order.stage})`)
  return withOrder(state, id, { stage: 'ready' }, 'approved', at)
}

export const deliveryNoteNumber = order => order.number.replace(/^SO-/u, 'DN-')

/** Ships a ready Order: takes its stock out, writes its delivery note, tells the customer. */
export function shipOrder(state, id, now) {
  const at = time(now)
  const order = orderOf(state, id)
  if (order.stage === 'approval') throw new OrderDeskError(`order ${order.number} is above the approval limit (${formatMoney(state.workflow.approvalAboveCents)}); approve it first`)
  if (order.stage !== 'ready') throw new OrderDeskError(`order ${order.number} cannot ship (it is ${order.stage})`)
  let next = { ...state, products: state.products.map(p => {
    const line = order.lines.find(l => l.sku === p.sku)
    return line ? { ...p, onHand: p.onHand - line.qty, reserved: p.reserved - line.qty } : p
  }) }
  next = withOrder(next, id, { stage: 'shipped', shipped: at, deliveryNote: deliveryNoteNumber(order) }, `shipped with delivery note ${deliveryNoteNumber(order)}`, at)
  return send(next, { kind: 'shipped', to: order.customer, subject: `Order ${order.number} is on its way`, orderId: order.id,
    body: `Hello ${order.customer.name},\n\nyour order ${order.number} has shipped today:\n\n${order.lines.map(lineText).join('\n')}\n\nThe delivery note ${deliveryNoteNumber(order)} is in the parcel.${signature(state)}` }, at)
}

export function cancelOrder(state, id, reason, now) {
  const at = time(now)
  const order = orderOf(state, id)
  if (!OPEN_STAGES.has(order.stage)) throw new OrderDeskError(`order ${order.number} is ${order.stage}; only open orders can be cancelled`)
  let next = order.stage === 'backorder' ? state : reserve(state, order.lines, -1)
  const why = optionalText(reason, 300)
  next = withOrder(next, id, { stage: 'cancelled' }, why ? `cancelled: ${why}` : 'cancelled', at)
  return send(next, { kind: 'cancelled', to: order.customer, subject: `Order ${order.number} cancelled`, orderId: order.id,
    body: `Hello ${order.customer.name},\n\nyour order ${order.number} is cancelled${why ? `: ${why}` : '.'}${signature(state)}` }, at)
}

/** Stock arrives: it goes on hand, and backorders waiting for it are reserved, oldest first, and their customers told. */
export function receiveStock(state, input, now) {
  const at = time(now)
  const code = sku(input.sku)
  const qty = count(input.qty, 'the quantity')
  productOf(state, code)
  let next = { ...state, products: state.products.map(p => p.sku === code ? { ...p, onHand: p.onHand + qty, onOrder: Math.max(0, p.onOrder - qty) } : p) }
  for (const order of next.orders.filter(o => o.stage === 'backorder')) {
    if (!fits(next, order.lines)) continue
    const stage = acceptedStage(next, order)
    next = reserve(next, order.lines, +1)
    next = withOrder(next, order.id, { stage }, `stock arrived (${qty} x ${code}); reserved`, at)
    next = confirmation(next, { ...order, stage }, at)
  }
  return next
}

/** Sends the product's supplier a purchase order and counts the quantity as on order. */
export function reorder(state, input, now) {
  const at = time(now)
  const product = productOf(state, sku(input.sku))
  if (!product.supplier) throw new OrderDeskError(`product ${product.sku} has no supplier to order from`)
  const suggested = reorderSuggestions(state).find(s => s.sku === product.sku)?.qty ?? product.reorderQty
  const qty = input.qty === undefined || input.qty === null || input.qty === '' ? suggested : count(input.qty, 'the quantity')
  if (!qty) throw new OrderDeskError(`how many ${product.name}? the product has no reorder quantity`)
  const next = { ...state, products: state.products.map(p => p.sku === product.sku ? { ...p, onOrder: p.onOrder + qty } : p) }
  return send(next, { kind: 'purchase-order', to: product.supplier, subject: `Purchase order: ${qty} x ${product.name}`, orderId: null, sku: product.sku,
    body: `Hello ${product.supplier.name},\n\nplease deliver ${qty} x ${product.name} (our item ${product.sku}) as soon as possible and confirm the delivery date.${signature(state)}` }, at)
}

export function setWorkflow(state, input) {
  const workflow = { ...state.workflow }
  if (input.approvalAboveEur !== undefined && input.approvalAboveEur !== '') workflow.approvalAboveCents = toCents(input.approvalAboveEur)
  if (input.company !== undefined && input.company !== '') workflow.company = text(input.company, 'the company name')
  if (input.sender !== undefined && input.sender !== '') workflow.sender = parseAddress(input.sender).email
  return { ...state, workflow }
}

// ---- views ----------------------------------------------------------------------------------------------------------------------

export function pipeline(state) {
  const by = stage => state.orders.filter(o => o.stage === stage)
  return { inbox: inbox(state), approval: by('approval'), ready: by('ready'), backorder: by('backorder'), shipped: by('shipped').slice(-12).reverse() }
}

export function stats(state) {
  const open = state.orders.filter(o => OPEN_STAGES.has(o.stage))
  return {
    newEmails: inbox(state).length,
    openOrders: open.length,
    toApprove: open.filter(o => o.stage === 'approval').length,
    toShip: open.filter(o => o.stage === 'ready').length,
    backorders: open.filter(o => o.stage === 'backorder').length,
    openValueCents: open.reduce((sum, o) => sum + orderTotal(o), 0),
    lowStock: state.products.filter(p => stockStatus(p) !== 'ok').length,
  }
}

// ---- the sample business ----------------------------------------------------------------------------------------------------------

/** A small coffee roaster with a catalog, suppliers and four real-looking customer emails, so the desk can be tried at once. */
export function loadSample(state, now) {
  if (state.products.length > 0 || state.emails.length > 0 || state.orders.length > 0) throw new OrderDeskError('the sample loads into an empty desk only')
  const at = time(now)
  const ago = minutes => new Date(Date.parse(at) - minutes * 60_000).toISOString()
  let next = { ...state, workflow: { company: 'Hafen Rösterei', sender: 'orders@hafen-roesterei.example', approvalAboveCents: 100000 } }
  const beans = 'Green Bean Imports <purchasing@greenbean-imports.example>'
  for (const p of [
    { sku: 'ESP-1K', name: 'Espresso Blend, 1 kg', unit: 'bag', price: '24.00', onHand: 30, reorderAt: 10, reorderQty: 40, supplier: beans },
    { sku: 'FIL-1K', name: 'House Filter, 1 kg', unit: 'bag', price: '22.00', onHand: 18, reorderAt: 8, reorderQty: 30, supplier: beans },
    { sku: 'DEC-1K', name: 'Decaf, 1 kg', unit: 'bag', price: '26.00', onHand: 4, reorderAt: 5, reorderQty: 20, supplier: beans },
    { sku: 'CUP-6', name: 'Cappuccino cups, set of 6', unit: 'set', price: '48.00', onHand: 12, reorderAt: 4, reorderQty: 12, supplier: 'Porzellanwerk Nord <sales@porzellanwerk-nord.example>' },
    { sku: 'FLT-100', name: 'Paper filters, pack of 100', unit: 'pack', price: '4.50', onHand: 200, reorderAt: 50, reorderQty: 300, supplier: 'Filter & Co <orders@filter-co.example>' },
  ]) next = addProduct(next, p)
  const mails = [
    { from: 'Maria Huber <maria@cafe-lindengasse.example>', subject: 'Order for next week', received: ago(95),
      body: 'Hi!\n\nCould you send us 6 kg of the espresso blend and 2 kg of the house filter? And two packs of paper filters please.\n\nThanks,\nMaria\nCafé Lindengasse, Lindengasse 12, 1070 Wien' },
    { from: 'Thomas Berger <einkauf@hotel-donaublick.example>', subject: 'Großbestellung Kaffee Wintersaison', received: ago(62),
      body: 'Guten Tag,\n\nfür die Wintersaison benötigen wir 40 kg Espresso und 3 Sets Cappuccino-Tassen. Ist eine Lieferung bis Ende Oktober möglich?\n\nMit freundlichen Grüßen\nThomas Berger\nEinkauf, Hotel Donaublick' },
    { from: 'Lena Wolf <lena@buero-wolf.example>', subject: 'Oat milk?', received: ago(40),
      body: 'Hello,\n\ndo you also sell oat milk? Our office would need about 12 litres a week.\n\nBest,\nLena' },
    { from: 'Jakob Steiner <jakob@baeckerei-sonnenschein.example>', subject: 'decaf', received: ago(12),
      body: 'Hi, 5 kg decaf please, same address as always. Jakob, Bäckerei Sonnenschein' },
  ]
  for (const m of mails) next = receiveEmail(next, m, at)
  return next
}
