import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FRAME_MOUNT_PREFIX } from '../src/routes.ts'
import { redirectOf, withApp } from './support.ts'

test('the topology page shows the cluster as the mockup does', () =>
  withApp(async (app) => {
    const { status, html } = await app.page('/')
    assert.equal(status, 200)
    assert.match(html, /<h1>Northstar cluster<\/h1><p>Raft consensus · 5 voting nodes · region eu-central<\/p>/)
    assert.match(html, /id="leaderBadge">Leader · node-03<\/span>/)
    assert.match(html, /● Quorum available/)
    assert.match(html, /<small>Node availability<\/small><b>5 \/ 5<\/b>/)
    assert.match(html, /<small>Quorum<\/small><b class="">3 \/ 5<\/b>/)
    assert.match(html, /<b id="commit">8,421<\/b>/)
    assert.match(html, /<small>Replication lag<\/small><b>18 ms<\/b>/)
    assert.match(html, /5 connected/)
    assert.match(html, /<g class="node leader selected" data-node="node-03">/)
    assert.match(html, /<g class="node warn" data-node="node-05">/)
    assert.match(html, /LEADER<\/text>/)
    assert.equal((html.match(/class="edge/g) ?? []).length, 6)
    assert.match(html, /<a href="\/\?node=node-01" aria-label="node-01, follower, healthy">/)
    assert.match(html, /<a href="\/" class="active" aria-current="page">Topology map<\/a>|<a href="\/\?node=node-03" class="active" aria-current="page">Topology map<\/a>/)
  }))

test('the inspector follows the selected node and shows the recent events', () =>
  withApp(async (app) => {
    const leader = (await app.page('/')).html
    assert.match(leader, /<h3 id="nodeTitle">node-03 · Leader<\/h3>/)
    assert.match(leader, /<span>Region<\/span><b>eu-central-1a<\/b>/)
    assert.match(leader, /<span>Consensus term<\/span><b>38<\/b>/)
    assert.match(leader, /<span>Last heartbeat<\/span><b>now<\/b>/)
    assert.match(leader, /10:42:12 · Commit index advanced<small>\+18 records<\/small>/)
    assert.match(leader, /10:42:10 · Heartbeat acknowledged<small>node-02<\/small>/)
    assert.match(leader, /10:41:58 · Replica lag warning<small>node-05 · 142 ms<\/small>/)
    assert.match(leader, /No live node is contacted and no data is moved/)
    const follower = (await app.page('/?node=node-05')).html
    assert.match(follower, /<h3 id="nodeTitle">node-05 · Follower<\/h3>/)
    assert.match(follower, /<span>Status<\/span><b class="warn">Degraded<\/b>/)
    assert.match(follower, /<span>Replication lag<\/span><b>142 ms<\/b>/)
    assert.match(follower, /<span>Last heartbeat<\/span><b>4 sec ago<\/b>/)
    assert.match(follower, /<a href="\/consensus\?node=node-05"/)
  }))

test('the consensus log lists the commit log newest first', () =>
  withApp(async (app) => {
    const { status, html } = await app.page('/consensus')
    assert.equal(status, 200)
    const rows = [...html.matchAll(/<tr data-index="(\d+)">/g)].map((m) => m[1])
    assert.deepEqual(rows, ['8421', '8420', '8419', '8418'])
    assert.match(html, /<td>8421<\/td><td>38<\/td><td>node-03<\/td><td>Write batch · 18 records<\/td><td class="ok">Committed<\/td>/)
  }))

test('replica health lists every node with role, status, lag and heartbeat', () =>
  withApp(async (app) => {
    const { html } = await app.page('/replicas')
    assert.match(html, /<td>Follower<\/td><td class="ok">Healthy<\/td><td>12 ms<\/td><td>1 sec ago<\/td>/)
    assert.match(html, /<td>Leader<\/td><td class="ok">Healthy<\/td><td>—<\/td><td>now<\/td>/)
    assert.match(html, /<td>Follower<\/td><td class="warn">Degraded<\/td><td>142 ms<\/td><td>4 sec ago<\/td>/)
  }))

test('the drills page lists the history; a failover posts, moves the leader and says so', () =>
  withApp(async (app) => {
    const before = (await app.page('/drills')).html
    assert.match(before, /Scheduled rehearsal · Nov 1<\/b><small>node-03 → node-02 · Completed in 2\.1 sec/)
    assert.match(before, /Quorum interruption test · Oct 28<\/b><small>3 \/ 5 quorum retained · Completed/)
    assert.match(before, /<option value="">Best follower \(node-02\)<\/option>/)
    assert.doesNotMatch(before, /<option value="node-05">/)
    const posted = await app.post('/drills', { target: '', name: 'Rehearsal' })
    assert.equal(posted.status, 303)
    assert.equal(redirectOf(posted).path, '/drills')
    assert.match(redirectOf(posted).ok ?? '', /node-03 → node-02: node-02 now leads term 39\./)
    const after = (await app.page('/')).html
    assert.match(after, /Leader · node-02/)
    assert.match(after, /<b id="commit">8,422<\/b>/)
    assert.match(after, /<g class="node leader selected" data-node="node-02">/)
    assert.match((await app.page('/drills')).html, /Rehearsal · just now<\/b><small>node-03 → node-02 · Completed in 2\.0 sec · illustrative/)
    assert.match((await app.page('/consensus')).html, /<td>8422<\/td><td>39<\/td><td>node-02<\/td><td>Leadership transition<\/td>/)
  }))

test('a failover to a degraded node or the current leader is refused with the reason', () =>
  withApp(async (app) => {
    assert.equal(redirectOf(await app.post('/drills', { target: 'node-05' })).error, 'node-05 is degraded; promote a healthy follower.')
    assert.equal(redirectOf(await app.post('/drills', { target: 'node-03' })).error, 'node-03 already leads the cluster.')
    assert.equal(redirectOf(await app.post('/drills', { target: 'node-99' })).error, 'There is no such node.')
  }))

test('the quorum test records its result; reset restores the seed', () =>
  withApp(async (app) => {
    assert.equal(redirectOf(await app.post('/drills/quorum', {})).ok, '3 / 5 quorum retained · Completed')
    await app.post('/drills', {})
    assert.equal(redirectOf(await app.post('/drills/reset', {})).ok, 'Fixture reset to the seeded cluster.')
    assert.match((await app.page('/')).html, /Leader · node-03/)
    assert.equal(app.root.mesh.drills().length, 2)
  }))

test('setting a node down updates the map, the statistics and elects a leader; a bad value is refused', () =>
  withApp(async (app) => {
    const down = await app.post('/nodes/node-03/health', { health: 'down', back: '/?node=node-03' })
    assert.deepEqual(redirectOf(down), { path: '/', ok: 'node-03 is now down.' })
    const html = (await app.page('/?node=node-03')).html
    assert.match(html, /Leader · node-02/)
    assert.match(html, /<small>Node availability<\/small><b>4 \/ 5<\/b>/)
    assert.match(html, /<g class="node down selected" data-node="node-03">/)
    assert.match(html, /DOWN<\/text>/)
    assert.match(html, /class="edge cut"/)
    assert.match(html, /4 connected/)
    assert.match(html, /<span>Last heartbeat<\/span><b>No response<\/b>/)
    assert.equal(redirectOf(await app.post('/nodes/node-03/health', { health: 'down' })).error, 'node-03 is already down.')
    assert.equal(redirectOf(await app.post('/nodes/node-03/health', { health: 'sideways' })).error, 'Pick healthy, degraded or down.')
    assert.equal(redirectOf(await app.post('/nodes/nope/health', { health: 'down' })).error, 'There is no such node.')
  }))

test('without a quorum the page says so and the drill buttons refuse', () =>
  withApp(async (app) => {
    for (const id of ['node-01', 'node-02', 'node-03']) await app.post(`/nodes/${id}/health`, { health: 'down' })
    const html = (await app.page('/')).html
    assert.match(html, /● Quorum lost/)
    assert.match(html, /<span class="badge bad" id="leaderBadge">No leader<\/span>/)
    assert.match(html, /<b class="bad">3 \/ 5<\/b>/)
    assert.match(redirectOf(await app.post('/drills', {})).error ?? '', /Only 2 of 5 nodes are up/)
  }))

test('a back address that leaves the app is ignored', () =>
  withApp(async (app) => {
    for (const back of ['https://evil.example/', '//evil.example', '/\\evil']) {
      const response = await app.post('/nodes/node-05/health', { health: 'healthy', back })
      assert.equal(redirectOf(response).path, '/', back)
      await app.post('/nodes/node-05/health', { health: 'degraded' })
    }
  }))

test('under the frame prefix every page and link carries it', () =>
  withApp(
    async (app) => {
      const { status, html } = await app.page('/')
      assert.equal(status, 200)
      assert.match(html, new RegExp(`href="${FRAME_MOUNT_PREFIX}/consensus\\?node=node-03"`))
      assert.match(html, new RegExp(`action="${FRAME_MOUNT_PREFIX}/drills"`))
      const response = await app.post('/drills', { back: `${FRAME_MOUNT_PREFIX}/drills` })
      assert.equal(redirectOf(response).path, `${FRAME_MOUNT_PREFIX}/drills`)
    },
    { prefix: FRAME_MOUNT_PREFIX },
  ))

test('the home widget shows the leader and term', () =>
  withApp(async (app) => {
    const widget = app.root.home.widgets().find((w) => w.id === 'topology')
    assert.ok(widget)
    assert.match(String(await widget.render()), /Northstar<\/b> · leader node-03 · term 38[\s\S]*5 of 5 nodes up/)
  }))
