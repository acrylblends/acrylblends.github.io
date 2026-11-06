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

test('the first page is the seeded overview with the mockup totals and reports', () =>
  withApp(async (app) => {
    const page = await app.page('/')
    assert.equal(page.status, 200)
    assert.match(page.html, /Website overview/)
    assert.match(page.html, /48,291/)
    assert.match(page.html, /62,814/)
    assert.match(page.html, /34\.6%/)
    assert.match(page.html, /4\.82%/)
    assert.match(page.html, /Visitors over time/)
    assert.match(page.html, /Top pages/)
    assert.match(page.html, /Traffic sources/)
    assert.match(page.html, /northstar\.app/)
  }))

test('the overview answers at its own path too', () =>
  withApp(async (app) => {
    const page = await app.page('/overview')
    assert.equal(page.status, 200)
    assert.match(page.html, /Website overview/)
  }))

test('the acquisition, pages, events and conversions reports render their data', () =>
  withApp(async (app) => {
    const acquisition = await app.page('/acquisition')
    assert.match(acquisition.html, /Acquisition/)
    assert.match(acquisition.html, /Organic search/)
    assert.match(acquisition.html, /19,472/)
    const pages = await app.page('/pages')
    assert.match(pages.html, /Pages & screens/)
    assert.match(pages.html, /\/docs\/getting-started/)
    const events = await app.page('/events')
    assert.match(events.html, /Event explorer/)
    assert.match(events.html, /page_view/)
    assert.match(events.html, /demo_request/)
    const filtered = await app.page('/events?name=sign_up')
    assert.match(filtered.html, /sign_up \(2\)/)
    const conversions = await app.page('/conversions')
    assert.match(conversions.html, /Funnel/)
    assert.match(conversions.html, /Sign up/)
    assert.match(conversions.html, /Demo request/)
  }))

test('the tracking page shows the snippet and the active state', () =>
  withApp(async (app) => {
    const page = await app.page('/settings/tracking')
    assert.equal(page.status, 200)
    assert.match(page.html, /Tracking setup/)
    assert.match(page.html, /Tracking active/)
    assert.match(page.html, /acr_9f2c41a7/)
    assert.match(page.html, /\/collect/)
    assert.match(page.html, /Copy snippet/)
  }))

test('a new property is waiting for its first event, and its overview says no events yet', () =>
  withApp(async (app) => {
    const created = await app.post('/settings/tracking/properties', { domain: 'newsite.example' })
    assert.equal(created.status, 303)
    assert.equal(noticeOf(created).kind, 'ok')
    const property = app.root.analytics.properties().find((item) => item.domain === 'newsite.example')
    assert.ok(property !== undefined)
    const tracking = await app.page(`/settings/tracking?property=${property.id}`)
    assert.match(tracking.html, /Waiting for the first event|Not installed yet/)
    const overview = await app.page(`/overview?property=${property.id}`)
    assert.match(overview.html, /No events yet/)
    const duplicate = await app.post('/settings/tracking/properties', { domain: 'newsite.example' })
    assert.equal(duplicate.status, 200)
    assert.match(await duplicate.text(), /already tracked/)
  }))

test('the collect endpoint stores a page view and answers with CORS', () =>
  withApp(async (app) => {
    const before = app.root.analytics.kpis(app.root.analytics.first()?.id ?? '', 30).current.visitors
    const response = await app.json('/collect', { trackingId: 'acr_9f2c41a7', path: '/from-snippet', referrer: '', sessionId: 's-1' })
    assert.equal(response.status, 202)
    assert.equal(response.headers.get('access-control-allow-origin'), '*')
    const body = (await response.json()) as { ok: boolean }
    assert.equal(body.ok, true)
    assert.equal(app.root.analytics.kpis(app.root.analytics.first()?.id ?? '', 30).current.visitors, before + 1)
    assert.ok(app.root.analytics.pages(app.root.analytics.first()?.id ?? '').some((page) => page.path === '/from-snippet'))
    const unknown = await app.json('/collect', { trackingId: 'nope' })
    assert.equal(unknown.status, 400)
    const bad = await app.root.router.request('/collect', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' })
    assert.equal(bad.status, 400)
    const options = await app.root.router.request('/collect', { method: 'OPTIONS' })
    assert.equal(options.status, 204)
  }))

test('health answers, an unknown path is a 404, and every feature is a row of the manifest', () =>
  withApp(async (app) => {
    assert.equal((await app.page('/health')).status, 200)
    assert.equal((await app.page('/nope')).status, 404)
    assert.deepEqual(readManifest().plugins.map((row) => row.id), [
      'router',
      'home',
      'analytics',
      'analytics-shell',
      'overview',
      'reports',
      'tracking',
      'extensions',
      'server',
      'acryl-door',
    ])
  }))

test('switching the reports plugin off leaves the app running without it', async () => {
  const manifest = readManifest()
  const without = {
    ...manifest,
    plugins: manifest.plugins.map((row) => (row.id === 'reports' ? { ...row, disabled: true } : row)),
  }
  const home = await mkdtemp(join(scratch, 'app-test-off-'))
  let ids = 0
  const app = await createApp(pinnedInstance(home, { root: projectRoot }), {
    listen: false,
    manifest: without,
    overrides: { analytics: { clock: () => new Date(2026, 10, 6, 9, 41), newId: (kind: string) => `${kind}-${++ids}` } },
  })
  try {
    const overview = await app.root.router.request('/overview', { headers: { accept: 'text/html' } })
    assert.equal(overview.status, 200)
    assert.match(await overview.text(), /Website overview/)
    assert.equal((await app.root.router.request('/pages')).status, 404)
  } finally {
    await app.stop()
    await rm(home, { recursive: true, force: true })
  }
})
