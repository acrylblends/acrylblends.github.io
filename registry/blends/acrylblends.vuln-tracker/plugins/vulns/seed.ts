/**
 * The console a new install starts with: 24 assets and the mockup's six findings, plus a deterministic back catalogue that makes the metrics real
 * (128 open, 7 critical, 42 fixed this month, 6 assets at risk). Every CVE is fixture data.
 */
import type { Asset, Finding, FindingStatus, RemediationEvent, Severity, VulnState } from './domain.ts'
import { stampOf } from './domain.ts'

const OWNERS = ['Platform Security', 'Network Ops', 'Identity Team', 'Platform', 'Web Team', 'Docs', 'Data Ops', 'SRE', 'Cloud Team', 'AppSec']

const NAMED_ASSETS: readonly Omit<Asset, 'id'>[] = [
  { name: 'api-prod-02', environment: 'Production', platform: 'Linux', owner: 'Platform Security', criticality: 'high' },
  { name: 'edge-gw-01', environment: 'Edge', platform: 'Ubuntu', owner: 'Network Ops', criticality: 'high' },
  { name: 'auth-service', environment: 'Production', platform: 'Node', owner: 'Identity Team', criticality: 'high' },
  { name: 'worker-pool', environment: 'Cloud', platform: 'Containers', owner: 'Platform', criticality: 'medium' },
  { name: 'portal-web-01', environment: 'Public', platform: 'Web', owner: 'Web Team', criticality: 'high' },
  { name: 'docs-preview', environment: 'Staging', platform: 'Web', owner: 'Docs', criticality: 'low' },
  { name: 'db-prod-01', environment: 'Production', platform: 'PostgreSQL', owner: 'Data Ops', criticality: 'high' },
  { name: 'vpn-gw-02', environment: 'Edge', platform: 'Network', owner: 'Network Ops', criticality: 'high' },
]

const GENERATED_ASSETS: readonly string[] = [
  'billing-api', 'search-worker', 'metrics-agent', 'ingest-queue', 'report-runner', 'mail-relay',
  'cache-prod-01', 'object-store', 'ci-runner-03', 'staging-web-02', 'identity-db', 'log-shipper',
  'scheduler-01', 'cdn-edge-04', 'backup-node', 'sandbox-api',
]

const CRITICAL_TITLES = ['TLS certificate validation bypass', 'Remote code execution in image parser', 'Authentication bypass in API gateway', 'Deserialization flaw in job runner', 'Privilege escalation in container runtime']
const HIGH_TITLES = ['SQL injection in report filter', 'Path traversal in file service', 'Weak token validation', 'SSRF in webhook delivery', 'Insecure deserialization', 'Broken access control on admin route', 'Session fixation in portal', 'Command injection in build step', 'Hard-coded credential in image', 'Missing authorization on export']
const MEDIUM_TITLES = ['Reflected cross-site scripting', 'Open redirect in sign-in', 'Verbose error page', 'Weak password policy', 'Missing security headers', 'Insecure cookie flags', 'Unpatched TLS library', 'Directory listing enabled']
const LOW_TITLES = ['Server banner disclosure', 'Outdated dependency notice', 'Autocomplete on secret field', 'Missing HSTS on staging', 'Debug endpoint exposed internally']

const CHECKLIST = [
  { label: 'Patch or configuration prepared', done: false },
  { label: 'Change deployed to the asset', done: false },
  { label: 'Verification evidence recorded', done: false },
]

