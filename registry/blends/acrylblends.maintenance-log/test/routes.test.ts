import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import { createApp, readManifest } from '../src/app.ts'
import type { PlantState } from '../plugins/plant/domain.ts'
import { pinnedInstance } from '../plugins/instance/index.ts'
import { noticeOf, NOW, projectRoot, withApp } from './support.ts'

const scratch = join(projectRoot, '.acrylblends', 'test')
mkdirSync(scratch, { recursive: true })

test('the first page is the mockup control room: metrics, register, schedule and selected asset', () =>
  withApp(async (app) => {
    const page = await app.page('/')
    assert.equal(page.status, 200)
    assert.match(page.html, /PLANT<span><i>\/<\/i>OPS<\/span>/)
    assert.match(page.html, /FACILITY 04 \/ PRODUCTION HALL/)
    assert.match(page.html, /17 MACHINES ONLINE/)
    for (const label of ['OPEN WORK ORDERS', 'OVERDUE PM TASKS', 'DOWNTIME · MTD', 'ASSET AVAILABILITY', 'Equipment register', 'Upcoming maintenance', 'Recent history']) {
      assert.match(page.html, new RegExp(label))
    }
    assert.match(page.html, /<strong>12<\/strong><small>4 awaiting parts/)
    assert.match(page.html, /03<\/strong><small>Across 2 production lines/)
    assert.match(page.html, /6\.4 <small>hrs<\/small>/)
    assert.match(page.html, /96\.8%/)
    assert.match(page.html, /CNC Mill 03/)
    assert.match(page.html, /Hydraulic Press 01/)
    assert.match(page.html, /Compressor 02/)
    assert.match(page.html, /Lubrication &amp; spindle inspection/)
    assert.match(page.html, /8,421 h/)
    assert.match(page.html, /74 \/ 100/)
    assert.doesNotMatch(page.html, /https?:\/\//)
  }))

test('the status filter narrows the register and a machine query selects the panel', () =>
  withApp(async (app) => {
    const fault = await app.page('/?status=fault')
    assert.match(fault.html, /Compressor 02/)
    assert.equal((fault.html.match(/class="machine(?:"| )/g) ?? []).length, 1)
    const machine = app.root.plant.machines().find((item) => item.code === 'LC-001')
    assert.ok(machine !== undefined)
    const selected = await app.page(`/?machine=${machine.id}`)
    assert.match(selected.html, /SELECTED ASSET \/ LC-001/)
  }))

test('the asset profile shows hours, health, open tasks and the service history', () =>
  withApp(async (app) => {
    const machine = app.root.plant.machines().find((item) => item.code === 'MC-003')
    assert.ok(machine !== undefined)
    const page = await app.page(`/machines/${machine.id}`)
    assert.equal(page.status, 200)
    assert.match(page.html, /ASSET PROFILE \/ MC-003/)
    assert.match(page.html, /8,421 h/)
    assert.match(page.html, /74 \/ 100/)
    assert.match(page.html, /Spindle vibration inspection/)
    assert.match(page.html, /Create work order/)
  }))

test('the work order detail assigns, schedules, starts and closes with a note and downtime', () =>
  withApp(async (app) => {
    const order = app.root.plant.openOrders()[0]
    assert.ok(order !== undefined)
    const page = await app.page(`/work-orders/${order.id}`)
    assert.equal(page.status, 200)
    assert.match(page.html, /Checklist/)
    assert.match(page.html, /Close with a dated note/)
    const assigned = await app.post(`/work-orders/${order.id}/assign`, { technician: 'L. Weber' })
    assert.equal(noticeOf(assigned).kind, 'ok')
    assert.equal(app.root.plant.workOrder(order.id)?.assignedTo, 'L. Weber')
    const scheduled = await app.post(`/work-orders/${order.id}/schedule`, { scheduledAt: '2026-11-21' })
    assert.equal(noticeOf(scheduled).kind, 'ok')
    const started = await app.post(`/work-orders/${order.id}/start`, {})
    assert.equal(noticeOf(started).kind, 'ok')
    assert.equal(app.root.plant.workOrder(order.id)?.status, 'in_progress')
    const refused = await app.post(`/work-orders/${order.id}/close`, { note: '', downtimeMinutes: '45' })
    assert.equal(noticeOf(refused).kind, 'error')
    assert.match(noticeOf(refused).text, /note/)
    const closed = await app.post(`/work-orders/${order.id}/close`, { note: 'Replaced and tested.', downtimeMinutes: '45', parts: 'bearing' })
    assert.equal(noticeOf(closed).kind, 'ok')
    assert.equal(app.root.plant.workOrder(order.id)?.status, 'done')
    assert.equal(app.root.plant.workOrder(order.id)?.downtimeMinutes, 45)
    assert.ok(app.root.plant.events(order.machineId)[0]?.summary.includes('Replaced and tested.'))
  }))

