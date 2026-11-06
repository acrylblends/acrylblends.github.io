import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  Vault,
  VaultError,
  checkName,
  etagOf,
  expiresAt,
  formatBytes,
  formatCount,
  formatGb,
  isExpired,
  listObjects,
  memoryStore,
  parseRetention,
  parseSizeGb,
  poolFreeGb,
  seed,
  totalsOf,
} from '../plugins/vaultline/index.ts'
import { NOW } from './support.ts'

const open = async () => {
  let ids = 0
  const store = memoryStore()
  let now = NOW
  const vault = await Vault.open({ store, clock: () => now, newId: () => `snap-n${++ids}` })
  return { vault, store, setNow: (d: Date) => (now = d) }
}

test('the seed reads as the mockup: 248 TB raw, 172 TB allocated (69%), 4.8 M objects in 12 buckets, 99.98% covered', () => {
  const t = totalsOf(seed(NOW), NOW)
  assert.equal(formatGb(t.rawGb), '248 TB')
  assert.equal(formatGb(t.allocatedGb), '172 TB')
  assert.equal(t.provisionedPercent, 69)
  assert.equal(formatCount(t.objects), '4.8 M')
  assert.equal(t.buckets, 12)
  assert.equal(t.protectionPercent, 99.98)
  const pools = seed(NOW).pools
  const state = seed(NOW)
  assert.deepEqual(pools.map((p) => poolFreeGb(p, state.volumes)), [28_000, 37_000, 11_000])
})

test('sizes and counts read as the mockup does', () => {
  assert.equal(formatGb(100), '100 GB')
  assert.equal(formatGb(2000), '2 TB')
  assert.equal(formatGb(1400), '1.4 TB')
  assert.equal(formatBytes(2_400_000_000), '2.4 GB')
  assert.equal(formatBytes(8_200_000), '8.2 MB')
  assert.equal(formatBytes(512), '512 B')
  assert.equal(formatCount(1_920_400), '1.9 M')
})

test('listing a bucket shows the folders and objects directly under a prefix, newest first', () => {
  const { objects } = seed(NOW)
  const root = listObjects(objects, 'media-assets', '')
  assert.deepEqual(root.folders, ['2026/'])
  assert.deepEqual(root.objects, [])
  const year = listObjects(objects, 'media-assets', '2026/')
  assert.deepEqual(year.folders, ['2026/Q3/', '2026/Q4/'])
  const q4 = listObjects(objects, 'media-assets', '2026/Q4/')
  assert.deepEqual(q4.objects.map((o) => o.key.split('/').pop()), ['launch-film-final.mp4', 'product-render-08.webp', 'brand-guidelines.pdf', 'teaser-cut.mov'])
  assert.deepEqual(listObjects(objects, 'tmp-share', '').objects, [])
})

test('an etag is stable per object and version', () => {
  const o = seed(NOW).objects[0]!
  assert.match(etagOf(o), /^[0-9a-f]{32}$/)
  assert.equal(etagOf(o), etagOf({ ...o }))
  assert.notEqual(etagOf(o), etagOf({ ...o, version: o.version + 1 }))
})

test('names, sizes and retention are checked', () => {
  assert.equal(checkName(' App-Data-01 ', 'volume'), 'app-data-01')
  assert.throws(() => checkName('', 'volume'), /Give the volume a name/)
  assert.throws(() => checkName('-bad', 'volume'), /3 to 40 characters/)
  assert.throws(() => checkName('ab', 'bucket'), /3 to 40 characters/)
  assert.equal(parseSizeGb('100'), 100)
  assert.throws(() => parseSizeGb('0'), /1 to 100000/)
  assert.throws(() => parseSizeGb('1.5'), VaultError)
  assert.equal(parseRetention('90'), 90)
  assert.throws(() => parseRetention('7'), /30, 90, 365 days/)
})

