import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { test } from 'node:test'
import { pinnedInstance, withPort } from '../plugins/instance/index.ts'
import { createShell } from '../plugins/hub-shell/index.ts'
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
      assert.equal(app.root.hubShell.prefix, FRAME_MOUNT_PREFIX)
      assert.equal(app.root.hubShell.href('/inbox'), `${FRAME_MOUNT_PREFIX}/inbox`)
      const health = await app.root.router.request(`${FRAME_MOUNT_PREFIX}/health`)
      assert.equal(health.status, 200)
      await health.body?.cancel()
    },
    { prefix: FRAME_MOUNT_PREFIX },
  )
})

test('opens the hub over the seed on the first launch and saves it at once', () =>
  withApp(async (app) => {
    assert.equal(app.store.saved, 1)
    assert.equal(app.root.hub.projects().length, 3)
    assert.equal(app.root.hub.state.tasks.length, 6)
    assert.equal(app.root.hub.state.notes.length, 4)
    assert.equal(app.root.hub.day().day, '2026-11-05')
  }))

test('a page registers its sidebar entry, quick capture follows the inbox entry, and both leave with the shell', () =>
  withApp(async (app) => {
    // A shell of its own: the app's inbox plugin already has an entry in the app's shell, and this test is about the shell's registration.
    const shell = createShell(app.root.hub, '')
    const page = () => shell.page({ title: 'Test', main: '<p id="body">hi</p>' })
    assert.doesNotMatch(page(), /id="capture"/)
    const dispose = shell.nav({ id: 'inbox', label: 'Inbox', icon: '▦', path: '/inbox', order: 20, count: () => app.root.hub.inbox().length })
    const html = page()
    assert.match(html, /<a href="\/inbox"><span aria-hidden="true">▦<\/span><span>Inbox<\/span><em>3<\/em><\/a>/)
    assert.match(html, /<form class="p-capture" method="post" action="\/inbox">/)
    assert.match(html, /Product launch[\s\S]*Personal[\s\S]*Reading list/)
    dispose()
    assert.doesNotMatch(page(), /Inbox|id="capture"/)
  }))

test('the shell escapes what people type and shows a notice from the redirect query', () =>
  withApp(async (app) => {
    const shell = app.root.hubShell
    assert.match(shell.header({ title: 'Make room for <good> work.' }), /<h1>Make room for &lt;good&gt; work<span>\.<\/span><\/h1>/)
    assert.match(shell.notice('/inbox?error=A%20title%20is%20needed.'), /<p class="p-alert error" role="alert">A title is needed\.<\/p>/)
    assert.equal(shell.notice('/inbox'), '')
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
  // The app's rows, in their order; a page's row (plugins/<name>/) sits between hub-shell and extensions.
  const library = ['router', 'home', 'productivity-hub', 'hub-shell', 'extensions', 'server', 'acryl-door']
  assert.deepEqual(
    manifest.plugins.map((row) => row.id).filter((id) => library.includes(id)),
    library,
  )
  assert.throws(() => readManifest({ nothing: 1 }), /parameter-override-unknown/)
})