test('the create form validates and creates a work order with parts', () =>
  withApp(async (app) => {
    const machine = app.root.plant.machines()[0]
    assert.ok(machine !== undefined)
    const form = await app.page(`/work-orders/new?machineId=${machine.id}`)
    assert.equal(form.status, 200)
    assert.match(form.html, /Create work order/)
    const invalid = await app.post('/work-orders', { machineId: machine.id, kind: 'repair', priority: 'high', description: '', scheduledAt: '2026-11-20', assignedTo: '', parts: '' })
    assert.equal(invalid.status, 200)
    assert.match(await invalid.text(), /Description/)
    const created = await app.post('/work-orders', { machineId: machine.id, kind: 'repair', priority: 'high', description: 'Replace bearing', scheduledAt: '2026-11-20', assignedTo: 'L. Weber', parts: 'bearing, grease' })
    assert.equal(created.status, 303)
    assert.equal(noticeOf(created).kind, 'ok')
    const order = app.root.plant.openOrders().find((item) => item.description === 'Replace bearing')
    assert.ok(order !== undefined)
    assert.deepEqual(order.parts, ['bearing', 'grease'])
    assert.equal(app.root.plant.stats().open, 13)
  }))

test('health, 404, prefix and the manifest work', async () => {
  await withApp(async (app) => {
    assert.equal((await app.page('/health')).status, 200)
    assert.equal((await app.page('/nope')).status, 404)
    assert.deepEqual(readManifest().plugins.map((row) => row.id), ['router', 'home', 'plant', 'plant-shell', 'control', 'machines', 'work-orders', 'extensions', 'server', 'acryl-door'])
  })
  await withApp(
    async (app) => {
      const response = await app.root.router.request('/app', { headers: { accept: 'text/html' } })
      assert.equal(response.status, 200)
      const html = await response.text()
      assert.match(html, /href="\/app\/work-orders\/new/)
    },
    { prefix: '/app' },
  )
})

test('switching the machines plugin off removes the profile only', async () => {
  const manifest = readManifest()
  const without = { ...manifest, plugins: manifest.plugins.map((row) => (row.id === 'machines' ? { ...row, disabled: true } : row)) }
  const home = await mkdtemp(join(scratch, 'app-test-off-machines-'))
  let ids = 0
  const app = await createApp(pinnedInstance(home, { root: projectRoot }), {
    listen: false,
    manifest: without,
    overrides: { plant: { clock: () => NOW, newId: (kind: string) => `${kind}-${++ids}` } },
  })
  try {
    const machine = app.root.plant.machines()[0]
    assert.ok(machine !== undefined)
    assert.equal((await app.root.router.request(`/machines/${machine.id}`)).status, 404)
    assert.equal((await app.root.router.request('/', { headers: { accept: 'text/html' } })).status, 200)
  } finally {
    await app.stop()
    await rm(home, { recursive: true, force: true })
  }
})

test('a failed save reports the error instead of success', async () => {
  const broken = {
    load: async (): Promise<PlantState | undefined> => undefined,
    save: async (): Promise<void> => {
      throw new Error('disk full')
    },
  }
  await withApp(
    async (app) => {
      const order = app.root.plant.openOrders()[0]
      assert.ok(order !== undefined)
      const response = await app.post(`/work-orders/${order.id}/close`, { note: 'Done', downtimeMinutes: '10' })
      assert.equal(response.status, 303)
      assert.equal(noticeOf(response).kind, 'error')
      assert.match(noticeOf(response).text, /disk full/)
    },
    { overrides: { plant: { store: broken } } },
  )
})
