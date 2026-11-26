import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { pinnedInstance, withPort } from '@acryldev/instance'
import { type App, type AppOptions, createApp } from '../src/app.ts'
import { FRAME_MOUNT_PREFIX } from '../src/routes.ts'

/** Throwaway homes live inside the project (`.acrylblends/` is ignored by git): a sandboxed agent may not write to the system temp folder. */
const scratch = join(fileURLToPath(new URL('..', import.meta.url)), '.acrylblends', 'test')
mkdirSync(scratch, { recursive: true })

const projectRoot = fileURLToPath(new URL('..', import.meta.url))

/** Boot the app in a throwaway home on any free port, run the test, always stop it and remove the home. */
async function withApp(run: (app: App) => Promise<void>, options: AppOptions = {}) {
  const home = await mkdtemp(join(scratch, 'app-test-'))
  const app = await createApp(withPort(pinnedInstance(home, { root: projectRoot }), 0), {
    ...options,
    listen: false,
  })
  try {
    await run(app)
  } finally {
    await app.stop()
    await rm(home, { recursive: true, force: true })
  }
}


test('serves the screen at the root, and the JSON API lists every step', () =>
  withApp(async (app) => {
    const response = await app.root.router.request('/')
    assert.equal(response.status, 200)
    assert.match(await response.text(), /id="content-studio"/u)
    const features = await app.root.router.request('/content/api/features')
    assert.equal(features.status, 200)
    const { features: list } = (await features.json()) as { features: Array<{ id: string }> }
    assert.deepEqual(list.map((f) => f.id), ['ingest', 'transcribe', 'cut', 'sound', 'music', 'visuals', 'shorts', 'thumbnail', 'posts'])
  }))

test('answers health checks and 404 for unknown paths', () =>
  withApp(async (app) => {
    assert.equal((await app.root.router.request('/health')).status, 200)
    const missing = await app.root.router.request('/nope')
    assert.equal(missing.status, 404)
    await missing.body?.cancel()
  }))

test('the frame mounts the same app under /app; the app on its own server keeps its URLs', async () => {
  await withApp(
    async (app) => {
      for (const path of ['', '/health', '/content/api/features']) {
        const response = await app.root.router.request(`${FRAME_MOUNT_PREFIX}${path}`)
        assert.equal(response.status, 200, path)
        if (path === '') assert.match(await response.text(), /data-base="\/app"/u)
        else await response.body?.cancel()
      }
    },
    { prefix: FRAME_MOUNT_PREFIX },
  )
})

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
  // The template's rows, in their order (the content machine's screen takes the root in place of the template's routes row); its own rows sit between them.
  const library = ['router', 'home', 'extensions', 'server', 'acryl-door']
  assert.deepEqual(
    manifest.plugins.map((row) => row.id).filter((id) => library.includes(id)),
    library,
  )
  const ids = manifest.plugins.map((row) => row.id)
  assert.ok(ids.indexOf('content') < ids.indexOf('content-ingest') && ids.indexOf('content-tools') < ids.indexOf('extensions'))
  assert.throws(() => readManifest({ nothing: 1 }), /parameter-override-unknown/)
})
