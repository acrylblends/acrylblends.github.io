/**
 * CSV Explorer's types and pure rules: reading a CSV, inferring what each column holds, profiling it, filtering, sorting and grouping rows. No clock,
 * no disk and no ids are made here; the {@link Tables} class applies these rules to the saved datasets.
 */

export type ColumnType = 'text' | 'number' | 'date' | 'category'

export interface Column {
  readonly name: string
  readonly type: ColumnType
  /** How many cells are empty. */
  readonly missing: number
  /** How many values the column has, empty ones left out. */
  readonly distinct: number
}

export interface Dataset {
  readonly id: string
  readonly name: string
  readonly fileName: string
  readonly sizeBytes: number
  readonly importedAt: string
  readonly columns: readonly Column[]
  readonly rows: readonly (readonly string[])[]
}

export interface Sort {
  readonly column: string
  readonly dir: 'asc' | 'desc'
}

export interface Filter {
  readonly column: string
  readonly value: string
}

export interface Chart {
  readonly groupBy: string
  /** A numeric column to sum, or `count`. */
  readonly metric: string
}

export interface SavedView {
  readonly id: string
  readonly datasetId: string
  readonly name: string
  readonly q: string
  readonly filters: readonly Filter[]
  readonly sort: Sort
  readonly chart: Chart
}

export interface TablesState {
  readonly version: 1
  datasets: Dataset[]
  views: SavedView[]
}

export type TablesErrorCode = 'invalid' | 'not-found' | 'conflict'

export class TablesError extends Error {
  readonly code: TablesErrorCode

  constructor(code: TablesErrorCode, message: string) {
    super(message)
    this.code = code
    this.name = 'TablesError'
  }
}

const pad = (n: number): string => String(n).padStart(2, '0')

