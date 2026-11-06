import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DESTINATIONS, MAX_RUNS, Ops, OpsError, horizonDays, latestVerified, memoryStore, parseRetention, parseRpo, pointLabel, preflight, readiness, rpoMet, seed, utcLabel, whenLabel } from '../plugins/restorepoint/index.ts'
import { NOW } from './support.ts'

const open = async () => {
  let ids = 0
  const store = memoryStore()
  const ops = await Ops.open({ store, clock: () => NOW, newId: (kind) => `${kind}-n${++ids}` })
  return { ops, store }
}

test('the seed reads as the mockup: four workloads, 3 of 4 with a verified point, the database timeline with a pending last point', () => {
  const s = seed()
  assert.deepEqual(s.workloads.map((w) => w.name), ['Production database', 'Media object store', 'App configuration', 'Developer laptops'])
  assert.deepEqual(readiness(s), { ready: 3, total: 4 })
  const db = s.workloads[0]
  assert.deepEqual(db?.points.map((p) => p.integrity), ['verified', 'verified', 'verified', 'verified', 'pending'])
  assert.equal(db === undefined ? '' : pointLabel(latestVerified(db)?.at ?? ''), 'Nov 05 · 02:00')
  assert.equal(utcLabel(s.readinessAt), '07:10 UTC')
  assert.equal(horizonDays({ daily: 30, weekly: 12, monthly: 12 }), 474)
})

test('labels: points, relative days and sizes', () => {
  assert.equal(whenLabel(new Date(2026, 10, 5, 2, 0).toISOString(), NOW), 'Today · 02:00')
  assert.equal(whenLabel(new Date(2026, 10, 4, 2, 0).toISOString(), NOW), 'Yesterday · 02:00')
  assert.equal(whenLabel(new Date(2026, 10, 1, 2, 0).toISOString(), NOW), 'Nov 01 · 02:00')
})

test('backup completion, integrity and restore readiness are separate: preflight names each check', () => {
  const s = seed()
  const [db, media, , laptops] = s.workloads
  const [isolated, staging, production] = DESTINATIONS
  assert.ok(db && media && laptops && isolated && staging && production)
  const full = db.scopes[0]
  assert.ok(full)
  assert.equal(preflight(db, db.points[3] as never, full, isolated).ok, true)
  const pending = preflight(db, db.points[4] as never, full, isolated)
  assert.deepEqual(pending.checks.filter((c) => !c.ok).map((c) => c.label), ['Checksum'])
  assert.match(pending.checks[1]?.detail ?? '', /not verified yet/)
  const failed = preflight(laptops, laptops.points[1] as never, laptops.scopes[0] as never, isolated)
  assert.match(failed.checks[1]?.detail ?? '', /integrity check failed: checksum mismatch in segment 14/)
  const big = preflight(media, media.points[2] as never, media.scopes[0] as never, staging)
  assert.deepEqual(big.checks.filter((c) => !c.ok).map((c) => c.label), ['Target capacity'])
  assert.equal(preflight(media, media.points[2] as never, media.scopes[2] as never, staging).ok, true)
  assert.deepEqual(preflight(db, db.points[3] as never, full, production).checks.filter((c) => !c.ok).map((c) => c.label), ['Approval'])
})

test('verifying: a pending point becomes verified and the readiness check is recorded; a corrupt one fails and stays unusable', async () => {
  const { ops } = await open()
  const r = await ops.verify('prod-db')
  assert.deepEqual([r.ok, r.point.id, r.point.integrity], [true, 'db-5', 'verified'])
  assert.equal(ops.state.readinessAt, NOW.toISOString())
  assert.equal(ops.workload('prod-db').log.at(-1)?.text, '✓ Catalog and checksum passed')
  const bad = await ops.verify('laptops')
  assert.deepEqual([bad.ok, bad.point.integrity], [false, 'failed'])
  assert.equal(readiness(ops.state).ready, 3)
  assert.equal((await ops.verify('laptops', 'lap-1')).ok, true)
  assert.equal(readiness(ops.state).ready, 4)
  await assert.rejects(ops.verify('nope'), /no such workload/)
  await assert.rejects(ops.verify('laptops', 'nope'), /no such recovery point/)
})