export function seed(now: Date, newId: (kind: string) => string): VulnState {
  const at = (daysAgo: number, hour = 9): string => stampOf(new Date(Date.UTC(2026, 10, 6) + hour * 3_600_000 - daysAgo * 86_400_000))
  const assets: Asset[] = [
    ...NAMED_ASSETS.map((asset) => ({ ...asset, id: newId('asset') })),
    ...GENERATED_ASSETS.map((name, index) => ({
      id: newId('asset'),
      name,
      environment: ['Production', 'Staging', 'Cloud', 'Edge'][index % 4] as string,
      platform: ['Linux', 'Node', 'Go', 'Java', 'Containers'][index % 5] as string,
      owner: OWNERS[(index + 2) % OWNERS.length] as string,
      criticality: (index % 3 === 0 ? 'medium' : 'low') as 'medium' | 'low',
    })),
  ]
  const [api, edge, auth, worker, portal, docs, database, vpn] = assets as [Asset, Asset, Asset, Asset, Asset, Asset, Asset, Asset]
  const findings: Finding[] = []
  const events: RemediationEvent[] = []

  const push = (finding: Omit<Finding, 'id' | 'checklist'> & { checklist?: Finding['checklist'] }): Finding => {
    const made: Finding = { id: newId('finding'), checklist: finding.checklist ?? CHECKLIST.map((item) => ({ ...item })), ...finding }
    findings.push(made)
    events.push({ id: newId('event'), findingId: made.id, actor: 'Demo scanner', action: 'opened', timestamp: made.createdAt, note: `${made.cve} opened from fixture data.` })
    return made
  }

  const named: readonly (Omit<Finding, 'id' | 'checklist'>)[] = [
    { cve: 'CVE-2026-21842', title: 'OpenSSL memory corruption', assetId: api.id, severity: 'critical', cvss: 9.8, affectedVersion: '3.0.12', fixedVersion: '3.0.14', dueDate: '2026-11-07', status: 'in_progress', ownerId: 'Platform Security', evidence: '', remediationNotes: 'Upgrade the runtime package, rebuild the image, verify exposure.', createdAt: at(2) },
    { cve: 'CVE-2026-20991', title: 'Kernel privilege escalation', assetId: edge.id, severity: 'critical', cvss: 9.1, affectedVersion: '6.8.0-31', fixedVersion: '6.8.0-45', dueDate: '2026-11-06', status: 'open', evidence: '', remediationNotes: 'Patch the kernel and reboot the edge gateway in a window.', createdAt: at(0, 6) },
    { cve: 'CVE-2026-17601', title: 'JWT algorithm confusion', assetId: auth.id, severity: 'high', cvss: 8.2, affectedVersion: '4.2.1', fixedVersion: '4.3.0', dueDate: '2026-11-09', status: 'assigned', ownerId: 'Identity Team', evidence: '', remediationNotes: 'Pin the accepted algorithm and rotate the verification key.', createdAt: at(3) },
    { cve: 'CVE-2026-15540', title: 'Outdated container base image', assetId: worker.id, severity: 'high', cvss: 7.8, affectedVersion: 'node:20.11', fixedVersion: 'node:20.18', dueDate: '2026-11-12', status: 'open', evidence: '', remediationNotes: 'Four images use the base; rebuild and redeploy the pool.', createdAt: at(5) },
    { cve: 'CVE-2026-08019', title: 'Weak TLS cipher configuration', assetId: portal.id, severity: 'medium', cvss: 5.9, affectedVersion: 'policy v3', fixedVersion: 'policy v4', dueDate: '2026-11-20', status: 'accepted', ownerId: 'Web Team', evidence: '', remediationNotes: 'Accepted until the legacy client is retired; review monthly.', createdAt: at(20) },
    { cve: 'CVE-2026-03008', title: 'Verbose server banner', assetId: docs.id, severity: 'low', cvss: 2.4, affectedVersion: 'nginx 1.24', fixedVersion: 'nginx 1.26', dueDate: '2026-12-01', status: 'open', evidence: '', remediationNotes: 'Turn off server tokens in the staging server.', createdAt: at(40) },
  ]
  for (const finding of named) push(finding)

  // Seven critical findings in total: the two named plus five on the two extra risk assets.
  const criticalSeeds: readonly [Asset, number][] = [
    [database, 9.05],
    [database, 9.04],
    [database, 9.03],
    [vpn, 9.02],
    [vpn, 9.01],
  ]
  criticalSeeds.forEach(([asset, cvss], index) => {
    push({
      cve: `CVE-2026-3${String(1000 + index)}`,
      title: CRITICAL_TITLES[index] as string,
      assetId: asset.id,
      severity: 'critical',
      cvss,
      affectedVersion: `${asset.platform} 2026.${String(index + 1)}`,
      fixedVersion: `${asset.platform} 2026.${String(index + 9)}`,
      dueDate: `2026-11-${String(10 + index).padStart(2, '0')}`,
      status: index % 2 === 0 ? 'open' : 'assigned',
      ...(index % 2 === 0 ? {} : { ownerId: asset.owner }),
      evidence: '',
      remediationNotes: 'Patch the component, redeploy, and record the verification scan.',
      createdAt: at(30 + index),
    })
  })

  // The remaining open findings: high only on the four named risk assets, medium and low elsewhere.
  const riskAssets = [api, edge, auth, worker]
  for (let index = 0; index < 10; index += 1) {
    const asset = riskAssets[index % riskAssets.length] as Asset
    push({
      cve: `CVE-2026-2${String(1000 + index)}`,
      title: HIGH_TITLES[index] as string,
      assetId: asset.id,
      severity: 'high',
      cvss: 7 + (index % 10) / 10,
      affectedVersion: 'current release',
      fixedVersion: 'next release',
      dueDate: `2026-11-${String(14 + (index % 10)).padStart(2, '0')}`,
      status: (['open', 'assigned', 'in_progress'] as FindingStatus[])[index % 3] as FindingStatus,
      ownerId: asset.owner,
      evidence: '',
      remediationNotes: 'Apply the vendor fix and record the verification step.',
      createdAt: at(8 + index),
    })
  }
  for (let index = 0; index < 60; index += 1) {
    const asset = assets[8 + (index % 16)] as Asset
    push({
      cve: `CVE-2026-1${String(1000 + index)}`,
      title: MEDIUM_TITLES[index % MEDIUM_TITLES.length] as string,
      assetId: asset.id,
      severity: 'medium',
      cvss: 4 + (index % 29) / 10,
      affectedVersion: 'current release',
      fixedVersion: 'next release',
      dueDate: index < 3 ? `2026-11-0${String(1 + index * 2)}` : `2026-11-${String(15 + (index % 10)).padStart(2, '0')}`,
      status: (['open', 'assigned', 'in_progress'] as FindingStatus[])[index % 3] as FindingStatus,
      ownerId: asset.owner,
      evidence: '',
      remediationNotes: 'Plan the change with the asset owner.',
      createdAt: index < 4 ? at(index % 4) : at(20 + index),
    })
  }
  for (let index = 0; index < 48; index += 1) {
    const asset = assets[8 + ((index + 4) % 16)] as Asset
    push({
      cve: `CVE-2026-0${String(1000 + index)}`,
      title: LOW_TITLES[index % LOW_TITLES.length] as string,
      assetId: asset.id,
      severity: 'low',
      cvss: 1 + (index % 29) / 10,
      affectedVersion: 'current release',
      fixedVersion: 'next release',
      dueDate: `2026-12-${String(1 + (index % 20)).padStart(2, '0')}`,
      status: 'open',
      evidence: '',
      remediationNotes: 'Bundle with the next maintenance window.',
      createdAt: at(50 + index),
    })
  }

  // The remediated history: 42 this month and 36 in October, each with evidence and a remediation event.
  const remediate = (index: number, month: 10 | 11): void => {
    const asset = assets[index % assets.length] as Asset
    const day = (index % 28) + 1
    const finding = push({
      cve: `CVE-2026-4${String(index + 1000)}`,
      title: (index % 2 === 0 ? HIGH_TITLES : MEDIUM_TITLES)[index % 5] as string,
      assetId: asset.id,
      severity: index % 3 === 0 ? 'high' : 'medium',
      cvss: index % 3 === 0 ? 7.2 : 5.2,
      affectedVersion: 'previous release',
      fixedVersion: 'current release',
      dueDate: `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      status: 'remediated',
      ownerId: asset.owner,
      evidence: `Patch deployed to ${asset.name}; verification scan SCN-${String(2000 + index)} clean.`,
      remediationNotes: 'Patched and verified.',
      createdAt: at(30 + index, 8),
      checklist: CHECKLIST.map((item) => ({ ...item, done: true })),
    })
    findings[findings.length - 1] = finding
    const timestamp = stampOf(new Date(Date.UTC(2026, month - 1, day, 12)))
    events.push({ id: newId('event'), findingId: finding.id, actor: asset.owner, action: 'remediated', timestamp, note: finding.evidence })
  }
  for (let index = 0; index < 42; index += 1) remediate(index, 11)
  for (let index = 42; index < 78; index += 1) remediate(index, 10)

  const first = findings[0] as Finding
  events.push({ id: newId('event'), findingId: first.id, actor: 'Alex M.', action: 'assigned', timestamp: at(1, 10), note: 'Assigned to Platform Security.' })
  events.push({ id: newId('event'), findingId: first.id, actor: 'Platform Security', action: 'in_progress', timestamp: at(0, 6), note: 'Patch built; deployment window tonight.' })

  return { version: 1, assets, findings, events }
}

export const SEED_FACTS = { assets: 24, findings: 207, open: 128, critical: 7, fixedThisMonth: 42, previousMonthFixed: 36, assetsAtRisk: 6, overdue: 3, openedThisWeek: 8 } as const
