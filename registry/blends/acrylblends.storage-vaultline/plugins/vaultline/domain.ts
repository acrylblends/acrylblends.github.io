/**
 * Vaultline's domain: storage pools, logical volumes, object buckets and objects, snapshots with retention, and the capacity arithmetic between them.
 * Pure functions and plain data; the {@link Vault} in vault.ts applies them to the saved state and the pages only read what it returns.
 *
 * Everything is a fictional lab cluster: no storage system is contacted and no byte is stored.
 */
import { createHash } from 'node:crypto'

export type PoolTier = 'NVMe' | 'SAS' | 'Object tier'

export interface Pool {
  readonly id: string
  readonly name: string
  readonly tier: PoolTier
  readonly nodes: number
  readonly totalGb: number
  /** What the pool holds besides the volumes below (other tenants, system data, metadata). */
  readonly baseUsedGb: number
  /** A person's flag: `watch` pools get the rust colour. */
  readonly watch: boolean
  /** The grey line under the meter: "NVMe · 4 nodes · compression 2.1×". */
  readonly note: string
}

export type VolumeStatus = 'healthy' | 'review' | 'provisioning'

export interface Volume {
  readonly id: string
  readonly name: string
  readonly poolId: string
  readonly sizeGb: number
  readonly usedGb: number
  readonly status: VolumeStatus
  /** Waiting for an integrity scrub. */
  readonly needsScrub: boolean
}

export interface Bucket {
  readonly id: string
  readonly name: string
  readonly poolId: string
  readonly objectCount: number
  readonly versioning: boolean
  readonly createdAt: string
}

export interface StoredObject {
  readonly id: string
  readonly bucketId: string
  /** The whole key: `2026/Q4/launch-film-final.mp4`. */
  readonly key: string
  readonly contentType: string
  readonly sizeBytes: number
  readonly version: number
  readonly encrypted: boolean
  readonly modifiedAt: string
  readonly tags: readonly string[]
}

export type SnapshotStatus = 'verified' | 'queued'

export interface Snapshot {
  readonly id: string
  readonly volumeId: string
  readonly label: string
  readonly createdAt: string
  readonly sizeGb: number
  readonly retainDays: number
  readonly status: SnapshotStatus
}

export interface Fabric {
  readonly region: string
  readonly nodesUp: number
  readonly nodesTotal: number
  readonly replicationLagSec: number
  readonly lastScanAt: string
}

export interface VaultState {
  readonly version: 1
  readonly fabric: Fabric
  readonly pools: readonly Pool[]
  readonly volumes: readonly Volume[]
  readonly buckets: readonly Bucket[]
  readonly objects: readonly StoredObject[]
  readonly snapshots: readonly Snapshot[]
}

export class VaultError extends Error {
  override readonly name = 'VaultError'
  readonly code: 'invalid' | 'not-found' | 'conflict'
  constructor(code: 'invalid' | 'not-found' | 'conflict', message: string) {
    super(message)
    this.code = code
  }
}

export const RETENTION_CHOICES = [30, 90, 365] as const

// ---- capacity ---------------------------------------------------------------------------------------------------------------------------------

export const volumeKind = (tier: PoolTier): string => (tier === 'NVMe' ? 'Block / NVMe' : tier === 'SAS' ? 'File / NFS' : 'Object')

export const poolUsedGb = (pool: Pool, volumes: readonly Volume[]): number => pool.baseUsedGb + volumes.filter((v) => v.poolId === pool.id).reduce((n, v) => n + v.sizeGb, 0)

export const poolFreeGb = (pool: Pool, volumes: readonly Volume[]): number => pool.totalGb - poolUsedGb(pool, volumes)

export const percent = (used: number, total: number): number => (total <= 0 ? 0 : Math.round((used / total) * 100))

/** `100 GB`, `2 TB`, `1.4 TB`, `248 TB`: decimal units, trailing zeros dropped. */
export function formatGb(gb: number): string {
  if (gb < 1000) return `${String(Math.round(gb * 10) / 10)} GB`
  return `${String(Math.round((gb / 1000) * 10) / 10)} TB`
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${String(Math.round(bytes / 1e8) / 10)} GB`
  if (bytes >= 1e6) return `${String(Math.round(bytes / 1e5) / 10)} MB`
  if (bytes >= 1e3) return `${String(Math.round(bytes / 1e3))} KB`
  return `${String(bytes)} B`
}

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)} K`
  return String(n)
}

