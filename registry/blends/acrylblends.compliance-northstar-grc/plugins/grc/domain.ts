/**
 * Northstar GRC's domain: a control library over three frameworks, the evidence collected for each control (with provenance, collection and review dates and a
 * retention class), a risk register with inherent and residual scores and a treatment, audit actions, and the audit trail. Pure functions and plain data; the
 * {@link Grc} in grc.ts applies them to the saved state and the pages only read what they return.
 *
 * Everything is an illustrative, synthetic catalogue: it claims no certification or legal compliance and holds no real personal data or evidence.
 */

export class GrcError extends Error {
  override readonly name = 'GrcError'
  readonly code: 'invalid' | 'not-found' | 'conflict'
  constructor(code: 'invalid' | 'not-found' | 'conflict', message: string) {
    super(message)
    this.code = code
  }
}

export type EvidenceState = 'pending' | 'accepted' | 'refresh-requested'
export type ControlStatus = 'Current' | 'Review' | 'Exception'
export type TreatmentAction = 'mitigate' | 'accept' | 'transfer' | 'avoid'
export type RiskStatus = 'open' | 'accepted' | 'closed'
export type Rating = 'High' | 'Medium' | 'Low'

export interface EvidenceItem {
  readonly id: string
  readonly title: string
  readonly provenance: string
  readonly collectedAt: string
  readonly reviewedAt?: string
  readonly reviewer?: string
  readonly retention: '1 year' | '3 years' | '7 years'
  readonly description: string
  readonly state: EvidenceState
}

export interface Control {
  readonly id: string
  readonly title: string
  readonly owner: string
  readonly framework: string
  readonly exception?: { readonly reason: string; readonly at: string; readonly by: string }
  readonly evidence: readonly EvidenceItem[]
}

export interface Treatment {
  readonly action: TreatmentAction
  readonly note: string
  /** Residual likelihood and impact, 1 to 5, after the treatment. */
  readonly likelihood: number
  readonly impact: number
}

export interface Risk {
  readonly id: string
  readonly title: string
  readonly area: string
  readonly owner: string
  readonly likelihood: number
  readonly impact: number
  readonly treatment: Treatment
  readonly status: RiskStatus
}

export interface AuditAction {
  readonly id: string
  readonly text: string
  /** ISO date the action is due. */
  readonly due: string
  readonly controlId?: string
  /** A completed refresh action brings the refreshed evidence in as a new pending item. */
  readonly refresh?: { readonly controlId: string; readonly evidenceId: string }
  readonly done: boolean
}

export interface AuditEvent {
  readonly id: string
  readonly at: string
  readonly actor: string
  readonly kind: 'evidence' | 'exception' | 'risk' | 'action'
  readonly subject: string
  readonly text: string
}

export interface GrcState {
  readonly version: 1
  readonly org: string
  readonly year: string
  readonly frameworks: readonly string[]
  readonly controls: readonly Control[]
  readonly risks: readonly Risk[]
  readonly actions: readonly AuditAction[]
  readonly events: readonly AuditEvent[]
}

export const ME = 'R. Ortiz'
export const FRESH_DAYS = 90
export const MAX_RISKS = 12
export const MAX_EVENTS = 100
export const HIGH = 15
export const MEDIUM = 8

export const TREATMENTS: Readonly<Record<TreatmentAction, string>> = { mitigate: 'Mitigate', accept: 'Accept', transfer: 'Transfer', avoid: 'Avoid' }

const DAY = 86_400_000
export const daysBetween = (fromIso: string, to: Date): number => Math.floor((to.getTime() - new Date(fromIso).getTime()) / DAY)

export const score = (likelihood: number, impact: number): number => likelihood * impact
export const rating = (s: number): Rating => (s >= HIGH ? 'High' : s >= MEDIUM ? 'Medium' : 'Low')
export const inherentOf = (r: Risk): number => score(r.likelihood, r.impact)
export const residualOf = (r: Risk): number => score(r.treatment.likelihood, r.treatment.impact)

/** Collected within the freshness window. */
export const isFresh = (e: EvidenceItem, now: Date): boolean => daysBetween(e.collectedAt, now) <= FRESH_DAYS

/** The newest evidence item of a control, by collection date. */
export const latestEvidence = (c: Control): EvidenceItem | undefined => [...c.evidence].sort((a, b) => b.collectedAt.localeCompare(a.collectedAt))[0]

