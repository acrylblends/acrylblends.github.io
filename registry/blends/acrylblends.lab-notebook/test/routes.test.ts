import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import { createApp, readManifest } from '../src/app.ts'
import type { LabState } from '../plugins/lab/domain.ts'
import { pinnedInstance } from '../plugins/instance/index.ts'
import { noticeOf, NOW, projectRoot, withApp } from './support.ts'

const scratch = join(projectRoot, '.acrylblends', 'test')
mkdirSync(scratch, { recursive: true })

test('the first page is the mockup record: the sidebar, the paper, the converter and no remote asset', () =>
  withApp(async (app) => {
    const page = await app.page('/')
    assert.equal(page.status, 200)
    assert.match(page.html, /FIELD <i>／<\/i> LAB/)
    for (const label of ['MY NOTEBOOKS', 'Materials Research', 'Water Quality Study', 'Sensor Calibration', '8 experiments', '4 experiments', '11 experiments', 'EXPERIMENTS', 'Polymer tensile test', 'Thermal cycling', 'UV exposure']) {
      assert.match(page.html, new RegExp(label))
    }
    assert.match(page.html, /NOTEBOOK M-042 \/ EXPERIMENT 01/)
    assert.match(page.html, /<h1>Polymer tensile test<\/h1>/)
    assert.match(page.html, /<h2>Effect of fibre ratio on tensile strength<\/h2>/)
    assert.match(page.html, /Author: Dr\. Maya Chen &nbsp; · &nbsp; Started 02 Nov 2026 &nbsp; · &nbsp; Protocol v1\.3/)
    for (const section of ['01 / OBJECTIVE', '02 / MATERIALS &amp; METHOD', '03 / RESULTS', '04 / OBSERVATIONS', '05 / AUDIT TRAIL']) {
      assert.match(page.html, new RegExp(section))
    }
    assert.match(page.html, /<small>FORMULATION A<\/small><b>42\.6<\/b>/)
    assert.match(page.html, /<small>FORMULATION B<\/small><b>51\.8<\/b>/)
    assert.match(page.html, /<small>FORMULATION C<\/small><b>58\.4<\/b>/)
    assert.match(page.html, /MEAN TENSILE STRENGTH/)
    assert.match(page.html, /Formulation C shows the highest mean tensile strength/)
    assert.match(page.html, /58\.4 MPa = 8,469\.8 psi/)
    assert.match(page.html, /Instron 5967/)
    assert.match(page.html, /Materials Lab · Bench 03/)
    assert.match(page.html, /3 files · 2 images · 1 CSV/)
    assert.match(page.html, /RECORD COMPLETE/)
    assert.doesNotMatch(page.html, /https?:\/\//)
  }))

test('the converter is exact, validates input and keeps the record in place', () =>
  withApp(async (app) => {
    const experiment = app.root.lab.activeExperiment()
    const converted = await app.post('/convert', { experimentId: experiment.id, value: '58.4', from: 'MPa', to: 'psi' })
    assert.equal(converted.status, 200)
    assert.match(await converted.text(), /58\.4 MPa = 8,470\.2 psi/)
    const invalid = await app.post('/convert', { experimentId: experiment.id, value: '0', from: 'MPa', to: 'psi' })
    assert.equal(invalid.status, 200)
    const html = await invalid.text()
    assert.match(html, /positive number/)
    assert.match(html, /58\.4 MPa = 8,469\.8 psi/)
    const badUnit = await app.post('/convert', { experimentId: experiment.id, value: '12', from: 'furlong', to: 'MPa' })
    assert.match(await badUnit.text(), /MPa, bar or psi/)
  }))

test('an observation appends to the record and to its audit trail', () =>
  withApp(async (app) => {
    const experiment = app.root.lab.activeExperiment()
    const before = app.root.lab.observations(experiment.id).length
    const response = await app.post(`/experiments/${experiment.id}/observations`, { body: 'Grip pressure raised before series C.' })
    assert.equal(response.status, 303)
    assert.equal(noticeOf(response).kind, 'ok')
    assert.equal(noticeOf(response).path, `/experiments/${experiment.id}`)
    assert.equal(app.root.lab.observations(experiment.id).length, before + 1)
    assert.equal(app.root.lab.audit(experiment.id)[0]?.action, 'Observation appended')
    assert.match((await app.page(`/experiments/${experiment.id}`)).html, /Grip pressure raised before series C\./)
    const empty = await app.post(`/experiments/${experiment.id}/observations`, { body: '' })
    assert.equal(noticeOf(empty).kind, 'error')
    assert.match(noticeOf(empty).text, /some text/)
  }))

test('the data table lists specimen rows, filters by formulation and appends a measurement', () =>
  withApp(async (app) => {
    const experiment = app.root.lab.activeExperiment()
    const page = await app.page('/data')
    assert.equal(page.status, 200)
    assert.match(page.html, /<b>A-01<\/b>/)
    assert.match(page.html, /<b>C-05<\/b>/)
    assert.match(page.html, /Export CSV/)
    const filtered = await app.page('/data?formulation=B')
    assert.match(filtered.html, /<b>B-01<\/b>/)
    assert.doesNotMatch(filtered.html, /<b>A-01<\/b>/)
    const appended = await app.post(`/experiments/${experiment.id}/measurements`, { sampleId: 'C-06', formulation: 'C', parameter: 'Tensile strength', value: '58.7', unit: 'MPa' })
    assert.equal(appended.status, 303)
    assert.equal(noticeOf(appended).kind, 'ok')
    assert.match((await app.page('/data')).html, /<b>C-06<\/b>/)
    const invalid = await app.post(`/experiments/${experiment.id}/measurements`, { sampleId: 'X', formulation: 'C', parameter: 'Tensile strength', value: '-4', unit: 'MPa' })
    assert.equal(invalid.status, 200)
    assert.match(await invalid.text(), /A-01/)
    const csv = await app.root.router.request('/data.csv')
    assert.equal(csv.status, 200)
    assert.match(csv.headers.get('content-type') ?? '', /text\/csv/)
    const text = await csv.text()
    assert.match(text, /^sample_id,formulation,parameter,value,unit,measured_at/)
    assert.equal(text.trim().split('\n').length, 17)
  }))

test('an experiment without samples shows the data table empty state', () =>
  withApp(async (app) => {
    const notebook = app.root.lab.notebooks()[0]
    assert.ok(notebook !== undefined)
    const experiment = await app.root.lab.addExperiment({
      notebookId: notebook.id,
      title: 'Empty series',
      objective: 'Record a series that has not been measured yet for the empty state.',
      method: 'No specimens have been run; the table should say so plainly.',
      protocolVersion: 'v1.0',
    })
    const page = await app.page(`/data?experimentId=${experiment.id}`)
    assert.equal(page.status, 200)
    assert.match(page.html, /No measurements match\./)
  }))

test('attachments list, add and validate the file type and size', () =>
  withApp(async (app) => {
    const experiment = app.root.lab.activeExperiment()
    const page = await app.page(`/experiments/${experiment.id}/attachments`)
    assert.equal(page.status, 200)
    assert.match(page.html, /tensile-series-a\.csv/)
    assert.match(page.html, /specimen-c-fracture\.jpg/)
    const added = await app.post(`/experiments/${experiment.id}/attachments`, { filename: 'specimen-d.jpg', mimeType: 'image/jpeg', sizeBytes: '400000' })
    assert.equal(added.status, 303)
    assert.equal(app.root.lab.attachments(experiment.id).length, 4)
    const badType = await app.post(`/experiments/${experiment.id}/attachments`, { filename: 'a.zip', mimeType: 'application/zip', sizeBytes: '10' })
    assert.equal(badType.status, 200)
    assert.match(await badType.text(), /image, a CSV or a PDF/)
    const badSize = await app.post(`/experiments/${experiment.id}/attachments`, { filename: 'a.pdf', mimeType: 'application/pdf', sizeBytes: '0' })
    assert.equal(badSize.status, 200)
    assert.match(await badSize.text(), /file size/)
  }))

test('the notebook list, the create form and the experiment create form validate and persist', () =>
  withApp(async (app) => {
    const list = await app.page('/notebooks')
    assert.equal(list.status, 200)
    assert.match(list.html, /Materials Research/)
    assert.match(list.html, /NOTEBOOK M-042 · 8 EXPERIMENTS/)
    assert.match(list.html, /NOTEBOOK W-018 · 4 EXPERIMENTS/)
    assert.match(list.html, /NOTEBOOK S-006 · 11 EXPERIMENTS/)
    const badNotebook = await app.post('/notebooks/new', { code: '42', title: 'Coating Trials', project: '' })
    assert.equal(badNotebook.status, 200)
    assert.match(await badNotebook.text(), /M-042/)
    const notebook = await app.post('/notebooks/new', { code: 'C-003', title: 'Coating Trials', project: 'Coatings / Batch 01' })
    assert.equal(notebook.status, 303)
    assert.equal(noticeOf(notebook).kind, 'ok')
    assert.equal(app.root.lab.notebooks().length, 4)
    const created = app.root.lab.notebooks().find((entry) => entry.code === 'C-003')
    assert.ok(created !== undefined)
    const form = await app.page(`/experiments/new?notebookId=${created.id}`)
    assert.match(form.html, /Create experiment/)
    const badExperiment = await app.post('/experiments/new', { notebookId: created.id, title: 'Salt spray', objective: 'too short', method: 'also too short', protocolVersion: 'v2.0' })
    assert.equal(badExperiment.status, 200)
    assert.match(await badExperiment.text(), /20 characters/)
    const experiment = await app.post('/experiments/new', {
      notebookId: created.id,
      title: 'Salt spray',
      objective: 'Measure coating blistering after 500 hours of neutral salt spray exposure.',
      method: 'Scribed panels are exposed in the salt chamber at 35 °C and assessed each week.',
      protocolVersion: 'v2.0',
    })
    assert.equal(experiment.status, 303)
    const path = noticeOf(experiment).path
    assert.match(path, /^\/experiments\//)
    const record = await app.page(path)
    assert.match(record.html, /Salt spray/)
    assert.match(record.html, /EXP-003-01/)
  }))

test('the history and the record export carry the audit trail and the measurements', () =>
  withApp(async (app) => {
    const experiment = app.root.lab.activeExperiment()
    const history = await app.page(`/experiments/${experiment.id}/history`)
    assert.equal(history.status, 200)
    assert.match(history.html, /Experiment created from protocol v1\.3/)
    assert.match(history.html, /Series measurements appended/)
    const exported = await app.root.router.request(`/experiments/${experiment.id}/export.json`)
    assert.equal(exported.status, 200)
    assert.match(exported.headers.get('content-disposition') ?? '', /exp-042-01-record\.json/)
    const body = (await exported.json()) as { experiment: { code: string }; measurements: unknown[]; audit: unknown[] }
    assert.equal(body.experiment.code, 'EXP-042-01')
    assert.equal(body.measurements.length, 18)
    assert.equal(body.audit.length, 4)
  }))

test('health answers, an unknown path is a 404 and a prefixed mount keeps links under the prefix', async () => {
  await withApp(async (app) => {
    assert.equal((await app.page('/health')).status, 200)
    assert.equal((await app.page('/nope')).status, 404)
  })
  const home = await mkdtemp(join(scratch, 'app-test-prefix-'))
  let ids = 0
  const app = await createApp(pinnedInstance(home, { root: projectRoot }), {
    listen: false,
    prefix: '/app',
    overrides: { lab: { clock: () => NOW, newId: (kind: string) => `${kind}-${++ids}` } },
  })
  try {
    const response = await app.root.router.request('/app', { headers: { accept: 'text/html' } })
    assert.equal(response.status, 200)
    const html = await response.text()
    assert.match(html, /href="\/app\/data\?experimentId=/)
    assert.match(html, /action="\/app\/convert"/)
    assert.doesNotMatch(html, /href="\/data"/)
  } finally {
    await app.stop()
    await rm(home, { recursive: true, force: true })
  }
})

test('switching the data plugin off removes the table and the CSV export only', async () => {
  const manifest = readManifest()
  const without = {
    ...manifest,
    plugins: manifest.plugins.map((row) => (row.id === 'data-table' ? { ...row, disabled: true } : row)),
  }
  const home = await mkdtemp(join(scratch, 'app-test-off-data-'))
  let ids = 0
  const app = await createApp(pinnedInstance(home, { root: projectRoot }), {
    listen: false,
    manifest: without,
    overrides: { lab: { clock: () => NOW, newId: (kind: string) => `${kind}-${++ids}` } },
  })
  try {
    assert.equal((await app.root.router.request('/data')).status, 404)
    assert.equal((await app.root.router.request('/data.csv')).status, 404)
    assert.equal((await app.root.router.request('/', { headers: { accept: 'text/html' } })).status, 200)
  } finally {
    await app.stop()
    await rm(home, { recursive: true, force: true })
  }
})

test('switching the record plugin off leaves the data table usable', async () => {
  const manifest = readManifest()
  const without = {
    ...manifest,
    plugins: manifest.plugins.map((row) => (row.id === 'record' ? { ...row, disabled: true } : row)),
  }
  const home = await mkdtemp(join(scratch, 'app-test-off-record-'))
  let ids = 0
  const app = await createApp(pinnedInstance(home, { root: projectRoot }), {
    listen: false,
    manifest: without,
    overrides: { lab: { clock: () => NOW, newId: (kind: string) => `${kind}-${++ids}` } },
  })
  try {
    assert.equal((await app.root.router.request('/')).status, 404)
    assert.equal((await app.root.router.request('/data', { headers: { accept: 'text/html' } })).status, 200)
  } finally {
    await app.stop()
    await rm(home, { recursive: true, force: true })
  }
})

test('a failed save keeps the record with an error notice instead of a lost write', async () => {
  const broken = {
    load: async (): Promise<LabState | undefined> => undefined,
    save: async (): Promise<void> => {
      throw new Error('disk full')
    },
  }
  await withApp(
    async (app) => {
      const experiment = app.root.lab.activeExperiment()
      const response = await app.post(`/experiments/${experiment.id}/observations`, { body: 'A note that cannot be stored.' })
      assert.equal(response.status, 303)
      assert.equal(noticeOf(response).kind, 'error')
      assert.match(noticeOf(response).text, /could not be saved/)
      assert.equal(app.root.lab.observations(experiment.id).length, 2)
    },
    { overrides: { lab: { store: broken } } },
  )
})
