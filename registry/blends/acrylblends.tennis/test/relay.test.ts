import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Acryl } from '../plugins/acryl-router/src/index.ts'
import { relayApp } from '../plugins/relay/index.ts'

/** The relay as the frame mounts it: under /app. */
const mounted = () => new Acryl().route('/app/api', relayApp())
const post = (app: Acryl, path: string, body: string) => app.request(`http://localhost/app/api${path}`, { method: 'POST', body })

test('a phone swing reaches the match state, and a created room links under the mount', async () => {
  const app = mounted()
  const swing = await (await post(app, '/racket/swing', JSON.stringify({ role: 'p2', shotType: 'SLICE', speed: 2 }))).json()
  assert.equal(swing.swing.shotType, 'slice')
  const state = await (await app.request('http://localhost/app/api/match/state?touch=p1')).json()
  assert.equal(state.p2.lastSwing.seq, 1)
  assert.equal(state.p2PhoneConnected, true)
  assert.equal(state.p1DesktopOnline, true)
  const created = await (await post(app, '/match/create', '{}')).json()
  assert.match(created.roomId, /^MT-[A-Z0-9]{4}$/)
  assert.equal(created.p2PhoneUrl, `http://localhost/app/companion.html?room=${created.roomId}&role=p2`)
})

test('a body that is not JSON counts as empty', async () => {
  const res = await post(mounted(), '/racket/feedback', 'not json')
  assert.equal(res.status, 200)
  assert.equal((await res.json()).feedback.kind, 'hit')
})
