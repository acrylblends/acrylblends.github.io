import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Studio, StudioError, applyTransform, checkMappings, memoryStore, missingRequired, preview, sampleRecords, seed, simulate, suggestMappings, ago, runStatus } from '../plugins/relaycraft/index.ts'
import { NOW } from './support.ts'

const open = async () => {
  let ids = 0
  const store = memoryStore()
  const studio = await Studio.open({ store, clock: () => NOW, newId: (k) => `${k}-n${++ids}` })
  return { studio, store }
}
const s = seed(NOW)
const hubspot = s.connectors[0]!
const csv = s.connectors[1]!
const postgres = s.connectors[3]!
const sync = s.pipelines[0]!

test('transforms trim, change case and format E.164, and say when a value cannot be formatted', () => {
  assert.equal(applyTransform('trim', '  Ada '), 'Ada')
  assert.equal(applyTransform('lowercase', 'ADA@X.EXAMPLE'), 'ada@x.example')
  assert.equal(applyTransform('uppercase', 'ada'), 'ADA')
  assert.equal(applyTransform('none', ' x '), ' x ')
  assert.equal(applyTransform('e164', '+43 1 555 1001'), '+4315551001')
  assert.equal(applyTransform('e164', '0043 1 555 1003'), '+4315551003')
  assert.equal(applyTransform('e164', '12'), undefined)
})

test('the sample rows are deterministic: 248 contacts, padded names, mixed-case e-mails, four invalid addresses', () => {
  const rows = sampleRecords(hubspot)
  assert.equal(rows.length, 248)
  assert.deepEqual(sampleRecords(hubspot), rows)
  assert.equal(rows[6]?.first_name, ' Gus ')
  assert.equal(rows[4]?.email, rows[4]?.email?.toUpperCase())
  assert.equal(rows.filter((r) => !(r.email ?? '').includes('@')).length, 4)
  assert.equal(sampleRecords(csv).length, 60)
  assert.deepEqual(Object.keys(sampleRecords(csv)[0]!), ['full_name', 'mail', 'organisation', 'tel'])
})

test('the seeded Customer sync reads as the mockup: 248 fetched, 244 synced, 4 skipped, 3 rules', () => {
  const sim = simulate(sync, hubspot, postgres)
  assert.deepEqual([sim.fetched, sim.synced, sim.skipped, sim.failed], [248, 244, 4, 0])
  assert.deepEqual(sim.issues.map((i) => i.row), [17, 64, 130, 201])
  assert.match(sim.issues[0]?.text ?? '', /email_address: “[^”]+” is not a valid e-mail address/)
  assert.equal(sync.mappings.filter((m) => m.transform !== 'none').length, 3)
  assert.deepEqual(checkMappings(sync, hubspot).map((c) => c.status), ['mapped', 'mapped', 'mapped', 'review'])
  assert.deepEqual(s.runs[0] && [s.runs[0].synced, s.runs[0].skipped, runStatus(s.runs[0])], [244, 4, 'Warnings'])
})

test('a phone mapping with E.164 fails the rows whose number is too short', () => {
  const withPhone = { ...sync, mappings: [...sync.mappings, { source: 'phone_number', transform: 'e164' as const, destination: 'phone' }] }
  const sim = simulate(withPhone, hubspot, postgres)
  assert.equal(sim.failed, Math.floor(248 / 11) - 0)
  assert.ok(sim.synced + sim.skipped + sim.failed === 248)
  assert.match(sim.issues.find((i) => i.kind === 'failed')?.text ?? '', /phone: “12” cannot be formatted as E\.164/)
  assert.equal(runStatus({ failed: 1, skipped: 0 }), 'Failed')
})

test('the preview shows the destination values and the unmapped source fields; required destination fields are checked', () => {
  const pv = preview(sync, hubspot, 3)
  assert.equal(pv.rows.length, 3)
  assert.deepEqual(pv.rows[0], { given_name: 'Ada', family_name: 'Reyes', email_address: 'ada.reyes@northwind.example', organization: 'Northwind' })
  assert.deepEqual(pv.unmapped, ['phone_number', 'country'])
  assert.deepEqual(missingRequired(sync, postgres), [])
  assert.deepEqual(missingRequired({ ...sync, mappings: [] }, postgres), ['given_name', 'family_name', 'email_address'])
})

test('suggested mappings pair the fields that mean the same thing, with a fitting transform', () => {
  assert.deepEqual(suggestMappings(csv, postgres), [
    { source: 'mail', transform: 'lowercase', destination: 'email_address' },
    { source: 'organisation', transform: 'trim', destination: 'organization' },
    { source: 'tel', transform: 'e164', destination: 'phone' },
  ])
  assert.equal(suggestMappings(hubspot, postgres).length, 6)
})

