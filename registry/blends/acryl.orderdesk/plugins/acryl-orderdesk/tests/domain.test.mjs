import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as d from '../lib/domain.js'
import { parseEmailFile, renderDeliveryNote, renderEml } from '../lib/files.js'

const NOW = '2026-10-20T09:00:00.000Z'
const sample = () => d.loadSample(d.emptyState(), NOW)
const product = (s, sku) => s.products.find(p => p.sku === sku)
const lastOrder = s => s.orders.at(-1)

test('order lines are read in either order, merged per SKU, and bad lines are refused', () => {
  assert.deepEqual(d.parseLines('ESP-1K x6, fil-1k 2; 2 x FLT-100, ESP-1K x1'), [{ sku: 'ESP-1K', qty: 7 }, { sku: 'FIL-1K', qty: 2 }, { sku: 'FLT-100', qty: 2 }])
  for (const bad of ['', 'ESP-1K', 'ESP-1K x0', 'ESP-1K x-2', 'six bags']) assert.throws(() => d.parseLines(bad), d.OrderDeskError)
})

test('senders and amounts are values: "Name <email>" and whole cents', () => {
  assert.deepEqual(d.parseAddress('Maria Huber <Maria@Cafe.example>'), { name: 'Maria Huber', email: 'maria@cafe.example' })
  assert.deepEqual(d.parseAddress('jakob@bakery.example'), { name: 'jakob', email: 'jakob@bakery.example' })
  assert.throws(() => d.parseAddress('not an address'), d.OrderDeskError)
  assert.equal(d.toCents('24,50'), 2450)
  assert.equal(d.formatMoney(110400), 'EUR 1,104.00')
})

test('the sample is a coffee roaster with five products and four new emails, and loads only into an empty desk', () => {
  const s = sample()
  assert.equal(s.products.length, 5)
  assert.equal(d.inbox(s).length, 4)
  assert.throws(() => d.loadSample(s, NOW), d.OrderDeskError)
})

test('an order from an email reserves stock, confirms to the sender, and marks the email handled', () => {
  let s = sample()
  s = d.createOrder(s, { emailId: 1, lines: 'ESP-1K x6, FIL-1K x2, FLT-100 x2' }, NOW)
  const order = lastOrder(s)
  assert.equal(order.number, 'SO-1001')
  assert.equal(order.stage, 'ready')
  assert.equal(order.customer.email, 'maria@cafe-lindengasse.example')
  assert.equal(d.orderTotal(order), 6 * 2400 + 2 * 2200 + 2 * 450)
  assert.equal(product(s, 'ESP-1K').reserved, 6)
  assert.equal(d.available(product(s, 'ESP-1K')), 24)
  assert.equal(s.emails[0].status, 'order')
  assert.equal(s.outbox.at(-1).kind, 'confirmation')
  assert.throws(() => d.createOrder(s, { emailId: 1, lines: 'ESP-1K x1' }, NOW), /already handled/u)
})

test('an order above the approval limit waits for approval before it can ship', () => {
  // 20 x 24.00 + 3 x 48.00 = 624.00, above a 500 limit
  let s = d.createOrder(d.setWorkflow(sample(), { approvalAboveEur: '500' }), { emailId: 2, lines: 'ESP-1K x20, CUP-6 x3' }, NOW)
  const id = lastOrder(s).id
  assert.equal(lastOrder(s).stage, 'approval')
  assert.throws(() => d.shipOrder(s, id, NOW), /approve it first/u)
  s = d.approveOrder(s, id, NOW)
  s = d.shipOrder(s, id, NOW)
  assert.equal(lastOrder(s).stage, 'shipped')
  assert.equal(lastOrder(s).deliveryNote, 'DN-1001')
  assert.equal(product(s, 'ESP-1K').onHand, 10)  // 30 - 20
  assert.equal(product(s, 'ESP-1K').reserved, 0)
  assert.equal(s.outbox.at(-1).kind, 'shipped')
})

test('an order the stock cannot cover is a backorder; stock that arrives reserves it and tells the customer', () => {
  let s = d.createOrder(sample(), { emailId: 4, lines: 'DEC-1K x5' }, NOW)
  assert.equal(lastOrder(s).stage, 'backorder')
  assert.equal(product(s, 'DEC-1K').reserved, 0)
  assert.equal(s.outbox.at(-1).kind, 'backorder')
  s = d.receiveStock(s, { sku: 'dec-1k', qty: 20 }, NOW)
  assert.equal(lastOrder(s).stage, 'ready')
  assert.equal(product(s, 'DEC-1K').reserved, 5)
  assert.equal(s.outbox.at(-1).kind, 'confirmation')
})

test('backorders are released oldest first, and only when all their lines fit', () => {
  let s = d.createOrder(sample(), { emailId: 2, lines: 'ESP-1K x40' }, NOW)
  s = d.createOrder(s, { emailId: 1, lines: 'ESP-1K x25' }, NOW)
  assert.equal(product(s, 'ESP-1K').reserved, 25)
  s = d.receiveStock(s, { sku: 'ESP-1K', qty: 30 }, NOW)   // 60 on hand, 25 reserved: 35 available, not enough for 40
  assert.equal(s.orders[0].stage, 'backorder')
  s = d.receiveStock(s, { sku: 'ESP-1K', qty: 10 }, NOW)   // 45 available
  assert.equal(s.orders[0].stage, 'ready')
  assert.equal(product(s, 'ESP-1K').reserved, 65)
})

