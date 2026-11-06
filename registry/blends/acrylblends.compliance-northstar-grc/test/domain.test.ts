import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Grc, GrcError, filterControls, memoryStore, parseLevel, posture, rating, residualOf, reviewMarkdown, score, seed, statusOf } from '../plugins/grc/index.ts'
import { NOW } from './support.ts'

const open = async () => {
  let ids = 0
  const store = memoryStore()
  const grc = await Grc.open({ store, clock: () => NOW, newId: (kind) => `${kind}-n${++ids}` })
  return { grc, store }
}

test('scores multiply likelihood by impact and rate High from 15, Medium from 8', () => {
  assert.equal(score(4, 4), 16)
  assert.deepEqual([4, 8, 9, 14, 15, 16].map(rating), ['Low', 'Medium', 'Medium', 'Medium', 'High', 'High'])
  assert.equal(parseLevel(' 3 ', 'x'), 3)
  assert.throws(() => parseLevel('6', 'Impact'), /Impact must be a whole number from 1 to 5/)
  assert.throws(() => parseLevel('', 'Impact'), GrcError)
})

test('status: an exception beats everything; otherwise the newest evidence must be accepted and fresh', () => {
  const s = seed()
  const by = (id: string) => statusOf(s.controls.find((c) => c.id === id) ?? (undefined as never), NOW)
  assert.deepEqual(['IAM-04', 'CC8.1', 'SUP-07', 'BCP-02'].map(by), ['Current', 'Review', 'Exception', 'Current'])
  const stale = new Date(2027, 0, 20)
  assert.equal(statusOf(s.controls[0] ?? (undefined as never), stale), 'Review', 'evidence older than 90 days is stale')
})

test('the posture is computed from the register, the evidence, the risks and the actions', () => {
  const p = posture(seed(), NOW)
  assert.deepEqual([p.coverage, p.current, p.controls, p.evidenceCurrent, p.evidenceTotal, p.needAttention, p.openRisks, p.highResidual, p.actions, p.dueThisWeek], [75, 6, 8, 6, 8, 2, 4, 1, 4, 1])
})

test('filters combine framework, owner and status', () => {
  const s = seed()
  assert.equal(filterControls(s, {}, NOW).length, 8)
  assert.deepEqual(filterControls(s, { framework: 'SOC 2' }, NOW).map((c) => c.id), ['CC8.1', 'CC6.1', 'CC7.2'])
  assert.deepEqual(filterControls(s, { framework: 'SOC 2', owner: 'J. Weber' }, NOW).map((c) => c.id), ['CC6.1'])
  assert.deepEqual(filterControls(s, { status: 'Exception' }, NOW).map((c) => c.id), ['SUP-07'])
  assert.equal(filterControls(s, { framework: 'Privacy', status: 'Exception' }, NOW).length, 0)
})

test('accepting evidence makes a control current, once; a refresh blocks it', async () => {
  const { grc } = await open()
  const e = await grc.acceptEvidence('CC8.1')
  assert.deepEqual([e.state, e.reviewer, e.reviewedAt], ['accepted', 'R. Ortiz', NOW.toISOString()])
  assert.equal(statusOf(grc.control('CC8.1'), NOW), 'Current')
  assert.equal(posture(grc.state, NOW).coverage, 88)
  await assert.rejects(grc.acceptEvidence('CC8.1'), /already accepted/)
  assert.match(grc.history('CC8.1')[0]?.text ?? '', /Accepted evidence “Change approval sample”/)
  await grc.requestRefresh('IAM-04')
  await assert.rejects(grc.acceptEvidence('IAM-04'), /refresh was requested/)
  await assert.rejects(grc.acceptEvidence('nope'), /no such control/)
})

test('requesting a refresh opens an action; completing it brings new evidence in for review, which can then be accepted', async () => {
  const { grc } = await open()
  const action = await grc.requestRefresh('IAM-04')
  assert.equal(action.due, new Date(NOW.getTime() + 7 * 86_400_000).toISOString())
  assert.equal(grc.control('IAM-04').evidence[0]?.state, 'refresh-requested')
  assert.equal(statusOf(grc.control('IAM-04'), NOW), 'Review')
  await assert.rejects(grc.requestRefresh('IAM-04'), /already requested/)
  await assert.rejects(grc.acceptEvidence('IAM-04'), /refresh was requested/)
  await grc.completeAction(action.id)
  const fresh = grc.control('IAM-04').evidence.at(-1)
  assert.deepEqual([fresh?.title, fresh?.state, fresh?.collectedAt], ['Quarterly access attestation (refreshed)', 'pending', NOW.toISOString()])
  await grc.acceptEvidence('IAM-04')
  assert.equal(statusOf(grc.control('IAM-04'), NOW), 'Current')
  await assert.rejects(grc.completeAction(action.id), /already done/)
  await assert.rejects(grc.completeAction('nope'), /no such action/)
})

