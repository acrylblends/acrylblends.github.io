/**
 * Orbit's domain: an API's endpoints and parameters, the resources behind its local response fixtures, the request simulation that turns a filled-in
 * request into a response (validating it the way the API would), and the SDK snippet generator. Pure functions and plain data; the {@link Console} in
 * console.ts applies them to the saved state and the pages only read what it returns.
 *
 * No request leaves the app: the "API" is a seeded fixture that answers like a real one, creates included.
 */

export type Method = 'GET' | 'POST'

export interface Param {
  readonly name: string
  readonly in: 'query' | 'path'
  readonly type: 'integer' | 'string' | 'enum'
  readonly options?: readonly string[]
  readonly default: string
  readonly description: string
}

export interface BodyField {
  readonly name: string
  readonly type: string
  readonly required: boolean
  readonly description: string
}

export interface Endpoint {
  readonly id: string
  readonly group: string
  readonly method: Method
  readonly path: string
  readonly description: string
  /** The resource the endpoint returns or creates; its schema is shown in the Schema tab. */
  readonly resource: 'Order' | 'Customer' | 'Event'
  readonly params: readonly Param[]
  readonly body?: { readonly fields: readonly BodyField[]; readonly example: string }
}

export interface Order {
  readonly id: string
  readonly customer_id: string
  readonly status: 'open' | 'paid' | 'cancelled'
  readonly currency: string
  readonly total: number
  readonly created_at: string
}

export interface Customer {
  readonly id: string
  readonly name: string
  readonly email: string
  readonly created_at: string
}

export interface ApiEvent {
  readonly id: string
  readonly type: string
  readonly delivered: boolean
  readonly created_at: string
}

/** What a person typed for an endpoint: parameter values by name and the request body. */
export interface Inputs {
  readonly params: Readonly<Record<string, string>>
  readonly body: string
}

export interface SentResponse {
  readonly endpointId: string
  readonly method: Method
  readonly path: string
  readonly status: number
  readonly statusText: string
  readonly ms: number
  readonly body: unknown
  readonly requestId: string
  readonly at: string
}

export interface OrbitState {
  readonly version: 1
  readonly baseUrl: string
  readonly apiVersion: string
  readonly orders: readonly Order[]
  readonly customers: readonly Customer[]
  readonly events: readonly ApiEvent[]
  /** What was last typed for each endpoint, by endpoint id. */
  readonly inputs: Readonly<Record<string, Inputs>>
  readonly last?: SentResponse
  /** How many requests have been sent: it numbers the request ids. */
  readonly requests: number
}

export class OrbitError extends Error {
  override readonly name = 'OrbitError'
  readonly code: 'invalid' | 'not-found'
  constructor(code: 'invalid' | 'not-found', message: string) {
    super(message)
    this.code = code
  }
}

// ---- the API ----------------------------------------------------------------------------------------------------------------------------------

const STATUSES = ['any', 'open', 'paid', 'cancelled'] as const

