/**
 * The notebook's types and pure rules: notebooks, experiments, measurements, observations, attachments and unit conversion. Nothing here touches the
 * disk, the clock or the router. Observations and measurements are append-only: the domain has no operation that rewrites one.
 */
export type Unit = 'MPa' | 'bar' | 'psi'

export const UNITS: readonly Unit[] = ['MPa', 'bar', 'psi']

/** Exact conversion factors: 1 MPa = 10 bar = 145.0377377 psi. */
const TO_MPA: Record<Unit, number> = { MPa: 1, bar: 0.1, psi: 1 / 145.0377377 }

export type ExperimentStatus = 'in-progress' | 'complete' | 'planned'

export interface Instrument {
  readonly id: string
  readonly name: string
  readonly location: string
}

export interface Notebook {
  readonly id: string
  readonly code: string
  readonly title: string
  readonly project: string
  readonly ownerId: string
}

export interface Experiment {
  readonly id: string
  readonly notebookId: string
  readonly code: string
  readonly number: number
  readonly title: string
  /** The study question shown at the top of the record. */
  readonly question: string
  readonly objective: string
  readonly method: string
  readonly protocolVersion: string
  readonly startedAt: string
  readonly status: ExperimentStatus
  readonly instrumentId: string
  readonly location: string
  readonly sampleSeries: string
}

export interface Measurement {
  readonly id: string
  readonly experimentId: string
  /** A single specimen, or the formulation's series average. */
  readonly kind: 'sample' | 'average'
  readonly sampleId: string
  /** A, B, C for the seed's three formulations. */
  readonly formulation: string
  readonly parameter: string
  readonly value: number
  readonly unit: Unit
  readonly measuredAt: string
}

export interface Observation {
  readonly id: string
  readonly experimentId: string
  readonly authorId: string
  readonly author: string
  readonly body: string
  readonly createdAt: string
}

export type AttachmentKind = 'image' | 'csv' | 'document'

export interface Attachment {
  readonly id: string
  readonly experimentId: string
  readonly filename: string
  readonly mimeType: string
  readonly sizeBytes: number
  readonly kind: AttachmentKind
  readonly addedAt: string
}

export interface AuditEvent {
  readonly id: string
  readonly experimentId: string
  readonly actor: string
  readonly action: string
  readonly at: string
}

export interface LabState {
  readonly version: 1
  notebooks: Notebook[]
  experiments: Experiment[]
  measurements: Measurement[]
  observations: Observation[]
  attachments: Attachment[]
  instruments: Instrument[]
  audit: AuditEvent[]
}

export type LabErrorCode = 'invalid' | 'not-found' | 'storage'

export class LabError extends Error {
  readonly code: LabErrorCode
  constructor(code: LabErrorCode, message: string) {
    super(message)
    this.code = code
    this.name = 'LabError'
  }
}

export function stampOf(date: Date): string {
  return date.toISOString()
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** `02 Nov 2026`, in UTC. */
export function dateText(stamp: string): string {
  const date = new Date(stamp)
  return `${String(date.getUTCDate()).padStart(2, '0')} ${MONTHS[date.getUTCMonth()] ?? ''} ${String(date.getUTCFullYear())}`
}

/** `04 NOV 2026 · 13:42`, in UTC. */
export function stampText(stamp: string): string {
  const date = new Date(stamp)
  return `${dateText(stamp).toUpperCase()} · ${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`
}

/** Convert a value between the three supported units with the exact factors. */
export function convert(value: number, from: Unit, to: Unit): number {
  return (value * TO_MPA[from]) / TO_MPA[to]
}

/** Thousands grouped with commas, at most two decimals, trailing zeros removed (`8,469.8`, `42.6`, `1,200`). */
export function formatNumber(value: number): string {
  const rounded = Math.round(value * 100) / 100
  const [whole, fraction] = Math.abs(rounded).toFixed(2).split('.') as [string, string]
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const decimals = fraction.replace(/0+$/, '')
  const sign = rounded < 0 ? '-' : ''
  return `${sign}${grouped}${decimals === '' ? '' : `.${decimals}`}`
}

export function sizeText(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`
  return `${String(Math.max(1, Math.round(bytes / 1_000)))} KB`
}

export function cleanUnit(value: unknown): Unit {
  if (value === 'MPa' || value === 'bar' || value === 'psi') return value
  throw new LabError('invalid', 'Choose MPa, bar or psi.')
}

export function cleanNotebookCode(value: unknown): string {
  const text = typeof value === 'string' ? value.trim().toUpperCase() : ''
  if (!/^[A-Z]-\d{3}$/.test(text)) throw new LabError('invalid', 'A notebook code looks like M-042.')
  return text
}

export function cleanNotebookTitle(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') throw new LabError('invalid', 'The notebook title is required.')
  return value.trim().slice(0, 80)
}

export function cleanExperimentTitle(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') throw new LabError('invalid', 'The experiment title is required.')
  return value.trim().slice(0, 100)
}

export function cleanObjective(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length < 20) throw new LabError('invalid', 'The objective needs at least 20 characters.')
  return value.trim().slice(0, 800)
}

export function cleanMethod(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length < 20) throw new LabError('invalid', 'The method needs at least 20 characters.')
  return value.trim().slice(0, 1_200)
}

export function cleanProtocol(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!/^v\d+\.\d+$/.test(text)) throw new LabError('invalid', 'The protocol version looks like v1.3.')
  return text
}

export function cleanObservationBody(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') throw new LabError('invalid', 'An observation needs some text.')
  const text = value.trim()
  if (text.length > 1_000) throw new LabError('invalid', 'An observation is limited to 1,000 characters.')
  return text
}

export function cleanSampleId(value: unknown): string {
  const text = typeof value === 'string' ? value.trim().toUpperCase() : ''
  if (!/^[A-Z]-\d{2}$/.test(text)) throw new LabError('invalid', 'A sample id looks like A-01.')
  return text
}

export function cleanFormulation(value: unknown): string {
  const text = typeof value === 'string' ? value.trim().toUpperCase() : ''
  if (!/^[A-Z]$/.test(text)) throw new LabError('invalid', 'A formulation is one letter, such as A.')
  return text
}

export function cleanParameter(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') throw new LabError('invalid', 'The parameter is required.')
  return value.trim().slice(0, 60)
}

export function cleanValue(value: unknown): number {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0 || number > 10_000) throw new LabError('invalid', 'The value must be a positive number below 10,000.')
  return Math.round(number * 10_000) / 10_000
}

export function cleanFilename(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : ''
  if (text === '' || text.length > 120) throw new LabError('invalid', 'The attachment needs a file name of at most 120 characters.')
  if (/[\\/]/.test(text)) throw new LabError('invalid', 'A file name cannot contain a folder.')
  if (!/\.[a-z0-9]{1,5}$/i.test(text)) throw new LabError('invalid', 'The file name needs an extension.')
  return text
}

export function cleanMimeType(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!/^(image\/(png|jpeg|webp)|text\/csv|application\/pdf)$/i.test(text))
    throw new LabError('invalid', 'Use an image, a CSV or a PDF.')
  return text.toLowerCase()
}

export function cleanSize(value: unknown): number {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0 || number > 50_000_000) throw new LabError('invalid', 'The file size must be between 1 byte and 50 MB.')
  return Math.round(number)
}

export function kindOf(mimeType: string): AttachmentKind {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType === 'text/csv') return 'csv'
  return 'document'
}

export function nextExperimentNumber(experiments: readonly Experiment[]): number {
  return experiments.reduce((max, experiment) => Math.max(max, experiment.number), 0) + 1
}
