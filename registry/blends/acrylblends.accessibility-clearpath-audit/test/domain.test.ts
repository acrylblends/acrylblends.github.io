import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Audit, AuditError, BUTTON, contrastRatio, measure, memoryStore, runSummary, scoreOf, seed, summarize } from '../plugins/clearpath/index.ts'
import { NOW } from './support.ts'

const open = async () => {
  let ids = 0
  const store = memoryStore()
  const audit = await Audit.open({ store, clock: () => NOW, newId: (kind) => `${kind}-n${++ids}` })
  return { audit, store }
}

test('the seed reads as the mockup: four findings, score 78, one earlier run', () => {
  const s = seed(NOW)
  assert.deepEqual(s.issues.map((i) => [i.id, i.severity]), [['contrast', 'high'], ['focus', 'medium'], ['alt', 'medium'], ['heading', 'low']])
  assert.equal(scoreOf(s.issues), 78)
  assert.equal(s.runs[0]?.score, 78)
})

test('contrast uses the WCAG ratio; the sample button fails before the fix and passes after', () => {
  assert.equal(contrastRatio('#000000', '#ffffff'), 21)
  assert.ok(contrastRatio(BUTTON.before.bg, BUTTON.before.fg) < 2)
  assert.ok(contrastRatio(BUTTON.after.bg, BUTTON.after.fg) > 7)
  const s = seed(NOW)
  const c = s.issues[0]
  assert.match(c ? measure(c) : '', /Measured 1\.6:1 for the button text; below the 4\.5:1/)
  assert.match(c ? measure({ ...c, resolved: true }) : '', /meets the 4\.5:1/)
})

test('the score drops by severity weight for each open finding', () => {
  const s = seed(NOW)
  assert.equal(scoreOf(s.issues.map((i) => (i.id === 'contrast' ? { ...i, resolved: true } : i))), 88)
  assert.equal(scoreOf(s.issues.map((i) => ({ ...i, resolved: true }))), 100)
  assert.deepEqual(summarize(s.issues), { open: 4, resolved: 0, queued: 0 })
  assert.match(runSummary(88, 78, { open: 3, resolved: 1, queued: 0 }), /score 88 \(\+10 since the last run\); 3 open, 1 resolved\. This is not a compliance certificate\./)
  assert.match(runSummary(78, 78, { open: 4, resolved: 0, queued: 0 }), /no change/)
})

test('resolving and reopening a finding, and queuing it for review; unchanged requests save nothing', async () => {
  const { audit, store } = await open()
  const r = await audit.setResolved('contrast', true)
  assert.deepEqual([r.resolved, r.resolvedAt], [true, NOW.toISOString()])
  const saves = store.saved
  await audit.setResolved('contrast', true)
  assert.equal(store.saved, saves)
  const back = await audit.setResolved('contrast', false)
  assert.equal('resolvedAt' in back, false)
  assert.equal((await audit.setQueued('focus', true)).queued, true)
  await assert.rejects(audit.setResolved('nope', true), (e: unknown) => e instanceof AuditError && e.code === 'not-found')
})

test('preview settings toggle and are validated', async () => {
  const { audit } = await open()
  assert.deepEqual(await audit.togglePreview('contrast'), { setting: 'contrast', on: true })
  assert.deepEqual(await audit.togglePreview('contrast'), { setting: 'contrast', on: false })
  await assert.rejects(audit.togglePreview('sepia'), /Pick a preview setting/)
})

test('a re-run records the score of the findings as they stand, with the change since the last run', async () => {
  const { audit } = await open()
  await audit.setResolved('contrast', true)
  assert.equal(audit.lastRun()?.score, 78, 'the score changes only on a re-run')
  const run = await audit.rerun()
  assert.deepEqual([run.score, run.open, run.resolved], [88, 3, 1])
  assert.match(run.summary, /\(\+10 since the last run\)/)
  assert.equal(audit.state.runs.length, 2)
})
