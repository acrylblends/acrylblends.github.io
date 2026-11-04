import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { pinnedInstance, withPort } from '../plugins/instance/index.ts'
import { type App, createApp } from '../src/app.ts'
import { listSize, sortOf } from '../src/monitor.ts'
import type { Signal } from '../src/monitor/kill-list.ts'
import type { Sources } from '../src/monitor/system.ts'

/** Throwaway homes live inside the project (`.acrylblends/` is ignored by git): a sandboxed agent may not write to the system temp folder. */
const scratch = join(fileURLToPath(new URL('..', import.meta.url)), '.acrylblends', 'test')
mkdirSync(scratch, { recursive: true })

const projectRoot = fileURLToPath(new URL('..', import.meta.url))

const PS = `    1  0.0   9120 root     /sbin/launchd
  412  1.5 204800 alex     /Applications/Google Chrome.app/Contents/MacOS/Google Chrome
  777 38.2 655360 alex     node
  901  0.1   1024 alex     /usr/bin/python3
`
const machine: Sources = {
  now: () => 1_700_000_000_000,
  host: () => 'test-machine',
  platform: () => 'linux',
  uptimeSeconds: () => 90_000,
  cpuCount: () => 8,
  load: () => [0.5, 0.4, 0.3],
  memory: async () => ({ totalBytes: 16 * 1024 ** 3, freeBytes: 4 * 1024 ** 3 }),
  disk: async () => ({ totalBytes: 500 * 1024 ** 3, freeBytes: 125 * 1024 ** 3 }),
  processList: async () => PS,
}

/** Boot the app on a fake machine, in a throwaway home and with no server (a request is made in process), run the test, always stop it. */
async function withApp(run: (app: App, sent: Array<[number, Signal]>) => Promise<void>, options: { listen?: boolean } = {}) {
  const home = await mkdtemp(join(scratch, 'app-test-'))
  const sent: Array<[number, Signal]> = []
  const app = await createApp(withPort(pinnedInstance(home, { root: projectRoot }), 0), {
    listen: options.listen ?? false,
    overrides: { monitor: { sources: machine, kill: (pid: number, signal: Signal) => { sent.push([pid, signal]) }, own: { pid: 777, parentPid: 5, user: 'alex' } } },
  })
  try {
    await run(app, sent)
  } finally {
    await app.stop()
    await rm(home, { recursive: true, force: true })
  }
}

const post = (body: unknown, headers: Record<string, string> = {}) => ({ method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })

test('the first page shows the machine and the heaviest processes, heaviest memory first', () =>
  withApp(async (app) => {
    const response = await app.root.router.request('/')
    assert.equal(response.status, 200)
    const html = await response.text()
    assert.match(html, /<title>System Monitor<\/title>/)
    assert.match(html, /test-machine/)
    assert.match(html, /12\.0 GB of 16\.0 GB \(75%\)/)
    assert.ok(html.indexOf('node') < html.indexOf('Google Chrome') && html.indexOf('Google Chrome') < html.indexOf('python3'))
    assert.match(html, /this is the monitor itself/)
  }))

test('the snapshot answers the machine, the sort and the limit, and marks what may not be ended', () =>
  withApp(async (app) => {
    const data = await (await app.root.router.request('/api/snapshot?sort=cpu&limit=2')).json() as Record<string, unknown> & { heaviest: Array<{ name: string; protectedReason?: string }> }
    assert.equal(data.sort, 'cpu')
    assert.equal(data.processCount, 4)
    assert.deepEqual(data.heaviest.map(p => p.name), ['node', 'Google Chrome'])
    assert.match(data.heaviest[0]?.protectedReason ?? '', /monitor itself/)
    assert.equal(data.heaviest[1]?.protectedReason, undefined)
    assert.deepEqual((data.memory as { usedPercent: number }).usedPercent, 75)
    const all = await (await app.root.router.request('/api/snapshot?limit=abc')).json() as { heaviest: unknown[] }
    assert.equal(all.heaviest.length, 4)
  }))

test('the page also sorts by CPU', () =>
  withApp(async (app) => {
    const html = await (await app.root.router.request('/?sort=cpu')).text()
    assert.match(html, /data-sort="cpu" aria-pressed="true"/)
    // `data-sort` marks the two sort buttons and nothing else: the script binds every element that has it.
    assert.equal(html.match(/ data-sort=/g)?.length, 2)
  }))

