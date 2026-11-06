import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import { createApp, readManifest } from '../src/app.ts'
import type { GarageState } from '../plugins/garage/domain.ts'
import { pinnedInstance } from '../plugins/instance/index.ts'
import { noticeOf, NOW, projectRoot, withApp } from './support.ts'

const scratch = join(projectRoot, '.acrylblends', 'test')
mkdirSync(scratch, { recursive: true })

test('the first page is the mockup logbook: hero, metrics, history, trend, fuel form and reminders', () =>
  withApp(async (app) => {
    const page = await app.page('/')
    assert.equal(page.status, 200)
    assert.match(page.html, /MOTOR<span><i>LOG<\/i><\/span>/)
    assert.match(page.html, /My vehicles/)
    assert.match(page.html, /Maintenance/)
    assert.match(page.html, /Expenses/)
    assert.match(page.html, /Documents/)
    assert.match(page.html, /Volvo XC60 T5/)
    assert.match(page.html, /Registration: W-482LX · VIN ending 7281/)
    assert.match(page.html, /86,420 km/)
    assert.match(page.html, /8\.1 L\/100/)
    assert.match(page.html, /€2,184/)
    assert.match(page.html, /€0\.31/)
    assert.match(page.html, /1,580 km/)
    assert.match(page.html, /Annual service/)
    assert.match(page.html, /Log fuel fill-up/)
    assert.match(page.html, /Oil &amp; filter service/)
    assert.match(page.html, /Running cost trend/)
    assert.doesNotMatch(page.html, /https?:\/\//)
  }))

test('a fuel entry moves the odometer and the year cost, and invalid input reports the error', () =>
  withApp(async (app) => {
    const before = app.root.garage.costs().costThisYear
    const created = await app.post('/fuel', { date: '2026-11-05', odometerKm: '86900', litres: '50', totalCost: '90' })
    assert.equal(created.status, 303)
    assert.equal(noticeOf(created).kind, 'ok')
    assert.equal(app.root.garage.vehicle().odometerKm, 86_900)
    assert.equal(app.root.garage.costs().costThisYear, before + 90)
    const invalid = await app.post('/fuel', { date: '2026-11-05', odometerKm: '86900', litres: '0', totalCost: '0' })
    assert.equal(noticeOf(invalid).kind, 'error')
  }))

test('the odometer and a reminder are updated from the profile', () =>
  withApp(async (app) => {
    const updated = await app.post('/odometer', { odometerKm: '87000' })
    assert.equal(noticeOf(updated).kind, 'ok')
    assert.equal(app.root.garage.vehicle().odometerKm, 87_000)
    const backwards = await app.post('/odometer', { odometerKm: '86000' })
    assert.equal(noticeOf(backwards).kind, 'error')
    const reminder = app.root.garage.reminders()[0]
    assert.ok(reminder !== undefined)
    const done = await app.post(`/reminders/${reminder.id}/done`, {})
    assert.equal(noticeOf(done).kind, 'ok')
    assert.equal(app.root.garage.reminders()[0]?.status, 'done')
  }))

test('the service history filters by type and the add form validates and persists', () =>
  withApp(async (app) => {
    const tyres = await app.page('/services?type=tyres')
    assert.match(tyres.html, /Tyre change/)
    assert.doesNotMatch(tyres.html, /Annual service/)
    const form = await app.page('/services/new')
    assert.match(form.html, /Add service record/)
    const invalid = await app.post('/services', { date: '2026-11-04', odometerKm: '86800', type: 'service', provider: '', description: 'Oil', cost: '100' })
    assert.equal(noticeOf(invalid).kind, 'error')
    const created = await app.post('/services', { date: '2026-11-04', odometerKm: '86800', type: 'service', provider: 'Autohaus West', description: 'Oil change', cost: '120', parts: 'oil, filter' })
    assert.equal(noticeOf(created).kind, 'ok')
    assert.equal(app.root.garage.services().length, 5)
  }))

test('the expenses page breaks the costs down and adds an expense', () =>
  withApp(async (app) => {
    const page = await app.page('/expenses')
    assert.equal(page.status, 200)
    assert.match(page.html, /Cost breakdown/)
    assert.match(page.html, /Service/)
    assert.match(page.html, /Fuel/)
    assert.match(page.html, /insurance/)
    const created = await app.post('/expenses', { date: '2026-11-06', category: 'other', amount: '25', note: 'Parking permit' })
    assert.equal(noticeOf(created).kind, 'ok')
    assert.equal(app.root.garage.expenses().length, 4)
    const invalid = await app.post('/expenses', { date: '2026-11-06', category: 'other', amount: '0', note: 'x' })
    assert.equal(noticeOf(invalid).kind, 'error')
  }))

test('the documents page masks the VIN', () =>
  withApp(async (app) => {
    const page = await app.page('/documents')
    assert.equal(page.status, 200)
    assert.match(page.html, /W-482LX/)
    assert.match(page.html, /YV1UZK••••••7281/)
    assert.match(page.html, /masked by default/)
  }))

test('health, 404, prefix and the manifest work', async () => {
  await withApp(async (app) => {
    assert.equal((await app.page('/health')).status, 200)
    assert.equal((await app.page('/nope')).status, 404)
    assert.deepEqual(readManifest().plugins.map((row) => row.id), ['router', 'home', 'garage', 'garage-shell', 'profile', 'services', 'expenses', 'documents', 'extensions', 'server', 'acryl-door'])
  })
  await withApp(
    async (app) => {
      const response = await app.root.router.request('/app', { headers: { accept: 'text/html' } })
      assert.equal(response.status, 200)
      assert.match(await response.text(), /href="\/app\/services/)
    },
    { prefix: '/app' },
  )
})

test('switching the expenses plugin off removes only that page', async () => {
  const manifest = readManifest()
  const without = { ...manifest, plugins: manifest.plugins.map((row) => (row.id === 'expenses' ? { ...row, disabled: true } : row)) }
  const home = await mkdtemp(join(scratch, 'app-test-off-expenses-'))
  let ids = 0
  const app = await createApp(pinnedInstance(home, { root: projectRoot }), {
    listen: false,
    manifest: without,
    overrides: { garage: { clock: () => NOW, newId: (kind: string) => `${kind}-${++ids}` } },
  })
  try {
    assert.equal((await app.root.router.request('/expenses')).status, 404)
    assert.equal((await app.root.router.request('/', { headers: { accept: 'text/html' } })).status, 200)
  } finally {
    await app.stop()
    await rm(home, { recursive: true, force: true })
  }
})

test('a failed save reports the error instead of success', async () => {
  const broken = { load: async (): Promise<GarageState | undefined> => undefined, save: async (): Promise<void> => { throw new Error('disk full') } }
  await withApp(
    async (app) => {
      const response = await app.post('/fuel', { date: '2026-11-05', odometerKm: '86900', litres: '50', totalCost: '90' })
      assert.equal(response.status, 303)
      assert.equal(noticeOf(response).kind, 'error')
      assert.match(noticeOf(response).text, /could not be saved/)
    },
    { overrides: { garage: { store: broken } } },
  )
})
