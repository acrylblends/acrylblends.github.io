/**
 * The gateway (`ctx.gate`): the saved state and every change to it. A change checks its input, builds the next state, saves it through the store and
 * only then makes it current, so a failed save leaves the gateway as it was.
 */
import {
  type GateState,
  GateError,
  type Layers,
  type Policy,
  type RequestTrace,
  type Route,
  type Upstream,
  MAX_ROUTES,
  label,
  parseRate,
  parseRouteInput,
  parseTimeout,
  samePolicy,
  simulate,
  stepCount,
} from './domain.ts'
import { seed } from './seed.ts'
import type { GateStore } from './store.ts'

export interface GateAdapters {
  readonly store: GateStore
  readonly clock: () => Date
}

export class Gate {
  #state: GateState
  readonly #adapters: GateAdapters

  private constructor(state: GateState, adapters: GateAdapters) {
    this.#state = state
    this.#adapters = adapters
  }

  static async open(adapters: GateAdapters): Promise<Gate> {
    const saved = await adapters.store.load()
    if (saved !== undefined) return new Gate(saved, adapters)
    const state = seed(adapters.clock())
    await adapters.store.save(state)
    return new Gate(state, adapters)
  }

  get state(): GateState {
    return this.#state
  }

  now(): Date {
    return this.#adapters.clock()
  }

  route(id: string): Route {
    const route = this.#state.routes.find((r) => r.id === id)
    if (route === undefined) throw new GateError('not-found', 'There is no such route.')
    return route
  }

  upstream(id: string): Upstream {
    const upstream = this.#state.upstreams.find((u) => u.id === id)
    if (upstream === undefined) throw new GateError('not-found', 'There is no such upstream service.')
    return upstream
  }

  /** The route's traces, newest first. */
  traces(routeId: string, limit = 12): readonly RequestTrace[] {
    return this.#state.traces.filter((t) => t.routeId === routeId).sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id)).slice(0, limit)
  }

  /** The policy the inspector shows: the draft when there is one, else the policy in force. */
  editing(route: Route): Policy {
    return route.draft ?? route.policy
  }

  hasPendingDraft(route: Route): boolean {
    return route.draft !== undefined && !samePolicy(route.draft, route.policy)
  }

  async #commit(next: GateState): Promise<void> {
    await this.#adapters.store.save(next)
    this.#state = next
  }

  #replaceRoute(route: Route): readonly Route[] {
    return this.#state.routes.map((r) => (r.id === route.id ? route : r))
  }

  /** Add a route with the default policy (JWT, rate limit and logging on, cache off) to an upstream. */
  async addRoute(fields: Readonly<Record<string, string | undefined>>): Promise<Route> {
    const { method, path } = parseRouteInput(fields)
    const upstream = this.upstream(fields.upstreamId ?? '')
    const timeoutMs = parseTimeout(fields.timeoutMs ?? '2500')
    if (this.#state.routes.length >= MAX_ROUTES) throw new GateError('conflict', `The registry holds at most ${String(MAX_ROUTES)} routes.`)
    if (this.#state.routes.some((r) => r.method === method && r.path === path)) throw new GateError('conflict', `${method} ${path} is already registered.`)
    const number = this.#state.routes.length + 1
    const route: Route = {
      id: `rt_${this.now().getTime().toString(36).toUpperCase().slice(-4)}${String(number).padStart(2, '0')}`,
      method,
      path,
      reqPerMin: 0,
      cacheWarm: false,
      policy: { upstreamId: upstream.id, timeoutMs, layers: { jwt: true, rateLimit: true, logging: true, cache: false }, rateLimitPerMin: 600 },
    }
    await this.#commit({ ...this.#state, routes: [...this.#state.routes, route] })
    return route
  }

  /** Save the inspector's values as the route's draft; the pipeline keeps running the old policy until the draft is applied. */
  async saveDraft(id: string, fields: Readonly<Record<string, string | undefined>>): Promise<Route> {
    const route = this.route(id)
    const upstream = this.upstream(fields.upstreamId ?? '')
    const layers: Layers = { jwt: fields.jwt === 'on', rateLimit: fields.rateLimit === 'on', logging: fields.logging === 'on', cache: fields.cache === 'on' }
    const draft: Policy = {
      upstreamId: upstream.id,
      timeoutMs: parseTimeout(fields.timeoutMs),
      layers,
      rateLimitPerMin: fields.rateLimitPerMin === undefined || fields.rateLimitPerMin === '' ? route.policy.rateLimitPerMin : parseRate(fields.rateLimitPerMin),
    }
    const next: Route = { ...route, draft }
    await this.#commit({ ...this.#state, routes: this.#replaceRoute(next) })
    return next
  }

  /** Make the draft the policy in force. Switching the cache off or changing the upstream empties the cache. */
  async applyDraft(id: string): Promise<Route> {
    const route = this.route(id)
    if (route.draft === undefined || samePolicy(route.draft, route.policy)) throw new GateError('conflict', `${label(route)} has no draft changes to apply.`)
    const { draft: policy, ...rest } = route
    const cold = policy.upstreamId !== route.policy.upstreamId || !policy.layers.cache
    const next: Route = { ...rest, policy: route.draft ?? route.policy, cacheWarm: cold ? false : route.cacheWarm }
    await this.#commit({ ...this.#state, routes: this.#replaceRoute(next) })
    return next
  }

  async discardDraft(id: string): Promise<Route> {
    const route = this.route(id)
    if (route.draft === undefined) throw new GateError('conflict', `${label(route)} has no draft to discard.`)
    const { draft: _draft, ...next } = route
    await this.#commit({ ...this.#state, routes: this.#replaceRoute(next) })
    return next
  }

  /** Send a test request through the policy in force and record its trace. */
  async runTest(id: string): Promise<RequestTrace> {
    const route = this.route(id)
    const at = this.now()
    const recent = this.#state.traces.filter((t) => t.routeId === id && t.origin === 'test' && at.getTime() - new Date(t.at).getTime() < 60_000).length
    const outcome = simulate(route.policy, this.upstream(route.policy.upstreamId), recent, route.cacheWarm)
    const trace: RequestTrace = {
      id: `tr_${String(this.#state.traces.length + 1)}`,
      routeId: id,
      at: at.toISOString(),
      summary: `${label(route)} · ${outcome.note === 'local policy simulation' ? `${outcome.note} · ${String(stepCount(route.policy))} steps` : outcome.note}`,
      status: outcome.status,
      ms: outcome.ms,
      origin: 'test',
    }
    await this.#commit({ ...this.#state, routes: this.#replaceRoute({ ...route, cacheWarm: outcome.cacheWarm }), traces: [...this.#state.traces, trace] })
    return trace
  }

  /** Mark an upstream reachable or not (to see what the pipeline does when it is down). */
  async setUpstream(id: string, up: boolean): Promise<Upstream> {
    const upstream = this.upstream(id)
    if (upstream.up === up) throw new GateError('conflict', `${id} is already ${up ? 'up' : 'down'}.`)
    const next = { ...upstream, up }
    await this.#commit({ ...this.#state, upstreams: this.#state.upstreams.map((u) => (u.id === id ? next : u)) })
    return next
  }
}
