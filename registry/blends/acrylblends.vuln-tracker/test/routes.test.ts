import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import { createApp, readManifest } from '../src/app.ts'
import { pinnedInstance } from '../plugins/instance/index.ts'
import { noticeOf, projectRoot, withApp } from './support.ts'

const scratch = join(projectRoot, '.acrylblends', 'test')
mkdirSync(scratch, { recursive: true })

test('the first page is the vulnerability overview with the metrics and the inspector', () =>
  withApp(async (app) => {
    const page = await app.page('/')
    assert.equal(page.status, 200)
    assert.match(page.html, /Vulnerability overview/)
    assert.match(page.html, /OpenSSL memory corruption/)
    assert.match(page.html, /CVE-2026-21842/)
    assert.match(page.html, /OPEN FINDINGS/)
    assert.match(page.html, /FINDING INSPECTOR/)
    assert.match(page.html, /128/)
    assert.match(page.html, /07/)
    assert.match(page.html, /42/)
    assert.match(page.html, /REMEDIATION CHECKLIST/)
    assert.match(page.html, /VERIFICATION RECORD/)
    assert.match(page.html, /Record verified remediation/)
  }))

test('severity, status, search and asset filters narrow the table', () =>
  withApp(async (app) => {
    const critical = await app.page('/findings?severity=critical')
    assert.match(critical.html, /OpenSSL memory corruption/)
    assert.doesNotMatch(critical.html, /Verbose server banner/)
    const search = await app.page('/findings?q=openssl')
    assert.match(search.html, /CVE-2026-21842/)
    assert.doesNotMatch(search.html, /Kernel privilege escalation/)
    const asset = app.root.vulns.assets()[2]
    assert.ok(asset !== undefined)
    const byAsset = await app.page(`/findings?asset=${asset.id}`)
    assert.match(byAsset.html, /JWT algorithm confusion/)
    assert.doesNotMatch(byAsset.html, /OpenSSL memory corruption/)
    const empty = await app.page('/findings?q=nothing-matches')
    assert.match(empty.html, /No finding matches|No findings match/)
  }))

test('a finding page selects that finding in the inspector', () =>
  withApp(async (app) => {
    const finding = app.root.vulns.findings().find((item) => item.cve === 'CVE-2026-17601')
    assert.ok(finding !== undefined)
    const page = await app.page(`/findings/${finding.id}`)
    assert.equal(page.status, 200)
    assert.match(page.html, /JWT algorithm confusion/)
    assert.match(page.html, /ASSIGN OWNER/)
  }))

test('assigning an owner and starting remediation record the events', () =>
  withApp(async (app) => {
    const finding = app.root.vulns.findings().find((item) => item.cve === 'CVE-2026-20991')
    assert.ok(finding !== undefined)
    const assigned = await app.post(`/findings/${finding.id}/assign`, { owner: 'Platform Security', back: `/findings/${finding.id}` })
    assert.equal(assigned.status, 303)
    assert.equal(noticeOf(assigned).kind, 'ok')
    assert.equal(app.root.vulns.finding(finding.id)?.ownerId, 'Platform Security')
    const started = await app.post(`/findings/${finding.id}/start`, { back: `/findings/${finding.id}` })
    assert.equal(noticeOf(started).kind, 'ok')
    assert.equal(app.root.vulns.finding(finding.id)?.status, 'in_progress')
  }))

test('marking remediated without evidence is refused; with evidence it is recorded', () =>
  withApp(async (app) => {
    const finding = app.root.vulns.findings().find((item) => item.cve === 'CVE-2026-20991')
    assert.ok(finding !== undefined)
    const refused = await app.post(`/findings/${finding.id}/evidence`, { evidence: '', back: `/findings/${finding.id}` })
    assert.equal(noticeOf(refused).kind, 'error')
    assert.match(noticeOf(refused).text, /evidence/)
    assert.equal(app.root.vulns.finding(finding.id)?.status, 'open')
    const done = await app.post(`/findings/${finding.id}/evidence`, { evidence: 'kernel 6.8.0-45; scan SCN-2001 clean', back: `/findings/${finding.id}` })
    assert.equal(noticeOf(done).kind, 'ok')
    assert.equal(app.root.vulns.finding(finding.id)?.status, 'remediated')
  }))

test('accepting a risk needs a reason', () =>
  withApp(async (app) => {
    const finding = app.root.vulns.findings().find((item) => item.cve === 'CVE-2026-03008')
    assert.ok(finding !== undefined)
    const refused = await app.post(`/findings/${finding.id}/accept`, { note: '', back: `/findings/${finding.id}` })
    assert.equal(noticeOf(refused).kind, 'error')
    const accepted = await app.post(`/findings/${finding.id}/accept`, { note: 'Staging only; retire the preview in December.', back: `/findings/${finding.id}` })
    assert.equal(noticeOf(accepted).kind, 'ok')
    assert.equal(app.root.vulns.finding(finding.id)?.status, 'accepted')
  }))

test('the asset inventory lists environments, owners and open findings', () =>
  withApp(async (app) => {
    const page = await app.page('/assets')
    assert.equal(page.status, 200)
    assert.match(page.html, /api-prod-02/)
    assert.match(page.html, /Platform Security/)
    assert.match(page.html, /Registered assets/)
  }))

