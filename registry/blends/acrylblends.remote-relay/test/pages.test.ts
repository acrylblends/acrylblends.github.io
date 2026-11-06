import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FRAME_MOUNT_PREFIX } from '../src/routes.ts'
import { redirectOf, withApp } from './support.ts'

test('the terminal shows the seeded session as the mockup does', () =>
  withApp(async (app) => {
    const { status, html } = await app.page('/')
    assert.equal(status, 200)
    assert.match(html, /<b id="hostName">staging-api<\/b><span>SSH · port 22<\/span><span class="badge">● Connected \(simulated\)<\/span>/)
    assert.match(html, /Relay terminal simulator · session #RLY-1042/)
    assert.match(html, /Outputs are canned demonstration fixtures\. No command is executed\./)
    assert.match(html, /<span class="prompt">deploy@staging-api:~\$<\/span> whoami<\/div><div class="line out">deploy<\/div>/)
    assert.match(html, /5ad8e1         api:1\.14\.2            Up 6 days/)
    assert.match(html, /placeholder="Try: ls, uptime, docker ps, git status…"/)
    for (const c of ['git status', 'df -h', 'free -m', 'help']) assert.match(html, new RegExp(`data-cmd="${c}"`))
    assert.match(html, /<a href="\/\?profile=staging-api" class="active" aria-current="page">Terminal<\/a>/)
    assert.match(html, /DEMO ENVIRONMENT/)
  }))

test('the left column lists the workspace\'s connections with their health, and the workspaces with counts', () =>
  withApp(async (app) => {
    const { html } = await app.page('/')
    assert.match(html, /data-host="staging-api"><b><span class="dot">●<\/span>staging-api<\/b><small>deploy@10\.20\.1\.14 · SSH 22<\/small>/)
    assert.match(html, /<span class="dot warn">●<\/span>edge-node<\/b><small>root@10\.20\.9\.8 · SSH 22/)
    assert.match(html, /db-replica<\/b><small>ops@10\.20\.1\.22 · SSH 2222/)
    assert.match(html, /<b>Production support<\/b><small>3 saved connections/)
    assert.match(html, /<b>Build infrastructure<\/b><small>5 saved connections/)
    assert.doesNotMatch(html, /data-host="ci-runner-a"/)
    const build = await app.page('/?profile=ci-runner-a')
    assert.match(build.html, /data-host="ci-runner-a"/)
    assert.match(build.html, /Not connected|Session closed|Timed out/)
  }))

test('the right column shows the session, recent sessions and the security note', () =>
  withApp(async (app) => {
    const { html } = await app.page('/')
    assert.match(html, /Session #RLY-1042<\/b><span>Started 10:42:01<\/span>/)
    assert.match(html, /<b>Identity<\/b><span>deploy · sample profile<\/span>/)
    assert.match(html, /SHA256:demo-only/)
    assert.match(html, /<b>Idle timeout<\/b><span>15 minutes<\/span>/)
    assert.match(html, /<b>staging-api<\/b><span>Today · 10:42 · Active<\/span>/)
    assert.match(html, /<b>db-replica<\/b><span>Yesterday · 16:19 · Closed<\/span>/)
    assert.match(html, /<b>edge-node<\/b><span>Nov 3 · 13:02 · Closed<\/span>/)
    assert.match(html, /No credentials are stored and no remote server is contacted/)
  }))

test('a command posts to the session, shows its output and returns to the terminal; unknown commands are denied in place', () =>
  withApp(async (app) => {
    const ok = await app.post('/sessions/RLY-1042/run', { command: 'pwd', back: '/?profile=staging-api' })
    assert.equal(ok.status, 303)
    assert.equal(ok.headers.get('location'), '/?profile=staging-api')
    let html = (await app.page('/')).html
    assert.match(html, /<span class="prompt">deploy@staging-api:~\$<\/span> pwd<\/div><div class="line out">\/home\/deploy<\/div>/)
    await app.post('/sessions/RLY-1042/run', { command: 'rm -rf /' })
    html = (await app.page('/')).html
    assert.match(html, /line out bad">Command not in demo allowlist/)
    assert.match(redirectOf(await app.post('/sessions/RLY-1042/run', { command: '' })).error ?? '', /Type a command first/)
    assert.equal(redirectOf(await app.post('/sessions/nope/run', { command: 'pwd' })).error, 'There is no such session.')
  }))

test('choosing a profile with no session shows the empty state; New session opens one, once', () =>
  withApp(async (app) => {
    const before = await app.page('/?profile=ci-runner-a')
    assert.match(before.html, /no session on ci-runner-a yet/)
    assert.match(before.html, /Press New session to open a simulated session/)
    assert.doesNotMatch(before.html, /id="command"/)
    const opened = await app.post('/sessions', { profileId: 'ci-runner-a' })
    assert.deepEqual(redirectOf(opened), { path: '/', ok: 'Session RLY-1043 opened on ci-runner-a.' })
    const after = await app.page('/?profile=ci-runner-a')
    assert.match(after.html, /session #RLY-1043/)
    assert.match(after.html, /id="command"/)
    const again = await app.post('/sessions', { profileId: 'ci-runner-a' })
    assert.equal(redirectOf(again).error, 'ci-runner-a already has an active session, RLY-1043. Close it first.')
    assert.equal(redirectOf(await app.post('/sessions', { profileId: 'nope' })).error, 'There is no such connection.')
  }))

test('closing a session ends the terminal input and says so', () =>
  withApp(async (app) => {
    const closed = await app.post('/sessions/RLY-1042/close', {})
    assert.equal(redirectOf(closed).ok, 'Session RLY-1042 closed.')
    const { html } = await app.page('/?profile=staging-api')
    assert.match(html, /● Session closed/)
    assert.match(html, /Session RLY-1042 is closed\. Press New session to open another\./)
    assert.doesNotMatch(html, /id="command"/)
    assert.doesNotMatch(html, /id="closeSession"/)
    assert.match(redirectOf(await app.post('/sessions/RLY-1042/close', {})).error ?? '', /already closed/)
  }))

test('the transfer tab lists the queue with sizes and states and the policy', () =>
  withApp(async (app) => {
    const { status, html } = await app.page('/transfer')
    assert.equal(status, 200)
    assert.match(html, /release-notes\.txt → \/tmp\/<\/span>.*Completed · 14 KB/)
    assert.match(html, /diagnostics\.tar\.gz ← \/var\/log\/<\/span>.*Ready · 2\.4 MB/)
    assert.match(html, /Checksum verification<\/span><b>Enabled/)
    assert.match(html, /Overwrite existing files<\/span><b>No/)
    assert.match(html, /SSH \/ SFTP \(not connected\)/)
    assert.match(html, /id="queue"/)
    assert.match(html, /<a href="\/transfer\?profile=staging-api" class="active" aria-current="page">File transfer<\/a>/)
  }))

test('queueing and stepping a transfer, and the guards', () =>
  withApp(async (app) => {
    const q = await app.post('/sessions/RLY-1042/transfers', { back: '/transfer?profile=staging-api' })
    assert.deepEqual(redirectOf(q), { path: '/transfer', ok: 'sample-bundle.zip queued.' })
    assert.match((await app.page('/transfer')).html, /sample-bundle\.zip → \/tmp\/<\/span>.*Queued · 640 KB/)
    const advance = await app.post('/transfers/xfer-2/advance', { back: '/transfer?profile=staging-api' })
    assert.equal(redirectOf(advance).ok, 'diagnostics.tar.gz is now running.')
    assert.equal(redirectOf(await app.post('/transfers/xfer-1/advance', {})).error, 'release-notes.txt is completed; it cannot move on.')
    assert.equal(redirectOf(await app.post('/transfers/xfer-2/cancel', {})).ok, 'diagnostics.tar.gz is now cancelled.')
    assert.equal(redirectOf(await app.post('/transfers/nope/cancel', {})).error, 'There is no such transfer.')
    const idle = await app.page('/transfer?profile=ci-runner-a')
    assert.match(idle.html, /Open a session on this connection to queue transfers/)
    assert.doesNotMatch(idle.html, /id="queue"/)
  }))

test('the audit tab lists the event log with results and the connection detail', () =>
  withApp(async (app) => {
    const { status, html } = await app.page('/audit')
    assert.equal(status, 200)
    assert.match(html, /10:42:01 · Session opened <span class="badge">OK<\/span>/)
    assert.match(html, /10:42:04 · Host profile staging-api selected<\/div>/)
    assert.match(html, /10:42:06 · whoami <span class="badge">Exit 0<\/span>/)
    assert.match(html, /10:42:12 · docker ps <span class="badge">Exit 0<\/span>/)
    assert.match(html, /Target<\/span><b>deploy@10\.20\.1\.14:22/)
    await app.post('/sessions/RLY-1042/run', { command: 'curl x' })
    assert.match((await app.page('/audit')).html, /curl x <span class="badge bad">Denied<\/span>/)
    assert.match((await app.page('/audit?profile=ci-runner-b')).html, /No events yet\. Open a session first\./)
  }))

test('Add connection saves a profile; a duplicate or bad value is refused with the reason', () =>
  withApp(async (app) => {
    const saved = await app.post('/connections', { name: 'gateway-01', user: 'ops', host: '10.1.1.1', port: '2200', workspaceId: 'production-support' })
    assert.deepEqual(redirectOf(saved), { path: '/', ok: 'Connection gateway-01 saved.' })
    assert.match((await app.page('/?profile=gateway-01')).html, /ops@10\.1\.1\.1 · SSH 2200/)
    assert.match((await app.page('/')).html, /<b>Production support<\/b><small>4 saved connections/)
    assert.match(redirectOf(await app.post('/connections', { name: 'gateway-01', user: 'ops', host: '10.1.1.1', port: '22', workspaceId: 'production-support' })).error ?? '', /already a connection called/)
    assert.match(redirectOf(await app.post('/connections', { name: 'x', user: 'ops', host: 'bad host', port: '22', workspaceId: 'production-support' })).error ?? '', /IPv4 address or a host name/)
  }))

test('a back address that leaves the app is ignored', () =>
  withApp(async (app) => {
    for (const back of ['https://evil.example/', '//evil.example', '/\\evil']) {
      const response = await app.post('/sessions/RLY-1042/run', { command: 'pwd', back })
      assert.equal(redirectOf(response).path, '/', back)
    }
  }))

test('under the frame prefix every page and link carries it', () =>
  withApp(
    async (app) => {
      const { status, html } = await app.page('/')
      assert.equal(status, 200)
      assert.match(html, new RegExp(`href="${FRAME_MOUNT_PREFIX}/transfer\\?profile=staging-api"`))
      assert.match(html, new RegExp(`action="${FRAME_MOUNT_PREFIX}/sessions/RLY-1042/run"`))
      const response = await app.post('/sessions/RLY-1042/run', { command: 'pwd', back: `${FRAME_MOUNT_PREFIX}/?profile=staging-api` })
      assert.equal(redirectOf(response).path, `${FRAME_MOUNT_PREFIX}/`)
    },
    { prefix: FRAME_MOUNT_PREFIX },
  ))

test('the home widget lists the active sessions', () =>
  withApp(async (app) => {
    const widget = app.root.home.widgets().find((w) => w.id === 'terminal')
    assert.ok(widget)
    assert.match(String(await widget.render()), /RLY-1042 on staging-api/)
  }))