test('exceptions need a reason, open a review action and can be cleared', async () => {
  const { grc, store } = await open()
  const saves = store.saved
  await assert.rejects(grc.markException('CC7.2', 'short'), /at least 10 characters/)
  await assert.rejects(grc.markException('SUP-07', 'a reason that is long enough'), /already an exception/)
  assert.equal(store.saved, saves)
  const before = grc.state.actions.length
  await grc.markException('CC7.2', 'Alert tooling is being replaced this quarter.')
  assert.equal(statusOf(grc.control('CC7.2'), NOW), 'Exception')
  assert.equal(grc.state.actions.length, before + 1)
  assert.equal(grc.state.actions.at(-1)?.text, 'Review the CC7.2 exception with L. Novak')
  await grc.clearException('CC7.2')
  assert.equal(statusOf(grc.control('CC7.2'), NOW), 'Current')
  await assert.rejects(grc.clearException('CC7.2'), /not an exception/)
})

test('a treatment update recalculates the residual score and the posture; its rules are enforced', async () => {
  const { grc } = await open()
  assert.equal(residualOf(grc.risk('r1')), 16)
  const r = await grc.setTreatment('r1', { action: 'mitigate', note: 'Second supplier live', likelihood: '3', impact: '3' })
  assert.equal(residualOf(r), 9)
  assert.equal(posture(grc.state, NOW).highResidual, 0)
  await assert.rejects(grc.setTreatment('r1', { action: 'mitigate', note: 'x', likelihood: '5', impact: '5' }), /cannot be higher than the inherent/)
  await assert.rejects(grc.setTreatment('r1', { action: 'accept', note: 'x', likelihood: '5', impact: '4' }), /cannot be higher|High residual/)
  await assert.rejects(grc.setTreatment('r1', { action: 'accept', note: '', likelihood: '2', impact: '2' }), /Describe the treatment/)
  await assert.rejects(grc.setTreatment('r1', { action: 'melt', note: 'x', likelihood: '2', impact: '2' }), /Pick a treatment/)
  await assert.rejects(grc.setTreatment('r1', { action: 'mitigate', note: 'x', likelihood: '0', impact: '2' }), /Residual likelihood/)
  const accepted = await grc.setTreatment('r1', { action: 'accept', note: 'Committee accepted', likelihood: '2', impact: '3' })
  assert.equal(accepted.status, 'accepted')
  assert.equal(posture(grc.state, NOW).openRisks, 3)
  const closed = await grc.setTreatment('r2', { action: 'avoid', note: '', likelihood: '1', impact: '1' })
  assert.equal(closed.status, 'closed')
  assert.equal(posture(grc.state, NOW).openRisks, 2)
})

test('a High residual risk cannot be accepted', async () => {
  const { grc } = await open()
  await assert.rejects(grc.setTreatment('r1', { action: 'accept', note: 'we will live with it', likelihood: '4', impact: '4' }), /A High residual risk \(16\) cannot be accepted; mitigate or transfer it first/)
  assert.equal(grc.risk('r1').status, 'open')
})

test('adding a risk checks its fields, starts untreated and is limited', async () => {
  const { grc } = await open()
  await assert.rejects(grc.addRisk({ title: '', area: 'x', owner: 'J. Weber', likelihood: '3', impact: '3' }), /Give the risk a title/)
  await assert.rejects(grc.addRisk({ title: 'Supplier concentration', area: 'x', owner: 'J. Weber', likelihood: '3', impact: '3' }), /already a risk called/)
  await assert.rejects(grc.addRisk({ title: 'Ok', area: 'x', owner: '', likelihood: '3', impact: '3' }), /Pick a risk owner/)
  await assert.rejects(grc.addRisk({ title: 'Ok', area: 'x', owner: 'J. Weber', likelihood: '9', impact: '3' }), /Likelihood/)
  const r = await grc.addRisk({ title: 'Shadow IT', area: 'Software estate', owner: 'J. Weber', likelihood: '4', impact: '3' })
  assert.deepEqual([r.id, residualOf(r), r.status], ['risk-n1', 12, 'open'])
  while (grc.state.risks.length < 12) await grc.addRisk({ title: `R${String(grc.state.risks.length)}`, area: 'a', owner: 'J. Weber', likelihood: '1', impact: '1' })
  await assert.rejects(grc.addRisk({ title: 'One more', area: 'a', owner: 'J. Weber', likelihood: '1', impact: '1' }), /At most 12 risks/)
})

test('the exported review lists posture, controls, risks and open actions, and says it is not a certification', () => {
  const md = reviewMarkdown(seed(), NOW)
  assert.match(md, /# Northstar control assurance review · FY2026/)
  assert.match(md, /not a certification or a statement of legal compliance/)
  assert.match(md, /- Control coverage: 75% \(6 of 8 controls current\)/)
  assert.match(md, /- SUP-07 Supplier review · ISO 27001 · L\. Novak · Exception \(exception: /)
  assert.match(md, /- Supplier concentration \(Third-party dependency\) · inherent 20 → residual 16 High · Mitigate · open/)
  assert.match(md, /- Collect refreshed change approval sample · due in 4 days/)
})
