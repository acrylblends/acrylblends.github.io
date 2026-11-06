import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import { createApp, readManifest } from '../src/app.ts'
import { pinnedInstance } from '../plugins/instance/index.ts'
import { fakeChecker } from '../plugins/uptime/index.ts'
import { noticeOf, projectRoot, withApp } from './support.ts'

const scratch = join(projectRoot, '.acrylblends', 'test')
mkdirSync(scratch, { recursive: true })

test('the first page is the monitor overview with the grouped endpoints and the selected detail', () =>
  withApp(async (app) => {
    const page = await app.page('/')
    assert.equal(page.status, 200)
    assert.match(page.html, /Monitor overview/)
    assert.match(page.html, /api\.webboxes\.dev/)
    assert.match(page.html, /status\.webboxes\.dev/)
    assert.match(page.html, /WEB SERVICES/)
    assert.match(page.html, /INFRASTRUCTURE/)
    assert.match(page.html, /90-day status history/)
    assert.match(page.html, /RECENT CHECKS/)
    assert.match(page.html, /Check now/)
    assert.match(page.html, /1\.42 s/)
  }))

test('a monitor page selects that monitor', () =>
  withApp(async (app) => {
    const monitor = app.root.uptime.monitors().find((item) => item.name === 'postgres-primary')
    assert.ok(monitor !== undefined)
    const page = await app.page(`/monitors/${monitor.id}`)
    assert.equal(page.status, 200)
    assert.match(page.html, /postgres-primary/)
    assert.match(page.html, /TCP monitor/)
  }))

test('the add form creates a paused monitor', () =>
  withApp(async (app) => {
    const form = await app.page('/monitors/new')
    assert.equal(form.status, 200)
    assert.match(form.html, /Add monitor/)
    const group = app.root.uptime.groups()[0]
    assert.ok(group !== undefined)
    const created = await app.post('/monitors', { name: 'New API', target: 'new.example.dev', protocol: 'https', path: '/health', intervalSeconds: '60', timeoutMs: '5000', expectedStatus: '200', groupId: group.id })
    assert.equal(created.status, 303)
    assert.equal(noticeOf(created).kind, 'ok')
    const monitor = app.root.uptime.monitors().find((item) => item.name === 'New API')
    assert.equal(monitor?.status, 'paused')
  }))

test('Check now records a check and a passing answer keeps the monitor up', () =>
  withApp(async (app) => {
    const monitor = app.root.uptime.monitors()[0]
    assert.ok(monitor !== undefined)
    const response = await app.post(`/monitors/${monitor.id}/check`, {})
    assert.equal(response.status, 303)
    assert.equal(noticeOf(response).kind, 'ok')
    assert.equal(app.root.uptime.monitor(monitor.id)?.status, 'up')
    assert.equal(app.root.uptime.checks(monitor.id, 1)[0]?.result, 'up')
  }))

test('a failing check turns the monitor down and opens an incident', () =>
  withApp(
    async (app) => {
      const monitor = app.root.uptime.monitors()[0]
      assert.ok(monitor !== undefined)
      const response = await app.post(`/monitors/${monitor.id}/check`, {})
      assert.equal(noticeOf(response).kind, 'error')
      assert.match(noticeOf(response).text, /down/)
      assert.equal(app.root.uptime.monitor(monitor.id)?.status, 'down')
      assert.equal(app.root.uptime.incidents(true).length, 2)
    },
    { overrides: { uptime: { checker: fakeChecker({ ok: false, statusCode: 503, latencyMs: 800, error: 'HTTP 503' }) } } },
  ))

test('a monitor can be paused and resumed', () =>
  withApp(async (app) => {
    const monitor = app.root.uptime.monitors()[0]
    assert.ok(monitor !== undefined)
    const paused = await app.post(`/monitors/${monitor.id}/pause`, {})
    assert.equal(noticeOf(paused).kind, 'ok')
    assert.equal(app.root.uptime.monitor(monitor.id)?.status, 'paused')
    const resumed = await app.post(`/monitors/${monitor.id}/pause`, {})
    assert.equal(app.root.uptime.monitor(monitor.id)?.status, 'up')
  }))

test('the incident log, the groups and the status page render their data', () =>
  withApp(async (app) => {
    const incidents = await app.page('/incidents')
    assert.match(incidents.html, /Incident log/)
    assert.match(incidents.html, /status\.webboxes\.dev/)
    assert.match(incidents.html, /open/)
    const groups = await app.page('/groups')
    assert.match(groups.html, /Monitor groups/)
    assert.match(groups.html, /Web Services/)
    const created = await app.post('/groups', { name: 'Databases' })
    assert.equal(created.status, 303)
    assert.equal(app.root.uptime.groups().length, 3)
    const status = await app.page('/status-page')
    assert.match(status.html, /Some systems are degraded/)
    assert.match(status.html, /Operational/)
  }))

test('health answers, an unknown path is a 404, and every feature is a row of the manifest', () =>
  withApp(async (app) => {
    assert.equal((await app.page('/health')).status, 200)
    assert.equal((await app.page('/nope')).status, 404)
    assert.deepEqual(readManifest().plugins.map((row) => row.id), [
      'router',
      'home',
      'uptime',
      'uptime-shell',
      'monitors',
      'incidents',
      'extensions',
      'server',
      'acryl-door',
    ])
  }))

test('switching the incidents plugin off leaves the app running without it', async () => {
  const manifest = readManifest()
  const without = {
    ...manifest,
    plugins: manifest.plugins.map((row) => (row.id === 'incidents' ? { ...row, disabled: true } : row)),
  }
  const home = await mkdtemp(join(scratch, 'app-test-off-'))
  let ids = 0
  const app = await createApp(pinnedInstance(home, { root: projectRoot }), {
    listen: false,
    manifest: without,
    overrides: { uptime: { clock: () => new Date(2026, 10, 6, 9, 41), newId: (kind: string) => `${kind}-${++ids}`, checker: fakeChecker({ ok: true, statusCode: 200, latencyMs: 100 }) } },
  })
  try {
    const monitors = await app.root.router.request('/', { headers: { accept: 'text/html' } })
    assert.equal(monitors.status, 200)
    const html = await monitors.text()
    assert.match(html, /Monitor overview/)
    assert.doesNotMatch(html, /href="\/incidents"/)
    assert.equal((await app.root.router.request('/incidents')).status, 404)
  } finally {
    await app.stop()
    await rm(home, { recursive: true, force: true })
  }
})
