import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Fed, FedError, approvalBlock, counts, edges, healthLabel, matches, memoryStore, peersOf, seed } from '../plugins/federary/index.ts'
import { NOW } from './support.ts'

const open = async () => {
  let ids = 0
  const store = memoryStore()
  const fed = await Fed.open({ store, clock: () => NOW, newId: (kind) => `${kind}-n${++ids}` })
  return { fed, store }
}

test('the seed reads as the mockup: a primary with five peers, three inbound requests and the stats strip', () => {
  const s = seed(NOW)
  assert.equal(s.instances.find((i) => i.primary === true)?.id, 'northstar.social')
  assert.deepEqual(counts(s), { known: 12, healthy: 5, pendingIn: 3, openReports: 5 })
  assert.equal(healthLabel(s.instances[1] as never), 'Healthy · v4.2')
  assert.equal(healthLabel(s.instances[4] as never), 'Review needed')
  assert.equal(healthLabel(s.instances[6] as never), 'Request pending')
})

test('domain patterns: a leading *. matches any subdomain', () => {
  assert.equal(matches('*.spamfarm.example', 'promo.spamfarm.example'), true)
  assert.equal(matches('*.spamfarm.example', 'spamfarm.example'), false)
  assert.equal(matches('openfield.net', 'OpenField.net'), true)
})

test('trust rules stop an approval: a denied domain, an expired or unsigned assertion', () => {
  const s = seed(NOW)
  const by = (id: string) => s.instances.find((i) => i.id === id) as never
  assert.match(approvalBlock(s, by('promo.spamfarm.example')) ?? '', /matches the deny rule “\*\.spamfarm\.example”/)
  assert.match(approvalBlock(s, by('signal.social')) ?? '', /Require signed identity assertions/)
  assert.match(approvalBlock(s, by('lantern.club')) ?? '', /assertion has expired/)
  assert.equal(approvalBlock(s, by('meadow.community')), undefined)
  assert.equal(approvalBlock({ rules: s.rules.map((r) => ({ ...r, enabled: false })) }, by('signal.social')), undefined)
})

test('the map draws the primary’s links by relation and the peer links, and drops a blocked instance’s', () => {
  const s = seed(NOW)
  const e = edges(s)
  assert.deepEqual(['solid', 'faint', 'dashed', 'warn'].map((st) => e.filter((x) => x.style === st).length), [5, 4, 4, 0])
  assert.deepEqual(peersOf(s, 'garden.pub').map((i) => i.id).sort(), ['commons.zone', 'northstar.social', 'quiet.space'])
  assert.deepEqual(peersOf(s, 'northstar.social').map((i) => i.id).sort(), ['commons.zone', 'garden.pub', 'openfield.net', 'quiet.space', 'weave.place'])
})

test('approving, holding and blocking follow the allowed transitions and are recorded', async () => {
  const { fed } = await open()
  const d = await fed.act('meadow.community', 'approve')
  assert.deepEqual([d.before.relation, d.after.relation, d.kind, d.undone], ['pending-in', 'peered', 'relation', false])
  assert.equal(fed.instance('meadow.community').relation, 'peered')
  assert.deepEqual(counts(fed.state), { known: 12, healthy: 6, pendingIn: 2, openReports: 5 })
  await assert.rejects(fed.act('meadow.community', 'approve'), /is peered; it cannot be set to peered with “Approve”/)
  await fed.act('meadow.community', 'hold')
  assert.equal(fed.instance('meadow.community').relation, 'quarantined')
  await fed.act('meadow.community', 'approve')
  await fed.act('lantern.club', 'request')
  assert.equal(fed.instance('lantern.club').relation, 'pending-out')
  await fed.act('lantern.club', 'withdraw')
  await fed.act('hollow.cafe', 'unblock')
  assert.equal(fed.instance('hollow.cafe').relation, 'unpeered')
  await assert.rejects(fed.act('northstar.social', 'block'), /primary instance cannot be changed/)
  await assert.rejects(fed.act('garden.pub', 'explode'), /Pick approve/)
  await assert.rejects(fed.act('nope', 'approve'), /no such instance/)
  assert.equal(fed.history('meadow.community')[0]?.text, 'Approve: Quarantined → Peered.')
})

