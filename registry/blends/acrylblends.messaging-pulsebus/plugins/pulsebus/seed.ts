/**
 * The workspace a person sees on the first start: eight topics with their schemas, three consumer groups, the newest messages of each topic (the
 * orders.created stream as in the mockup, one retry among them) and two dead letters, timed relative to now.
 */
import type { BusState, Message, SchemaField, Topic } from './domain.ts'

const f = (name: string, type: SchemaField['type'], required = true, example?: unknown): SchemaField => ({ name, type, required, ...(example === undefined ? {} : { example }) })
const topic = (id: string, perHour: number, perMin: number, p95Ms: number, deliveryPercent: number, schemaVersion: number, groupId: string, fields: SchemaField[]): Topic => ({ id, perHour, perMin, p95Ms, deliveryPercent, schemaVersion, groupId, fields })

export function seed(now: Date): BusState {
  const ago = (s: number) => new Date(now.getTime() - s * 1000).toISOString()
  const msg = (id: string, topicId: string, secondsAgo: number, schemaVersion: number, data: Record<string, unknown>, extra: Partial<Message> = {}): Message => ({
    id,
    topicId,
    at: ago(secondsAgo),
    schemaVersion,
    data,
    state: 'acked',
    attempts: 1,
    origin: 'fixture',
    replays: 0,
    ...extra,
  })
  return {
    version: 1,
    workspace: 'Sandbox',
    region: 'eu-central',
    topics: [
      topic('orders.created', 12_400, 3400, 42, 99.98, 3, 'analytics-sink', [f('order_id', 'string', true, 'ORD-2049'), f('customer_region', 'string', true, 'AT'), f('total', 'number', false)]),
      topic('orders.fulfilled', 8100, 2200, 38, 99.99, 2, 'fulfillment-worker', [f('order_id', 'string', true, 'ORD-2049'), f('carrier', 'string', false)]),
      topic('billing.invoice-issued', 1200, 330, 51, 99.95, 4, 'billing-service', [f('invoice_id', 'string', true, 'INV-7713'), f('amount', 'number', true, 120), f('currency', 'string', false)]),
      topic('users.updated', 420, 120, 33, 100, 1, 'analytics-sink', [f('user_id', 'string', true, 'USR-1200'), f('fields', 'array', false)]),
      topic('inventory.low-stock', 12, 4, 29, 100, 2, 'fulfillment-worker', [f('sku', 'string', true, 'SKU-4411'), f('remaining', 'number', true, 4)]),
      topic('shipping.dispatched', 3100, 860, 40, 99.97, 1, 'fulfillment-worker', [f('shipment_id', 'string', true, 'SHP-5522'), f('order_id', 'string', true, 'ORD-2049')]),
      topic('payments.captured', 5600, 1500, 47, 99.99, 3, 'billing-service', [f('payment_id', 'string', true, 'PAY-9082'), f('amount', 'number', true, 99)]),
      topic('audit.logged', 960, 270, 36, 100, 1, 'analytics-sink', [f('actor', 'string', true, 'svc-orders'), f('action', 'string', true, 'topic.configure')]),
    ],
    groups: [
      { id: 'fulfillment-worker', consumers: 6, baseLag: 0 },
      { id: 'analytics-sink', consumers: 3, baseLag: 17 },
      { id: 'billing-service', consumers: 2, baseLag: 0 },
    ],
    messages: [
      msg('evt_98ab1e', 'orders.created', 22, 3, { order_id: 'ORD-2045', customer_region: 'AT', total: 99 }, { state: 'retry', attempts: 1, lastError: 'analytics-sink timed out after 5 s' }),
      msg('evt_98ab1f', 'orders.created', 17, 3, { order_id: 'ORD-2046', customer_region: 'CZ', total: 42.9 }),
      msg('evt_98ab20', 'orders.created', 14, 3, { order_id: 'ORD-2047', customer_region: 'DE', total: 310 }),
      msg('evt_98ab21', 'orders.created', 12, 3, { order_id: 'ORD-2048', customer_region: 'AT', total: 184.5 }),
      msg('evt_98aa90', 'orders.fulfilled', 60, 2, { order_id: 'ORD-2030', carrier: 'DHL' }),
      msg('evt_98aa91', 'orders.fulfilled', 41, 2, { order_id: 'ORD-2033', carrier: 'UPS' }),
      msg('evt_98aa70', 'billing.invoice-issued', 300, 4, { invoice_id: 'INV-7712', amount: 1280, currency: 'EUR' }),
      msg('evt_98a9f3', 'billing.invoice-issued', 3600, 4, { invoice_id: 'INV-7690', amount: 75, currency: '€' }, { state: 'dead', attempts: 3, lastError: 'billing-service cannot parse currency “€” (expects ISO 4217)' }),
      msg('evt_98a7c0', 'users.updated', 7200, 1, { user_id: 'USR-1182', fields: ['email'] }, { state: 'dead', attempts: 3, lastError: 'analytics-sink timed out after 3 attempts' }),
      msg('evt_98aa05', 'users.updated', 900, 1, { user_id: 'USR-1190', fields: ['name', 'locale'] }),
      msg('evt_98a811', 'inventory.low-stock', 1800, 2, { sku: 'SKU-4410', remaining: 6 }),
      msg('evt_98aa44', 'shipping.dispatched', 120, 1, { shipment_id: 'SHP-5521', order_id: 'ORD-2030' }),
      msg('evt_98aa51', 'payments.captured', 95, 3, { payment_id: 'PAY-9081', amount: 184.5 }),
      msg('evt_98aa60', 'audit.logged', 75, 1, { actor: 'svc-orders', action: 'topic.configure' }),
    ],
  }
}