test('answers health checks and 404 for unknown paths', () =>
  withApp(async (app) => {
    assert.equal((await app.root.router.request('/health')).status, 200)
    const missing = await app.root.router.request('/nope')
    assert.equal(missing.status, 404)
    await missing.body?.cancel()
  }))

test('a call made inside the process cannot end a process: the route answers only a program on this machine', () =>
  withApp(async (app, sent) => {
    const response = await app.root.router.request('/api/kill', post({ pid: 412, name: 'Google Chrome', signal: 'SIGTERM' }))
    assert.equal(response.status, 403)
    await response.body?.cancel()
    assert.deepEqual(sent, [])
  }))

/** A sandbox may forbid listening on a port (Codex's workspace-write does); the tests that start the real server are skipped there, and say so. */
const canListen = await new Promise<boolean>((done) => {
  const probe = createServer()
  probe.once('error', () => done(false))
  probe.listen(0, '127.0.0.1', () => probe.close(() => done(true)))
})
const skip = canListen ? false : 'this environment does not allow listening on a port'
if (!canListen) console.log(`skipped: the tests that start the real server (${skip}); every other test ran in process`)

test('ending a process over the real server: a good request sends the signal, a bad one is refused and sends nothing', { skip }, () =>
  withApp(async (app, sent) => {
    const ok = await fetch(`${app.url}/api/kill`, post({ pid: 412, name: 'Google Chrome', signal: 'SIGTERM' }))
    assert.equal(ok.status, 200)
    assert.deepEqual(await ok.json(), { ok: true, pid: 412, name: 'Google Chrome', signal: 'SIGTERM' })
    assert.deepEqual(sent, [[412, 'SIGTERM']])
    for (const [body, status] of [
      [{ pid: 412, name: 'Google Chrome', signal: 'SIGHUP' }, 400],
      [{ pid: 'x', name: 'node', signal: 'SIGTERM' }, 400],
      [{ pid: 412, name: 'Firefox', signal: 'SIGTERM' }, 409],
      [{ pid: 999, name: 'ghost', signal: 'SIGTERM' }, 404],
      [{ pid: 1, name: 'launchd', signal: 'SIGKILL' }, 403],
      [{ pid: 777, name: 'node', signal: 'SIGKILL' }, 403],
    ] as const) {
      const response = await fetch(`${app.url}/api/kill`, post(body))
      assert.equal(response.status, status, JSON.stringify(body))
      assert.equal(typeof ((await response.json()) as { error: string }).error, 'string')
    }
    assert.deepEqual(sent, [[412, 'SIGTERM']])
  }, { listen: true }))

test('a page from another site cannot end a process', { skip }, () =>
  withApp(async (app, sent) => {
    const response = await fetch(`${app.url}/api/kill`, post({ pid: 412, name: 'Google Chrome', signal: 'SIGTERM' }, { origin: 'http://evil.example' }))
    assert.equal(response.status, 403)
    await response.body?.cancel()
    assert.deepEqual(sent, [])
  }, { listen: true }))

test('stops listening when stopped', { skip }, async () => {
  const home = await mkdtemp(join(scratch, 'app-test-'))
  const app = await createApp(withPort(pinnedInstance(home, { root: projectRoot }), 0), { overrides: { monitor: { sources: machine } } })
  await app.stop()
  await assert.rejects(fetch(`${app.url}/health`))
  await rm(home, { recursive: true, force: true })
})

test('list size and sort come from the query, with safe fallbacks', () => {
  assert.equal(listSize('5', 10), 5)
  assert.equal(listSize('500', 10), 50)
  assert.equal(listSize('0', 10), 10)
  assert.equal(listSize('2.5', 10), 10)
  assert.equal(listSize(undefined, 10), 10)
  assert.equal(sortOf('cpu'), 'cpu')
  assert.equal(sortOf('anything'), 'memory')
})

test('the manifest decides what is mounted: a parameter changes the server, an unknown value is refused', async () => {
  const { readManifest } = await import('../src/app.ts')
  const manifest = readManifest()
  assert.deepEqual(manifest.plugins.map(row => row.id), ['router', 'monitor', 'server'])
  assert.throws(() => readManifest({ nothing: 1 }), /parameter-override-unknown/)
})
