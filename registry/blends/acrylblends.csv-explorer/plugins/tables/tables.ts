/**
 * The datasets and the views saved over them, and every operation a page may run: import a CSV, page and sort its rows, group a column and save a
 * view. Its outside effects (where the state lives, what time it is, how ids are made) come in as adapters.
 */
import {
  type Bar,
  type Chart,
  type Column,
  type Dataset,
  fileNameOf,
  type Filter,
  filterRows,
  groupBars,
  number,
  type Page,
  pageOf,
  parseCsv,
  profile,
  type SavedView,
  type Sort,
  sortRows,
  type TablesState,
  TablesError,
  stampOf,
  statsOf,
  type DatasetStats,
  whenText,
} from './domain.ts'
import { seed } from './seed.ts'
import type { Store } from './store.ts'

export interface TablesAdapters {
  readonly store: Store<TablesState>
  readonly clock: () => Date
  readonly newId: (kind: string) => string
}

export interface RowPage extends Page {
  readonly page: number
  readonly pages: number
}

export class Tables {
  private state: TablesState
  private readonly adapters: TablesAdapters

  private constructor(state: TablesState, adapters: TablesAdapters) {
    this.state = state
    this.adapters = adapters
  }

  static async open(adapters: TablesAdapters): Promise<Tables> {
    const saved = await adapters.store.load()
    return new Tables(saved ?? seed(adapters.clock(), adapters.newId), adapters)
  }

  datasets(): readonly Dataset[] {
    return this.state.datasets
  }

  dataset(id: string): Dataset | undefined {
    return this.state.datasets.find((dataset) => dataset.id === id)
  }

  /** The first dataset: the app's first screen. */
  first(): Dataset | undefined {
    return this.state.datasets[0]
  }

  views(datasetId?: string): readonly SavedView[] {
    return this.state.views.filter((view) => datasetId === undefined || view.datasetId === datasetId)
  }

  view(id: string): SavedView | undefined {
    return this.state.views.find((view) => view.id === id)
  }

  stats(dataset: Dataset): DatasetStats {
    return statsOf(dataset)
  }

  /** One page of the dataset after its search, filters and sort; the pages use this for every table. */
  page(id: string, filter: { q?: string; filters?: readonly Filter[]; sort?: Sort; page?: number; pageSize?: number } = {}): RowPage | undefined {
    const dataset = this.dataset(id)
    if (dataset === undefined) return undefined
    const rows = sortRows(filterRows(dataset.rows, dataset.columns, filter), dataset.columns, filter.sort)
    return pageOf(rows, filter.page ?? 1, filter.pageSize ?? 50) as RowPage
  }

  /** The rows after the filter, for a count or a chart. */
  rows(id: string, filter: { q?: string; filters?: readonly Filter[]; sort?: Sort } = {}): readonly (readonly string[])[] {
    const dataset = this.dataset(id)
    if (dataset === undefined) return []
    return sortRows(filterRows(dataset.rows, dataset.columns, filter), dataset.columns, filter.sort)
  }

  bars(id: string, chart: Chart, filter: { q?: string; filters?: readonly Filter[] } = {}): Bar[] {
    const dataset = this.dataset(id)
    if (dataset === undefined) return []
    return groupBars(filterRows(dataset.rows, dataset.columns, filter), dataset.columns, chart)
  }

  /** Import a CSV: the name, the file name and the text; the columns are profiled from the rows. */
  async createDataset(name: string, fileName: string, text: string): Promise<Dataset> {
    const cleanName = name.trim()
    if (cleanName === '') throw new TablesError('invalid', 'The dataset needs a name.')
    if (cleanName.length > 80) throw new TablesError('invalid', 'The name is longer than 80 characters.')
    const { headers, rows } = parseCsv(text)
    if (rows.length > 500_000) throw new TablesError('invalid', 'The file has more than 500,000 rows; split it first.')
    const dataset: Dataset = {
      id: this.adapters.newId('dataset'),
      name: cleanName,
      fileName: fileName.trim() === '' ? fileNameOf(cleanName) : fileName.trim(),
      sizeBytes: Buffer.byteLength(text, 'utf8'),
      importedAt: stampOf(this.adapters.clock()),
      columns: profile(headers, rows),
      rows,
    }
    this.state.datasets.push(dataset)
    await this.save()
    return dataset
  }

  /** Save the current filter, sort and chart as a named view. */
  async saveView(datasetId: string, name: string, filter: { q?: string; filters?: readonly Filter[]; sort?: Sort }, chart: Chart): Promise<SavedView> {
    const dataset = this.dataset(datasetId)
    if (dataset === undefined) throw new TablesError('not-found', 'That dataset no longer exists.')
    const clean = name.trim()
    if (clean === '') throw new TablesError('invalid', 'The view needs a name.')
    if (clean.length > 60) throw new TablesError('invalid', 'The view name is longer than 60 characters.')
    const columns = new Set(dataset.columns.map((column) => column.name))
    for (const item of filter.filters ?? [])
      if (!columns.has(item.column)) throw new TablesError('invalid', `The dataset has no column “${item.column}”.`)
    if (filter.sort !== undefined && !columns.has(filter.sort.column)) throw new TablesError('invalid', `The dataset has no column “${filter.sort.column}”.`)
    if (!columns.has(chart.groupBy)) throw new TablesError('invalid', `The dataset has no column “${chart.groupBy}”.`)
    if (this.state.views.some((view) => view.datasetId === datasetId && view.name.toLowerCase() === clean.toLowerCase()))
      throw new TablesError('conflict', `A view named “${clean}” already exists.`)
    const view: SavedView = {
      id: this.adapters.newId('view'),
      datasetId,
      name: clean,
      q: (filter.q ?? '').trim(),
      filters: [...(filter.filters ?? [])],
      sort: filter.sort ?? { column: dataset.columns[0]?.name ?? '', dir: 'asc' },
      chart,
    }
    this.state.views.push(view)
    await this.save()
    return view
  }

  /** The column of a dataset by name, for the pages' forms. */
  column(dataset: Dataset, name: string): Column | undefined {
    return dataset.columns.find((column) => column.name === name)
  }

  /** The profile line the field list shows: `text`, `number`, `date` or `category`, and the missing cells. */
  profileLine(column: Column): string {
    return column.missing === 0 ? column.type : `${column.type} · ${number(column.missing)} empty`
  }

  /** The dataset line the import page shows after a save: `24,680 rows`. */
  summary(dataset: Dataset): string {
    return `${number(dataset.rows.length)} rows imported ${whenText(dataset.importedAt, this.adapters.clock())}`
  }

  private async save(): Promise<void> {
    this.state = { ...this.state, datasets: [...this.state.datasets], views: [...this.state.views] }
    await this.adapters.store.save(this.state)
  }
}
