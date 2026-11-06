/** The API a person sees on the first start: six orders, five customers and a few event deliveries, with nothing sent yet. */
import type { ApiEvent, Customer, Order, OrbitState } from './domain.ts'

export function seed(now: Date): OrbitState {
  const at = (days: number, h: number, m: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - days, h, m).toISOString().replace(/\.\d{3}Z$/, 'Z')
  const order = (id: string, status: Order['status'], total: number, customer: string, days: number, h: number, m: number): Order => ({ id, customer_id: customer, status, currency: 'EUR', total, created_at: at(days, h, m) })
  const customer = (id: string, name: string, email: string, days: number): Customer => ({ id, name, email, created_at: at(days, 9, 0) })
  const event = (id: string, type: string, delivered: boolean, days: number, h: number, m: number): ApiEvent => ({ id, type, delivered, created_at: at(days, h, m) })
  return {
    version: 1,
    baseUrl: 'https://api.acme.example',
    apiVersion: '2026-01',
    orders: [
      order('ord_2048', 'paid', 184.5, 'cus_2048', 0, 10, 42),
      order('ord_2047', 'open', 92, 'cus_2047', 0, 10, 31),
      order('ord_2046', 'paid', 41.2, 'cus_2046', 1, 16, 5),
      order('ord_2045', 'cancelled', 18, 'cus_2045', 1, 12, 48),
      order('ord_2044', 'open', 300, 'cus_2048', 2, 9, 20),
      order('ord_2043', 'paid', 12.9, 'cus_2044', 3, 15, 10),
    ],
    customers: [
      customer('cus_2048', 'Ada Reyes', 'ada@example.com', 40),
      customer('cus_2047', 'Ben Okafor', 'ben@example.com', 33),
      customer('cus_2046', 'Chloe Martin', 'chloe@example.com', 21),
      customer('cus_2045', 'Dev Patel', 'dev@example.com', 14),
      customer('cus_2044', 'Elif Demir', 'elif@example.com', 5),
    ],
    events: [
      event('evt_9004', 'order.created', true, 0, 10, 42),
      event('evt_9003', 'order.created', true, 0, 10, 31),
      event('evt_9002', 'customer.created', true, 1, 14, 2),
      event('evt_9001', 'order.created', false, 1, 12, 48),
    ],
    inputs: {},
    requests: 0,
  }
}
