import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  cleanEvidence,
  filterFindings,
  isOpen,
  severityOf,
  statsOf,
  Vulns,
  VulnsError,
} from '../plugins/vulns/index.ts'
import type { VulnState } from '../plugins/vulns/domain.ts'
import { memoryStore } from '../plugins/vulns/store.ts'
import { seed } from '../plugins/vulns/seed.ts'
import { NOW, withApp } from './support.ts'

const newId = (kind: string): string => `${kind}-${Math.random().toString(36).slice(2, 8)}`

test('a CVSS score maps to a severity', () => {
  assert.equal(severityOf(9.8), 'critical')
  assert.equal(severityOf(7), 'high')
  assert.equal(severityOf(4), 'medium')
  assert.equal(severityOf(3.9), 'low')
  assert.equal(isOpen('in_progress'), true)
  assert.equal(isOpen('remediated'), false)
})

test('findings sort by severity then CVSS, and the filters narrow them', () => {
  const state = seed(NOW, newId)
  const all = filterFindings(state)
  assert.equal(all[0]?.severity, 'critical')
  assert.ok(all[0]!.cvss >= all[1]!.cvss)
  assert.ok(filterFindings(state, { severity: 'critical' }).every((finding) => finding.severity === 'critical'))
  assert.ok(filterFindings(state, { q: 'openssl' }).some((finding) => finding.cve === 'CVE-2026-21842'))
  assert.equal(filterFindings(state, { q: 'nothing-matches' }).length, 0)
  assert.ok(filterFindings(state, { assetId: state.assets[2]?.id }).length >= 2)
})

test('the seed makes the mockup metrics real: 24 assets, 128 open, 7 critical, 42 fixed, 6 at risk', () => {
  const state = seed(NOW, newId)
  assert.equal(state.assets.length, 24)
  assert.equal(state.findings.length, 207)
  assert.equal(state.findings.filter((finding) => finding.status === 'remediated').length, 78)
  assert.ok(state.findings.filter((finding) => finding.status === 'remediated').every((finding) => finding.evidence !== ''))
  const stats = statsOf(state, '2026-11', NOW)
  assert.equal(stats.open, 128)
  assert.equal(stats.critical, 7)
  assert.equal(stats.fixedThisMonth, 42)
  assert.equal(stats.previousMonthFixed, 36)
  assert.equal(stats.assetsAtRisk, 6)
  assert.equal(stats.overdue, 3)
  assert.equal(stats.openedThisWeek, 8)
  assert.equal(stats.trackedAssets, 24)
})

test('evidence is required to mark a finding remediated', () => {
  assert.equal(cleanEvidence(' patch 1.2.3 '), 'patch 1.2.3')
  assert.throws(() => cleanEvidence(''), (error: unknown) => error instanceof VulnsError && /evidence/.test(error.message))
  assert.throws(() => cleanEvidence('no'), /evidence/)
})

async function open(): Promise<Vulns> {
  let ids = 0
  return Vulns.open({ store: memoryStore(), clock: () => NOW, newId: (kind) => `${kind}-${++ids}` })
}

test('assigning, starting, remediating and accepting keep the audit trail', async () => {
  const store = memoryStore<VulnState>()
  let ids = 0
  const vulns = await Vulns.open({ store, clock: () => NOW, newId: (kind) => `${kind}-${++ids}` })
  const finding = vulns.findings().find((item) => item.cve === 'CVE-2026-20991')
  assert.ok(finding !== undefined)
  const assigned = await vulns.assign(finding.id, 'Platform Security')
  assert.equal(assigned.status, 'assigned')
  assert.equal(assigned.ownerId, 'Platform Security')
  const started = await vulns.start(finding.id)
  assert.equal(started.status, 'in_progress')
  await assert.rejects(vulns.remediate(finding.id, ' '), /evidence/)
  const remediated = await vulns.remediate(finding.id, 'kernel 6.8.0-45 deployed; scan SCN-2001 clean')
  assert.equal(remediated.status, 'remediated')
  assert.ok(remediated.checklist.every((item) => item.done))
  assert.match(remediated.evidence, /SCN-2001/)
  assert.equal(vulns.eventsOf(finding.id).length, 4)
  assert.equal(store.saved, 3)
  await assert.rejects(vulns.assign(finding.id, 'Platform Security'), /closed/)
  const other = vulns.findings().find((item) => item.cve === 'CVE-2026-03008')
  assert.ok(other !== undefined)
  await assert.rejects(vulns.assign(other.id, 'Nobody'), /Unknown owner/)
})

test('accepting a risk needs a reason and closes the finding', async () => {
  const vulns = await open()
  const finding = vulns.findings({ severity: 'low' })[0]
  assert.ok(finding !== undefined)
  await assert.rejects(vulns.accept(finding.id, ''), /accepted/)
  const accepted = await vulns.accept(finding.id, 'Legacy client retires in December.')
  assert.equal(accepted.status, 'accepted')
  await assert.rejects(vulns.start(finding.id), /closed/)
})

test('the console the pages see is the seed', () =>
  withApp(async (app) => {
    assert.equal(app.root.vulns.findings().length, 207)
    assert.equal(app.root.vulns.stats().open, 128)
  }))
