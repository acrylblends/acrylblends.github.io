import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  filterRows,
  groupBars,
  inferType,
  pageOf,
  parseCsv,
  profile,
  sortRows,
  splitCsvLine,
  statsOf,
  Tables,
  TablesError,
} from '../plugins/tables/index.ts'
import { memoryStore } from '../plugins/tables/store.ts'
import type { TablesState } from '../plugins/tables/domain.ts'
import { seed } from '../plugins/tables/seed.ts'
import { NOW, withApp } from './support.ts'

const newId = (kind: string): string => `${kind}-${Math.random().toString(36).slice(2, 8)}`

test('a CSV line splits on commas outside quotes, and "" is one quote', () => {
  assert.deepEqual(splitCsvLine('a,b,c'), ['a', 'b', 'c'])
  assert.deepEqual(splitCsvLine('"Alpine, Systems",18420,DACH'), ['Alpine, Systems', '18420', 'DACH'])
  assert.deepEqual(splitCsvLine('"He said ""hello""",x'), ['He said "hello"', 'x'])
})

test('a CSV document reads a header and rows, skipping empty lines and padding short rows', () => {
  const { headers, rows } = parseCsv('﻿customer,revenue\nAlpine,18420\n\nNordic,14800\nForma')
  assert.deepEqual(headers, ['customer', 'revenue'])
  assert.equal(rows.length, 3)
  assert.deepEqual(rows[2], ['Forma', ''])
  assert.throws(() => parseCsv(''), (error: unknown) => error instanceof TablesError && /no rows/.test(error.message))
  assert.throws(() => parseCsv('one\nrow'), /at least two columns/)
})

test('a column type is inferred from its values', () => {
  assert.equal(inferType(['1', '2.5', '3']), 'number')
  assert.equal(inferType(['2026-09-28', '2026-09-27']), 'date')
  assert.equal(inferType(Array.from({ length: 30 }, (_, index) => (index % 2 === 0 ? 'Paid' : 'Open'))), 'category')
  assert.equal(inferType(Array.from({ length: 30 }, (_, index) => `Customer ${String(index)}`)), 'text')
  assert.equal(inferType(['', '']), 'text')
})

test('a profile counts missing cells and distinct values', () => {
  const columns = profile(['name', 'revenue'], [['A', '1'], ['A', ''], ['B', '3']])
  assert.equal(columns[0]?.name, 'name')
  assert.equal(columns[0]?.distinct, 2)
  assert.equal(columns[1]?.missing, 1)
  assert.equal(columns[1]?.type, 'number')
})

test('rows filter by text and by a column, and sort numerically', () => {
  const columns = profile(['name', 'revenue'], [['A', '10'], ['B', '2'], ['C', '30']])
  const rows = [['A', '10'], ['B', '2'], ['C', '30']]
  assert.deepEqual(filterRows(rows, columns, { q: 'b' }).map((row) => row[0]), ['B'])
  assert.deepEqual(filterRows(rows, columns, { filters: [{ column: 'name', value: 'C' }] }).map((row) => row[0]), ['C'])
  assert.deepEqual(sortRows(rows, columns, { column: 'revenue', dir: 'asc' }).map((row) => row[0]), ['B', 'A', 'C'])
})

test('a page never runs past the last page', () => {
  const rows = Array.from({ length: 12 }, (_, index) => [String(index)])
  assert.deepEqual(pageOf(rows, 1, 5).rows.map((row) => row[0]), ['0', '1', '2', '3', '4'])
  const last = pageOf(rows, 99, 5)
  assert.equal(last.page, 3)
  assert.equal(last.rows.length, 2)
  assert.equal(last.pages, 3)
})

test('bars group a numeric column by a label, largest first', () => {
  const columns = profile(['region', 'revenue'], [['DACH', '10'], ['Nordics', '20'], ['DACH', '5']])
  const rows = [['DACH', '10'], ['Nordics', '20'], ['DACH', '5']]
  assert.deepEqual(groupBars(rows, columns, { groupBy: 'region', metric: 'revenue' }), [
    { label: 'Nordics', value: 20 },
    { label: 'DACH', value: 15 },
  ])
})

test('the seed is the file the mockup shows: 24,680 rows, eight columns, five top orders', () => {
  const state = seed(NOW, newId)
  const dataset = state.datasets[0]
  assert.ok(dataset !== undefined)
  assert.equal(dataset.rows.length, 24_680)
  assert.equal(dataset.columns.length, 8)
  assert.equal(dataset.fileName, 'sales_q3_2026.csv')
  assert.deepEqual(dataset.rows[0]?.slice(1), ['Alpine Systems', '18420', '2026-09-28', 'DACH', '24', 'Direct', 'Paid'])
  const stats = statsOf(dataset)
  assert.ok(stats.missingShare > 0 && stats.missingShare < 0.01)
  assert.equal(stats.numericColumns, 2)
  assert.equal(stats.dateColumns, 1)
  assert.equal(groupBars(dataset.rows, dataset.columns, { groupBy: 'region', metric: 'revenue' }).length, 5)
  assert.equal(state.views.length, 3)
})

async function open(): Promise<Tables> {
  let ids = 0
  return Tables.open({ store: memoryStore(), clock: () => NOW, newId: (kind) => `${kind}-${++ids}` })
}

test('importing a CSV profiles it and persists the dataset', async () => {
  let ids = 0
  const store = memoryStore<TablesState>()
  const tables = await Tables.open({ store, clock: () => NOW, newId: (kind) => `${kind}-${++ids}` })
  const dataset = await tables.createDataset('Small file', '', 'name,revenue,region\nA,10,DACH\nB,20,Nordics')
  assert.equal(dataset.name, 'Small file')
  assert.equal(dataset.fileName, 'small_file.csv')
  assert.equal(dataset.rows.length, 2)
  assert.equal(dataset.columns.length, 3)
  assert.equal(store.saved, 1)
  await assert.rejects(tables.createDataset('', '', 'a,b\n1,2'), /needs a name/)
})

test('a saved view keeps its filter and chart, and refuses a duplicate name', async () => {
  const tables = await open()
  const dataset = tables.first()
  assert.ok(dataset !== undefined)
  const view = await tables.saveView(dataset.id, 'My view', { q: '', filters: [{ column: 'region', value: 'DACH' }], sort: { column: 'revenue', dir: 'desc' } }, { groupBy: 'channel', metric: 'revenue' })
  assert.equal(view.name, 'My view')
  assert.deepEqual(tables.view(view.id)?.filters, [{ column: 'region', value: 'DACH' }])
  await assert.rejects(tables.saveView(dataset.id, 'my view', {}, { groupBy: 'region', metric: 'count' }), (error: unknown) => error instanceof TablesError && error.code === 'conflict')
  await assert.rejects(tables.saveView(dataset.id, 'Other', { filters: [{ column: 'nope', value: 'x' }] }, { groupBy: 'region', metric: 'count' }), /no column/)
})

test('the dataset the pages see is the seed', () =>
  withApp(async (app) => {
    assert.equal(app.root.tables.first()?.rows.length, 24_680)
  }))