export const ENDPOINTS: readonly Endpoint[] = [
  {
    id: 'orders-list', group: 'Orders', method: 'GET', path: '/v1/orders', description: 'List orders for the authenticated workspace.', resource: 'Order',
    params: [
      { name: 'limit', in: 'query', type: 'integer', default: '20', description: 'Items per page' },
      { name: 'status', in: 'query', type: 'enum', options: STATUSES, default: 'any', description: 'Filter by state' },
    ],
  },
  { id: 'orders-get', group: 'Orders', method: 'GET', path: '/v1/orders/{id}', description: 'Retrieve a single order by identifier.', resource: 'Order', params: [{ name: 'id', in: 'path', type: 'string', default: 'ord_2048', description: 'Order identifier' }] },
  {
    id: 'orders-create', group: 'Orders', method: 'POST', path: '/v1/orders', description: 'Create an order in the active workspace.', resource: 'Order', params: [],
    body: {
      fields: [
        { name: 'customer_id', type: 'string', required: true, description: 'The customer placing the order' },
        { name: 'currency', type: 'ISO 4217', required: true, description: 'Three upper-case letters' },
        { name: 'items', type: 'array', required: true, description: 'Lines: { sku, quantity } with quantity a positive integer' },
      ],
      example: '{"customer_id":"cus_2048","currency":"EUR","items":[{"sku":"WB-01","quantity":2}]}',
    },
  },
  {
    id: 'customers-list', group: 'Customers', method: 'GET', path: '/v1/customers', description: 'Search and paginate workspace customers.', resource: 'Customer',
    params: [
      { name: 'q', in: 'query', type: 'string', default: '', description: 'Search name or email' },
      { name: 'limit', in: 'query', type: 'integer', default: '20', description: 'Items per page' },
    ],
  },
  {
    id: 'customers-create', group: 'Customers', method: 'POST', path: '/v1/customers', description: 'Create a customer record.', resource: 'Customer', params: [],
    body: {
      fields: [
        { name: 'name', type: 'string', required: true, description: 'Display name' },
        { name: 'email', type: 'string', required: true, description: 'Unique e-mail address' },
      ],
      example: '{"name":"Nora Bell","email":"nora@example.com"}',
    },
  },
  {
    id: 'events-list', group: 'Events', method: 'GET', path: '/v1/events', description: 'Read recent event deliveries.', resource: 'Event',
    params: [
      { name: 'limit', in: 'query', type: 'integer', default: '20', description: 'Items per page' },
      { name: 'type', in: 'query', type: 'enum', options: ['any', 'order.created', 'customer.created'], default: 'any', description: 'Filter by event type' },
    ],
  },
]

export const SCHEMAS: Readonly<Record<Endpoint['resource'], Readonly<Record<string, string>>>> = {
  Order: { id: 'string', customer_id: 'string', status: 'open | paid | cancelled', currency: 'ISO 4217', total: 'number', created_at: 'ISO 8601' },
  Customer: { id: 'string', name: 'string', email: 'string', created_at: 'ISO 8601' },
  Event: { id: 'string', type: 'string', delivered: 'boolean', created_at: 'ISO 8601' },
}

export const LANGUAGES = ['JavaScript', 'Python', 'Go'] as const
export type Language = (typeof LANGUAGES)[number]

/** The SKUs a new order can contain, with their unit price. */
export const PRICES: Readonly<Record<string, number>> = { 'WB-01': 92.25, 'HD-02': 19.9, 'KB-03': 64, 'MS-04': 24.5 }

export const STATUS_TEXT: Readonly<Record<number, string>> = { 200: 'OK', 201: 'Created', 404: 'Not Found', 409: 'Conflict', 422: 'Unprocessable Entity' }

export function endpointOf(id: string): Endpoint {
  const endpoint = ENDPOINTS.find((e) => e.id === id)
  if (endpoint === undefined) throw new OrbitError('not-found', 'There is no such endpoint.')
  return endpoint
}

/** The values to show for an endpoint: what was last typed, else the defaults. */
export function inputsFor(endpoint: Endpoint, saved: Inputs | undefined): Inputs {
  return {
    params: Object.fromEntries(endpoint.params.map((p) => [p.name, saved?.params[p.name] ?? p.default])),
    body: saved?.body ?? endpoint.body?.example ?? '',
  }
}

// ---- simulation -------------------------------------------------------------------------------------------------------------------------------

export interface Outcome {
  readonly status: number
  readonly body: unknown
  readonly records: number
  readonly created?: { readonly kind: 'order'; readonly record: Order } | { readonly kind: 'customer'; readonly record: Customer }
}

const problem = (status: number, code: string, message: string): Outcome => ({ status, body: { error: { code, message } }, records: 0 })

function intParam(raw: string | undefined, name: string, min: number, max: number): number | Outcome {
  const text = (raw ?? '').trim()
  const n = text === '' ? 20 : Number(text)
  return Number.isInteger(n) && n >= min && n <= max ? n : problem(422, 'invalid_parameter', `${name} must be an integer from ${String(min)} to ${String(max)}`)
}

