import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  cleanCommit,
  durationText,
  latestOf,
  nextEnvironment,
  Release,
  ReleaseError,
  stateLabel,
  statsOf,
  whenText,
} from '../plugins/release/index.ts'
import { memoryStore } from '../plugins/release/store.ts'
import { seed } from '../plugins/release/seed.ts'
import { NOW, withApp } from './support.ts'

const newId = (kind: string): string => `${kind}-${Math.random().toString(36).slice(2, 8)}`

test('a commit is hexadecimal and shown short', () => {
  assert.equal(cleanCommit('8a31fc2e9b'), '8a31fc2')
  assert.throws(() => cleanCommit('nope'), (error: unknown) => error instanceof ReleaseError && /hexadecimal/.test(error.message))
})

test('durations and states read like the board', () => {
  assert.equal(durationText(42), '42s')
  assert.equal(durationText(522), '8m 42s')
  assert.equal(stateLabel('succeeded', 'prod'), 'Healthy')
  assert.equal(stateLabel('succeeded', 'stg'), 'Deployed')
  assert.equal(stateLabel('building', 'dev'), 'Building')
  assert.equal(stateLabel('failed', 'stg'), 'Failed')
  assert.equal(whenText('2026-11-06T09:37', NOW), '4m ago')
})

test('the seed has three services, three environments, eighteen deployments today and two open incidents', () => {
  const state = seed(NOW, newId)
  assert.equal(state.services.length, 3)
  assert.equal(state.environments.length, 3)
  assert.equal(state.deployments.length, 18)
  assert.equal(state.incidents.filter((incident) => incident.status !== 'resolved').length, 2)
  const stats = statsOf(state, '2026-11-06')
  assert.equal(stats.today, 18)
  assert.equal(stats.failed, 1)
  assert.ok(stats.successRate > 90 && stats.successRate < 100)
  assert.ok(stats.averageSeconds > 0)
  const web = state.services.find((service) => service.name === 'web-frontend')
  const staging = state.environments.find((environment) => environment.kind === 'stg')
  assert.ok(web !== undefined && staging !== undefined)
  assert.equal(latestOf(state, web.id, staging.id)?.status, 'failed')
  assert.equal(nextEnvironment(state, staging.id)?.kind, 'prod')
  assert.equal(nextEnvironment(state, state.environments.find((environment) => environment.kind === 'prod')?.id ?? ''), undefined)
})

async function open(): Promise<Release> {
  let ids = 0
  return Release.open({ store: memoryStore(), clock: () => NOW, newId: (kind) => `${kind}-${++ids}` })
}

test('the board has three columns and each service has its latest deployment', async () => {
  const release = await open()
  const board = release.board()
  assert.equal(board.length, 3)
  assert.deepEqual(board.map((column) => column.environment.kind), ['dev', 'stg', 'prod'])
  assert.ok(board.every((column) => column.cards.length === 3))
  assert.equal(release.stats().today, 18)
})

test('a queued deployment is added with an event', async () => {
  const release = await open()
  const service = release.services()[0]
  const environment = release.environments()[1]
  assert.ok(service !== undefined && environment !== undefined)
  const deployment = await release.queue({ serviceId: service.id, environmentId: environment.id, version: 'v9.0.0', commit: 'abc1234' })
  assert.equal(deployment.status, 'queued')
  assert.equal(release.deployments().length, 19)
  assert.equal(release.events(1)[0]?.type, 'deploy')
  await assert.rejects(release.queue({ serviceId: service.id, environmentId: environment.id, version: '', commit: 'abc1234' }), /version is required/)
})

test('a deployment promotes to the next environment and refuses from production', async () => {
  const release = await open()
  const dev = release.environments().find((environment) => environment.kind === 'dev')
  const service = release.services()[0]
  assert.ok(dev !== undefined && service !== undefined)
  const deployment = release.latest(service.id, dev.id)
  assert.ok(deployment !== undefined)
  const promoted = await release.promote(deployment.id)
  const stg = release.environments().find((environment) => environment.kind === 'stg')
  assert.equal(promoted.environmentId, stg?.id)
  assert.equal(promoted.version, deployment.version)
  const prod = release.environments().find((environment) => environment.kind === 'prod')
  assert.ok(prod !== undefined)
  const productionDeployment = release.deployments().find((item) => item.environmentId === prod.id)
  assert.ok(productionDeployment !== undefined)
  await assert.rejects(release.promote(productionDeployment.id), /no next environment/)
})

test('a rollback queues the previous version', async () => {
  const release = await open()
  const prod = release.environments().find((environment) => environment.kind === 'prod')
  const service = release.services()[0]
  assert.ok(prod !== undefined && service !== undefined)
  const current = release.latest(service.id, prod.id)
  assert.ok(current !== undefined)
  const previous = release.previousOf(current)
  assert.ok(previous !== undefined)
  const rolled = await release.rollback(current.id)
  assert.equal(rolled.version, previous.version)
  assert.equal(rolled.status, 'queued')
  assert.equal(release.events(1)[0]?.type, 'rollback')
})

test('an incident is acknowledged and then resolved', async () => {
  const release = await open()
  const openIncident = release.incidents('open')[0]
  assert.ok(openIncident !== undefined)
  const acknowledged = await release.acknowledge(openIncident.id)
  assert.equal(acknowledged.status, 'acknowledged')
  const resolved = await release.resolve(openIncident.id)
  assert.equal(resolved.status, 'resolved')
  assert.ok(resolved.timeline.length > openIncident.timeline.length)
  assert.equal(release.stats().activeIncidents, 1)
})

test('the board the pages see is the seed', () =>
  withApp(async (app) => {
    assert.equal(app.root.release.stats().today, 18)
  }))
