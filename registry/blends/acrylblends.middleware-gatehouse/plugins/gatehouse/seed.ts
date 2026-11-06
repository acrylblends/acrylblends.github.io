/**
 * The gateway a person sees on the first start: five upstream services, twelve routes (GET /v1/orders selected by default) with their policies, and
 * the recent traces of GET /v1/orders, timed relative to now.
 */
import type { GateState, Layers, Method, Policy, Route, Upstream } from './domain.ts'

const ALL: Layers = { jwt: true, rateLimit: true, logging: true, cache: false }
const policy = (upstreamId: string, timeoutMs = 2500, layers: Partial<Layers> = {}, rateLimitPerMin = 600): Policy => ({ upstreamId, timeoutMs, layers: { ...ALL, ...layers }, rateLimitPerMin })

const UPSTREAMS: Upstream[] = [
  { id: 'orders-service', address: '10.2.1.14:8080', latencyMs: 18, up: true },
  { id: 'identity-service', address: '10.2.1.21:8080', latencyMs: 26, up: true },
  { id: 'billing-service', address: '10.2.1.32:8080', latencyMs: 34, up: true },
  { id: 'search-service', address: '10.2.1.40:9200', latencyMs: 41, up: true },
  { id: 'integration-bus', address: '10.2.1.51:8081', latencyMs: 22, up: true },
]

const route = (id: string, method: Method, path: string, reqPerMin: number, p: Policy): Route => ({ id, method, path, reqPerMin, policy: p, cacheWarm: false })

export function seed(now: Date): GateState {
  const ago = (s: number) => new Date(now.getTime() - s * 1000).toISOString()
  const trace = (id: string, secondsAgo: number, summary: string, status: number, ms: number) => ({ id, routeId: 'rt_01H9X', at: ago(secondsAgo), summary, status, ms, origin: 'fixture' as const })
  return {
    version: 1,
    environment: 'Sandbox environment',
    upstreams: UPSTREAMS,
    routes: [
      route('rt_01H9X', 'GET', '/v1/orders', 2400, policy('orders-service')),
      route('rt_01H9Y', 'GET', '/v1/users/:id', 1100, policy('identity-service', 2000, { cache: true })),
      route('rt_01H9Z', 'POST', '/v1/payments', 320, policy('billing-service', 5000, {}, 120)),
      route('rt_01HA0', 'POST', '/v1/search', 98, policy('search-service', 3000, { logging: false })),
      route('rt_01HA1', 'POST', '/webhooks/*', 56, policy('integration-bus', 4000, { jwt: false })),
      route('rt_01HA2', 'GET', '/v1/orders/:id', 880, policy('orders-service', 2500, { cache: true })),
      route('rt_01HA3', 'POST', '/v1/orders', 210, policy('orders-service', 4000, {}, 200)),
      route('rt_01HA4', 'DELETE', '/v1/orders/:id', 12, policy('orders-service', 4000, {}, 30)),
      route('rt_01HA5', 'GET', '/v1/invoices', 140, policy('billing-service', 3000, { cache: true })),
      route('rt_01HA6', 'POST', '/v1/users', 35, policy('identity-service', 3000, {}, 60)),
      route('rt_01HA7', 'GET', '/v1/search/suggest', 410, policy('search-service', 1500, { jwt: false, cache: true })),
      route('rt_01HA8', 'GET', '/healthz', 960, policy('orders-service', 500, { jwt: false, rateLimit: false, logging: false })),
    ],
    traces: [
      trace('tr_1', 21, 'GET /v1/orders · upstream retry', 206, 88),
      trace('tr_2', 17, 'GET /v1/orders · JWT refreshed', 200, 51),
      trace('tr_3', 14, 'GET /v1/orders · cache hit', 200, 8),
      trace('tr_4', 12, 'GET /v1/orders · 4 middleware steps', 200, 42),
    ],
  }
}
