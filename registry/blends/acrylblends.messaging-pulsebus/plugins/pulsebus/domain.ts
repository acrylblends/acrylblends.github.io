/**
 * Pulsebus's domain: topics with a payload schema, consumer groups, messages with their delivery state machine, the dead-letter queue and the checks
 * a synthetic event must pass. Pure functions and plain data; the {@link Bus} in bus.ts applies them to the saved state and the pages only read what
 * it returns.
 *
 * Everything is a local fixture: no broker is contacted and no message leaves the app.
 */

export type FieldType = 'string' | 'number' | 'boolean' | 'array'

export interface SchemaField {
  readonly name: string
  readonly type: FieldType
  readonly required: boolean
  /** The value the publish form pre-fills. */
  readonly example?: unknown
}

export interface Topic {
  readonly id: string
  readonly perHour: number
  readonly perMin: number
  readonly p95Ms: number
  readonly deliveryPercent: number
  readonly schemaVersion: number
  readonly fields: readonly SchemaField[]
  /** The consumer group whose deliveries the stream shows. */
  readonly groupId: string
}

export interface ConsumerGroup {
  readonly id: string
  readonly consumers: number
  /** The lag the group had before any message below went unacknowledged. */
  readonly baseLag: number
}

export type DeliveryState = 'acked' | 'retry' | 'dead'

export interface Message {
  readonly id: string
  readonly topicId: string
  readonly at: string
  readonly schemaVersion: number
  /** The event's `data` object. */
  readonly data: Readonly<Record<string, unknown>>
  readonly state: DeliveryState
  readonly attempts: number
  readonly lastError?: string
  readonly origin: 'fixture' | 'local'
  readonly replays: number
}

export interface BusState {
  readonly version: 1
  readonly workspace: string
  readonly region: string
  readonly topics: readonly Topic[]
  readonly groups: readonly ConsumerGroup[]
  readonly messages: readonly Message[]
}

export class BusError extends Error {
  override readonly name = 'BusError'
  readonly code: 'invalid' | 'not-found' | 'conflict'
  constructor(code: 'invalid' | 'not-found' | 'conflict', message: string) {
    super(message)
    this.code = code
  }
}

/** A message that fails this many deliveries goes to the dead-letter queue. */
export const MAX_ATTEMPTS = 3

export const STATE_LABEL: Readonly<Record<DeliveryState, string>> = { acked: 'ACKED', retry: 'RETRY', dead: 'DEAD' }

// ---- validation ------------------------------------------------------------------------------------------------------------------------------

const typeOf = (value: unknown): FieldType | 'null' | 'object' => (value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value === 'object' ? 'object' : (typeof value as FieldType))

/**
 * Parse a synthetic event's `data` and check it against the topic's schema: it must be a JSON object, every required field must be there, and a field
 * the schema names must have its type. Other fields are allowed; `"poison": true` makes the consumer reject the event on every delivery.
 */
export function validatePayload(topic: Topic, text: string): Record<string, unknown> {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    throw new BusError('invalid', `Payload must be valid JSON (${error instanceof Error ? error.message : 'parse error'}).`)
  }
  if (typeOf(parsed) !== 'object') throw new BusError('invalid', 'Payload must be a JSON object.')
  const data = parsed as Record<string, unknown>
  for (const field of topic.fields) {
    const value = data[field.name]
    if (value === undefined) {
      if (field.required) throw new BusError('invalid', `${topic.id} v${String(topic.schemaVersion)} requires “${field.name}” (${field.type}).`)
      continue
    }
    if (typeOf(value) !== field.type) throw new BusError('invalid', `“${field.name}” must be a ${field.type}, not ${typeOf(value)}.`)
  }
  if (data.poison !== undefined && typeof data.poison !== 'boolean') throw new BusError('invalid', '“poison” must be true or false.')
  if (JSON.stringify(data).length > 4000) throw new BusError('invalid', 'A payload is at most 4000 characters.')
  return data
}

// ---- delivery ---------------------------------------------------------------------------------------------------------------------------------

export interface Delivery {
  readonly state: DeliveryState
  readonly attempts: number
  readonly lastError?: string
}

/** One delivery attempt of a message: a poison event fails every time (and dies at {@link MAX_ATTEMPTS}); anything else is acknowledged. */
export function attemptDelivery(message: Pick<Message, 'data' | 'attempts'>, groupId: string): Delivery {
  const attempts = message.attempts + 1
  if (message.data.poison === true) {
    const lastError = `${groupId} rejected the event: poison flag set`
    return attempts >= MAX_ATTEMPTS ? { state: 'dead', attempts, lastError } : { state: 'retry', attempts, lastError }
  }
  return { state: 'acked', attempts }
}

/** A message still being retried is lag; a dead letter has left the consumer's queue and an acknowledged one is done. */
export const isUnacked = (m: Message): boolean => m.state === 'retry'

/** A group's lag: its base lag plus the messages being retried on the topics it consumes. */
export const lagOf = (group: ConsumerGroup, topics: readonly Topic[], messages: readonly Message[]): number =>
  group.baseLag + messages.filter((m) => isUnacked(m) && topics.find((t) => t.id === m.topicId)?.groupId === group.id).length

// ---- display ----------------------------------------------------------------------------------------------------------------------------------

/** `12.4k`, `420`, `3.4k`. */
export const compact = (n: number): string => (n >= 1000 ? `${String(Math.round(n / 100) / 10)}k` : String(n))

/** The line under a message id: its first two fields, `customer_` dropped: `order_id: ORD-2048 · region: AT`. */
export function summarize(data: Readonly<Record<string, unknown>>): string {
  return Object.entries(data)
    .filter(([k]) => k !== 'poison')
    .slice(0, 2)
    .map(([k, v]) => `${k.replace(/^customer_/, '')}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join(' · ')
}

/** The envelope the inspector shows: id, type, time and data. */
export function envelope(m: Message): Record<string, unknown> {
  return { event_id: m.id, type: m.topicId, occurred_at: m.at.replace(/\.\d{3}Z$/, 'Z'), data: m.data }
}

/** `10:42:18`, local time. */
export function clockOf(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** The id after the newest `evt_<hex>`: ids count up in hexadecimal. */
export function nextMessageId(messages: readonly Message[]): string {
  const highest = Math.max(0, ...messages.map((m) => /^evt_([0-9a-f]+)$/.exec(m.id)?.[1]).filter((h): h is string => h !== undefined).map((h) => parseInt(h, 16)))
  return `evt_${(highest + 1).toString(16)}`
}
