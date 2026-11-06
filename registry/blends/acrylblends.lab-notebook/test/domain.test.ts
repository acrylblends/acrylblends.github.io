import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  cleanFilename,
  cleanMimeType,
  cleanNotebookCode,
  cleanObjective,
  cleanProtocol,
  cleanSampleId,
  cleanSize,
  cleanUnit,
  cleanValue,
  convert,
  formatNumber,
  LabError,
  sizeText,
  stampText,
  type LabState,
} from '../plugins/lab/index.ts'
import { Lab } from '../plugins/lab/lab.ts'
import { seed, SEED_FACTS } from '../plugins/lab/seed.ts'
import { memoryStore } from '../plugins/lab/store.ts'
import { NOW } from './support.ts'

const ids = (): ((kind: string) => string) => {
  let next = 0
  return (kind) => `${kind}-${String(++next)}`
}

async function open(store = memoryStore<LabState>()): Promise<{ lab: Lab; store: ReturnType<typeof memoryStore<LabState>> }> {
  return { lab: await Lab.open({ store, clock: () => NOW, newId: ids() }), store }
}

test('the seed is the mockup notebook: three notebooks, 23 experiments, the record and its evidence', () => {
  const state = seed(NOW, ids())
  assert.equal(state.notebooks.length, SEED_FACTS.notebooks)
  assert.equal(state.experiments.length, SEED_FACTS.experiments)
  assert.equal(state.measurements.length, SEED_FACTS.measurements)
  assert.equal(state.observations.length, SEED_FACTS.observations)
  assert.equal(state.attachments.length, SEED_FACTS.attachments)
  assert.deepEqual(state.notebooks.map((notebook) => notebook.code), ['M-042', 'W-018', 'S-006'])
  assert.equal(state.experiments.filter((experiment) => experiment.notebookId === state.notebooks[0]?.id).length, 8)
  const active = state.experiments[0]
  assert.ok(active !== undefined)
  assert.equal(active.title, 'Polymer tensile test')
  assert.equal(active.code, 'EXP-042-01')
  assert.equal(active.question, 'Effect of fibre ratio on tensile strength')
  assert.equal(active.protocolVersion, 'v1.3')
  const averages = state.measurements.filter((measurement) => measurement.kind === 'average')
  assert.deepEqual(averages.map((measurement) => measurement.value), [42.6, 51.8, 58.3972])
  assert.equal(state.measurements.filter((measurement) => measurement.kind === 'sample').length, 15)
})

test('unit conversion is exact and formatted without locale drift', () => {
  assert.equal(formatNumber(convert(58.4, 'MPa', 'psi')), '8,470.2')
  assert.equal(formatNumber(convert(58.3972, 'MPa', 'psi')), '8,469.8')
  assert.equal(formatNumber(convert(58.4, 'MPa', 'bar')), '584')
  assert.equal(formatNumber(convert(1, 'bar', 'MPa')), '0.1')
  assert.equal(formatNumber(convert(8_469.8, 'psi', 'MPa')), '58.4')
  assert.equal(formatNumber(1_200), '1,200')
  assert.equal(formatNumber(42.6), '42.6')
  assert.equal(convert(0, 'MPa', 'psi'), 0)
  assert.equal(sizeText(1_200_000), '1.2 MB')
  assert.equal(stampText('2026-11-04T13:42:00.000Z'), '04 NOV 2026 · 13:42')
})

test('validation names the unit, code, protocol, sample, value, file and size', () => {
  assert.equal(cleanUnit('bar'), 'bar')
  assert.throws(() => cleanUnit('furlong'), /MPa, bar or psi/)
  assert.equal(cleanNotebookCode(' m-042 '), 'M-042')
  assert.throws(() => cleanNotebookCode('42'), /M-042/)
  assert.throws(() => cleanObjective('too short'), /20 characters/)
  assert.equal(cleanProtocol('v1.3'), 'v1.3')
  assert.throws(() => cleanProtocol('1.3'), /v1.3/)
  assert.equal(cleanSampleId('a-01'), 'A-01')
  assert.throws(() => cleanSampleId('A1'), /A-01/)
  assert.throws(() => cleanValue('0'), /positive/)
  assert.throws(() => cleanValue('nope'), /positive/)
  assert.equal(cleanValue('58.39724'), 58.3972)
  assert.equal(cleanFilename('series.csv'), 'series.csv')
  assert.throws(() => cleanFilename('series'), /extension/)
  assert.throws(() => cleanFilename('a/b.csv'), /folder/)
  assert.equal(cleanMimeType('text/csv'), 'text/csv')
  assert.throws(() => cleanMimeType('application/zip'), /image, a CSV or a PDF/)
  assert.throws(() => cleanSize(0), /file size/)
})

test('observations append, never rewrite, and every append is audited', async () => {
  const { lab, store } = await open()
  const experiment = lab.activeExperiment()
  const before = lab.observations(experiment.id).length
  const observation = await lab.addObservation(experiment.id, '  Grip pressure was raised before series C.  ')
  assert.equal(observation.body, 'Grip pressure was raised before series C.')
  assert.equal(observation.author, 'You')
  assert.equal(lab.observations(experiment.id).length, before + 1)
  assert.equal(lab.observations(experiment.id)[0]?.id, observation.id)
  assert.equal(lab.audit(experiment.id)[0]?.action, 'Observation appended')
  assert.equal(store.saved, 1)
  await assert.rejects(lab.addObservation(experiment.id, ''), /some text/)
  await assert.rejects(lab.addObservation('missing', 'x'), /no longer exists/)
})

