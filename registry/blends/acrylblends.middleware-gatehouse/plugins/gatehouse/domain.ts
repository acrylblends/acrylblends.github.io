/**
 * Gatehouse's domain: routes with an ordered middleware pipeline, upstream services, route policies with a local draft, and the deterministic
 * simulation that turns a test request into a trace. Pure functions and plain data; the {@link Gate} in gate.ts applies them to the saved state and
 * the pages only read what it returns.
 *
 * Nothing is proxied: a "request" is a simulation of what the policy would do.
 */

export const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const
export type Method = (typeof METHODS)[number]

export interface Upstream {
  readonly id: string
  readonly address: string
  readonly latencyMs: number
  readonly up: boolean
}

export interface Layers {
  readonly jwt: boolean
  readonly rateLimit: boolean
  readonly logging: boolean
  readonly cache: boolean
}

export const LAYER_LABEL: Readonly<Record<keyof Layers, string>> = { jwt: 'JWT validation', rateLimit: 'Rate limiting', logging: 'Request logging', cache: 'Response cache' }

/** What a route does with a request: where it goes, how long it waits, which layers run and how many requests a minute it admits. */
export interface Policy {
  readonly upstreamId: string
  readonly timeoutMs: number
  readonly layers: Layers
  readonly rateLimitPerMin: number
}

export interface Route {
  readonly id: string
  readonly method: Method
  readonly path: string
  readonly reqPerMin: number
  /** The policy in force: the pipeline is drawn from it. */
  readonly policy: Policy
  /** An unsaved-to-pipeline edit; `Apply` promotes it to the policy. */
  readonly draft?: Policy
  /** Whether a request has already filled the response cache. */
  readonly cacheWarm: boolean
}

export interface RequestTrace {
  readonly id: string
  readonly routeId: string
  readonly at: string
  readonly summary: string
  readonly status: number
  readonly ms: number
  readonly origin: 'fixture' | 'test'
}

export interface GateState {
  readonly version: 1
  readonly environment: string
  readonly routes: readonly Route[]
  readonly upstreams: readonly Upstream[]
  readonly traces: readonly RequestTrace[]
}

export class GateError extends Error {
  override readonly name = 'GateError'
  readonly code: 'invalid' | 'not-found' | 'conflict'
  constructor(code: 'invalid' | 'not-found' | 'conflict', message: string) {
    super(message)
    this.code = code
  }
}

export const MAX_ROUTES = 40
export const label = (route: Pick<Route, 'method' | 'path'>): string => `${route.method} ${route.path}`

// ---- pipeline ---------------------------------------------------------------------------------------------------------------------------------

export interface PipelineNode {
  readonly name: string
  readonly note: string
  /** A layer that is switched off stays on the diagram, dimmed, so the order is always visible. */
  readonly active: boolean
}

/** The ordered middleware pipeline a policy gives a route: Ingress, Auth, Transform, an optional cache, then the upstream. */
export function pipelineOf(policy: Policy): PipelineNode[] {
  const l = policy.layers
  return [
    { name: 'Ingress', note: l.rateLimit ? 'TLS · rate limit' : 'TLS', active: true },
    { name: 'Auth policy', note: l.jwt ? 'JWT validation' : 'Disabled', active: l.jwt },
    { name: 'Transform', note: l.logging ? 'Header mapping · request log' : 'Header mapping', active: true },
    ...(l.cache ? [{ name: 'Response cache', note: 'Cache lookup', active: true }] : []),
    { name: 'Upstream', note: policy.upstreamId, active: true },
  ]
}

/** How many middleware steps a request passes: the active nodes before the upstream. */
export const stepCount = (policy: Policy): number => pipelineOf(policy).filter((n) => n.active && n.name !== 'Upstream').length + 1

export const samePolicy = (a: Policy, b: Policy): boolean =>
  a.upstreamId === b.upstreamId && a.timeoutMs === b.timeoutMs && a.rateLimitPerMin === b.rateLimitPerMin && (Object.keys(a.layers) as (keyof Layers)[]).every((k) => a.layers[k] === b.layers[k])

// ---- simulation -------------------------------------------------------------------------------------------------------------------------------

export interface Outcome {
  readonly status: number
  readonly ms: number
  readonly note: string
  /** Whether the response cache is warm afterwards. */
  readonly cacheWarm: boolean
}

/**
 * What the policy would do with one request: a rate-limited request is refused at the ingress (429); an unreachable upstream answers 502 after the
 * timeout; an upstream slower than the timeout answers 504; a warm cache answers in 8 ms; otherwise the upstream's latency plus 2 ms per active layer.
 */
export function simulate(policy: Policy, upstream: Upstream, recentTests: number, cacheWarm: boolean): Outcome {
  const layers = Object.values(policy.layers).filter(Boolean).length
  if (policy.layers.rateLimit && recentTests >= policy.rateLimitPerMin) return { status: 429, ms: 1, note: 'rate limited', cacheWarm }
  if (policy.layers.cache && cacheWarm) return { status: 200, ms: 8, note: 'cache hit', cacheWarm }
  if (!upstream.up) return { status: 502, ms: policy.timeoutMs, note: 'upstream unreachable', cacheWarm }
  const ms = upstream.latencyMs + 2 * layers
  if (ms > policy.timeoutMs) return { status: 504, ms: policy.timeoutMs, note: 'upstream timeout', cacheWarm }
  return { status: 200, ms, note: 'local policy simulation', cacheWarm: policy.layers.cache ? true : cacheWarm }
}

// ---- input checks -----------------------------------------------------------------------------------------------------------------------------

export function parseTimeout(raw: string | undefined): number {
  const value = raw === undefined || raw.trim() === '' ? Number.NaN : Number(raw)
  if (!Number.isInteger(value) || value < 10 || value > 60_000) throw new GateError('invalid', 'The timeout is a whole number of milliseconds from 10 to 60000.')
  return value
}

export function parseRate(raw: string | undefined): number {
  const value = raw === undefined || raw.trim() === '' ? Number.NaN : Number(raw)
  if (!Number.isInteger(value) || value < 1 || value > 100_000) throw new GateError('invalid', 'The rate limit is a whole number of requests per minute from 1 to 100000.')
  return value
}

export function parseRouteInput(fields: Readonly<Record<string, string | undefined>>): { method: Method; path: string } {
  const method = (fields.method ?? '').toUpperCase()
  if (!(METHODS as readonly string[]).includes(method)) throw new GateError('invalid', `The method is one of ${METHODS.join(', ')}.`)
  const path = (fields.path ?? '').trim()
  if (!/^\/[A-Za-z0-9\-._~/:*]*$/.test(path) || path.length > 100 || path.includes('//')) throw new GateError('invalid', 'The path starts with / and holds letters, digits, - . _ ~ : * and /.')
  return { method: method as Method, path }
}

/** `10:42:18`, local time. */
export function clockOf(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export const compact = (n: number): string => (n >= 1000 ? `${String(Math.round(n / 100) / 10)}k` : String(n))
