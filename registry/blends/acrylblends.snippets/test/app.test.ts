import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { pinnedInstance, withPort } from '../plugins/instance/index.ts'
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
    const missing = await app.page('/nope')
    assert.equal(missing.status, 404)
  }))

test('the manifest decides what is mounted: an unknown parameter is refused', () =>
  withApp(async (app) => {
    const { readManifest } = await import('../src/app.ts')
    const manifest = readManifest()
    assert.equal(manifest.plugins.length, 11)
    assert.throws(() => readManifest({ nothing: 1 }), /parameter-override-unknown/)
  }))

test('the frame mounts the same app under /app, and every link follows the prefix', () =>
  withApp(
    async (app) => {
      assert.equal(app.root.shell.prefix, FRAME_MOUNT_PREFIX)
      const library = await app.page('/snippets')
      assert.equal(library.status, 200)
      assert.match(library.html, /href="\/app\/snippets"/)
      assert.match(library.html, /href="\/app\/new"/)
      const root = await app.root.router.request(FRAME_MOUNT_PREFIX)
      assert.equal(root.status, 302)
      assert.equal(root.headers.get('location'), '/app/snippets')
    },
    { prefix: FRAME_MOUNT_PREFIX },
  ))

const canListen = await new Promise<boolean>((done) => {
  const probe = createServer()
  probe.once('error', (error: NodeJS.ErrnoException) => done(!(error.code === 'EPERM' || error.code === 'EACCES')))
  probe.listen(0, '127.0.0.1', () => probe.close(() => done(true)))
})

test('serves the seeded library on a real port and stops listening when stopped', { skip: canListen ? false : 'this environment does not allow listening on a port' }, async () => {
  const door = process.env.ACRYL_DOOR
  process.env.ACRYL_DOOR = 'off'
  const home = await mkdtemp(join(scratch, 'app-test-'))
  try {
    let ids = 0
    const app = await createApp(withPort(pinnedInstance(home, { root: projectRoot }), 0), {
      overrides: { snippets: { clock: () => NOW, newId: (kind: string) => `${kind}-${++ids}` } },
    })
    const page = await fetch(`${app.url}/snippets`)
    assert.equal(page.status, 200)
    assert.match(await page.text(), /retry-with-backoff/)
    await app.stop()
    await assert.rejects(fetch(`${app.url}/health`))
  } finally {
    if (door === undefined) delete process.env.ACRYL_DOOR
    else process.env.ACRYL_DOOR = door
    await rm(home, { recursive: true, force: true })
  }
})
