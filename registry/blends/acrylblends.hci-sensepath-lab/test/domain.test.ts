import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEFAULT_SENSITIVITY, Lab, LabError, MODALITIES, compareObservations, defaultSettings, memoryStore, modalityOf, parseSettings, runEvents, seed, simulate } from '../plugins/sensepath/index.ts'
import { NOW } from './support.ts'

const open = async () => {
  let ids = 0
  const store = memoryStore()
  const lab = await Lab.open({ store, clock: () => NOW, newId: (kind) => `${kind}-n${++ids}` })
  return { lab, store }
}

test('the seed reads as the mockup: six modalities at the default calibration, speech at 92% and 1.4 s, two saved observations', () => {
  const s = seed(NOW)
  assert.equal(MODALITIES.length, 6)
  assert.deepEqual(Object.values(s.settings).map((x) => x.sensitivity), [72, 72, 72, 72, 72, 72])
  const speech = s.runs.find((r) => r.modality === 'speech')
  assert.deepEqual([speech?.completion, speech?.latency], [92, 1.4])
  assert.deepEqual(s.observations.map((o) => o.modality), ['gesture', 'speech'])
})

test('at the default calibration every modality reproduces its illustrative figure', () => {
  for (const m of MODALITIES) {
    const r = simulate(m, defaultSettings())
    assert.deepEqual([r.completion, r.latency], [m.completion, m.latency], m.id)
  }
})

test('sensitivity trades misses for accidental activations; feedback and variant add small offsets; the model is deterministic', () => {
  const speech = modalityOf('speech')
  const at = (sensitivity: number) => simulate(speech, { ...defaultSettings(), sensitivity })
  assert.ok(at(40).completion < at(72).completion && at(100).completion < at(72).completion)
  assert.ok(at(40).completion < at(100).completion, 'low sensitivity misses more than high triggers by accident')
  assert.ok(at(100).latency < at(72).latency && at(40).latency > at(72).latency)
  assert.equal(at(10).outcome, 'missed')
  assert.equal(at(72).outcome, 'completed')
  assert.deepEqual(at(55), at(55))
  assert.equal(simulate(speech, { ...defaultSettings(), feedback: 'text' }).completion, 90)
  assert.equal(simulate(modalityOf('haptics'), { ...defaultSettings(), feedback: 'haptic' }).completion, 90)
  assert.equal(simulate(speech, { ...defaultSettings(), variant: 1 }).completion, 90)
  assert.deepEqual(runEvents(1.4, 'completed').map((e) => e.t), [0, 840, 1400, 1600])
  assert.equal(runEvents(1, 'missed').at(-1)?.label, 'Task missed')
})

test('settings are checked field by field', () => {
  const cur = defaultSettings()
  assert.deepEqual(parseSettings({ sensitivity: '50', feedback: 'text', variant: '2' }, cur), { variant: 2, sensitivity: 50, feedback: 'text' })
  assert.deepEqual(parseSettings({}, cur), cur)
  assert.throws(() => parseSettings({ sensitivity: '5' }, cur), /Sensitivity must be a whole number from 10 to 100%/)
  assert.throws(() => parseSettings({ sensitivity: '50.5' }, cur), LabError)
  assert.throws(() => parseSettings({ feedback: 'smell' }, cur), /Pick a feedback style/)
  assert.throws(() => parseSettings({ variant: '3' }, cur), /three variants/)
  assert.equal(DEFAULT_SENSITIVITY, 72)
})

test('a run applies the form calibration and saves it with the run in one save; a refused run saves nothing', async () => {
  const { lab, store } = await open()
  const saves = store.saved
  const run = await lab.run('gesture', { sensitivity: '40', feedback: 'text' })
  assert.equal(store.saved, saves + 1)
  assert.deepEqual(lab.settings('gesture'), { variant: 0, sensitivity: 40, feedback: 'text' })
  assert.equal(lab.latestRun('gesture')?.id, run.id)
  assert.match(run.summary, /Gesture recognition profile \(Point and select at 40% sensitivity, text only\)/)
  await assert.rejects(lab.run('gesture', { sensitivity: '200' }), /Sensitivity/)
  await assert.rejects(lab.run('nope'), /no such modality/)
  assert.equal(store.saved, saves + 1)
  const missed = await lab.run('bci', { sensitivity: '10' })
  assert.equal(missed.outcome, 'missed')
  assert.match(missed.summary, /Task missed/)
})

test('calibration and reset are per modality', async () => {
  const { lab } = await open()
  await lab.calibrate('speech', { variant: '1' })
  await lab.calibrate('speech', { sensitivity: '60' })
  assert.deepEqual(lab.settings('speech'), { variant: 1, sensitivity: 60, feedback: 'visual-text' })
  assert.equal(lab.settings('gesture').sensitivity, 72)
  await lab.reset('speech')
  assert.deepEqual(lab.settings('speech'), defaultSettings())
})

test('an observation needs a run, is saved once per run, and takes a note or the run summary', async () => {
  const { lab } = await open()
  await assert.rejects(lab.saveObservation('haptics', ''), /Run the Haptic interface task simulation first/)
  const run = await lab.run('haptics')
  const o = await lab.saveObservation('haptics', '  felt fine  ')
  assert.deepEqual([o.note, o.runId, o.completion], ['felt fine', run.id, run.completion])
  await assert.rejects(lab.saveObservation('haptics', ''), /already saved/)
  await lab.run('haptics')
  assert.equal((await lab.saveObservation('haptics', '')).note, lab.latestRun('haptics')?.summary)
  await assert.rejects(lab.saveObservation('haptics', 'x'.repeat(201)), /at most 200/)
  await lab.deleteObservation(o.id)
  await assert.rejects(lab.deleteObservation(o.id), /no such observation/)
})

test('observations are capped at twenty', async () => {
  const { lab } = await open()
  for (let i = 0; i < 18; i += 1) {
    await lab.run('keyboard')
    await lab.saveObservation('keyboard', '')
  }
  assert.equal(lab.state.observations.length, 20)
  await lab.run('keyboard')
  await assert.rejects(lab.saveObservation('keyboard', ''), /At most 20 observations/)
})

test('comparing two observations reports the differences', async () => {
  const { lab } = await open()
  await lab.run('speech', { sensitivity: '50', feedback: 'text' })
  const o = await lab.saveObservation('speech', '')
  const c = lab.compare('obs-s2', o.id)
  assert.equal(c.completion, o.completion - 92)
  assert.equal(c.latency, Math.round((o.latency - 1.4) * 10) / 10)
  assert.deepEqual(c.differences, ['sensitivity: 72% → 50%', 'feedback: Visual + text confirmation → Text only'])
  assert.throws(() => lab.compare('obs-s2', 'obs-s2'), /two different/)
  assert.throws(() => lab.compare('obs-s2', 'nope'), /Pick two saved observations/)
  assert.deepEqual(compareObservations(c.b, c.a).differences.length, 2)
})
