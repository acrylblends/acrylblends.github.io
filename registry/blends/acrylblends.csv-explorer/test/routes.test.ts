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

test('the first page is the seeded dataset: the file, the health summary, the chart and the preview', () =>
  withApp(async (app) => {
    const page = await app.page('/')
    assert.equal(page.status, 200)
    assert.match(page.html, /sales_q3_2026\.csv/)
    assert.match(page.html, /Explore data/)
    assert.match(page.html, /24,680/)
    assert.match(page.html, /99\.8% valid rows/)
    assert.match(page.html, /Alpine Systems/)
    assert.match(page.html, /€18,420/)
    assert.match(page.html, /Revenue by region|Sum of revenue by region/)
    assert.match(page.html, /DACH/)
  }))

test('the datasets list names the file and its shape', () =>
  withApp(async (app) => {
    const page = await app.page('/datasets')
    assert.equal(page.status, 200)
    assert.match(page.html, /Sales Q3 2026/)
    assert.match(page.html, /24,680 rows/)
    assert.match(page.html, /8 columns/)
  }))

test('a dataset page sorts, searches and filters', () =>
  withApp(async (app) => {
    const dataset = app.root.tables.first()
    assert.ok(dataset !== undefined)
    const ascending = await app.page(`/datasets/${dataset.id}?sort=revenue&dir=asc`)
    assert.match(ascending.html, /Rows 1–50 of 24,680/)
    const search = await app.page(`/datasets/${dataset.id}?q=Alpine`)
    assert.match(search.html, /Alpine Systems/)
    assert.doesNotMatch(search.html, /Nordic Labs/)
    const filtered = await app.page(`/datasets/${dataset.id}?f_region=Nordics`)
    assert.match(filtered.html, /Nordic Labs/)
    assert.doesNotMatch(filtered.html, /Alpine Systems/)
  }))

test('the chart page charts a column and saves the view', () =>
  withApp(async (app) => {
    const dataset = app.root.tables.first()
    assert.ok(dataset !== undefined)
    const chart = await app.page(`/datasets/${dataset.id}/chart?groupBy=channel&metric=revenue`)
    assert.equal(chart.status, 200)
    assert.match(chart.html, /Sum of revenue by channel/)
    assert.match(chart.html, /Save this view/)
    const saved = await app.post(`/datasets/${dataset.id}/views`, { name: 'Channel report', groupBy: 'channel', metric: 'revenue', q: '' })
    assert.equal(saved.status, 303)
    assert.equal(noticeOf(saved).kind, 'ok')
    const view = app.root.tables.views(dataset.id).find((item) => item.name === 'Channel report')
    assert.ok(view !== undefined)
    const page = await app.page(`/views/${view.id}`)
    assert.match(page.html, /Channel report/)
    assert.match(page.html, /Sum of revenue by channel/)
  }))

test('a seeded view applies its filter and chart', () =>
  withApp(async (app) => {
    const view = app.root.tables.views().find((item) => item.name === 'DACH region')
    assert.ok(view !== undefined)
    const page = await app.page(`/views/${view.id}`)
    assert.equal(page.status, 200)
    assert.match(page.html, /DACH region/)
    assert.match(page.html, /region = DACH/)
    assert.match(page.html, /by channel/)
  }))

test('the export is the filtered rows as CSV', () =>
  withApp(async (app) => {
    const dataset = app.root.tables.first()
    assert.ok(dataset !== undefined)
    const response = await app.root.router.request(`/datasets/${dataset.id}/export.csv`)
    assert.equal(response.status, 200)
    assert.match(response.headers.get('content-type') ?? '', /text\/csv/)
    const text = await response.text()
    assert.match(text.split('\n')[0] ?? '', /^order_id,customer,revenue,order_date,region,quantity,channel,status$/)
  }))

test('the import page makes a dataset from pasted CSV, and an invalid file keeps the form', () =>
  withApp(async (app) => {
    const form = await app.page('/import')
    assert.equal(form.status, 200)
    assert.match(form.html, /Import a CSV/)
    const invalid = await app.post('/import', { name: 'Bad', fileName: '', text: 'only_one_column' })
    assert.equal(invalid.status, 200)
    assert.match(await invalid.text(), /at least two columns/)
    const created = await app.post('/import', { name: 'Tiny sales', fileName: '', text: 'customer,revenue,region\nA,10,DACH\nB,20,Nordics' })
    assert.equal(created.status, 303)
    assert.equal(noticeOf(created).kind, 'ok')
    assert.equal(app.root.tables.datasets().length, 2)
    const dataset = app.root.tables.datasets()[1]
    assert.ok(dataset !== undefined)
    assert.match((await app.page(`/datasets/${dataset.id}`)).html, /Tiny sales/)
  }))

test('health answers, an unknown path is a 404, and every feature is a row of the manifest', () =>
  withApp(async (app) => {
    assert.equal((await app.page('/health')).status, 200)
    assert.equal((await app.page('/nope')).status, 404)
    assert.deepEqual(readManifest().plugins.map((row) => row.id), [
      'router',
      'home',
      'tables',
      'table-shell',
      'explorer',
      'imports',
      'views',
      'extensions',
      'server',
      'acryl-door',
    ])
  }))

test('switching the views plugin off leaves the app running without it', async () => {
  const manifest = readManifest()
  const without = {
    ...manifest,
    plugins: manifest.plugins.map((row) => (row.id === 'views' ? { ...row, disabled: true } : row)),
  }
  const home = await mkdtemp(join(scratch, 'app-test-off-'))
  let ids = 0
  const app = await createApp(pinnedInstance(home, { root: projectRoot }), {
    listen: false,
    manifest: without,
    overrides: { tables: { clock: () => new Date(2026, 10, 6, 9, 41), newId: (kind: string) => `${kind}-${++ids}` } },
  })
  try {
    const dataset = await app.root.router.request('/', { headers: { accept: 'text/html' } })
    assert.equal(dataset.status, 200)
    assert.match(await dataset.text(), /Explore data/)
    assert.equal((await app.root.router.request('/views/x')).status, 404)
  } finally {
    await app.stop()
    await rm(home, { recursive: true, force: true })
  }
})
