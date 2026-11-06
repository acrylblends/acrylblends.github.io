import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  cleanPath,
  cleanTarget,
  fakeChecker,
  healthOf,
  historyCounts,
  latencyText,
  summaryOf,
  Uptime,
  UptimeError,
  uptimeText,
} from '../plugins/uptime/index.ts'
import { memoryStore } from '../plugins/uptime/store.ts'
import type { UptimeState } from '../plugins/uptime/domain.ts'
import { seed } from '../plugins/uptime/seed.ts'
import { NOW, withApp } from './support.ts'

const newId = (kind: string): string => `${kind}-${Math.random().toString(36).slice(2, 8)}`

test('a target and a path are cleaned and refused with a message', () => {
  assert.equal(cleanTarget('https', 'https://api.example.dev/health'), 'api.example.dev')
  assert.equal(cleanTarget('tcp', 'postgres-primary:5432'), 'postgres-primary:5432')
  assert.throws(() => cleanTarget('tcp', 'postgres-primary'), /host:port/)
  assert.throws(() => cleanTarget('https', 'not a host'), (error: unknown) => error instanceof UptimeError && /host name/.test(error.message))
  assert.equal(cleanPath(''), '')
  assert.equal(cleanPath('/health'), '/health')
  assert.throws(() => cleanPath('health'), /starts with \//)
})

test('a check is degraded above one second and down when it fails', () => {
  assert.equal(healthOf({ ok: true, latencyMs: 142 }), 'up')
  assert.equal(healthOf({ ok: true, latencyMs: 1420 }), 'degraded')
  assert.equal(healthOf({ ok: false, latencyMs: 12 }), 'down')
  assert.equal(latencyText(142), '142 ms')
  assert.equal(latencyText(1420), '1.42 s')
  assert.equal(uptimeText(99.98), '99.98%')
})

test('the seed has ten monitors in two groups, nine healthy, one degraded and one open incident', () => {
  const state = seed(NOW, newId)
  assert.equal(state.monitors.length, 10)
  assert.equal(state.groups.length, 2)
  assert.equal(state.monitors.filter((monitor) => monitor.status === 'up').length, 9)
  assert.equal(state.monitors.filter((monitor) => monitor.status === 'degraded').length, 1)
  assert.equal(state.monitors[0]?.history.length, 90)
  assert.equal(state.monitors[0]?.responseTimes.length, 24)
  const summary = summaryOf(state)
  assert.equal(summary.openIncidents, 1)
  assert.ok(summary.uptime > 99 && summary.uptime < 100)
  const degraded = state.monitors.find((monitor) => monitor.status === 'degraded')
  assert.ok(degraded !== undefined)
  assert.equal(historyCounts(degraded).degraded, 2)
})

async function open(checker = fakeChecker({ ok: true, statusCode: 200, latencyMs: 95 })): Promise<Uptime> {
  let ids = 0
  return Uptime.open({ store: memoryStore(), clock: () => NOW, newId: (kind) => `${kind}-${++ids}`, checker })
}

test('checking the degraded monitor with a healthy answer records it and closes the incident', async () => {
  const store = memoryStore<UptimeState>()
  let ids = 0
  const uptime = await Uptime.open({ store, clock: () => NOW, newId: (kind) => `${kind}-${++ids}`, checker: fakeChecker({ ok: true, statusCode: 200, latencyMs: 95 }) })
  const monitor = uptime.monitors().find((item) => item.status === 'degraded')
  assert.ok(monitor !== undefined)
  const outcome = await uptime.checkNow(monitor.id)
  assert.equal(outcome.check.result, 'up')
  assert.equal(outcome.monitor.status, 'up')
  assert.equal(outcome.monitor.latencyMs, 95)
  assert.ok(outcome.monitor.history.length >= 1)
  assert.equal(outcome.incident?.resolvedAt, '2026-11-06T09:41')
  assert.equal(uptime.summary().openIncidents, 0)
  assert.equal(store.saved, 1)
})

test('a failing check makes the monitor down and opens an incident', async () => {
  const uptime = await open(fakeChecker({ ok: false, statusCode: 503, latencyMs: 800, error: 'HTTP 503' }))
  const monitor = uptime.monitors()[0]
  assert.ok(monitor !== undefined)
  const outcome = await uptime.checkNow(monitor.id)
  assert.equal(outcome.monitor.status, 'down')
  assert.equal(outcome.incident?.severity, 'high')
  assert.match(outcome.incident?.summary ?? '', /not answering/)
  assert.equal(uptime.incidents(true).length, 2)
})

test('a new monitor starts paused, gets checked, and can be paused again', async () => {
  const uptime = await open()
  const group = uptime.groups()[0]
  assert.ok(group !== undefined)
  const monitor = await uptime.createMonitor({ name: 'New API', target: 'https://new.example.dev/health', protocol: 'https', path: '/health', intervalSeconds: 60, timeoutMs: 5000, expectedStatus: 200, groupId: group.id })
  assert.equal(monitor.status, 'paused')
  assert.equal(monitor.target, 'new.example.dev')
  const outcome = await uptime.checkNow(monitor.id)
  assert.equal(outcome.monitor.status, 'up')
  const paused = await uptime.togglePause(monitor.id)
  assert.equal(paused.status, 'paused')
  const resumed = await uptime.togglePause(monitor.id)
  assert.equal(resumed.status, 'up')
  await assert.rejects(uptime.createMonitor({ name: '', target: 'x.dev', protocol: 'https', path: '/', intervalSeconds: 60, timeoutMs: 5000, expectedStatus: 200, groupId: group.id }), /needs a name/)
  await assert.rejects(uptime.createMonitor({ name: 'x', target: 'x.dev', protocol: 'https', path: '/', intervalSeconds: 1, timeoutMs: 5000, expectedStatus: 200, groupId: group.id }), /at least 10 seconds/)
})

test('a group name must be new', async () => {
  const uptime = await open()
  const group = await uptime.createGroup('Databases')
  assert.equal(group.name, 'Databases')
  await assert.rejects(uptime.createGroup('databases'), (error: unknown) => error instanceof UptimeError && error.code === 'conflict')
})

test('the monitors the pages see are the seed', () =>
  withApp(async (app) => {
    assert.equal(app.root.uptime.monitors().length, 10)
    assert.equal(app.root.uptime.summary().degraded, 1)
  }))