export function dayOf(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function stampOf(date: Date): string {
  return `${dayOf(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function whenText(stamp: string, now: Date): string {
  const then = new Date(stamp)
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  if (hours < 48) return 'Yesterday'
  if (then.getFullYear() === now.getFullYear())
    return then.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })
  return then.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' })
}

/** Thousands separators, and the value as the person reads it. */
export function number(value: number, digits = 0): string {
  return new Intl.NumberFormat('en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)
}

/** `€18,420` for a whole amount, `€18,420.80` when it has cents. */
export function euro(value: number): string {
  const rounded = Math.round(value * 100) / 100
  return `€${number(rounded, Number.isInteger(rounded) ? 0 : 2)}`
}

/** `€180k`, `€1.2M` for a chart label. */
export function euroShort(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `€${(value / 1_000_000).toFixed(1)}M`
  if (Math.abs(value) >= 1_000) return `€${Math.round(value / 1_000)}k`
  return euro(value)
}

/** One CSV field, unquoted and unescaped. */
function unquote(field: string): string {
  const text = field.trim()
  return text.startsWith('"') && text.endsWith('"') ? text.slice(1, -1).replaceAll('""', '"') : text
}

/** One CSV line as fields: commas inside double quotes do not split, and `""` is one quote. */
export function splitCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let quoted = false
  for (let index = 0; index < line.length; index++) {
    const character = line[index]
    if (quoted) {
      if (character === '"' && line[index + 1] === '"') {
        current += '"'
        index++
      } else if (character === '"') quoted = false
      else current += character
    } else if (character === '"') quoted = true
    else if (character === ',') {
      fields.push(unquote(current))
      current = ''
    } else current += character
  }
  fields.push(unquote(current))
  return fields
}

/** A CSV document as a header and rows; empty lines are skipped. @throws a message the import form shows. */
export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.replace(/^﻿/u, '').split(/\r?\n/u).filter((line) => line.trim() !== '')
  if (lines.length === 0) throw new TablesError('invalid', 'The file has no rows.')
  const headers = splitCsvLine(lines[0] as string).map((header, index) => (header === '' ? `column_${String(index + 1)}` : header))
  if (headers.length < 2) throw new TablesError('invalid', 'The file needs a header row with at least two columns.')
  const rows = lines.slice(1).map((line) => {
    const fields = splitCsvLine(line)
    return headers.map((_, index) => fields[index] ?? '')
  })
  if (rows.length === 0) throw new TablesError('invalid', 'The file has a header but no data rows.')
  return { headers, rows }
}

const DATE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?)?$/u
const NUMERIC = /^-?\d+(?:\.\d+)?$/u

/** Number when every value parses as one, date when every value is an ISO date, category when few repeat, text otherwise. */
export function inferType(values: readonly string[]): ColumnType {
  const filled = values.filter((value) => value.trim() !== '')
  if (filled.length === 0) return 'text'
  if (filled.every((value) => DATE.test(value.trim()))) return 'date'
  if (filled.every((value) => NUMERIC.test(value.trim()))) return 'number'
  const distinct = new Set(filled.map((value) => value.trim().toLowerCase())).size
  return distinct <= 20 && filled.length >= 20 ? 'category' : 'text'
}

/** A column's name, type, missing cells and distinct values. */
export function profileColumn(name: string, values: readonly string[]): Column {
  const filled = values.filter((value) => value.trim() !== '')
  return {
    name,
    type: inferType(values),
    missing: values.length - filled.length,
    distinct: new Set(filled.map((value) => value.trim().toLowerCase())).size,
  }
}

/** Every column's profile, in the file's order. */
export function profile(headers: readonly string[], rows: readonly (readonly string[])[]): Column[] {
  return headers.map((header, index) => profileColumn(header, rows.map((row) => row[index] ?? '')))
}

export interface RowFilter {
  readonly q?: string
  readonly filters?: readonly Filter[]
}

/** The rows matching the free text (any cell) and every filter (the cell equals the value, ignoring case). */
export function filterRows(
  rows: readonly (readonly string[])[],
  columns: readonly Column[],
  filter: RowFilter = {},
): readonly (readonly string[])[] {
  const q = (filter.q ?? '').trim().toLowerCase()
  const active = (filter.filters ?? []).filter((item) => item.value !== '')
  if (q === '' && active.length === 0) return rows
  const indexes = active.flatMap((item) => {
    const index = columns.findIndex((column) => column.name === item.column)
    return index === -1 ? [] : [{ index, value: item.value.trim().toLowerCase() }]
  })
  return rows.filter((row) => {
    if (q !== '' && !row.some((cell) => cell.toLowerCase().includes(q))) return false
    return indexes.every(({ index, value }) => (row[index] ?? '').trim().toLowerCase() === value)
  })
}

/** The rows in the sort's order; a number column sorts by value, the others by text. */
export function sortRows(
  rows: readonly (readonly string[])[],
  columns: readonly Column[],
  sort: Sort | undefined,
): readonly (readonly string[])[] {
  if (sort === undefined) return rows
  const index = columns.findIndex((column) => column.name === sort.column)
  if (index === -1) return rows
  const numeric = columns[index]?.type === 'number'
  const direction = sort.dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const left = a[index] ?? ''
    const right = b[index] ?? ''
    const compared = numeric ? Number(left) - Number(right) : left.localeCompare(right)
    return compared * direction
  })
}

export interface Page {
  readonly rows: readonly (readonly string[])[]
  readonly total: number
  readonly page: number
  readonly pages: number
  readonly pageSize: number
}

/** One page of the given size; a page past the end is the last page. */
export function pageOf(rows: readonly (readonly string[])[], page: number, pageSize: number): Page {
  const total = rows.length
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pages)
  const start = (current - 1) * pageSize
  return { rows: rows.slice(start, start + pageSize), total, page: current, pages, pageSize }
}

export interface Bar {
  readonly label: string
  readonly value: number
}

/** The sum of a numeric column (or the row count) for each value of a column, largest first. */
export function groupBars(
  rows: readonly (readonly string[])[],
  columns: readonly Column[],
  chart: Chart,
): Bar[] {
  const groupIndex = columns.findIndex((column) => column.name === chart.groupBy)
  if (groupIndex === -1) return []
  const metricIndex = chart.metric === 'count' ? -1 : columns.findIndex((column) => column.name === chart.metric)
  const totals = new Map<string, number>()
  for (const row of rows) {
    const label = (row[groupIndex] ?? '').trim() || '(empty)'
    const value = metricIndex === -1 ? 1 : Number(row[metricIndex] ?? '')
    totals.set(label, (totals.get(label) ?? 0) + (Number.isFinite(value) ? value : 0))
  }
  return [...totals.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
}

export interface DatasetStats {
  readonly rows: number
  readonly columns: number
  readonly sizeBytes: number
  readonly missingCells: number
  readonly missingShare: number
  readonly numericColumns: number
  readonly dateColumns: number
}

export function statsOf(dataset: Dataset): DatasetStats {
  const cells = dataset.rows.length * dataset.columns.length
  const missingCells = dataset.columns.reduce((total, column) => total + column.missing, 0)
  return {
    rows: dataset.rows.length,
    columns: dataset.columns.length,
    sizeBytes: dataset.sizeBytes,
    missingCells,
    missingShare: cells === 0 ? 0 : missingCells / cells,
    numericColumns: dataset.columns.filter((column) => column.type === 'number').length,
    dateColumns: dataset.columns.filter((column) => column.type === 'date').length,
  }
}

/** A byte count as `18.2 MB`. */
export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
}

/** A file name for a pasted dataset: `sales_q3_2026.csv` from `Sales Q3 2026`. */
export function fileNameOf(name: string): string {
  return `${name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/gu, '_').replace(/^_+|_+$/gu, '')}.csv`
}