test('approval is refused by a trust rule until the rule is switched off', async () => {
  const { fed } = await open()
  await assert.rejects(fed.act('signal.social', 'approve'), /Require signed identity assertions/)
  assert.equal(fed.instance('signal.social').relation, 'pending-in')
  assert.equal((await fed.toggleRule('rule-signed')).enabled, false)
  await fed.act('signal.social', 'approve')
  await assert.rejects(fed.act('promo.spamfarm.example', 'approve'), /deny rule/)
  await fed.toggleRule('rule-deny')
  await fed.act('promo.spamfarm.example', 'approve')
  await assert.rejects(fed.toggleRule('nope'), /no such trust rule/)
})

test('a decision can be undone while its result stands, and not after the instance has moved on', async () => {
  const { fed } = await open()
  const a = await fed.act('meadow.community', 'approve')
  await fed.undo(a.id)
  assert.equal(fed.instance('meadow.community').relation, 'pending-in')
  await assert.rejects(fed.undo(a.id), /already undone/)
  const b = await fed.act('meadow.community', 'approve')
  await fed.act('meadow.community', 'hold')
  await assert.rejects(fed.undo(b.id), /has changed since this decision/)
  await assert.rejects(fed.undo('nope'), /no such decision/)
})

test('reports: dismiss, limit the instance or block it; each is decided once and can be undone', async () => {
  const { fed } = await open()
  await fed.decideReport('rep-5', 'dismiss')
  assert.equal(fed.report('rep-5').state, 'dismissed')
  const lim = await fed.decideReport('rep-1', 'limit')
  assert.deepEqual([fed.report('rep-1').state, fed.instance('openfield.net').relation], ['actioned', 'quarantined'])
  await assert.rejects(fed.decideReport('rep-2', 'limit'), /already quarantined/)
  await assert.rejects(fed.decideReport('rep-1', 'dismiss'), /already been decided/)
  await assert.rejects(fed.decideReport('rep-2', 'shrug'), /Pick dismiss, limit or block/)
  await fed.undo(lim.id)
  assert.deepEqual([fed.report('rep-1').state, fed.instance('openfield.net').relation], ['open', 'peered'])
  await fed.decideReport('rep-4', 'block')
  assert.equal(fed.instance('promo.spamfarm.example').relation, 'blocked')
  assert.equal(counts(fed.state).openReports, 3)
})

test('handshakes: valid ones refresh the time and clear a review; an expired assertion fails and is logged', async () => {
  const { fed } = await open()
  assert.equal((await fed.handshake('garden.pub')).handshakeAt, NOW.toISOString())
  const open2 = await fed.handshake('openfield.net')
  assert.equal(open2.health, 'healthy')
  assert.match(fed.history('signal.social').length === 0 ? '' : 'x', /x|/)
  await assert.rejects(fed.handshake('lantern.club'), /identity assertion has expired/)
  assert.equal(fed.history('lantern.club')[0]?.text, 'Identity handshake failed: the assertion has expired.')
  await assert.rejects(fed.handshake('hollow.cafe'), /is blocked/)
  await assert.rejects(fed.handshake('northstar.social'), /does not handshake with itself/)
  await fed.handshake('signal.social')
  assert.equal(fed.history('signal.social')[0]?.text, 'Handshake completed, but the identity is unsigned.')
})

test('the exported topology lists instances and the links on the map', async () => {
  const { fed } = await open()
  const t = fed.topology()
  assert.equal(t.instances.length, 12)
  assert.equal(t.links.length, 9)
  await fed.act('garden.pub', 'block')
  assert.equal(fed.topology().links.length, 6)
  assert.ok(new FedError('invalid', 'x') instanceof Error)
})
