/**
 * The console (`ctx.orbit`): the saved state and every change to it. Sending a request validates it the way the API
 * would, applies a create to the fixture data, remembers what was typed and the response, and saves; a failed save leaves the state as it was.
 */
import {
  type Endpoint,
  type Inputs,
  type OrbitState,
  type SentResponse,
  ENDPOINTS,
  STATUS_TEXT,
  endpointOf,
  inputsFor,
  latencyMs,
  requestIdOf,
  respond,
} from './domain.ts'
import { seed } from './seed.ts'
import type { OrbitStore } from './store.ts'

export interface OrbitAdapters {
  readonly store: OrbitStore
  readonly clock: () => Date
}

export class Orbit {
  #state: OrbitState
  readonly #adapters: OrbitAdapters

  private constructor(state: OrbitState, adapters: OrbitAdapters) {
    this.#state = state
    this.#adapters = adapters
  }

  static async open(adapters: OrbitAdapters): Promise<Orbit> {
    const saved = await adapters.store.load()
    if (saved !== undefined) return new Orbit(saved, adapters)
    const state = seed(adapters.clock())
    await adapters.store.save(state)
    return new Orbit(state, adapters)
  }

  get state(): OrbitState {
    return this.#state
  }

  now(): Date {
    return this.#adapters.clock()
  }

  endpoints(): readonly Endpoint[] {
    return ENDPOINTS
  }

  endpoint(id: string): Endpoint {
    return endpointOf(id)
  }

  /** What to show in the form for an endpoint. */
  inputs(endpoint: Endpoint): Inputs {
    return inputsFor(endpoint, this.#state.inputs[endpoint.id])
  }

  async #commit(next: OrbitState): Promise<void> {
    await this.#adapters.store.save(next)
    this.#state = next
  }

  /** Remember what was typed without sending it. */
  async saveInputs(id: string, inputs: Inputs): Promise<void> {
    endpointOf(id)
    await this.#commit({ ...this.#state, inputs: { ...this.#state.inputs, [id]: inputs } })
  }

  /** Send the request to the local fixture API: the response is kept as the last one; a create adds its record to the data. */
  async send(id: string, inputs: Inputs): Promise<SentResponse> {
    const endpoint = endpointOf(id)
    const now = this.now()
    const outcome = respond(endpoint, inputs, this.#state, now)
    const requests = this.#state.requests + 1
    const sent: SentResponse = {
      endpointId: id,
      method: endpoint.method,
      path: endpoint.path,
      status: outcome.status,
      statusText: STATUS_TEXT[outcome.status] ?? '',
      ms: latencyMs(endpoint, outcome.records),
      body: outcome.body,
      requestId: requestIdOf(requests),
      at: now.toISOString(),
    }
    const created = outcome.created
    await this.#commit({
      ...this.#state,
      inputs: { ...this.#state.inputs, [id]: inputs },
      last: sent,
      requests,
      orders: created?.kind === 'order' ? [created.record, ...this.#state.orders] : this.#state.orders,
      customers: created?.kind === 'customer' ? [created.record, ...this.#state.customers] : this.#state.customers,
    })
    return sent
  }

  /** Clear the last response and the typed inputs, and put the fixture data back. */
  async reset(): Promise<void> {
    await this.#commit(seed(this.now()))
  }
}
