/**
 * The dataset a new install starts with: `sales_q3_2026.csv`, 24,680 order rows over eight columns, with the five rows the mockup shows at the top
 * and enough variation for the profile, the chart and the filters to mean something. It is generated from a fixed seed, so every install and every
 * test sees the same file.
 */
import { type Dataset, profile, type SavedView, stampOf, type TablesState } from './domain.ts'

export const HEADERS = ['order_id', 'customer', 'revenue', 'order_date', 'region', 'quantity', 'channel', 'status'] as const

const CUSTOMERS = [
  'Alpine Systems', 'Nordic Labs', 'Studio Meridian', 'Helix Robotics', 'Forma Studio',
  'Vela Digital', 'Kite & Co', 'Nordwind GmbH', 'Blue Harbor', 'Lightpath',
  'Lumen Works', 'Aster Analytics', 'Cobalt Studio', 'Driftwood', 'Fjord Systems',
  'Granite Peak', 'Harborline', 'Iris Software', 'Juniper Labs', 'Kestrel Group',
  'Latitude Nine', 'Mistral Data', 'Northstar Digital', 'Oakline', 'Pinefield',
  'Quartz Works', 'Riverbend', 'Solstice Labs', 'Tern Systems', 'Umbra Studio',
  'Vantage Point', 'Westwind', 'Yarrow Tech', 'Zephyr Labs', 'Arbor & Co',
  'Beacon Works', 'Cedarline', 'Delta Forge', 'Ember Studio', 'Falcon Ridge',
] as const

const REGIONS = ['DACH', 'Nordics', 'Benelux', 'France', 'Other'] as const
const REGION_WEIGHT = [0.32, 0.25, 0.2, 0.16, 0.07] as const
const REGION_FACTOR: Readonly<Record<string, number>> = { DACH: 1.2, Nordics: 1.1, Benelux: 1, France: 0.9, Other: 0.6 }
const CHANNELS = ['Direct', 'Partner', 'Web'] as const
const STATUSES = ['Paid', 'Open', 'Overdue'] as const

/** The five rows the mockup's table shows, in its order. */
const TOP: readonly (readonly string[])[] = [
  ['Alpine Systems', '18420', '2026-09-28', 'DACH', '24', 'Direct', 'Paid'],
  ['Nordic Labs', '14800', '2026-09-27', 'Nordics', '12', 'Partner', 'Paid'],
  ['Studio Meridian', '12250', '2026-09-26', 'Benelux', '8', 'Direct', 'Open'],
  ['Helix Robotics', '9680', '2026-09-25', 'DACH', '18', 'Web', 'Paid'],
  ['Forma Studio', '8920', '2026-09-24', 'France', '6', 'Partner', 'Overdue'],
]

/** A small deterministic random number generator (mulberry32), so the seed is the same everywhere. */
function random(seed: number): () => number {
  let value = seed >>> 0
  return () => {
    value = (value + 0x6d2b79f5) >>> 0
    let next = value
    next = Math.imul(next ^ (next >>> 15), next | 1)
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61)
    return ((next ^ (next >>> 14)) >>> 0) / 4_294_967_296
  }
}

function pick<T>(values: readonly T[], randomValue: number): T {
  return values[Math.min(values.length - 1, Math.floor(randomValue * values.length))] as T
}

/** The seed dataset and its saved views; `newId` names them, so a test sees stable ids. */
export function seed(now: Date, newId: (kind: string) => string): TablesState {
  const count = 24_680
  const next = random(2026_11_06)
  const rows: string[][] = []
  for (let index = 0; index < count; index++) {
    const top = TOP[index]
    if (top !== undefined) {
      rows.push([`SO-2026-${String(index + 1).padStart(5, '0')}`, ...top])
      continue
    }
    let chosen: string = REGIONS[0]
    const roll = next()
    let cumulative = 0
    for (let regionIndex = 0; regionIndex < REGIONS.length; regionIndex++) {
      cumulative += REGION_WEIGHT[regionIndex] as number
      if (roll <= cumulative) {
        chosen = REGIONS[regionIndex] as string
        break
      }
    }
    const base = 4 + Math.floor(next() * 20)
    const spike = next() < 0.005 ? Math.floor(next() * 2000) : 0
    const revenue = Math.round((base + spike) * (REGION_FACTOR[chosen] ?? 1))
    const day = 1 + (index % 30)
    const quantity = 1 + Math.floor(next() * 30)
    const channel = pick(CHANNELS, next())
    const statusRoll = next()
    const status = statusRoll < 0.86 ? 'Paid' : statusRoll < 0.96 ? 'Open' : 'Overdue'
    const row = [
      `SO-2026-${String(index + 1).padStart(5, '0')}`,
      pick(CUSTOMERS, next()),
      String(revenue),
      `2026-09-${String(day).padStart(2, '0')}`,
      chosen,
      String(quantity),
      channel,
      status,
    ]
    // 395 cells are empty (0.2% of the sheet), spread over the three columns the mockup names.
    if (index % 62 === 0) row[3 + (index % 3) * 2] = ''
    rows.push(row)
  }
  const fileText = [HEADERS.join(','), ...rows.map((row) => row.join(','))].join('\n')
  const dataset: Dataset = {
    id: newId('dataset'),
    name: 'Sales Q3 2026',
    fileName: 'sales_q3_2026.csv',
    sizeBytes: Buffer.byteLength(fileText, 'utf8'),
    importedAt: stampOf(now),
    columns: profile(HEADERS, rows),
    rows,
  }
  const views: SavedView[] = [
    { id: newId('view'), datasetId: dataset.id, name: 'Large orders', q: '', filters: [], sort: { column: 'revenue', dir: 'desc' }, chart: { groupBy: 'region', metric: 'revenue' } },
    { id: newId('view'), datasetId: dataset.id, name: 'Open invoices', q: '', filters: [{ column: 'status', value: 'Open' }], sort: { column: 'revenue', dir: 'desc' }, chart: { groupBy: 'region', metric: 'revenue' } },
    { id: newId('view'), datasetId: dataset.id, name: 'DACH region', q: '', filters: [{ column: 'region', value: 'DACH' }], sort: { column: 'revenue', dir: 'desc' }, chart: { groupBy: 'channel', metric: 'revenue' } },
  ]
  return { version: 1, datasets: [dataset], views }
}