test('a restore preview is simulated when preflight passes and blocked, with the reason, when it does not; both are recorded and logged', async () => {
  const { ops, store } = await open()
  const ok = await ops.restore('prod-db', 'db-4', 'Full database', 'isolated')
  assert.deepEqual([ok.result, ok.reason], ['simulated', undefined])
  assert.deepEqual(ops.workload('prod-db').log.slice(-5).map((l) => l.text), ['Plan assembled', 'Scope: Full database', 'Target: Isolated recovery environment', '✓ Preflight checks passed', '✓ Restore simulation complete'])
  const blocked = await ops.restore('media', 'media-3', 'Full bucket set', 'staging')
  assert.equal(blocked.result, 'blocked')
  assert.match(blocked.reason ?? '', /^Target capacity: .* needed, only 500\.0 GB available at New staging cluster/)
  assert.equal((await ops.restore('prod-db', 'db-5', 'Full database', 'isolated')).reason?.startsWith('Checksum: integrity not verified yet'), true)
  assert.match((await ops.restore('prod-db', 'db-4', 'Full database', 'production')).reason ?? '', /^Approval: production restores need an approved change/)
  assert.equal(ops.state.runs.length, 4)
  const saves = store.saved
  await assert.rejects(ops.restore('prod-db', 'db-4', 'Whole planet', 'isolated'), /Pick a restore scope/)
  await assert.rejects(ops.restore('prod-db', 'db-4', 'Full database', 'moon'), /no such destination/)
  assert.equal(store.saved, saves)
})

test('the run history and the log are capped', async () => {
  const { ops } = await open()
  for (let i = 0; i < MAX_RUNS + 5; i += 1) await ops.restore('prod-db', 'db-4', 'Full database', 'isolated')
  assert.equal(ops.state.runs.length, MAX_RUNS)
  assert.equal(ops.workload('prod-db').log.length, 12)
})

test('retention and RPO are validated and saved together', async () => {
  const { ops, store } = await open()
  assert.deepEqual(parseRetention({ daily: '7', weekly: '0', monthly: '1' }), { daily: 7, weekly: 0, monthly: 1 })
  assert.throws(() => parseRetention({ daily: '0', weekly: '1', monthly: '1' }), /at least one daily point/)
  assert.throws(() => parseRetention({ daily: '91', weekly: '1', monthly: '1' }), /Daily points must be a whole number from 0 to 90/)
  assert.throws(() => parseRetention({ daily: '1', weekly: '1.5', monthly: '1' }), OpsError)
  assert.equal(parseRpo('15'), 15)
  assert.throws(() => parseRpo('4'), /from 5 to 1440/)
  const saves = store.saved
  await assert.rejects(ops.setRetention('prod-db', { daily: '10', weekly: '4', monthly: '2', rpo: '1' }), /RPO target/)
  assert.equal(store.saved, saves)
  const w = await ops.setRetention('prod-db', { daily: '10', weekly: '4', monthly: '2', rpo: '30' })
  assert.deepEqual([w.retention, w.rpoMin], [{ daily: 10, weekly: 4, monthly: 2 }, 30])
})

test('pausing the jobs that meet the RPO puts it at risk', async () => {
  const { ops } = await open()
  assert.equal(rpoMet(ops.workload('prod-db')), true)
  await ops.setJobEnabled('prod-db', 'db-log', false)
  assert.equal(rpoMet(ops.workload('prod-db')), true, 'continuous replication still meets 15 minutes')
  await ops.setJobEnabled('prod-db', 'db-repl', false)
  assert.equal(rpoMet(ops.workload('prod-db')), false)
  assert.equal(ops.workload('prod-db').log.at(-1)?.text, 'Cross-region replication paused')
  const saves = (await open()).store.saved
  assert.equal(saves, 1)
  await ops.setJobEnabled('prod-db', 'db-log', true)
  assert.equal(rpoMet(ops.workload('prod-db')), true)
  await assert.rejects(ops.setJobEnabled('prod-db', 'nope', true), /no such backup job/)
})
