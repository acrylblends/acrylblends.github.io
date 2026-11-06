import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { test } from 'node:test'
import { pinnedInstance, withPort } from '../plugins/instance/index.ts'
import { createApp } from '../src/app.ts'
import { FRAME_MOUNT_PREFIX } from '../src/routes.ts'
import { projectRoot, withApp } from './support.ts'

/** Throwaway homes live inside the project (`.acrylblends/` is ignored by git): a sandboxed agent may not write to the system temp folder. */
const scratch = join(projectRoot, '.acrylblends', 'test')
mkdirSync(scratch, { recursive: true })

test('answers health checks on its own server and under the frame prefix, and 404 for unknown paths', async () => {
  await withApp(async (app) => {
    const health = await app.root.router.request('/health')
    assert.equal(health.status, 200)
    assert.deepEqual(await health.json(), { ok: true })
    const missing = await app.root.router.request('/nope')
    assert.equal(missing.status, 404)
    await missing.body?.cancel()
  })
  // The frame composes the same blend.yaml rows at the one prefix the app names; src/frame.ts only claims that prefix on the frame's web server.
  const frame = await import('../src/frame.ts')
  assert.deepEqual([...frame.inject], ['routerHttp'])
  await withApp(
    async (app) => {
      assert.equal(app.root.windowShell.prefix, FRAME_MOUNT_PREFIX)
      assert.equal(app.root.windowShell.href('/export'), `${FRAME_MOUNT_PREFIX}/export`)
      const health = await app.root.router.request(`${FRAME_MOUNT_PREFIX}/health`)
      assert.equal(health.status, 200)
      await health.body?.cancel()
    },
    { prefix: FRAME_MOUNT_PREFIX },
  )
})

test('opens the project over the seed on the first launch and saves it at once', () =>
  withApp(async (app) => {
    assert.equal(app.store.saved, 1)
    assert.deepEqual(app.root.project.state.docs.map((d) => d.name), ['Hero poster', 'Social card', 'Brand marks', 'Typography'])
    assert.equal(app.root.project.state.view.zoom, 100)
    assert.equal(app.root.project.doc('hero-poster').layers.length, 6)
  }))

test('a region leaves with its plugin', async () => {
  await withApp(
    async (app) => {
      const { html } = await app.page('/')
      assert.doesNotMatch(html, /id="apply"|id="selname"/)
      assert.match(html, /Project files/)
    },
    { off: ['inspector'] },
  )
  await withApp(
    async (app) => {
      const { html } = await app.page('/')
      assert.doesNotMatch(html, /id="export"|Activity<\/div>/)
      assert.equal((await app.post('/export', { file: 'hero-poster' })).status, 404)
    },
    { off: ['exports'] },
  )
  await withApp(
    async (app) => {
      assert.equal((await app.page('/')).status, 404)
    },
    { off: ['canvas'] },
  )
})

test('the shell escapes what people type and shows a notice from the redirect query', () =>
  withApp(async (app) => {
    const html = app.root.windowShell.page({ title: '<x>', main: app.root.windowShell.notice('/?error=Bad%20%3Cinput%3E'), url: '/' })
    assert.match(html, /<title>&lt;x&gt; · Canvasmith<\/title>/)
    assert.match(html, /<p class="alert error" role="alert">Bad &lt;input&gt;<\/p>/)
  }))

/** A sandbox may forbid listening on a port (Codex's workspace-write does); the one test that starts the real server is skipped there, and says so. */
/**
 * Whether this environment forbids listening at all: only a sandbox's refusal (EPERM/EACCES) means the real-server test must skip. A loaded
 * machine can fail a bind transiently, so that is retried briefly; any other outcome lets the real test run, where a host that truly cannot
 * listen fails loudly instead of hiding behind a skip.
 */
const canListen = await new Promise<boolean>((done) => {
  let attempts = 0
  const probeOnce = (): void => {
    attempts += 1
    const probe = createServer()
    probe.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EPERM' || error.code === 'EACCES') done(false)
      else if (attempts < 3) setTimeout(probeOnce, 100)
      else done(true)
    })
    probe.listen(0, '127.0.0.1', () => probe.close(() => done(true)))
  }
  probeOnce()
})
const skip = canListen ? false : 'this environment does not allow listening on a port'
if (!canListen)
  console.log(
    `skipped: the test that starts the real server (${skip}); every other test ran in process`,
  )

test('stops listening when stopped', { skip }, async () => {
  // One process at a time serves a folder's door, and in the frame the frame's own door serves this folder: this server starts without one.
  const door = process.env.ACRYL_DOOR
  process.env.ACRYL_DOOR = 'off'
  const home = await mkdtemp(join(scratch, 'app-test-'))
  try {
    const app = await createApp(withPort(pinnedInstance(home, { root: projectRoot }), 0))
    await app.stop()
    await assert.rejects(fetch(`${app.url}/health`))
  } finally {
    if (door === undefined) delete process.env.ACRYL_DOOR
    else process.env.ACRYL_DOOR = door
    await rm(home, { recursive: true, force: true })
  }
})

test('the manifest decides what is mounted: a parameter changes the server, an unknown value is refused', async () => {
  const { readManifest } = await import('../src/app.ts')
  const manifest = readManifest()
  // The app's rows, in their order; a page's row (plugins/<name>/) sits between window-shell and extensions.
  const library = ['router', 'home', 'canvasmith', 'window-shell', 'files', 'canvas', 'inspector', 'exports', 'extensions', 'server', 'acryl-door']
  assert.deepEqual(
    manifest.plugins.map((row) => row.id).filter((id) => library.includes(id)),
    library,
  )
  assert.throws(() => readManifest({ nothing: 1 }), /parameter-override-unknown/)
})
