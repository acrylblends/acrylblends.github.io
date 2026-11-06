/**
 * Relaycraft's domain: connectors and their connections, pipelines of source, transform and destination steps, field mappings, the deterministic sample
 * records and the sync simulation that turns a pipeline into a run with processed, skipped and failed rows. Pure functions and plain data; the
 * {@link Studio} in studio.ts applies them to the saved state and the pages only read what it returns.
 *
 * No real system is contacted. A connection stores a credential *reference* (a name), never a secret.
 */

export type FieldType = 'string' | 'email' | 'phone' | 'text'

export interface Field {
  readonly name: string
  readonly type: FieldType
  readonly required?: boolean
}

export interface Connector {
  readonly id: string
  readonly name: string
  readonly letter: string
  readonly role: 'source' | 'destination'
  /** The destination's table, or the source's object. */
  readonly object: string
  readonly records: number
  readonly fields: readonly Field[]
  readonly connected: boolean
  /** A name that stands for the secret, kept elsewhere; never the secret itself. */
  readonly credentialRef: string
}

export type TransformId = 'none' | 'trim' | 'lowercase' | 'uppercase' | 'e164'

export const TRANSFORMS: Readonly<Record<TransformId, { label: string; types: readonly FieldType[] }>> = {
  none: { label: '—', types: ['string', 'email', 'phone', 'text'] },
  trim: { label: 'Trim whitespace', types: ['string', 'email', 'phone', 'text'] },
  lowercase: { label: 'Lowercase', types: ['string', 'email', 'text'] },
  uppercase: { label: 'Uppercase', types: ['string', 'text'] },
  e164: { label: 'Format E.164', types: ['phone'] },
}

export interface Mapping {
  readonly source: string
  readonly transform: TransformId
  readonly destination: string
}

export interface Pipeline {
  readonly id: string
  readonly name: string
  readonly sourceId: string
  readonly destinationId: string
  readonly mappings: readonly Mapping[]
  /** The draft version; saving bumps it. */
  readonly version: number
  readonly dirty: boolean
  readonly editedBy: string
  readonly editedAt: string
}

export interface RunLine {
  readonly at: string
  readonly level: 'ok' | 'warn' | 'err'
  readonly text: string
}

export interface RunIssue {
  readonly row: number
  readonly kind: 'skipped' | 'failed'
  readonly text: string
}

export interface SyncRun {
  readonly id: string
  readonly pipelineId: string
  readonly at: string
  readonly fetched: number
  readonly synced: number
  readonly skipped: number
  readonly failed: number
  readonly durationSec: number
  readonly lines: readonly RunLine[]
  readonly issues: readonly RunIssue[]
}

export interface StudioState {
  readonly version: 1
  readonly workspace: string
  readonly planLimit: number
  readonly connectors: readonly Connector[]
  readonly pipelines: readonly Pipeline[]
  readonly runs: readonly SyncRun[]
}

export class StudioError extends Error {
  override readonly name = 'StudioError'
  readonly code: 'invalid' | 'not-found' | 'conflict'
  constructor(code: 'invalid' | 'not-found' | 'conflict', message: string) {
    super(message)
    this.code = code
  }
}

// ---- sample records --------------------------------------------------------------------------------------------------------------------------

export type SampleRecord = Readonly<Record<string, string>>

const FIRST = ['Ada', 'Ben', 'Chloe', 'Dev', 'Elif', 'Farah', 'Gus', 'Hana', 'Ivo', 'Jade', 'Kofi', 'Lena']
const LAST = ['Reyes', 'Okafor', 'Martin', 'Patel', 'Demir', 'Haddad', 'Novak', 'Lindqvist', 'Moreau', 'Tanaka']
const COMPANY = ['Northwind', 'Contoso', 'Globex', 'Initech', 'Umbrella', 'Hooli', 'Stark & Co', 'Wayne Works']

/** Rows of the sample data that carry an invalid e-mail address (the ones a run skips). */
export const BAD_EMAIL_ROWS = [17, 64, 130, 201] as const

/** The deterministic rows a connector would serve: padded names, mixed-case e-mails, odd phone formats, a few invalid values. Row numbers start at 1. */
export function sampleRecords(connector: Pick<Connector, 'id' | 'records'>): SampleRecord[] {
  const rows: SampleRecord[] = []
  for (let n = 1; n <= connector.records; n += 1) {
    const i = n - 1
    const first = FIRST[i % FIRST.length] ?? 'Ada'
    const last = LAST[(i * 3) % LAST.length] ?? 'Reyes'
    const company = COMPANY[(i * 5) % COMPANY.length] ?? 'Northwind'
    let email = `${first}.${last}${n > 12 ? String(n) : ''}@${company.toLowerCase().replace(/[^a-z]/g, '')}.example`.toLowerCase()
    if (n % 5 === 0) email = email.toUpperCase()
    if ((BAD_EMAIL_ROWS as readonly number[]).includes(n)) email = email.replace('@', '')
    const phone = n % 11 === 0 ? '12' : n % 3 === 0 ? `0043 1 555 ${String(1000 + n)}` : `+43 1 555 ${String(1000 + n)}`
    const base = { first_name: n % 7 === 0 ? ` ${first} ` : first, last_name: last, email, company: n % 4 === 0 ? ` ${company}` : company, phone_number: phone, country: 'AT' }
    if (connector.id === 'stripe') rows.push({ customer_id: `cus_${String(n).padStart(4, '0')}`, name: `${first} ${last}`, email, currency: 'EUR' })
    else if (connector.id === 'csv') rows.push({ full_name: `${first} ${last}`, mail: email, organisation: company, tel: phone })
    else rows.push(base)
  }
  return rows
}