/** Exception beats everything; otherwise Current needs the newest evidence accepted and fresh, anything else needs review. */
export function statusOf(c: Control, now: Date): ControlStatus {
  if (c.exception !== undefined) return 'Exception'
  const e = latestEvidence(c)
  return e !== undefined && e.state === 'accepted' && isFresh(e, now) ? 'Current' : 'Review'
}

export interface Posture {
  readonly coverage: number
  readonly controls: number
  readonly current: number
  readonly evidenceCurrent: number
  readonly evidenceTotal: number
  readonly needAttention: number
  readonly openRisks: number
  readonly highResidual: number
  readonly actions: number
  readonly dueThisWeek: number
}

export function posture(s: GrcState, now: Date): Posture {
  const current = s.controls.filter((c) => statusOf(c, now) === 'Current').length
  const evidence = s.controls.flatMap((c) => c.evidence)
  const evidenceCurrent = evidence.filter((e) => e.state === 'accepted' && isFresh(e, now)).length
  const open = s.risks.filter((r) => r.status === 'open')
  const actions = s.actions.filter((a) => !a.done)
  return {
    coverage: s.controls.length === 0 ? 0 : Math.round((current / s.controls.length) * 100),
    controls: s.controls.length,
    current,
    evidenceCurrent,
    evidenceTotal: evidence.length,
    needAttention: evidence.length - evidenceCurrent,
    openRisks: open.length,
    highResidual: open.filter((r) => residualOf(r) >= HIGH).length,
    actions: actions.length,
    dueThisWeek: actions.filter((a) => new Date(a.due).getTime() - now.getTime() <= 7 * DAY).length,
  }
}

export interface ControlFilter {
  readonly framework?: string | undefined
  readonly owner?: string | undefined
  readonly status?: string | undefined
}

export function filterControls(s: GrcState, f: ControlFilter, now: Date): Control[] {
  return s.controls.filter((c) => (f.framework === undefined || f.framework === 'all' || c.framework === f.framework) && (f.owner === undefined || f.owner === 'all' || c.owner === f.owner) && (f.status === undefined || f.status === 'all' || statusOf(c, now) === f.status))
}

/** Parse a likelihood or impact: a whole number from 1 to 5. */
export function parseLevel(raw: string | undefined, label: string): number {
  const n = Number((raw ?? '').trim())
  if (!Number.isInteger(n) || n < 1 || n > 5) throw new GrcError('invalid', `${label} must be a whole number from 1 to 5.`)
  return n
}

export const dateLabel = (iso: string): string => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

export function dueLabel(iso: string, now: Date): string {
  const days = Math.ceil((new Date(iso).getTime() - now.getTime()) / DAY)
  return days < 0 ? `${String(-days)} ${days === -1 ? 'day' : 'days'} overdue` : days === 0 ? 'due today' : days === 1 ? 'due tomorrow' : `due in ${String(days)} days`
}

export function agoLabel(iso: string, now: Date): string {
  const d = daysBetween(iso, now)
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${String(d)} days ago`
}

/** The Markdown of a review: posture figures, the control register, the risk register and the open audit actions. Synthetic data only. */
export function reviewMarkdown(s: GrcState, now: Date): string {
  const p = posture(s, now)
  const lines = [
    `# ${s.org} control assurance review · ${s.year}`,
    '',
    '> Illustrative demo data. This is not a certification or a statement of legal compliance.',
    '',
    '## Posture',
    `- Control coverage: ${String(p.coverage)}% (${String(p.current)} of ${String(p.controls)} controls current)`,
    `- Evidence current: ${String(p.evidenceCurrent)} / ${String(p.evidenceTotal)}`,
    `- Open risks: ${String(p.openRisks)} (${String(p.highResidual)} with a high residual score)`,
    `- Open audit actions: ${String(p.actions)} (${String(p.dueThisWeek)} due this week)`,
    '',
    '## Controls',
    ...s.controls.map((c) => `- ${c.id} ${c.title} · ${c.framework} · ${c.owner} · ${statusOf(c, now)}${c.exception === undefined ? '' : ` (exception: ${c.exception.reason})`}`),
    '',
    '## Risks',
    ...s.risks.map((r) => `- ${r.title} (${r.area}) · inherent ${String(inherentOf(r))} → residual ${String(residualOf(r))} ${rating(residualOf(r))} · ${TREATMENTS[r.treatment.action]} · ${r.status}`),
    '',
    '## Open audit actions',
    ...s.actions.filter((a) => !a.done).map((a) => `- ${a.text} · ${dueLabel(a.due, now)}`),
    '',
  ]
  return lines.join('\n')
}
