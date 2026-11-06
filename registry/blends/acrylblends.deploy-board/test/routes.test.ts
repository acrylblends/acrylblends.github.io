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

test('the first page is the deployment board with the columns, the numbers and the incident rail', () =>
  withApp(async (app) => {
    const page = await app.page('/')
    assert.equal(page.status, 200)
    assert.match(page.html, /Deployment board/)
    assert.match(page.html, /Development/)
    assert.match(page.html, /Staging/)
    assert.match(page.html, /Production/)
    assert.match(page.html, /api-gateway/)
    assert.match(page.html, /web-frontend/)
    assert.match(page.html, /worker-jobs/)
    assert.match(page.html, /Active incidents/)
    assert.match(page.html, /INC-024/)
    assert.match(page.html, /Release & incident timeline/)
    assert.match(page.html, /DEPLOYMENTS TODAY/)
  }))

test('the board is also at /deployments', () =>
  withApp(async (app) => {
    const page = await app.page('/deployments')
    assert.equal(page.status, 200)
    assert.match(page.html, /Deployment board/)
  }))

test('a new deployment is queued from the form', () =>
  withApp(async (app) => {
    const form = await app.page('/deployments/new')
    assert.equal(form.status, 200)
    assert.match(form.html, /New deployment/)
    const service = app.root.release.services()[1]
    const environment = app.root.release.environments()[0]
    assert.ok(service !== undefined && environment !== undefined)
    const created = await app.post('/deployments', { serviceId: service.id, environmentId: environment.id, version: 'v9.1.0', commit: 'abc1234', actor: 'Alex M.' })
    assert.equal(created.status, 303)
    assert.equal(noticeOf(created).kind, 'ok')
    assert.ok(app.root.release.deployments().some((deployment) => deployment.version === 'v9.1.0' && deployment.status === 'queued'))
  }))

test('promoting a development deployment queues it in staging', () =>
  withApp(async (app) => {
    const dev = app.root.release.environments().find((environment) => environment.kind === 'dev')
    const service = app.root.release.services()[0]
    assert.ok(dev !== undefined && service !== undefined)
    const deployment = app.root.release.latest(service.id, dev.id)
    assert.ok(deployment !== undefined)
    const response = await app.post(`/deployments/${deployment.id}/promote`, {})
    assert.equal(response.status, 303)
    assert.equal(noticeOf(response).kind, 'ok')
    const stg = app.root.release.environments().find((environment) => environment.kind === 'stg')
    assert.ok(stg !== undefined)
    assert.ok(app.root.release.deployments().some((item) => item.environmentId === stg.id && item.version === deployment.version && item.status === 'queued'))
  }))

test('a production rollback asks first, then queues the previous version', () =>
  withApp(async (app) => {
    const prod = app.root.release.environments().find((environment) => environment.kind === 'prod')
    const service = app.root.release.services()[0]
    assert.ok(prod !== undefined && service !== undefined)
    const deployment = app.root.release.latest(service.id, prod.id)
    assert.ok(deployment !== undefined)
    const confirm = await app.page(`/deployments/${deployment.id}/rollback`)
    assert.equal(confirm.status, 200)
    assert.match(confirm.html, /Roll back api-gateway\?/)
    const response = await app.post(`/deployments/${deployment.id}/rollback`, {})
    assert.equal(response.status, 303)
    assert.equal(noticeOf(response).kind, 'ok')
    assert.ok(app.root.release.events(1)[0]?.message.startsWith('api-gateway'))
  }))

test('the incident queue and one incident in full let a person acknowledge and resolve it', () =>
  withApp(async (app) => {
    const queue = await app.page('/incidents')
    assert.equal(queue.status, 200)
    assert.match(queue.html, /Incident queue/)
    assert.match(queue.html, /INC-024/)
    assert.match(queue.html, /Staging frontend health check/)
    const incident = app.root.release.incidents('open')[0]
    assert.ok(incident !== undefined)
    const detail = await app.page(`/incidents/${incident.id}`)
    assert.match(detail.html, /Timeline/)
    assert.match(detail.html, /Acknowledge/)
    const ack = await app.post(`/incidents/${incident.id}/ack`, {})
    assert.equal(noticeOf(ack).kind, 'ok')
    assert.equal(app.root.release.incident(incident.id)?.status, 'acknowledged')
    const resolved = await app.post(`/incidents/${incident.id}/resolve`, {})
    assert.equal(noticeOf(resolved).kind, 'ok')
    assert.equal(app.root.release.incident(incident.id)?.status, 'resolved')
  }))

test('services, environments and the event log render their data', () =>
  withApp(async (app) => {
    const services = await app.page('/services')
    assert.match(services.html, /Service inventory/)
    assert.match(services.html, /webboxes\/api-gateway/)
    assert.match(services.html, /v2\.18\.0/)
    const environments = await app.page('/environments')
    assert.match(environments.html, /Environments/)
    assert.match(environments.html, /eu-central-1/)
    const events = await app.page('/events')
    assert.match(events.html, /Event log/)
    assert.match(events.html, /api-gateway v2\.18\.0 deployed to DEV/)
  }))

test('health answers, an unknown path is a 404, and every feature is a row of the manifest', () =>
  withApp(async (app) => {
    assert.equal((await app.page('/health')).status, 200)
    assert.equal((await app.page('/nope')).status, 404)
    assert.deepEqual(readManifest().plugins.map((row) => row.id), [
      'router',
      'home',
      'release',
      'release-shell',
      'board',
      'incidents',
      'services',
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
    overrides: { release: { clock: () => new Date(2026, 10, 6, 9, 41), newId: (kind: string) => `${kind}-${++ids}` } },
  })
  try {
    const board = await app.root.router.request('/', { headers: { accept: 'text/html' } })
    assert.equal(board.status, 200)
    const html = await board.text()
    assert.match(html, /Deployment board/)
    assert.doesNotMatch(html, /href="\/incidents"/)
    assert.equal((await app.root.router.request('/incidents')).status, 404)
  } finally {
    await app.stop()
    await rm(home, { recursive: true, force: true })
  }
})
