/** Vulnerability Tracker's types and pure rules: assets, findings, remediation events and the counts the console shows. */
export type Severity = 'critical' | 'high' | 'medium' | 'low'
export type FindingStatus = 'open' | 'assigned' | 'in_progress' | 'remediated' | 'accepted'
export const SEVERITIES: readonly Severity[] = ['critical', 'high', 'medium', 'low']
export const STATUSES: readonly FindingStatus[] = ['open', 'assigned', 'in_progress', 'remediated', 'accepted']
export const OPEN_STATUSES: readonly FindingStatus[] = ['open', 'assigned', 'in_progress']
const SEVERITY_RANK: Readonly<Record<Severity, number>> = { critical: 0, high: 1, medium: 2, low: 3 }

export interface Asset {
  readonly id: string
  readonly name: string
  readonly environment: string
  readonly platform: string
  readonly owner: string
  readonly criticality: 'high' | 'medium' | 'low'
}

export interface Finding {
  readonly id: string
  readonly cve: string
  readonly title: string
  readonly assetId: string
  readonly severity: Severity
  readonly cvss: number
  readonly affectedVersion: string
  readonly fixedVersion: string
  readonly dueDate: string
  readonly status: FindingStatus
  readonly ownerId?: string
  readonly evidence: string
  readonly remediationNotes: string
  readonly createdAt: string
  readonly checklist: readonly { readonly label: string; readonly done: boolean }[]
}

export interface RemediationEvent {
  readonly id: string
  readonly findingId: string
  readonly actor: string
  readonly action: string
  readonly timestamp: string
  readonly note: string
}

export interface VulnState {
  readonly version: 1
  assets: Asset[]
  findings: Finding[]
  events: RemediationEvent[]
}

export type VulnsErrorCode = 'invalid' | 'not-found' | 'conflict'
export class VulnsError extends Error {
  readonly code: VulnsErrorCode
  constructor(code: VulnsErrorCode, message: string) {
    super(message)
    this.code = code
    this.name = 'VulnsError'
  }
}

const pad = (n: number): string => String(n).padStart(2, '0')
export const dayOf = (date: Date): string => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
export const stampOf = (date: Date): string => `${dayOf(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`

/** `07 Nov` from `2026-11-07`. */
export function shortDate(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

export function whenText(stamp: string, now: Date): string {
  const then = new Date(stamp)
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  if (hours < 48) return 'Yesterday'
  return then.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

/** `04 NOV 2026 · 13:42`, in UTC. */
export function stampText(stamp: string): string {
  const date = new Date(stamp)
  const day = `${String(date.getUTCDate()).padStart(2, '0')} ${['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][date.getUTCMonth()]} ${String(date.getUTCFullYear())}`
  return `${day} · ${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`
}

/** The severity a CVSS score maps to. */
export function severityOf(cvss: number): Severity {
  if (cvss >= 9) return 'critical'
  if (cvss >= 7) return 'high'
  if (cvss >= 4) return 'medium'
  return 'low'
}

export const isOpen = (status: FindingStatus): boolean => OPEN_STATUSES.includes(status)
export const severityRank = (severity: Severity): number => SEVERITY_RANK[severity]

/** The owners in use, unique and sorted. */
export function ownersOf(state: VulnState): string[] {
  return [...new Set(state.assets.map((asset) => asset.owner))].sort()
}

export interface FindingFilter {
  readonly severity?: Severity
  readonly status?: FindingStatus
  readonly q?: string
  readonly assetId?: string
}

/** Findings matching the filter, by severity then CVSS, highest first. */
export function filterFindings(state: VulnState, filter: FindingFilter = {}): Finding[] {
  const q = (filter.q ?? '').trim().toLowerCase()
  return state.findings
    .filter((finding) => filter.severity === undefined || finding.severity === filter.severity)
    .filter((finding) => filter.status === undefined || finding.status === filter.status)
    .filter((finding) => filter.assetId === undefined || finding.assetId === filter.assetId)
    .filter((finding) => q === '' || [finding.cve, finding.title, ...state.assets.filter((asset) => asset.id === finding.assetId).map((asset) => asset.name)].join(' ').toLowerCase().includes(q))
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || b.cvss - a.cvss)
}

export interface VulnStats {
  readonly open: number
  readonly critical: number
  readonly fixedThisMonth: number
  readonly assetsAtRisk: number
  readonly trackedAssets: number
  readonly openedThisWeek: number
  readonly overdue: number
  readonly previousMonthFixed: number
  readonly velocity: number
}

function previousMonth(month: string): string {
  const [year, number] = month.split('-').map((part) => Number.parseInt(part, 10)) as [number, number]
  return number === 1 ? `${String(year - 1)}-12` : `${String(year)}-${String(number - 1).padStart(2, '0')}`
}

export function statsOf(state: VulnState, month: string, now: Date): VulnStats {
  const open = state.findings.filter((finding) => isOpen(finding.status))
  const risky = new Set(open.filter((finding) => finding.severity === 'critical' || finding.severity === 'high').map((finding) => finding.assetId))
  const fixedIds = new Set(state.events.filter((event) => event.action === 'remediated' && event.timestamp.startsWith(month)).map((event) => event.findingId))
  const previousIds = new Set(state.events.filter((event) => event.action === 'remediated' && event.timestamp.startsWith(previousMonth(month))).map((event) => event.findingId))
  const today = now.toISOString().slice(0, 10)
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString()
  return {
    open: open.length,
    critical: open.filter((finding) => finding.severity === 'critical').length,
    fixedThisMonth: fixedIds.size,
    assetsAtRisk: risky.size,
    trackedAssets: state.assets.length,
    openedThisWeek: state.findings.filter((finding) => finding.createdAt >= weekAgo).length,
    overdue: open.filter((finding) => finding.dueDate < today).length,
    previousMonthFixed: previousIds.size,
    velocity: previousIds.size === 0 ? 0 : Math.round(((fixedIds.size - previousIds.size) / previousIds.size) * 100),
  }
}

/** A patch or scan reference: at least three characters, so "done" is not evidence. */
export function cleanEvidence(value: unknown): string {
  if (typeof value !== 'string') throw new VulnsError('invalid', 'The verification evidence is required.')
  const text = value.trim()
  if (text.length < 3) throw new VulnsError('invalid', 'Record the evidence (a patch, a test or a scan reference) before marking the finding remediated.')
  if (text.length > 500) throw new VulnsError('invalid', 'The evidence is longer than 500 characters.')
  return text
}