test('measurements append as sample rows and are audited', async () => {
  const { lab } = await open()
  const experiment = lab.activeExperiment()
  const measurement = await lab.addMeasurement(experiment.id, { sampleId: 'C-06', formulation: 'C', parameter: 'Tensile strength', value: '58.7', unit: 'MPa' })
  assert.equal(measurement.kind, 'sample')
  assert.equal(measurement.value, 58.7)
  assert.equal(lab.measurements(experiment.id, { kind: 'sample' }).length, 16)
  assert.equal(lab.audit(experiment.id)[0]?.action, 'Measurement appended for C-06')
  await assert.rejects(lab.addMeasurement(experiment.id, { sampleId: 'X', formulation: 'C', parameter: 'p', value: 1, unit: 'MPa' }), /A-01/)
  await assert.rejects(lab.addMeasurement(experiment.id, { sampleId: 'C-06', formulation: 'C', parameter: 'p', value: -1, unit: 'MPa' }), /positive/)
})

test('attachments validate their type and size and are audited', async () => {
  const { lab } = await open()
  const experiment = lab.activeExperiment()
  const image = await lab.addAttachment(experiment.id, { filename: 'specimen-d.jpg', mimeType: 'image/jpeg', sizeBytes: 400_000 })
  assert.equal(image.kind, 'image')
  const csv = await lab.addAttachment(experiment.id, { filename: 'series-b.csv', mimeType: 'text/csv', sizeBytes: 20_000 })
  assert.equal(csv.kind, 'csv')
  assert.equal(lab.attachments(experiment.id).length, 5)
  await assert.rejects(lab.addAttachment(experiment.id, { filename: 'a.zip', mimeType: 'application/zip', sizeBytes: 1 }), /image, a CSV or a PDF/)
  await assert.rejects(lab.addAttachment(experiment.id, { filename: 'a.pdf', mimeType: 'application/pdf', sizeBytes: 0 }), /file size/)
})

test('a notebook and an experiment are created with valid codes and numbers', async () => {
  const { lab } = await open()
  const notebook = await lab.addNotebook({ code: 'C-003', title: 'Coating Trials', project: 'Coatings / Batch 01' })
  assert.equal(notebook.code, 'C-003')
  assert.equal(lab.notebooks().length, 4)
  await assert.rejects(lab.addNotebook({ code: 'C-003', title: 'Duplicate', project: '' }), /already exists/)
  const experiment = await lab.addExperiment({ notebookId: notebook.id, title: 'Salt spray', objective: 'Measure coating blistering after 500 hours of salt spray exposure.', method: 'Panels are scribed and exposed in the salt chamber at 35 °C.', protocolVersion: 'v2.0' })
  assert.equal(experiment.code, 'EXP-003-01')
  assert.equal(experiment.status, 'planned')
  assert.equal(lab.experiments(notebook.id).length, 1)
  await assert.rejects(lab.addExperiment({ notebookId: 'missing', title: 'x', objective: 'x'.repeat(30), method: 'x'.repeat(30), protocolVersion: 'v1.0' }), /notebook/)
})

test('the export and the CSV keep the record and the specimen rows', async () => {
  const { lab } = await open()
  const experiment = lab.activeExperiment()
  const exported = lab.exportRecord(experiment.id)
  assert.equal(exported.experiment.code, 'EXP-042-01')
  assert.equal(exported.measurements.length, 18)
  assert.equal(exported.observations.length, 2)
  const csv = lab.csv(experiment.id)
  const lines = csv.trim().split('\n')
  assert.equal(lines[0], 'sample_id,formulation,parameter,value,unit,measured_at')
  assert.equal(lines.length, 16)
  assert.match(csv, /C-05,C,Tensile strength,58\.6,MPa/)
  assert.doesNotMatch(csv, /SERIES/)
})

test('a store failure is a storage error and leaves the record unchanged', async () => {
  const broken = await Lab.open({
    store: {
      load: async () => undefined,
      save: async () => {
        throw new Error('disk full')
      },
    },
    clock: () => NOW,
    newId: ids(),
  })
  const experiment = broken.activeExperiment()
  const before = broken.observations(experiment.id).length
  await assert.rejects(broken.addObservation(experiment.id, 'A note'), (error: unknown) => error instanceof LabError && error.code === 'storage')
  assert.equal(broken.observations(experiment.id).length, before)
})

test('the seed is deterministic and the active experiment is the first record', () => {
  const first = seed(NOW, ids())
  const second = seed(NOW, ids())
  assert.deepEqual(first, second)
  const notebook = first.notebooks[0]
  assert.ok(notebook !== undefined)
  assert.equal(first.experiments[0]?.notebookId, notebook.id)
  assert.ok(first.measurements.every((measurement) => measurement.measuredAt.endsWith('Z')))
})
