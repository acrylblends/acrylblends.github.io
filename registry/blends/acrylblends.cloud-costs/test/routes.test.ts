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

test('the first page is the cost overview with the mockup spend and services', () =>
  withApp(async (app) => {
    const page = await app.page('/')
    assert.equal(page.status, 200)
    assert.match(page.html, /Cloud spend/)
    assert.match(page.html, /€18,462\.80/)
    assert.match(page.html, /74%/)
    assert.match(page.html, /Projected month end/)
    assert.match(page.html, /Compute \/ EC2/)
    assert.match(page.html, /Network egress/)
    assert.match(page.html, /Daily cloud spend/)
    assert.match(page.html, /Spend by service/)
  }))

test('the overview answers at /costs too', () =>
  withApp(async (app) => {
    const page = await app.page('/costs')
    assert.equal(page.status, 200)
    assert.match(page.html, /Cloud spend/)
  }))

test('the cost explorer filters by provider and service', () =>
  withApp(async (app) => {
    const aws = app.root.finops.providers().find((provider) => provider.sourceType === 'aws')
    assert.ok(aws !== undefined)
    const page = await app.page(`/explorer?provider=${aws.id}`)
    assert.equal(page.status, 200)
    assert.match(page.html, /Cost explorer/)
    assert.match(page.html, /Amazon Web Services/)
    assert.doesNotMatch(page.html, /Object storage<\/b>/)
    const service = await app.page('/explorer?service=Network%20egress')
    assert.match(service.html, /Network egress/)
    assert.doesNotMatch(service.html, /Managed database<\/b>/)
  }))

test('the import page imports a provider file and records a duplicate', () =>
  withApp(async (app) => {
    const aws = app.root.finops.providers().find((provider) => provider.sourceType === 'aws')
    assert.ok(aws !== undefined)
    const form = await app.page('/imports')
    assert.equal(form.status, 200)
    assert.match(form.html, /Import billing data/)
    assert.match(form.html, /Import history/)
    const text = 'service,account,region,day,amount,currency\nNew service,prod-aws,eu-central-1,2026-11-07,123.45,EUR'
    const imported = await app.post('/imports', { providerId: aws.id, fileName: 'aws-extra.csv', text })
    assert.equal(imported.status, 303)
    assert.equal(noticeOf(imported).kind, 'ok')
    const duplicate = await app.post('/imports', { providerId: aws.id, fileName: 'aws-extra.csv', text })
    assert.equal(noticeOf(duplicate).kind, 'warn')
    assert.match(noticeOf(duplicate).text, /duplicate/)
    const page = await app.page('/imports')
    assert.match(page.html, /aws-extra\.csv/)
    assert.match(page.html, /duplicate/)
    const invalid = await app.post('/imports', { providerId: aws.id, fileName: 'bad.csv', text: 'service,day\nEC2,2026-11-01' })
    assert.equal(invalid.status, 200)
    assert.match(await invalid.text(), /no “amount” column/)
  }))

test('the budgets page lists the budgets and adds one', () =>
  withApp(async (app) => {
    const page = await app.page('/budgets')
    assert.match(page.html, /Budgets & alerts/)
    assert.match(page.html, /Cloud infrastructure/)
    assert.match(page.html, /at risk/)
    const created = await app.post('/budgets', { name: 'Data platform', scope: 'logging', limit: '8000', alertThreshold: '80' })
    assert.equal(created.status, 303)
    assert.equal(app.root.finops.budgets().length, 6)
    assert.match((await app.page('/budgets')).html, /Data platform/)
    const duplicate = await app.post('/budgets', { name: 'data platform', scope: 'logging', limit: '1', alertThreshold: '80' })
    assert.equal(duplicate.status, 200)
    assert.match(await duplicate.text(), /already exists/)
  }))

test('the alerts page lists the open alerts', () =>
  withApp(async (app) => {
    const page = await app.page('/alerts')
    assert.equal(page.status, 200)
    assert.match(page.html, /Alert log/)
    assert.match(page.html, /Network egress/)
    assert.match(page.html, /open/)
  }))

test('the allocation rules page shows the rules, the unallocated spend and adds a rule', () =>
  withApp(async (app) => {
    const page = await app.page('/allocation-rules')
    assert.match(page.html, /Allocation rules/)
    assert.match(page.html, /Platform/)
    assert.match(page.html, /unallocated/)
    const created = await app.post('/allocation-rules', { service: 'egress', team: 'Network' })
    assert.equal(created.status, 303)
    assert.equal(app.root.finops.rules().length, 3)
    assert.match((await app.page('/allocation-rules')).html, /Network/)
  }))

test('health answers, an unknown path is a 404, and every feature is a row of the manifest', () =>
  withApp(async (app) => {
    assert.equal((await app.page('/health')).status, 200)
    assert.equal((await app.page('/nope')).status, 404)
    assert.deepEqual(readManifest().plugins.map((row) => row.id), [
      'router',
      'home',
      'finops',
      'finops-shell',
      'overview',
      'explorer',
      'budgets',
      'extensions',
      'server',
      'acryl-door',
    ])
  }))

test('switching the budgets plugin off leaves the app running without it', async () => {
  const manifest = readManifest()
  const without = {
    ...manifest,
    plugins: manifest.plugins.map((row) => (row.id === 'budgets' ? { ...row, disabled: true } : row)),
  }
  const home = await mkdtemp(join(scratch, 'app-test-off-'))
  let ids = 0
  const app = await createApp(pinnedInstance(home, { root: projectRoot }), {
    listen: false,
    manifest: without,
    overrides: { finops: { clock: () => new Date(2026, 10, 6, 9, 41), newId: (kind: string) => `${kind}-${++ids}` } },
  })
  try {
    const overview = await app.root.router.request('/', { headers: { accept: 'text/html' } })
    assert.equal(overview.status, 200)
    assert.match(await overview.text(), /Cloud spend/)
    assert.equal((await app.root.router.request('/budgets')).status, 404)
  } finally {
    await app.stop()
    await rm(home, { recursive: true, force: true })
  }
})
