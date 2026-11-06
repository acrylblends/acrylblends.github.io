import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  BASELINE,
  GRID,
  HORIZON_MIN,
  Lab,
  LabError,
  memoryStore,
  parseParams,
  STEP_MIN,
  seed,
  simulate,
  thermalField,
  tracesCsv,
} from '../plugins/morrow-lab/index.ts'
import { NOW } from './support.ts'

const fields = (p: object): Record<string, string> => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, String(v)]))

test('the model is deterministic and the baseline reads as the mockup does', () => {
  const a = simulate(BASELINE)
  const b = simulate(BASELINE)
  assert.deepEqual(a, b)
  assert.equal(a.summary.peak, 64.8)
  assert.equal(a.summary.energy, 1.36)
  assert.equal(a.summary.runtime, 1.8)
  assert.equal(a.summary.settle, 12.4)
  assert.equal(a.trace.length, HORIZON_MIN / STEP_MIN + 1)
  assert.equal(a.trace[0]?.temp, BASELINE.ambient)
  // Probe A rises monotonically towards the peak and never passes it.
  for (let i = 1; i < a.trace.length; i += 1) assert.ok((a.trace[i]?.temp ?? 0) >= (a.trace[i - 1]?.temp ?? 0))
  assert.ok((a.trace.at(-1)?.temp ?? 0) <= a.summary.peak)
  // Intake is cooler than exhaust, exhaust cooler than the centre.
  assert.ok(a.summary.probes.b < a.summary.probes.c && a.summary.probes.c < a.summary.probes.a)
})

test('more airflow lowers the peak and settles faster; a cold heater keeps the ambient', () => {
  const base = simulate(BASELINE).summary
  const windy = simulate({ ...BASELINE, airflow: 90 }).summary
  assert.ok(windy.peak < base.peak)
  assert.ok(windy.settle < base.settle)
  const off = simulate({ ...BASELINE, heater: 0 }).summary
  assert.equal(off.peak, BASELINE.ambient)
  assert.equal(off.energy, 0)
})

test('parameters are checked: every field a whole number in its range', () => {
  assert.deepEqual(parseParams(fields(BASELINE)), BASELINE)
  assert.throws(() => parseParams({ ...fields(BASELINE), heater: '101' }), /Heater output must be a whole number from 0 to 100/)
  assert.throws(() => parseParams({ ...fields(BASELINE), ambient: '4' }), LabError)
  assert.throws(() => parseParams({ ...fields(BASELINE), airflow: '' }), /Airflow/)
  assert.throws(() => parseParams({ ...fields(BASELINE), insulation: '0.7' }), /Insulation factor/)
})

test('the thermal field has the grid shape, stays between ambient and peak, and is hottest near the heater', () => {
  const field = thermalField(BASELINE)
  const { peak } = simulate(BASELINE).summary
  assert.equal(field.length, GRID.rows)
  assert.ok(field.every((row) => row.length === GRID.cols))
  const all = field.flat()
  assert.ok(all.every((t) => t >= BASELINE.ambient && t <= peak))
  assert.ok((field[GRID.rows - 2]?.[GRID.cols / 2] ?? 0) > (field[0]?.[0] ?? 0))
})

test('traces export as CSV with one column per run', () => {
  const state = seed(NOW)
  const csv = tracesCsv([state.runs[2], state.runs[1]].filter((r) => r !== undefined))
  const lines = csv.trim().split('\n')
  assert.equal(lines[0], 'minute,Baseline · 18,High airflow · 17')
  assert.equal(lines.length, HORIZON_MIN / STEP_MIN + 2)
  assert.match(lines[1] ?? '', /^0,21,21$/)
})

test('the lab runs, keeps drafts, saves and loads snapshots, and refuses bad input without saving', async () => {
  let ids = 0
  const store = memoryStore()
  const lab = await Lab.open({ store, clock: () => NOW, newId: (kind) => `${kind}-${++ids}` })
  assert.equal(store.saved, 1)
  assert.equal(lab.state.dirty, false)

  await lab.setDraft(fields({ ...BASELINE, heater: 90 }))
  assert.equal(lab.state.dirty, true)
  const run = await lab.runSimulation(fields({ ...BASELINE, heater: 90 }), 'Hot')
  assert.equal(run.number, 19)
  assert.equal(run.name, 'Hot')
  assert.equal(lab.state.dirty, false)
  assert.equal(lab.latestRun()?.id, run.id)

  const snapshot = await lab.saveSnapshot('  Hot heater  ')
  assert.equal(snapshot.name, 'Hot heater')
  await lab.resetDraft()
  assert.deepEqual(lab.state.draft, BASELINE)
  await lab.loadSnapshot(snapshot.id)
  assert.equal(lab.state.draft.heater, 90)
  await lab.deleteSnapshot(snapshot.id)
  assert.ok(!lab.snapshots().some((s) => s.id === snapshot.id))

  const saves = store.saved
  await assert.rejects(lab.saveSnapshot(''), /Give the snapshot a name/)
  await assert.rejects(lab.createModel('chamber 04', 'enclosure'), /already a model/)
  await assert.rejects(lab.selectModel('nope'), /no such model/)
  await assert.rejects(lab.runSimulation(fields({ ...BASELINE, heater: 500 })), /Heater/)
  assert.equal(store.saved, saves)

  const model = await lab.createModel('Cold store', 'airflow')
  assert.equal(lab.activeModel().id, model.id)
  assert.equal(model.kind, 'Airflow chamber · 2D')
  assert.equal(lab.latestRun(), undefined)
})
