import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FRAME_MOUNT_PREFIX } from '../src/routes.ts'
import { redirectOf, withApp } from './support.ts'

test('answers health checks on its own server and under the frame prefix, and 404 for unknown paths', async () => {
  await withApp(async (app) => {
    assert.equal((await app.root.router.request('/health')).status, 200)
    const missing = await app.root.router.request('/nope')
    assert.equal(missing.status, 404)
    await missing.body?.cancel()
  })
  await withApp(
    async (app) => {
      assert.equal(app.root.termShell.prefix, FRAME_MOUNT_PREFIX)
      const { status, html } = await app.page('/')
      assert.equal(status, 200)
      assert.match(html, /href="\/app\/\?ws=infra-staging/)
    },
    { prefix: FRAME_MOUNT_PREFIX },
  )
})

test('opens the workspaces over the seed and saves it at once', () =>
  withApp(async (app) => {
    assert.equal(app.store.saved, 1)
    assert.equal(app.root.forge.state.workspaces.length, 3)
  }))

test('a part leaves with its plugin', async () => {
  await withApp(async (app) => {
    const { html } = await app.page('/')
    assert.match(html, /Task launcher/)
    assert.match(html, /Command snippets/)
  })
  await withApp(
    async (app) => {
      const { html } = await app.page('/')
      assert.doesNotMatch(html, /Task launcher/)
      assert.equal((await app.post('/tasks/build/run', {})).status, 404)
    },
    { off: ['tasks'] },
  )
})

test('the shell escapes what people type and shows a notice from the redirect query', () =>
  withApp(async (app) => {
    const url = '/?error=Bad%20%3Cinput%3E'
    assert.match(app.root.termShell.page({ title: '<x>', main: '', url }), /<title>&lt;x&gt; · Termforge<\/title>/)
    assert.match(app.root.termShell.notice(url), /<p class="alert error" role="alert">Bad &lt;input&gt;<\/p>/)
  }))

test('the manifest decides what is mounted', async () => {
  const { readManifest } = await import('../src/app.ts')
  const library = ['router', 'home', 'termforge', 'term-shell', 'workspaces', 'deck', 'tasks', 'console', 'snippets', 'session', 'extensions', 'server', 'acryl-door']
  assert.deepEqual(readManifest().plugins.map((r) => r.id).filter((id) => library.includes(id)), library)
  assert.throws(() => readManifest({ nothing: 1 }), /parameter-override-unknown/)
})

test('the console shows the seeded session, the deck, the overview and the safe-mode footer', () =>
  withApp(async (app) => {
    const { html } = await app.page('/')
    assert.match(html, /alex@acryl ~\/projects\/acryl \$<\/span> <span class="cmd">git status/)
    assert.match(html, /nothing to commit, working tree clean/)
    assert.match(html, /SAFE MODE ON/)
    assert.match(html, /LOCAL SIMULATION · NO HOST SHELL/)
    assert.match(html, /Host profile<\/span><b>macOS \/ ARM64/)
    assert.match(html, /id="exit">0</)
    for (const label of ['Git status', 'Run tests', 'Build project', 'Current time']) assert.match(html, new RegExp(label))
    assert.match(html, /data-snippet="List files"/)
    assert.match((await app.page('/?ws=infra-staging')).html, /infra \/ staging/)
  }))

test('a shortcut fills the prompt, Run answers from the fixtures and the exit status follows', () =>
  withApp(async (app) => {
    const filled = await app.page('/?ws=acryl&tab=tab-1&cmd=npm%20test')
    assert.match(filled.html, /id="command" name="command" value="npm test"/)
    const r = await app.post('/run', { ws: 'acryl', tab: 'tab-1', command: 'npm test' })
    assert.equal(r.status, 303)
    assert.match((await app.page('/')).html, /✓ 42 tests passed/)
    await app.post('/run', { ws: 'acryl', tab: 'tab-1', command: 'sudo reboot' })
    const after = (await app.page('/')).html
    assert.match(after, /command not available in safe demo mode/)
    assert.match(after, /id="exit">127</)
    assert.match(after, /Recent commands/)
    assert.doesNotMatch(after, /<div class="recent"[^]*sudo reboot[^]*?<\/div>/)
  }))

test('operators are refused, empty input is an error notice, clear empties the terminal', () =>
  withApp(async (app) => {
    await app.post('/run', { ws: 'acryl', tab: 'tab-1', command: 'ls; cat /etc/passwd' })
    assert.match((await app.page('/')).html, /shell operators are not interpreted/)
    assert.match(redirectOf(await app.post('/run', { ws: 'acryl', tab: 'tab-1', command: '  ' })).error ?? '', /Type a command first/)
    await app.post('/run', { ws: 'acryl', tab: 'tab-1', command: 'clear' })
    const html = (await app.page('/')).html
    assert.match(html, /Terminal cleared\. Type help to continue/)
    assert.doesNotMatch(html, /alex@acryl ~\/projects\/acryl \$<\/span> <span class="cmd">pwd/)
    assert.match(redirectOf(await app.post('/clear', { ws: 'acryl', tab: 'tab-1' })).ok ?? '', /cleared/)
  }))

test('tabs: open, switch, close; the last tab stays', () =>
  withApp(async (app) => {
    const r = redirectOf(await app.post('/tabs', { ws: 'scratch', tab: 'tab-3' }))
    assert.match(r.ok ?? '', /New tab opened/)
    assert.equal(app.root.forge.workspace('scratch').tabs.length, 2)
    const id = app.root.forge.workspace('scratch').tabs[1]?.id ?? ''
    assert.match((await app.page(`/?ws=scratch&tab=${id}`)).html, /class="tab on"[^>]*>⌘ zsh 2/)
    assert.match(redirectOf(await app.post(`/tabs/${id}/close`, { ws: 'scratch', tab: id })).ok ?? '', /Tab closed/)
    assert.match(redirectOf(await app.post('/tabs/tab-3/close', { ws: 'scratch', tab: 'tab-3' })).error ?? '', /at least one tab/)
  }))

test('tasks run routines and report a failing step', () =>
  withApp(async (app) => {
    assert.match(redirectOf(await app.post('/tasks/test/run', { ws: 'acryl', tab: 'tab-1' })).ok ?? '', /Test finished: 1 step passed/)
    assert.match(redirectOf(await app.post('/tasks/deploy/run', { ws: 'scratch', tab: 'tab-3' })).error ?? '', /Deploy \(dry run\) stopped at “git status” \(exit 1\)/)
    assert.match(redirectOf(await app.post('/tasks/nope/run', { ws: 'acryl', tab: 'tab-1' })).error ?? '', /no such task/)
  }))

test('snippets: save, refuse, delete', () =>
  withApp(async (app) => {
    assert.match(redirectOf(await app.post('/snippets', { ws: 'acryl', tab: 'tab-1', label: 'Me', command: 'whoami' })).ok ?? '', /Snippet Me saved/)
    assert.match((await app.page('/')).html, /data-snippet="Me"/)
    assert.match(redirectOf(await app.post('/snippets', { ws: 'acryl', tab: 'tab-1', label: 'Bad', command: 'rm -rf /' })).error ?? '', /allowlist/)
    const id = app.root.forge.state.snippets.at(-1)?.id ?? ''
    assert.match(redirectOf(await app.post(`/snippets/${id}/delete`, { ws: 'acryl', tab: 'tab-1' })).ok ?? '', /deleted/)
  }))

test('a redirect target that is not a path of this app is ignored', () =>
  withApp(async (app) => {
    const r = await app.post('/snippets', { ws: 'acryl', tab: 'tab-1', label: 'Me', command: 'whoami', back: 'https://evil.example/x' })
    assert.equal(new URL(r.headers.get('location') ?? '', 'http://local').hostname, 'local')
  }))