test('volumes are created against the pool\'s free capacity, start provisioning, and are activated, scrubbed and deleted by rule', async () => {
  const { vault, store } = await open()
  const saves = store.saved
  await assert.rejects(vault.createVolume({ name: 'huge', poolId: 'flash-pool-01', sizeGb: '28001' }), /flash-pool-01 has 28 TB free; huge needs 28 TB/)
  await assert.rejects(vault.createVolume({ name: 'media-assets', poolId: 'flash-pool-01', sizeGb: '10' }), /already a volume called media-assets/)
  await assert.rejects(vault.createVolume({ name: 'xyz', poolId: 'nope', sizeGb: '10' }), /no such pool/)
  assert.equal(store.saved, saves)
  const v = await vault.createVolume({ name: 'app-data-01', poolId: 'flash-pool-01', sizeGb: '100' })
  assert.equal(v.status, 'provisioning')
  assert.equal(vault.poolFree('flash-pool-01'), 27_900)
  assert.equal(vault.kindOf(v), 'Block / NVMe')
  await assert.rejects(vault.createSnapshot({ volumeId: v.id }), /still provisioning/)
  assert.equal((await vault.activateVolume(v.id)).status, 'healthy')
  await assert.rejects(vault.activateVolume(v.id), /not provisioning/)
  await assert.rejects(vault.scrubVolume(v.id), /no scrub pending/)
  // backup-vault is under review and waiting for a scrub: scrubbing brings it back.
  assert.equal(vault.pendingScrubs(), 2)
  const scrubbed = await vault.scrubVolume('backup-vault')
  assert.deepEqual([scrubbed.status, scrubbed.needsScrub], ['healthy', false])
  assert.equal(vault.pendingScrubs(), 1)
  await assert.rejects(vault.deleteVolume('postgres-primary'), /holds 1.4 TB/)
  await vault.deleteVolume(v.id)
  assert.equal(vault.state.volumes.length, 4)
})

test('buckets are unique by name and start empty with versioning on', async () => {
  const { vault } = await open()
  const b = await vault.createBucket({ name: 'app-exports', poolId: 'capacity-pool-02' })
  assert.deepEqual([b.objectCount, b.versioning], [0, true])
  assert.equal(vault.state.buckets.length, 13)
  await assert.rejects(vault.createBucket({ name: 'app-exports', poolId: 'capacity-pool-02' }), /already a bucket called app-exports/)
  await assert.rejects(vault.createBucket({ name: 'ok-name', poolId: 'nope' }), /no such pool/)
})

test('snapshots are queued, verified, counted towards protection, and purged only once their retention has run out', async () => {
  const { vault, setNow } = await open()
  assert.equal(vault.totals().protectionPercent, 99.98)
  const s = await vault.createSnapshot({ volumeId: 'scratch-tmp', label: ' tmp check ', retainDays: '30' })
  assert.deepEqual([s.status, s.label, s.sizeGb, s.id], ['queued', 'tmp check', 1, 'snap-n1'])
  // Only a verified snapshot counts as coverage.
  assert.equal(vault.totals().protectionPercent, 99.98)
  await vault.verifySnapshot(s.id)
  assert.equal(vault.totals().protectionPercent, 100)
  await assert.rejects(vault.verifySnapshot(s.id), /already verified/)
  await assert.rejects(vault.purgeSnapshot(s.id), /still within its retention/)
  await assert.rejects(vault.createSnapshot({ volumeId: 'scratch-tmp', label: 'x'.repeat(41) }), /at most 40 characters/)
  await assert.rejects(vault.createSnapshot({ volumeId: 'scratch-tmp', retainDays: '7' }), /30, 90, 365 days/)
  await assert.rejects(vault.createSnapshot({ volumeId: 'nope' }), /no such volume/)
  // 31 days later the 30-day snapshots are expired: no longer coverage, and purgeable.
  const later = new Date(NOW.getTime() + 31 * 86_400_000)
  setNow(later)
  assert.equal(isExpired(s, later), true)
  assert.equal(expiresAt(s).getTime(), new Date(s.createdAt).getTime() + 30 * 86_400_000)
  assert.ok(vault.totals().protectionPercent < 99)
  await vault.purgeSnapshot(s.id)
  assert.equal(vault.snapshots().length, 3)
  await assert.rejects(vault.purgeSnapshot('nope'), /no such snapshot/)
})