/** What the API would answer: validation (422), lookups (404), conflicts (409), lists and creates, over the fixture data. */
export function respond(endpoint: Endpoint, inputs: Inputs, data: Pick<OrbitState, 'orders' | 'customers' | 'events'>, now: Date): Outcome {
  const p = (name: string) => inputs.params[name]
  switch (endpoint.id) {
    case 'orders-list': {
      const limit = intParam(p('limit'), 'limit', 1, 100)
      if (typeof limit !== 'number') return limit
      const status = p('status') ?? 'any'
      if (!(STATUSES as readonly string[]).includes(status)) return problem(422, 'invalid_parameter', `status must be one of ${STATUSES.join(', ')}`)
      const matching = data.orders.filter((o) => status === 'any' || o.status === status)
      const page = matching.slice(0, limit)
      return { status: 200, body: { data: page, has_more: matching.length > page.length }, records: page.length }
    }
    case 'orders-get': {
      const order = data.orders.find((o) => o.id === (p('id') ?? '').trim())
      return order === undefined ? problem(404, 'not_found', `No order with id ${p('id') ?? ''}`) : { status: 200, body: order, records: 1 }
    }
    case 'orders-create': {
      const parsed = parseBody(inputs.body)
      if (!parsed.ok) return parsed.outcome
      const body = parsed.body
      if (typeof body.customer_id !== 'string' || body.customer_id.trim() === '') return problem(422, 'invalid_body', 'customer_id is required')
      if (typeof body.currency !== 'string' || !/^[A-Z]{3}$/.test(body.currency)) return problem(422, 'invalid_body', 'currency must be an ISO 4217 code such as EUR')
      if (!Array.isArray(body.items) || body.items.length === 0) return problem(422, 'invalid_body', 'items must be a non-empty array')
      let total = 0
      for (const [i, raw] of body.items.entries()) {
        const item = raw as { sku?: unknown; quantity?: unknown }
        if (typeof item?.sku !== 'string' || PRICES[item.sku] === undefined) return problem(422, 'invalid_body', `items[${String(i)}].sku is unknown`)
        if (!Number.isInteger(item.quantity) || (item.quantity as number) < 1) return problem(422, 'invalid_body', `items[${String(i)}].quantity must be a positive integer`)
        total += (PRICES[item.sku] ?? 0) * (item.quantity as number)
      }
      const order: Order = { id: `ord_local_${String(2049 + data.orders.filter((o) => o.id.startsWith('ord_local_')).length)}`, customer_id: body.customer_id, status: 'open', currency: body.currency, total: Math.round(total * 100) / 100, created_at: now.toISOString().replace(/\.\d{3}Z$/, 'Z') }
      return { status: 201, body: order, records: 1, created: { kind: 'order', record: order } }
    }
    case 'customers-list': {
      const limit = intParam(p('limit'), 'limit', 1, 100)
      if (typeof limit !== 'number') return limit
      const q = (p('q') ?? '').trim().toLowerCase()
      const matching = data.customers.filter((c) => q === '' || c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q))
      const page = matching.slice(0, limit)
      return { status: 200, body: { data: page, has_more: matching.length > page.length }, records: page.length }
    }
    case 'customers-create': {
      const parsed = parseBody(inputs.body)
      if (!parsed.ok) return parsed.outcome
      const body = parsed.body
      if (typeof body.name !== 'string' || body.name.trim() === '') return problem(422, 'invalid_body', 'name is required')
      if (typeof body.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) return problem(422, 'invalid_body', 'email must be a valid e-mail address')
      const email = body.email.toLowerCase()
      if (data.customers.some((c) => c.email === email)) return problem(409, 'conflict', `A customer with ${email} already exists`)
      const customer: Customer = { id: `cus_local_${String(2050 + data.customers.filter((c) => c.id.startsWith('cus_local_')).length)}`, name: body.name.trim(), email, created_at: now.toISOString().replace(/\.\d{3}Z$/, 'Z') }
      return { status: 201, body: customer, records: 1, created: { kind: 'customer', record: customer } }
    }
    case 'events-list': {
      const limit = intParam(p('limit'), 'limit', 1, 100)
      if (typeof limit !== 'number') return limit
      const type = p('type') ?? 'any'
      const page = data.events.filter((e) => type === 'any' || e.type === type).slice(0, limit)
      return { status: 200, body: { data: page, has_more: false }, records: page.length }
    }
    default:
      return problem(404, 'not_found', 'Unknown endpoint')
  }
}