test('cancelling releases reserved stock; shipped orders cannot be cancelled', () => {
  let s = d.createOrder(sample(), { emailId: 1, lines: 'ESP-1K x6' }, NOW)
  const id = lastOrder(s).id
  s = d.cancelOrder(s, id, 'customer called', NOW)
  assert.equal(product(s, 'ESP-1K').reserved, 0)
  assert.match(lastOrder(s).history.at(-1).note, /customer called/u)
  assert.throws(() => d.cancelOrder(s, id, '', NOW), d.OrderDeskError)
})

test('unknown products are refused with the catalog, so the agent can correct itself', () => {
  assert.throws(() => d.createOrder(sample(), { emailId: 3, lines: 'OAT-1L x12' }, NOW), /no product OAT-1L; the catalog has ESP-1K, FIL-1K/u)
})

test('a reply goes to the sender with the company signature and closes the email', () => {
  const s = d.replyToEmail(sample(), { emailId: 3, text: 'We do not sell oat milk.' }, NOW)
  const reply = s.outbox.at(-1)
  assert.equal(reply.to.email, 'lena@buero-wolf.example')
  assert.match(reply.body, /Hafen Rösterei/u)
  assert.equal(s.emails[2].status, 'answered')
})

test('low stock suggests a reorder; a purchase order counts as on order and stops the suggestion', () => {
  let s = sample()
  assert.deepEqual(d.reorderSuggestions(s).map(x => x.sku), ['DEC-1K'])
  s = d.reorder(s, { sku: 'DEC-1K' }, NOW)
  assert.equal(product(s, 'DEC-1K').onOrder, 20)
  assert.equal(s.outbox.at(-1).to.email, 'purchasing@greenbean-imports.example')
  assert.deepEqual(d.reorderSuggestions(s), [])
  s = d.receiveStock(s, { sku: 'DEC-1K', qty: 20 }, NOW)
  assert.equal(product(s, 'DEC-1K').onOrder, 0)
})

test('the approval limit is a workflow rule', () => {
  let s = d.setWorkflow(sample(), { approvalAboveEur: '100' })
  s = d.createOrder(s, { emailId: 1, lines: 'ESP-1K x6' }, NOW)
  assert.equal(lastOrder(s).stage, 'approval')
})

test('a phone order needs a customer address', () => {
  assert.throws(() => d.createOrder(sample(), { lines: 'ESP-1K x1' }, NOW), /customer email/u)
  const s = d.createOrder(sample(), { lines: 'ESP-1K x1', customerName: 'Café Nord', customerEmail: 'hi@cafe-nord.example' }, NOW)
  assert.deepEqual(lastOrder(s).customer, { name: 'Café Nord', email: 'hi@cafe-nord.example' })
})

test('email files: headers, folded lines and CRLF are read; sent messages are standard .eml; delivery notes escape text', () => {
  const parsed = parseEmailFile('From: Anna <anna@x.example>\r\nSubject: Need\r\n  coffee\r\n\r\n3 kg espresso\r\n')
  assert.deepEqual(parsed, { from: 'Anna <anna@x.example>', subject: 'Need coffee', body: '3 kg espresso', received: undefined })
  const s = d.receiveEmail(d.emptyState(), parsed, NOW)
  assert.equal(s.emails[0].from.email, 'anna@x.example')
  let shipped = d.createOrder(sample(), { emailId: 1, lines: 'ESP-1K x1', note: '<b>back door</b>' }, NOW)
  shipped = d.shipOrder(shipped, lastOrder(shipped).id, NOW)
  const eml = renderEml(shipped.outbox.at(-1), shipped.workflow.sender, shipped.workflow.company)
  assert.match(eml, /^From: Hafen Rösterei <orders@hafen-roesterei\.example>\r\nTo: Maria Huber <maria@cafe-lindengasse\.example>\r\n/u)
  const note = renderDeliveryNote(lastOrder(shipped), shipped.workflow)
  assert.match(note, /Delivery note DN-1001/u)
  assert.match(note, /&lt;b&gt;back door&lt;\/b&gt;/u)
})

test('backorders count as demand: a product owed to customers is suggested even above its reorder point', () => {
  const s = d.createOrder(sample(), { emailId: 2, lines: 'ESP-1K x40' }, NOW)   // 30 available, 40 owed
  const espresso = d.reorderSuggestions(s).find(x => x.sku === 'ESP-1K')
  assert.equal(espresso.owed, 40)
  assert.equal(espresso.qty, 40)   // max(usual 40, 10 + 1 - (30 - 40) = 21)
})

test('writing to a customer about an order goes to that customer and is kept in the order history', () => {
  let s = d.createOrder(sample(), { emailId: 2, lines: 'ESP-1K x40' }, NOW)
  s = d.messageCustomer(s, { orderId: s.orders[0].id, text: 'Delivery by 30 October is possible.' }, NOW)
  assert.equal(s.outbox.at(-1).to.email, 'einkauf@hotel-donaublick.example')
  assert.equal(s.outbox.at(-1).subject, 'Your order SO-1001')
  assert.match(s.orders[0].history.at(-1).note, /wrote to the customer/u)
  assert.throws(() => d.messageCustomer(sample(), { text: 'hi' }, NOW), /who to write to/u)
})
