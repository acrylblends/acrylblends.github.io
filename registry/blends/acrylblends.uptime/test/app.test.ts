import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { pinnedInstance, withPort } from '../plugins/instance/index.ts'
import { fakeChecker } from '../plugins/uptime/index.ts'
import { createApp } from '../src/app.ts'
import { FRAME_MOUNT_PREFIX } from '../src/routes.ts'
import { NOW, projectRoot, withApp } from './support.ts'

const scratch = join(fileURLToPath(new URL('..', import.meta.url)), '.acrylblends', 'test')
mkdirSync(scratch, { recursive: true })

test('answers health checks and 404 for unknown paths', () =>
  withApp(async (app) => {
    const health = await app.page('/health')
    assert.equal(health.status, 200)
    assert.deepEqual(JSON.parse(health.html) as unknown, { ok: true })
    assert.equal((await app.page('/nope')).status, 404)
  }))

test('the manifest decides what is mounted: an unknown parameter is refused', () =>
  withApp(async () => {
    const { readManifest } = await import('../src/app.ts')
    assert.equal(readManifest().plugins.length, 9)
    assert.throws(() => readManifest({ nothing: 1 }), /parameter-override-unknown/)
  }))

test('the frame mounts the same app under /app, and every link follows the prefix', () =>
  withApp(
    async (app) => {
      assert.equal(app.root.shell.prefix, FRAME_MOUNT_PREFIX)
      const page = await app.page('/monitors')
      assert.equal(page.status, 200)
      assert.match(page.html, /href="\/app\/monitors\/new"/)
      assert.match(page.html, /href="\/app\/status-page"/)
      const root = await app.root.router.request(FRAME_MOUNT_PREFIX)
      assert.equal(root.status, 200)
    },
    { prefix: FRAME_MOUNT_PREFIX },
  ))

const canListen = await new Promise<boolean>((done) => {
  const probe = createServer()
  probe.once('error', (error: NodeJS.ErrnoException) => done(!(error.code === 'EPERM' || error.code === 'EACCES')))
  probe.listen(0, '127.0.0.1', () => probe.close(() => done(true)))
})

test('serves the seeded overview on a real port and stops listening when stopped', { skip: canListen ? false : 'this environment does not allow listening on a port' }, async () => {
  const door = process.env.ACRYL_DOOR
  process.env.ACRYL_DOOR = 'off'
  const home = await mkdtemp(join(scratch, 'app-test-'))
  try {
    let ids = 0
    const app = await createApp(withPort(pinnedInstance(home, { root: projectRoot }), 0), {
      overrides: { uptime: { clock: () => NOW, newId: (kind: string) => `${kind}-${++ids}`, checker: fakeChecker({ ok: true, statusCode: 200, latencyMs: 100 }) } },
    })
    const page = await fetch(`${app.url}/monitors`)
    assert.equal(page.status, 200)
    assert.match(await page.text(), /api\.webboxes\.dev/)
    await app.stop()
    await assert.rejects(fetch(`${app.url}/health`))
  } finally {
    if (door === undefined) delete process.env.ACRYL_DOOR
    else process.env.ACRYL_DOOR = door
    await rm(home, { recursive: true, force: true })
  }
})