function parseBody(text: string): { ok: true; body: Record<string, unknown> } | { ok: false; outcome: Outcome } {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, outcome: problem(422, 'invalid_json', 'The request body must be valid JSON') }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return { ok: false, outcome: problem(422, 'invalid_json', 'The request body must be a JSON object') }
  return { ok: true, body: parsed as Record<string, unknown> }
}

/** The fixture's latency: a base plus a little per record returned, and a little more for a write. */
export const latencyMs = (endpoint: Endpoint, records: number): number => 30 + 2 * records + (endpoint.method === 'POST' ? 12 : 0)

// ---- SDK snippets -----------------------------------------------------------------------------------------------------------------------------

/** The URL a request goes to: path parameters filled in, the others as a query string (defaults left out). */
export function urlOf(baseUrl: string, endpoint: Endpoint, inputs: Inputs): string {
  let path = endpoint.path
  const query: string[] = []
  for (const param of endpoint.params) {
    const value = inputs.params[param.name] ?? param.default
    if (param.in === 'path') path = path.replace(`{${param.name}}`, encodeURIComponent(value))
    else if (value !== '' && value !== param.default) query.push(`${param.name}=${encodeURIComponent(value)}`)
  }
  return `${baseUrl}${path}${query.length === 0 ? '' : `?${query.join('&')}`}`
}

/** A ready-to-paste SDK example for the endpoint with the values typed so far. */
export function snippetOf(language: Language, baseUrl: string, endpoint: Endpoint, inputs: Inputs): string {
  const url = urlOf(baseUrl, endpoint, inputs)
  const post = endpoint.method === 'POST'
  let body = inputs.body
  try {
    body = JSON.stringify(JSON.parse(inputs.body))
  } catch {
    // The snippet shows what was typed, even when it is not valid JSON yet.
  }
  if (language === 'JavaScript')
    return post
      ? `const response = await fetch(\n  '${url}',\n  {\n    method: 'POST',\n    headers: { Authorization: \`Bearer \${token}\`, 'Content-Type': 'application/json' },\n    body: JSON.stringify(${body}),\n  }\n);\nconst result = await response.json();`
      : `const response = await fetch(\n  '${url}',\n  { headers: { Authorization: \`Bearer \${token}\` } }\n);\nconst result = await response.json();`
  if (language === 'Python')
    return post
      ? `import requests\nresponse = requests.post(\n    '${url}',\n    headers={'Authorization': f'Bearer {token}'},\n    json=${body.replaceAll('true', 'True').replaceAll('false', 'False').replaceAll('null', 'None')},\n)\nresult = response.json()`
      : `import requests\nresponse = requests.get(\n    '${url}',\n    headers={'Authorization': f'Bearer {token}'}\n)\nresult = response.json()`
  return post
    ? `payload := strings.NewReader(\`${body}\`)\nreq, _ := http.NewRequest(\n  "POST", "${url}", payload,\n)\nreq.Header.Set("Authorization", "Bearer "+token)\nreq.Header.Set("Content-Type", "application/json")\nresp, _ := http.DefaultClient.Do(req)`
    : `req, _ := http.NewRequest(\n  "GET", "${url}", nil,\n)\nreq.Header.Set("Authorization", "Bearer "+token)\nresp, _ := http.DefaultClient.Do(req)`
}

/** `<id>` of the request: counts up in hexadecimal from the mockup's `req_demo_18a2`. */
export const requestIdOf = (n: number): string => `req_demo_${(0x18a2 + n).toString(16)}`
