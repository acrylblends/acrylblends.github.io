import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MAX_PEERS, RANGES, Swarm, SwarmError, availability, count, etaLabel, holds, integrity, memoryStore, parseName, parseSize, percentOf, quality, receiptOf, runs, seed, span, step } from '../plugins/swarmdrop/index.ts'
import { NOW } from './support.ts'

const open = async () => {
  const store = memoryStore()
  const swarm = await Swarm.open({ store, clock: () => NOW })
  return { swarm, store }
}

test('the seed reads as the mockup: room SD-482 at 68%, four peers, 1.8 MB/s, and two more rooms', async () => {
  const { swarm } = await open()
  const r = swarm.room('SD-482')
  assert.deepEqual([r.code, r.name, percentOf(r), count(r, 'v'), count(r, 'f'), count(r, 'm')], ['SWM-4K8P-Q2', 'field-recordings-archive.zip', 68, 48, 5, 17])
  assert.equal(r.peers.reduce((n, p) => n + p.rate, 0), 1820)
  assert.deepEqual(r.peers.map((p) => quality(p)), ['good', 'good', 'good', 'poor'])
  assert.deepEqual(swarm.state.rooms.map((x) => x.id), ['SD-482', 'SD-517', 'SD-390'])
  assert.equal(receiptOf(swarm.room('SD-390'))?.file, 'quarterly-data.csv.gz')
  assert.match(etaLabel(r), /^\d+m \d\d s remaining$|^\d+m \d\ds remaining$/)
})

test('ranges cover all 1,024 chunks; holdings are deterministic', async () => {
  assert.deepEqual([span(0), span(RANGES - 1)], [[0, 13], [1009, 1023]])
  let chunks = 0
  for (let i = 0; i < RANGES; i += 1) chunks += span(i)[1] - span(i)[0] + 1
  assert.equal(chunks, 1024)
  const { swarm } = await open()
  const r = swarm.room('SD-482')
  const p = r.peers[0]
  assert.ok(p)
  assert.equal(holds(r, p, 7), holds(r, p, 7))
  assert.ok(availability(r, 60) <= 3)
  assert.equal(runs([1, 2, 3, 7, 9, 10]), '01–03, 07, 09–10')
})

test('a step verifies what is in flight, retries a corrupt copy once and starts the rarest ranges first', async () => {
  const { swarm } = await open()
  const r = swarm.room('SD-482')
  const s = step(r)
  assert.deepEqual(s.verified, [48, 49, 51, 52])
  assert.deepEqual(s.failed, [50])
  assert.deepEqual(s.corrupt, [])
  assert.ok(!s.started.includes(50))
  const probe = { ...r, ranges: s.ranges }
  const nStarted = s.started.map((i) => availability(probe, i))
  assert.deepEqual(nStarted, [...nStarted].sort((a, b) => a - b), 'rarest first')
  assert.equal(s.started.length, 5)
})

test('advancing runs the swarm to completion; the integrity check then gives the receipt', async () => {
  const { swarm } = await open()
  let guard = 0
  while (swarm.room('SD-482').completedAt === undefined && guard < 40) {
    await swarm.advance('SD-482')
    guard += 1
  }
  const r = swarm.room('SD-482')
  assert.ok(r.completedAt !== undefined && guard < 40)
  assert.equal(percentOf(r), 100)
  assert.equal(receiptOf(r), undefined, 'no receipt until the integrity check passes')
  const check = await swarm.verify('SD-482')
  assert.deepEqual([check.result, check.checked], ['passed', 70])
  const receipt = receiptOf(swarm.room('SD-482'))
  assert.equal(receipt?.chunks, 1024)
  assert.match(receipt?.digest ?? '', /^[0-9a-f]{64}$/)
  assert.ok(swarm.room('SD-482').events.some((e) => e.text.includes('range 50 failed') || e.text.includes('range 50 ')))
  await assert.rejects(swarm.advance('SD-482'), /already complete/)
  await assert.rejects(swarm.setPaused('SD-482', true), /nothing to pause/)
})

test('an integrity check on a partial transfer says so; a bad verified range fails it', async () => {
  const { swarm } = await open()
  const partial = await swarm.verify('SD-482')
  assert.deepEqual([partial.result, partial.checked], ['partial', 48])
  const r = swarm.room('SD-482')
  assert.equal(integrity({ ...r, corrupt: [3] }, NOW.toISOString()).result, 'failed')
})

test('pausing blocks the simulation; resuming lets it run', async () => {
  const { swarm } = await open()
  await swarm.setPaused('SD-482', true)
  await assert.rejects(swarm.advance('SD-482'), /paused/)
  assert.equal(etaLabel(swarm.room('SD-482')), 'paused')
  await swarm.setPaused('SD-482', false)
  assert.equal((await swarm.advance('SD-482')).failed.length, 1)
  await assert.rejects(swarm.advance('SD-517'), /paused/)
})

test('with no peer able to send the rest, the transfer stalls and says so', async () => {
  const { swarm } = await open()
  for (const p of ['peer-north-04', 'peer-amber-11', 'peer-lake-02']) await swarm.dropPeer('SD-482', p)
  await swarm.advance('SD-482')
  const r = await swarm.advance('SD-482')
  assert.equal(r.stalled, true)
  assert.ok(swarm.room('SD-482').events.some((e) => e.text.startsWith('stalled')))
  assert.equal(etaLabel(swarm.room('SD-482')), 'no peer is sending')
  await assert.rejects(swarm.dropPeer('SD-482', 'nope'), /no such peer/)
})

test('demo peers are deterministic and limited', async () => {
  const { swarm } = await open()
  const a = await swarm.addPeer('SD-517')
  assert.equal(a.id, 'peer-demo-15')
  assert.deepEqual(await open().then(({ swarm: s }) => s.addPeer('SD-517')), a)
  while (swarm.room('SD-517').peers.length < MAX_PEERS) await swarm.addPeer('SD-517')
  await assert.rejects(swarm.addPeer('SD-517'), /at most 12 peers/)
})

test('rooms: create, join by code, close; input is checked', async () => {
  const { swarm } = await open()
  const room = await swarm.createRoom(' notes.txt ', '120')
  assert.deepEqual([room.id, room.name, room.direction, room.paused, count(room, 'm')], ['SD-518', 'notes.txt', 'incoming', true, 70])
  assert.match(room.code, /^SWM-[A-Z2-9]{4}-[A-Z2-9]{2}$/)
  assert.equal(swarm.joinRoom(` ${room.code.toLowerCase()} `).id, 'SD-518')
  assert.throws(() => swarm.joinRoom('SWM-NOPE-00'), /No transfer room has the code/)
  assert.throws(() => swarm.joinRoom(''), /Enter a room code/)
  await assert.rejects(swarm.createRoom('NOTES.TXT', '5'), /already a room for/)
  assert.throws(() => parseName('a/b'), SwarmError)
  assert.throws(() => parseSize('0'), /from 1 to 50,000/)
  await swarm.closeRoom('SD-518')
  assert.equal(swarm.state.rooms.length, 3)
  await assert.rejects(swarm.closeRoom('nope'), /no such transfer room/)
})