test('health answers, an unknown path is a 404, and every feature is a row of the manifest', () =>
  withApp(async (app) => {
    assert.equal((await app.page('/health')).status, 200)
    assert.equal((await app.page('/nope')).status, 404)
    assert.deepEqual(readManifest().plugins.map((row) => row.id), ['router', 'home', 'vulns', 'vuln-shell', 'overview', 'assets', 'remediation', 'reports', 'policies', 'extensions', 'server', 'acryl-door'])
  }))

test('switching the assets plugin off leaves the app running without it', async () => {
  const manifest = readManifest()
  const without = { ...manifest, plugins: manifest.plugins.map((row) => (row.id === 'assets' ? { ...row, disabled: true } : row)) }
  const home = await mkdtemp(join(scratch, 'app-test-off-'))
  let ids = 0
  const app = await createApp(pinnedInstance(home, { root: projectRoot }), {
    listen: false,
    manifest: without,
    overrides: { vulns: { clock: () => new Date(2026, 10, 6, 9, 41), newId: (kind: string) => `${kind}-${++ids}` } },
  })
  try {
    const overview = await app.root.router.request('/', { headers: { accept: 'text/html' } })
    assert.equal(overview.status, 200)
    assert.match(await overview.text(), /Vulnerability overview/)
    assert.equal((await app.root.router.request('/assets')).status, 404)
  } finally {
    await app.stop()
    await rm(home, { recursive: true, force: true })
  }
})

test('the sidebar has every console entry and the status filter narrows by lifecycle', () =>
  withApp(async (app) => {
    const page = await app.page('/')
    for (const label of ['Overview', 'Assets', 'Vulnerabilities', 'Remediation', 'Reports', 'Policies']) {
      assert.match(page.html, new RegExp(label))
    }
    const accepted = await app.page('/findings?status=accepted')
    assert.match(accepted.html, /Weak TLS cipher configuration/)
    assert.doesNotMatch(accepted.html, /OpenSSL memory corruption/)
    const remediated = await app.page('/findings?status=remediated')
    assert.match(remediated.html, /REMEDIATED/)
  }))

test('the remediation trail lists the audit events with their findings', () =>
  withApp(async (app) => {
    const page = await app.page('/remediation')
    assert.equal(page.status, 200)
    assert.match(page.html, /Remediation trail/)
    assert.match(page.html, /remediated/)
    assert.match(page.html, /OpenSSL memory corruption/)
    const filtered = await app.page('/remediation?action=accepted')
    assert.match(filtered.html, /accepted/)
  }))

test('reports summarise the console and export JSON and CSV', () =>
  withApp(async (app) => {
    const page = await app.page('/reports')
    assert.equal(page.status, 200)
    assert.match(page.html, /Open findings by severity/)
    assert.match(page.html, /Assets at risk/)
    const json = await app.root.router.request('/export.json')
    assert.equal(json.status, 200)
    const body = (await json.json()) as { stats: { open: number; critical: number }; findings: unknown[] }
    assert.equal(body.stats.open, 128)
    assert.equal(body.stats.critical, 7)
    assert.equal(body.findings.length, 207)
    const csv = await app.root.router.request('/export.csv')
    assert.match(csv.headers.get('content-type') ?? '', /text\/csv/)
    assert.equal((await csv.text()).trim().split('\n').length, 208)
  }))

test('policies state the SLA and the evidence rule', () =>
  withApp(async (app) => {
    const page = await app.page('/policies')
    assert.equal(page.status, 200)
    assert.match(page.html, /Remediation windows/)
    assert.match(page.html, /3 days/)
    assert.match(page.html, /Verification rule/)
  }))

test('switching the reports plugin off removes the reports and the exports only', async () => {
  const manifest = readManifest()
  const without = { ...manifest, plugins: manifest.plugins.map((row) => (row.id === 'reports' ? { ...row, disabled: true } : row)) }
  const home = await mkdtemp(join(scratch, 'app-test-off-reports-'))
  let ids = 0
  const app = await createApp(pinnedInstance(home, { root: projectRoot }), {
    listen: false,
    manifest: without,
    overrides: { vulns: { clock: () => new Date(2026, 10, 6, 9, 41), newId: (kind: string) => `${kind}-${++ids}` } },
  })
  try {
    assert.equal((await app.root.router.request('/reports')).status, 404)
    assert.equal((await app.root.router.request('/export.json')).status, 404)
    assert.equal((await app.root.router.request('/', { headers: { accept: 'text/html' } })).status, 200)
  } finally {
    await app.stop()
    await rm(home, { recursive: true, force: true })
  }
})

test('a failed save reports the error instead of claiming success', async () => {
  const broken = {
    load: async () => undefined,
    save: async () => {
      throw new Error('disk full')
    },
  }
  await withApp(
    async (app) => {
      const finding = app.root.vulns.findings().find((item) => item.cve === 'CVE-2026-20991')
      assert.ok(finding !== undefined)
      const response = await app.post(`/findings/${finding.id}/assign`, { owner: 'Platform Security', back: `/findings/${finding.id}` })
      assert.equal(response.status, 303)
      assert.equal(noticeOf(response).kind, 'error')
      assert.match(noticeOf(response).text, /disk full/)
    },
    { overrides: { vulns: { store: broken } } },
  )
})
