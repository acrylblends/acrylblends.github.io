/** The workspace a person sees on the first start: eight synthetic controls over ISO 27001, SOC 2 and Privacy, five risks and the open audit actions, for FY2026. */
import type { AuditAction, AuditEvent, Control, EvidenceItem, GrcState, Risk } from './domain.ts'

const d = (m: number, day: number): string => new Date(2026, m - 1, day, 9, 0).toISOString()
const ev = (id: string, title: string, provenance: string, collected: string, state: EvidenceItem['state'], description: string, retention: EvidenceItem['retention'] = '3 years', reviewer?: string, reviewed?: string): EvidenceItem => ({ id, title, provenance, collectedAt: collected, retention, description, state, ...(reviewer === undefined ? {} : { reviewer, reviewedAt: reviewed ?? collected }) })

const controls: Control[] = [
  { id: 'IAM-04', title: 'Access reviews', owner: 'J. Weber', framework: 'ISO 27001', evidence: [ev('e1', 'Quarterly access attestation', 'Uploaded by J. Weber', d(10, 14), 'accepted', 'Signed sample report · 97 of 97 accounts reviewed.', '3 years', 'P. Nair', d(10, 16))] },
  { id: 'CC8.1', title: 'Change approvals', owner: 'M. Chen', framework: 'SOC 2', evidence: [ev('e2', 'Change approval sample', 'Exported from the change tracker', d(10, 28), 'pending', 'Sample of 25 changes with approver and ticket references (synthetic).')] },
  { id: 'PRIV-12', title: 'Retention schedule', owner: 'A. Singh', framework: 'Privacy', evidence: [ev('e3', 'Retention schedule v4', 'Uploaded by A. Singh', d(9, 30), 'accepted', 'Schedule of record classes and retention periods (synthetic).', '7 years', 'P. Nair', d(10, 2))] },
  { id: 'SUP-07', title: 'Supplier review', owner: 'L. Novak', framework: 'ISO 27001', exception: { reason: 'Annual vendor assessment is overdue; a compensating quarterly review is agreed.', at: d(10, 20), by: 'P. Nair' }, evidence: [ev('e4', 'Vendor assessment 2025', 'Uploaded by L. Novak', d(6, 12), 'accepted', 'Prior-year assessment summary (synthetic).', '3 years', 'P. Nair', d(6, 14))] },
  { id: 'CC6.1', title: 'Logical access', owner: 'J. Weber', framework: 'SOC 2', evidence: [ev('e5', 'Access control configuration', 'Exported from the identity provider', d(10, 9), 'accepted', 'Role mapping and MFA policy export (synthetic).', '1 year', 'P. Nair', d(10, 11))] },
  { id: 'BCP-02', title: 'Recovery testing', owner: 'M. Chen', framework: 'ISO 27001', evidence: [ev('e6', 'Recovery drill report', 'Uploaded by M. Chen', d(9, 18), 'accepted', 'Tabletop recovery drill, results and follow-ups (synthetic).', '3 years', 'P. Nair', d(9, 21))] },
  { id: 'PRIV-03', title: 'Data subject requests', owner: 'A. Singh', framework: 'Privacy', evidence: [ev('e7', 'Request log extract', 'Exported from the request queue', d(9, 25), 'accepted', 'Synthetic request log with handling times.', '3 years', 'P. Nair', d(9, 27))] },
  { id: 'CC7.2', title: 'Monitoring alerts', owner: 'L. Novak', framework: 'SOC 2', evidence: [ev('e8', 'Alert review minutes', 'Uploaded by L. Novak', d(10, 3), 'accepted', 'Weekly alert review notes (synthetic).', '1 year', 'P. Nair', d(10, 5))] },
]

const risks: Risk[] = [
  { id: 'r1', title: 'Supplier concentration', area: 'Third-party dependency', owner: 'L. Novak', likelihood: 5, impact: 4, treatment: { action: 'mitigate', note: 'Qualify a second supplier for the two critical services.', likelihood: 4, impact: 4 }, status: 'open' },
  { id: 'r2', title: 'Privilege drift', area: 'Quarterly access review', owner: 'J. Weber', likelihood: 4, impact: 4, treatment: { action: 'mitigate', note: 'Quarterly reviews with automatic removal of unused roles.', likelihood: 3, impact: 3 }, status: 'open' },
  { id: 'r3', title: 'Data retention gaps', area: 'Legacy workspace', owner: 'A. Singh', likelihood: 3, impact: 3, treatment: { action: 'mitigate', note: 'Apply the retention schedule to the legacy workspace.', likelihood: 2, impact: 2 }, status: 'open' },
  { id: 'r4', title: 'Backup restore delays', area: 'IT resilience', owner: 'M. Chen', likelihood: 3, impact: 4, treatment: { action: 'mitigate', note: 'Quarterly recovery drills.', likelihood: 2, impact: 3 }, status: 'open' },
  { id: 'r5', title: 'Unmanaged laptops', area: 'Endpoint hygiene', owner: 'L. Novak', likelihood: 3, impact: 3, treatment: { action: 'accept', note: 'Low exposure; reviewed by the risk committee.', likelihood: 3, impact: 2 }, status: 'accepted' },
]

const actions: AuditAction[] = [
  { id: 'a1', text: 'Collect refreshed change approval sample', due: d(11, 9), controlId: 'CC8.1', done: false },
  { id: 'a2', text: 'Review the SUP-07 exception with the supplier owner', due: d(11, 17), controlId: 'SUP-07', done: false },
  { id: 'a3', text: 'Qualify a second supplier (supplier concentration)', due: d(12, 15), done: false },
  { id: 'a4', text: 'Re-run the quarterly access review for contractors', due: d(11, 20), controlId: 'IAM-04', done: false },
]

const events: AuditEvent[] = [
  { id: 'v1', at: d(10, 16), actor: 'P. Nair', kind: 'evidence', subject: 'IAM-04', text: 'Accepted evidence “Quarterly access attestation”.' },
  { id: 'v2', at: d(10, 20), actor: 'P. Nair', kind: 'exception', subject: 'SUP-07', text: 'Marked an exception: Annual vendor assessment is overdue; a compensating quarterly review is agreed.' },
]

export function seed(): GrcState {
  return { version: 1, org: 'Northstar', year: 'FY2026', frameworks: ['ISO 27001', 'SOC 2', 'Privacy'], controls, risks, actions, events }
}