// ---- transforms and mappings ---------------------------------------------------------------------------------------------------------------

/** Apply a transform to a value; E.164 needs at least seven digits and returns undefined when it cannot. */
export function applyTransform(transform: TransformId, value: string): string | undefined {
  switch (transform) {
    case 'trim':
      return value.trim()
    case 'lowercase':
      return value.toLowerCase()
    case 'uppercase':
      return value.toUpperCase()
    case 'e164': {
      const digits = value.replace(/[^\d]/g, '')
      const national = value.trim().startsWith('00') ? digits.slice(2) : digits
      return national.length < 7 ? undefined : `+${national}`
    }
    default:
      return value
  }
}

export const isEmail = (v: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)

/** The names that stand for the same thing across systems, so "Suggest mappings" can pair fields. */
const SYNONYMS: readonly (readonly string[])[] = [
  ['first_name', 'given_name', 'firstname'],
  ['last_name', 'family_name', 'lastname', 'surname'],
  ['email', 'email_address', 'mail'],
  ['company', 'organization', 'organisation'],
  ['phone_number', 'phone', 'tel'],
  ['country', 'country_code'],
]

const transformFor = (type: FieldType): TransformId => (type === 'email' ? 'lowercase' : type === 'phone' ? 'e164' : type === 'string' ? 'trim' : 'none')

export function suggestMappings(source: Connector, destination: Connector): Mapping[] {
  const out: Mapping[] = []
  for (const group of SYNONYMS) {
    const s = source.fields.find((f) => group.includes(f.name))
    const d = destination.fields.find((f) => group.includes(f.name))
    if (s !== undefined && d !== undefined) out.push({ source: s.name, transform: transformFor(d.type), destination: d.name })
  }
  return out
}

export interface MappingCheck {
  readonly mapping: Mapping
  /** `mapped`, or `review` when the first sample rows hold values the transform would change but none is chosen. */
  readonly status: 'mapped' | 'review'
}

/** Whether each mapping is solid or needs a look: no transform, yet the sample rows have padding or empty values. */
export function checkMappings(pipeline: Pipeline, source: Connector): MappingCheck[] {
  const rows = sampleRecords({ id: source.id, records: Math.min(source.records, 40) })
  return pipeline.mappings.map((mapping) => {
    const values = rows.map((r) => r[mapping.source] ?? '')
    const messy = mapping.transform === 'none' && values.some((v) => v === '' || v !== v.trim())
    return { mapping, status: messy ? 'review' : 'mapped' }
  })
}

/** Destination fields the contract needs that no mapping fills. */
export const missingRequired = (pipeline: Pipeline, destination: Connector): string[] =>
  destination.fields.filter((f) => f.required === true && !pipeline.mappings.some((m) => m.destination === f.name)).map((f) => f.name)

/** The first sample rows as the destination would receive them, and the source fields no mapping uses. */
export function preview(pipeline: Pipeline, source: Connector, limit = 4): { rows: Record<string, string>[]; unmapped: string[] } {
  const rows = sampleRecords({ id: source.id, records: Math.min(source.records, limit) }).map((record) => {
    const out: Record<string, string> = {}
    for (const m of pipeline.mappings) out[m.destination] = applyTransform(m.transform, record[m.source] ?? '') ?? '⚠ cannot format'
    return out
  })
  return { rows, unmapped: source.fields.map((f) => f.name).filter((n) => !pipeline.mappings.some((m) => m.source === n)) }
}

// ---- the sync simulation ---------------------------------------------------------------------------------------------------------------------

export interface Simulation {
  readonly fetched: number
  readonly synced: number
  readonly skipped: number
  readonly failed: number
  readonly durationSec: number
  readonly issues: RunIssue[]
}

/** Run every source row through the mappings: an invalid e-mail skips the row, a value a transform cannot format fails it, the rest are synced. */
export function simulate(pipeline: Pipeline, source: Connector, destination: Connector): Simulation {
  const issues: RunIssue[] = []
  let synced = 0
  let skipped = 0
  let failed = 0
  const records = sampleRecords(source)
  records.forEach((record, i) => {
    const row = i + 1
    let state: 'ok' | 'skipped' | 'failed' = 'ok'
    for (const m of pipeline.mappings) {
      const out = applyTransform(m.transform, record[m.source] ?? '')
      const field = destination.fields.find((f) => f.name === m.destination)
      if (out === undefined) {
        state = 'failed'
        issues.push({ row, kind: 'failed', text: `${m.destination}: “${record[m.source] ?? ''}” cannot be formatted as E.164` })
        break
      }
      if (field?.type === 'email' && !isEmail(out)) {
        state = 'skipped'
        issues.push({ row, kind: 'skipped', text: `${m.destination}: “${out}” is not a valid e-mail address` })
        break
      }
    }
    if (state === 'ok') synced += 1
    else if (state === 'skipped') skipped += 1
    else failed += 1
  })
  return { fetched: records.length, synced, skipped, failed, durationSec: Math.round((1.2 + records.length / 120) * 10) / 10, issues }
}

export const runStatus = (r: Pick<SyncRun, 'failed' | 'skipped'>): 'Failed' | 'Warnings' | 'Success' => (r.failed > 0 ? 'Failed' : r.skipped > 0 ? 'Warnings' : 'Success')

export function clockOf(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** `8 min ago`, `just now`, `2 h ago`, `3 days ago`. */
export function ago(iso: string, now: Date): string {
  const minutes = Math.round((now.getTime() - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${String(minutes)} min ago`
  if (minutes < 1440) return `${String(Math.round(minutes / 60))} h ago`
  return `${String(Math.round(minutes / 1440))} days ago`
}