export interface Totals {
  readonly rawGb: number
  readonly allocatedGb: number
  readonly provisionedPercent: number
  readonly objects: number
  readonly buckets: number
  /** Share of provisioned volume capacity covered by a live (verified, unexpired) snapshot, in %. */
  readonly protectionPercent: number
}

export function totalsOf(state: VaultState, now: Date): Totals {
  const rawGb = state.pools.reduce((n, p) => n + p.totalGb, 0)
  const allocatedGb = state.pools.reduce((n, p) => n + poolUsedGb(p, state.volumes), 0)
  const provisioned = state.volumes.reduce((n, v) => n + v.sizeGb, 0)
  const covered = state.volumes.filter((v) => state.snapshots.some((s) => s.volumeId === v.id && s.status === 'verified' && !isExpired(s, now))).reduce((n, v) => n + v.sizeGb, 0)
  return {
    rawGb,
    allocatedGb,
    provisionedPercent: percent(allocatedGb, rawGb),
    objects: state.buckets.reduce((n, b) => n + b.objectCount, 0),
    buckets: state.buckets.length,
    protectionPercent: provisioned === 0 ? 100 : Math.round((covered / provisioned) * 10000) / 100,
  }
}

// ---- snapshots and retention --------------------------------------------------------------------------------------------------------------------

export const expiresAt = (s: Snapshot): Date => new Date(new Date(s.createdAt).getTime() + s.retainDays * 86_400_000)

export const isExpired = (s: Snapshot, now: Date): boolean => expiresAt(s).getTime() <= now.getTime()

// ---- object browsing -----------------------------------------------------------------------------------------------------------------------------

export interface Listing {
  readonly prefix: string
  /** Immediate sub-prefixes: `2026/Q4/`. */
  readonly folders: readonly string[]
  readonly objects: readonly StoredObject[]
}

/** The folders and objects directly under a prefix (`''` or ending in `/`). */
export function listObjects(objects: readonly StoredObject[], bucketId: string, prefix: string): Listing {
  const inBucket = objects.filter((o) => o.bucketId === bucketId && o.key.startsWith(prefix))
  const folders = new Set<string>()
  const direct: StoredObject[] = []
  for (const o of inBucket) {
    const rest = o.key.slice(prefix.length)
    const slash = rest.indexOf('/')
    if (slash === -1) direct.push(o)
    else folders.add(`${prefix}${rest.slice(0, slash + 1)}`)
  }
  return { prefix, folders: [...folders].sort(), objects: direct.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt)) }
}

/** A made-up but stable entity tag for an object's version, so the same object always shows the same one. */
export const etagOf = (o: StoredObject): string => createHash('md5').update(`${o.bucketId}/${o.key}@${String(o.version)}`).digest('hex')

/** The icon glyph a content type gets. */
export const iconFor = (contentType: string): string => (contentType.startsWith('video/') ? '▧' : '▤')

// ---- input checks ----------------------------------------------------------------------------------------------------------------------------------

const NAME = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/

export function checkName(raw: string | undefined, what: string): string {
  const name = (raw ?? '').trim().toLowerCase()
  if (name === '') throw new VaultError('invalid', `Give the ${what} a name.`)
  if (!NAME.test(name)) throw new VaultError('invalid', `A ${what} name is 3 to 40 characters: lowercase letters, digits and dashes, not starting or ending with a dash.`)
  return name
}

export function parseSizeGb(raw: string | undefined): number {
  const value = raw === undefined || raw.trim() === '' ? Number.NaN : Number(raw)
  if (!Number.isInteger(value) || value < 1 || value > 100_000) throw new VaultError('invalid', 'The size is a whole number of GB from 1 to 100000.')
  return value
}

export function parseRetention(raw: string | undefined): number {
  const value = Number(raw)
  if (!(RETENTION_CHOICES as readonly number[]).includes(value)) throw new VaultError('invalid', `Retention is ${RETENTION_CHOICES.join(', ')} days.`)
  return value
}
