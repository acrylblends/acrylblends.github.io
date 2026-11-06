/** The audit a person sees on the first start: Northstar App's release candidate with the mockup's four findings and a first run scoring 78. */
import { type AuditState, type Issue, scoreOf, summarize, runSummary } from './domain.ts'

const issues: Issue[] = [
  { id: 'contrast', title: 'Low text contrast', severity: 'high', component: 'Hero / Primary action', target: 'cta', resolved: false, queued: false, description: 'The primary action uses a muted foreground on a muted background. Verify text contrast for the actual rendered state.', fix: 'Use a darker foreground or a stronger button fill. Re-check all interactive states and hover/focus treatments.' },
  { id: 'focus', title: 'Focus indicator missing', severity: 'medium', component: 'Navigation / Menu link', target: 'nav', resolved: false, queued: false, description: 'The selected navigation item does not show a clear keyboard focus state in the sample preview.', fix: 'Define a visible focus ring with sufficient contrast and preserve it for keyboard navigation.' },
  { id: 'alt', title: 'Image text alternative', severity: 'medium', component: 'Feature card / Illustration', target: 'illustration', resolved: false, queued: false, description: 'A feature illustration needs a meaningful text alternative or should be marked decorative.', fix: 'Provide concise alt text that communicates the image purpose, or use an empty alternative for decorative imagery.' },
  { id: 'heading', title: 'Heading hierarchy', severity: 'low', component: 'Page / Section outline', target: 'outline', resolved: false, queued: false, description: 'The page outline should use a logical heading sequence with no skipped levels.', fix: 'Use one page-level heading and nest section headings in a meaningful order.' },
]

export function seed(now: Date): AuditState {
  const score = scoreOf(issues)
  const s = summarize(issues)
  return {
    version: 1,
    product: 'Northstar App',
    release: 'Release candidate 0.9',
    page: 'northstar.app',
    issues,
    preview: { contrast: false, large: false, focus: false },
    runs: [{ id: 'run-seed', at: new Date(now.getTime() - 25 * 60_000).toISOString(), score, open: s.open, resolved: s.resolved, summary: runSummary(score, undefined, s) }],
  }
}
