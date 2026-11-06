/**
 * Clearpath Audit's domain: a sample audit of a sample page. Findings (issues) have a severity, the component they affect, a description and a suggested
 * fix, and can be resolved or queued for the next design review; the preview has three view settings; each re-run of the local checklist records a
 * heuristic score. Pure functions and plain data; the {@link Audit} in audit.ts applies them to the saved state.
 *
 * This is a triage concept, not a conformance check: passing the sample checks proves nothing about WCAG compliance, so no criterion numbers are
 * claimed, and nothing here infers anything about a person.
 */

export class AuditError extends Error {
  override readonly name = 'AuditError'
  readonly code: 'invalid' | 'not-found' | 'conflict'
  constructor(code: 'invalid' | 'not-found' | 'conflict', message: string) {
    super(message)
    this.code = code
  }
}

export type Severity = 'high' | 'medium' | 'low'
export type Target = 'cta' | 'nav' | 'illustration' | 'outline'
export type Setting = 'contrast' | 'large' | 'focus'

export const SEVERITIES: Readonly<Record<Severity, { label: string; tag: string; weight: number; short: string }>> = {
  high: { label: 'High', tag: 'HIGH PRIORITY', weight: 10, short: 'High' },
  medium: { label: 'Medium', tag: 'MEDIUM PRIORITY', weight: 5, short: 'Med' },
  low: { label: 'Low', tag: 'LOW PRIORITY', weight: 2, short: 'Low' },
}

export const SETTINGS: Readonly<Record<Setting, string>> = { contrast: '◐ High contrast preview', large: 'A+ Larger text', focus: '◎ Show focus outlines' }

export interface Issue {
  readonly id: string
  readonly title: string
  readonly severity: Severity
  /** `Hero / Primary action`: the component in the sample page this finding is about. */
  readonly component: string
  readonly target: Target
  readonly description: string
  readonly fix: string
  readonly resolved: boolean
  /** Added to the next design review. */
  readonly queued: boolean
  /** When it was marked resolved, if it is. */
  readonly resolvedAt?: string
}

export interface Run {
  readonly id: string
  readonly at: string
  readonly score: number
  readonly open: number
  readonly resolved: number
  readonly summary: string
}

export interface AuditState {
  readonly version: 1
  readonly product: string
  readonly release: string
  readonly page: string
  readonly issues: readonly Issue[]
  readonly preview: Readonly<Record<Setting, boolean>>
  readonly runs: readonly Run[]
}

export const MAX_RUNS = 30

/** 100 minus a weight for every open finding; a heuristic for the demo, not a conformance score. */
export const scoreOf = (issues: readonly Issue[]): number => Math.max(0, 100 - issues.filter((i) => !i.resolved).reduce((n, i) => n + SEVERITIES[i.severity].weight, 0))

const channel = (v: number): number => {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

export function luminance(hex: string): number {
  const n = Number.parseInt(hex.replace('#', ''), 16)
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}

/** The contrast ratio of two colours, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

/** The sample page's primary button colours before and after the fix. */
export const BUTTON = { before: { bg: '#b8c4b8', fg: '#f2f5f1' }, after: { bg: '#1f4d3a', fg: '#ffffff' } } as const
export const MIN_TEXT_CONTRAST = 4.5

/** What was measured for a finding in the sample page (illustrative, from the preview's own colours and markup). */
export function measure(issue: Issue): string {
  switch (issue.target) {
    case 'cta': {
      const c = issue.resolved ? BUTTON.after : BUTTON.before
      const r = contrastRatio(c.bg, c.fg)
      return `Measured ${r.toFixed(1)}:1 for the button text; ${r >= MIN_TEXT_CONTRAST ? 'meets' : 'below'} the ${String(MIN_TEXT_CONTRAST)}:1 used for normal text in this sample.`
    }
    case 'nav':
      return issue.resolved ? 'The menu link shows a 2 px outline when focused.' : 'No visible outline when the menu link is focused.'
    case 'illustration':
      return issue.resolved ? 'The illustration has a text alternative.' : 'The illustration has no text alternative and is not marked decorative.'
    case 'outline':
      return issue.resolved ? 'Outline: h1 → h2 → h2.' : 'Outline: h1 → h3 (skips h2).'
  }
}

export interface Summary {
  readonly open: number
  readonly resolved: number
  readonly queued: number
}

export function summarize(issues: readonly Issue[]): Summary {
  return { open: issues.filter((i) => !i.resolved).length, resolved: issues.filter((i) => i.resolved).length, queued: issues.filter((i) => i.queued).length }
}

export function runSummary(score: number, previous: number | undefined, s: Summary): string {
  const delta = previous === undefined ? '' : score === previous ? ' (no change since the last run)' : ` (${score > previous ? '+' : '−'}${String(Math.abs(score - previous))} since the last run)`
  return `Sample checks re-run: score ${String(score)}${delta}; ${String(s.open)} open, ${String(s.resolved)} resolved. This is not a compliance certificate.`
}

/** `4 minutes ago`. */
export function ago(iso: string, now: Date): string {
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${String(minutes)} ${minutes === 1 ? 'minute' : 'minutes'} ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${String(hours)} ${hours === 1 ? 'hour' : 'hours'} ago`
  const days = Math.round(hours / 24)
  return `${String(days)} ${days === 1 ? 'day' : 'days'} ago`
}
