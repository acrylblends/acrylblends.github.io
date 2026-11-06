/**
 * The vault (`ctx.vault`): the saved state and every change to it. A change checks its input and the capacity and uniqueness guards, builds the next
 * state, saves it through the store and only then makes it current, so a failed save leaves the vault as it was.
 */
import {
  type Bucket,
  type Listing,
  type Pool,
  type Snapshot,
  type StoredObject,
  type Totals,
  type VaultState,
  VaultError,
  type Volume,
  checkName,
  formatGb,
  isExpired,
  listObjects,
  parseRetention,
  parseSizeGb,
  poolFreeGb,
  totalsOf,
  volumeKind,
} from './domain.ts'
import { seed } from './seed.ts'
import type { VaultStore } from './store.ts'

export interface VaultAdapters {
  readonly store: VaultStore
  readonly clock: () => Date
  readonly newId: (kind: 'snapshot') => string
}

export class Vault {
  #state: VaultState
  readonly #adapters: VaultAdapters

  private constructor(state: VaultState, adapters: VaultAdapters) {
    this.#state = state
    this.#adapters = adapters
  }

  static async open(adapters: VaultAdapters): Promise<Vault> {
    const saved = await adapters.store.load()
    if (saved !== undefined) return new Vault(saved, adapters)
    const state = seed(adapters.clock())
    await adapters.store.save(state)
    return new Vault(state, adapters)
  }

  get state(): VaultState {
    return this.#state
  }

  now(): Date {
    return this.#adapters.clock()
  }