test('mappings: added against the schemas once per destination, removed, and the draft is dirty until saved', async () => {
  const { studio, store } = await open()
  const saves = store.saved
  await assert.rejects(studio.addMapping('customer-sync', { source: 'nope', transform: 'none', destination: 'phone' }), /Pick a source field/)
  await assert.rejects(studio.addMapping('customer-sync', { source: 'phone_number', transform: 'none', destination: 'nope' }), /Pick a destination field/)
  await assert.rejects(studio.addMapping('customer-sync', { source: 'first_name', transform: 'lowercase', destination: 'phone' }), /Lowercase does not apply to phone \(phone\)/)
  await assert.rejects(studio.addMapping('customer-sync', { source: 'company', transform: 'none', destination: 'organization' }), /organization is already mapped/)
  await assert.rejects(studio.addMapping('customer-sync', { source: 'company', transform: 'weird', destination: 'phone' }), /Pick a transform/)
  assert.equal(store.saved, saves)
  const added = await studio.addMapping('customer-sync', { source: 'phone_number', transform: 'e164', destination: 'phone' })
  assert.deepEqual([added.mappings.length, added.dirty, added.editedBy, added.version], [5, true, 'You', 4])
  assert.equal((await studio.saveDraft('customer-sync')).version, 5)
  await assert.rejects(studio.saveDraft('customer-sync'), /no unsaved changes/)
  assert.equal((await studio.removeMapping('customer-sync', 'phone')).mappings.length, 4)
  await assert.rejects(studio.removeMapping('customer-sync', 'phone'), /phone is not mapped/)
})

test('connections: connect and disconnect, but not while a pipeline uses the connector', async () => {
  const { studio } = await open()
  assert.equal((await studio.connect('stripe', true)).connected, true)
  await assert.rejects(studio.connect('stripe', true), /already connected/)
  await assert.rejects(studio.connect('stripe', false), /Stripe is used by a pipeline/)
  await assert.rejects(studio.connect('hubspot', false), /HubSpot CRM is used by a pipeline/)
  await assert.rejects(studio.connect('nope', true), /no such connector/)
})

test('pipelines: created between connected connectors of the right role, limited by the plan; ends changed with suggestions', async () => {
  const { studio } = await open()
  await assert.rejects(studio.createPipeline({ name: '', sourceId: 'hubspot', destinationId: 'postgres' }), /Give the pipeline a name/)
  await assert.rejects(studio.createPipeline({ name: 'Customer sync', sourceId: 'hubspot', destinationId: 'postgres' }), /already a pipeline called/)
  await assert.rejects(studio.createPipeline({ name: 'X', sourceId: 'postgres', destinationId: 'postgres' }), /PostgreSQL is a destination; pick a source/)
  await assert.rejects(studio.createPipeline({ name: 'X', sourceId: 'hubspot', destinationId: 'hubspot' }), /HubSpot CRM is a source; pick a destination/)
  await assert.rejects(studio.createPipeline({ name: 'X', sourceId: 'stripe', destinationId: 'postgres' }), /Stripe is not connected/)
  const p = await studio.createPipeline({ name: 'Lead  Export!', sourceId: 'csv', destinationId: 'postgres' })
  assert.deepEqual([p.id, p.mappings.length, p.dirty], ['lead-export', 0, true])
  const moved = await studio.setEnds('lead-export', 'hubspot', 'postgres')
  assert.equal(moved.mappings.length, 6)
  await assert.rejects(studio.suggest('lead-export'), /nothing new to suggest/)
  for (let i = 0; i < 10; i += 1) await studio.createPipeline({ name: `Flow ${String(i)}`, sourceId: 'csv', destinationId: 'postgres' }).catch(() => undefined)
  assert.equal(studio.state.pipelines.length, 10)
  await assert.rejects(studio.createPipeline({ name: 'One more', sourceId: 'csv', destinationId: 'postgres' }), /plan allows 10 flows/)
})

test('a run needs mappings, connected ends and the required destination fields; it records counts, lines and issues', async () => {
  const { studio } = await open()
  await assert.rejects(studio.run('lead-intake'), /has no field mappings yet/)
  await assert.rejects(studio.run('invoice-export'), /Stripe is not connected/)
  await studio.suggest('lead-intake')
  await assert.rejects(studio.run('lead-intake'), /PostgreSQL requires given_name, family_name; map them before running/)
  const run = await studio.run('customer-sync')
  assert.deepEqual([run.fetched, run.synced, run.skipped, run.failed], [248, 244, 4, 0])
  assert.equal(run.durationSec, 3.3)
  assert.deepEqual(run.lines.map((l) => l.level), ['ok', 'ok', 'ok', 'warn', 'ok'])
  assert.equal(studio.latestRun('customer-sync')?.id, run.id)
  assert.equal(studio.runs().length, 2)
  assert.equal(ago(new Date(NOW.getTime() - 8 * 60_000).toISOString(), NOW), '8 min ago')
  assert.equal(ago(NOW.toISOString(), NOW), 'just now')
  assert.ok(new StudioError('invalid', 'x') instanceof Error)
})
