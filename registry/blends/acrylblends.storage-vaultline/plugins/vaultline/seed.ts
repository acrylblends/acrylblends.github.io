/**
 * The lab cluster a person sees on the first start: three pools (248 TB raw, 172 TB allocated), four volumes, twelve buckets holding 4.8 million
 * objects (a sample of them listed), and three verified snapshots, timed relative to now.
 */
import type { Bucket, Pool, Snapshot, StoredObject, VaultState, Volume } from './domain.ts'

const at = (now: Date, daysAgo: number, h: number, m: number): string => new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, h, m).toISOString()

const POOLS: Pool[] = [
  { id: 'flash-pool-01', name: 'flash-pool-01', tier: 'NVMe', nodes: 4, totalGb: 96_000, baseUsedGb: 65_995, watch: false, note: 'NVMe · 4 nodes · compression 2.1×' },
  { id: 'capacity-pool-02', name: 'capacity-pool-02', tier: 'SAS', nodes: 8, totalGb: 128_000, baseUsedGb: 73_000, watch: false, note: 'SAS · 8 nodes · erasure coded' },
  { id: 'archive-pool-01', name: 'archive-pool-01', tier: 'Object tier', nodes: 0, totalGb: 24_000, baseUsedGb: 3_000, watch: true, note: 'Object tier · lifecycle review due' },
]

const VOLUMES: Volume[] = [
  { id: 'postgres-primary', name: 'postgres-primary', poolId: 'flash-pool-01', sizeGb: 2000, usedGb: 1400, status: 'healthy', needsScrub: false },
  { id: 'media-assets', name: 'media-assets', poolId: 'capacity-pool-02', sizeGb: 18_000, usedGb: 12_800, status: 'healthy', needsScrub: false },
  { id: 'backup-vault', name: 'backup-vault', poolId: 'archive-pool-01', sizeGb: 10_000, usedGb: 5300, status: 'review', needsScrub: true },
  { id: 'scratch-tmp', name: 'scratch-tmp', poolId: 'flash-pool-01', sizeGb: 5, usedGb: 1, status: 'healthy', needsScrub: true },
]

export function seed(now: Date): VaultState {
  const bucket = (name: string, poolId: string, objectCount: number, daysAgo: number): Bucket => ({ id: name, name, poolId, objectCount, versioning: true, createdAt: at(now, daysAgo, 9, 0) })
  const buckets: Bucket[] = [
    bucket('media-assets', 'capacity-pool-02', 1_920_400, 210),
    bucket('telemetry-raw', 'capacity-pool-02', 1_240_000, 180),
    bucket('app-logs', 'capacity-pool-02', 880_000, 160),
    bucket('ml-datasets', 'capacity-pool-02', 310_500, 140),
    bucket('backups-daily', 'archive-pool-01', 148_200, 120),
    bucket('user-uploads', 'capacity-pool-02', 96_300, 100),
    bucket('build-artifacts', 'capacity-pool-02', 85_700, 90),
    bucket('docs-archive', 'archive-pool-01', 42_100, 80),
    bucket('thumbnails', 'capacity-pool-02', 38_900, 60),
    bucket('exports', 'capacity-pool-02', 21_400, 40),
    bucket('audit-trail', 'archive-pool-01', 12_300, 30),
    bucket('tmp-share', 'capacity-pool-02', 4200, 10),
  ]
  const object = (bucketId: string, key: string, contentType: string, sizeBytes: number, version: number, modifiedAt: string, tags: string[] = []): StoredObject => ({
    id: `${bucketId}:${key}`,
    bucketId,
    key,
    contentType,
    sizeBytes,
    version,
    encrypted: true,
    modifiedAt,
    tags,
  })
  const objects: StoredObject[] = [
    object('media-assets', '2026/Q4/launch-film-final.mp4', 'video/mp4', 2_400_000_000, 3, at(now, 1, 16, 42), ['campaign:launch', 'master']),
    object('media-assets', '2026/Q4/product-render-08.webp', 'image/webp', 8_200_000, 1, at(now, 1, 14, 10), ['campaign:launch']),
    object('media-assets', '2026/Q4/brand-guidelines.pdf', 'application/pdf', 18_500_000, 2, at(now, 2, 9, 8), ['brand']),
    object('media-assets', '2026/Q4/teaser-cut.mov', 'video/quicktime', 640_000_000, 1, at(now, 7, 11, 30), ['campaign:launch']),
    object('media-assets', '2026/Q3/summer-recap.mp4', 'video/mp4', 1_100_000_000, 2, at(now, 48, 15, 20)),
    object('media-assets', '2026/Q3/banner-set.zip', 'application/zip', 54_000_000, 1, at(now, 51, 10, 5)),
    object('backups-daily', 'pg/2026-11-05.dump.zst', 'application/zstd', 1_400_000_000, 1, at(now, 0, 2, 10), ['retention:30d']),
    object('backups-daily', 'pg/2026-11-04.dump.zst', 'application/zstd', 1_390_000_000, 1, at(now, 1, 2, 10), ['retention:30d']),
    object('app-logs', 'api/2026-11-04.log.gz', 'application/gzip', 38_000_000, 1, at(now, 1, 23, 59)),
  ]
  const snapshot = (id: string, volumeId: string, label: string, createdAt: string, sizeGb: number, retainDays: number): Snapshot => ({ id, volumeId, label, createdAt, sizeGb, retainDays, status: 'verified' })
  return {
    version: 1,
    fabric: { region: 'North region', nodesUp: 12, nodesTotal: 12, replicationLagSec: 0.4, lastScanAt: at(now, 0, 2, 14) },
    pools: POOLS,
    volumes: VOLUMES,
    buckets,
    objects,
    snapshots: [
      snapshot('snap-1', 'postgres-primary', 'pre-upgrade', at(now, 0, 9, 30), 1400, 30),
      snapshot('snap-2', 'media-assets', 'weekly', at(now, 3, 2, 0), 12_800, 90),
      snapshot('snap-3', 'backup-vault', 'monthly', at(now, 4, 1, 0), 5300, 365),
    ],
  }
}