  totals(): Totals {
    return totalsOf(this.#state, this.now())
  }

  pool(id: string): Pool {
    const pool = this.#state.pools.find((p) => p.id === id)
    if (pool === undefined) throw new VaultError('not-found', 'There is no such pool.')
    return pool
  }

  poolFree(id: string): number {
    return poolFreeGb(this.pool(id), this.#state.volumes)
  }

  volume(id: string): Volume {
    const volume = this.#state.volumes.find((v) => v.id === id)
    if (volume === undefined) throw new VaultError('not-found', 'There is no such volume.')
    return volume
  }

  bucket(id: string): Bucket {
    const bucket = this.#state.buckets.find((b) => b.id === id)
    if (bucket === undefined) throw new VaultError('not-found', 'There is no such bucket.')
    return bucket
  }

  object(id: string): StoredObject {
    const object = this.#state.objects.find((o) => o.id === id)
    if (object === undefined) throw new VaultError('not-found', 'There is no such object.')
    return object
  }

  list(bucketId: string, prefix: string): Listing {
    this.bucket(bucketId)
    return listObjects(this.#state.objects, bucketId, prefix)
  }

  /** Newest first. */
  snapshots(volumeId?: string): readonly Snapshot[] {
    return [...this.#state.snapshots].filter((s) => volumeId === undefined || s.volumeId === volumeId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  pendingScrubs(): number {
    return this.#state.volumes.filter((v) => v.needsScrub).length
  }

  async #commit(next: VaultState): Promise<void> {
    await this.#adapters.store.save(next)
    this.#state = next
  }

  /** Create a volume in a pool; it starts in `provisioning`. The pool must have the room. */
  async createVolume(fields: Readonly<Record<string, string | undefined>>): Promise<Volume> {
    const name = checkName(fields.name, 'volume')
    const pool = this.pool(fields.poolId ?? '')
    const sizeGb = parseSizeGb(fields.sizeGb)
    if (this.#state.volumes.some((v) => v.name === name)) throw new VaultError('conflict', `There is already a volume called ${name}.`)
    const free = this.poolFree(pool.id)
    if (sizeGb > free) throw new VaultError('conflict', `${pool.name} has ${formatGb(free)} free; ${name} needs ${formatGb(sizeGb)}.`)
    const volume: Volume = { id: name, name, poolId: pool.id, sizeGb, usedGb: 0, status: 'provisioning', needsScrub: false }
    await this.#commit({ ...this.#state, volumes: [volume, ...this.#state.volumes] })
    return volume
  }

  /** Make a provisioning volume healthy. */
  async activateVolume(id: string): Promise<Volume> {
    const volume = this.volume(id)
    if (volume.status !== 'provisioning') throw new VaultError('conflict', `${volume.name} is not provisioning.`)
    const next = { ...volume, status: 'healthy' as const }
    await this.#commit({ ...this.#state, volumes: this.#state.volumes.map((v) => (v.id === id ? next : v)) })
    return next
  }

  /** Run the integrity scrub a volume is waiting for; a volume under review comes back healthy. */
  async scrubVolume(id: string): Promise<Volume> {
    const volume = this.volume(id)
    if (!volume.needsScrub) throw new VaultError('conflict', `${volume.name} has no scrub pending.`)
    const next: Volume = { ...volume, needsScrub: false, status: volume.status === 'review' ? 'healthy' : volume.status }
    await this.#commit({ ...this.#state, volumes: this.#state.volumes.map((v) => (v.id === id ? next : v)), fabric: { ...this.#state.fabric, lastScanAt: this.now().toISOString() } })
    return next
  }

  /** Delete an empty volume (nothing used, no snapshots). */
  async deleteVolume(id: string): Promise<void> {
    const volume = this.volume(id)
    if (volume.usedGb > 0) throw new VaultError('conflict', `${volume.name} holds ${formatGb(volume.usedGb)}; it can only be deleted empty.`)
    if (this.snapshots(id).length > 0) throw new VaultError('conflict', `${volume.name} still has snapshots; purge them first.`)
    await this.#commit({ ...this.#state, volumes: this.#state.volumes.filter((v) => v.id !== id) })
  }

  /** Create an object bucket in a pool, with versioning on. */
  async createBucket(fields: Readonly<Record<string, string | undefined>>): Promise<Bucket> {
    const name = checkName(fields.name, 'bucket')
    const pool = this.pool(fields.poolId ?? '')
    if (this.#state.buckets.some((b) => b.name === name)) throw new VaultError('conflict', `There is already a bucket called ${name}.`)
    const bucket: Bucket = { id: name, name, poolId: pool.id, objectCount: 0, versioning: true, createdAt: this.now().toISOString() }
    await this.#commit({ ...this.#state, buckets: [bucket, ...this.#state.buckets] })
    return bucket
  }

  /** Record a snapshot of a volume (queued until verified). */
  async createSnapshot(fields: Readonly<Record<string, string | undefined>>): Promise<Snapshot> {
    const volume = this.volume(fields.volumeId ?? '')
    if (volume.status === 'provisioning') throw new VaultError('conflict', `${volume.name} is still provisioning; activate it before taking a snapshot.`)
    const label = (fields.label ?? '').trim() || 'manual snapshot'
    if (label.length > 40) throw new VaultError('invalid', 'A snapshot label is at most 40 characters.')
    const retainDays = parseRetention(fields.retainDays ?? '30')
    const snapshot: Snapshot = { id: this.#adapters.newId('snapshot'), volumeId: volume.id, label, createdAt: this.now().toISOString(), sizeGb: volume.usedGb, retainDays, status: 'queued' }
    await this.#commit({ ...this.#state, snapshots: [...this.#state.snapshots, snapshot] })
    return snapshot
  }

  async verifySnapshot(id: string): Promise<Snapshot> {
    const snapshot = this.#snapshot(id)
    if (snapshot.status === 'verified') throw new VaultError('conflict', 'That snapshot is already verified.')
    const next = { ...snapshot, status: 'verified' as const }
    await this.#commit({ ...this.#state, snapshots: this.#state.snapshots.map((s) => (s.id === id ? next : s)) })
    return next
  }

  /** Remove a snapshot whose retention has run out. */
  async purgeSnapshot(id: string): Promise<void> {
    const snapshot = this.#snapshot(id)
    if (!isExpired(snapshot, this.now())) throw new VaultError('conflict', 'That snapshot is still within its retention period.')
    await this.#commit({ ...this.#state, snapshots: this.#state.snapshots.filter((s) => s.id !== id) })
  }

  #snapshot(id: string): Snapshot {
    const snapshot = this.#state.snapshots.find((s) => s.id === id)
    if (snapshot === undefined) throw new VaultError('not-found', 'There is no such snapshot.')
    return snapshot
  }

  /** The volume's kind label, from its pool. */
  kindOf(volume: Volume): string {
    return volumeKind(this.pool(volume.poolId).tier)
  }
}
