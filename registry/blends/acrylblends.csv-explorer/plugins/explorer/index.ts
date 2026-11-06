/**
 * The dataset workbench: the field list, the dataset health summary, the exploratory chart and the data preview, with search, filters, sort and
 * paging. It is the app's first screen, so `/` shows the first dataset.
 *
 * Routes (under the shell's prefix): GET /, GET /datasets, GET /datasets/:id?q&sort&dir&page&f_<column>,
 * GET /datasets/:id/chart?groupBy&metric, GET /datasets/:id/export.csv, POST /datasets/:id/views.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import {
  type Bar,
  type Chart,
  type Column,
  type Dataset,
  euro,
  euroShort,
  type Filter,
  type SavedView,
  type Sort,
  number,
  TablesError,
} from '../tables/index.ts'

export const name = 'explorer'
export const inject = ['tables', 'shell', 'router']

const TYPE_ICON: Readonly<Record<string, string>> = { text: 'Ab', number: '#', date: '◷', category: '✓' }

const badgeClass = (value: string): string => (value.toLowerCase() === 'paid' ? 'paid' : value.toLowerCase() === 'open' ? 'open' : 'late')
const isMoney = (column: Column): boolean => column.type === 'number' && /revenue|amount|price|cost/iu.test(column.name)

function cell(column: Column, value: string): string {
  if (value === '') return '<span style="color:#bcc4c7">—</span>'
  if (column.type === 'number') return isMoney(column) ? euro(Number(value)) : number(Number(value))
  if (/status|state/iu.test(column.name)) return `<i class="${badgeClass(value)}">${escape(value)}</i>`
  return escape(value)
}

const escape = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

const query = (parts: Record<string, string | undefined>): string => {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(parts)) if (value !== undefined && value !== '') search.set(key, value)
  const text = search.toString()
  return text === '' ? '' : `?${text}`
}

export function apply(ctx: Context): void {
  const { tables, shell } = ctx
  const e = shell.e
  const prefix = shell.prefix

  const readState = (read: (name: string) => string | undefined, dataset: Dataset): { q: string; filters: Filter[]; sort: Sort; page: number } => {
    const q = (read('q') ?? '').slice(0, 120)
    const filters = dataset.columns.flatMap((column) => {
      const value = read(`f_${column.name}`) ?? ''
      return value === '' ? [] : [{ column: column.name, value }]
    })
    const sortColumn = read('sort')
    const sort: Sort = sortColumn === undefined || tables.column(dataset, sortColumn) === undefined
      ? { column: 'revenue', dir: 'desc' }
      : { column: sortColumn, dir: read('dir') === 'asc' ? 'asc' : 'desc' }
    const page = Math.max(1, Number(read('page') ?? 1) || 1)
    return { q, filters, sort, page }
  }

  const barsHtml = (bars: readonly Bar[], chart: Chart, big = false): string => {
    const max = Math.max(1, ...bars.map((bar) => bar.value))
    return `<div class="d-bars"${big ? ' style="height:220px"' : ''}>${bars.map((bar) => `<div><span>${e(chart.metric === 'count' ? number(bar.value) : euroShort(bar.value))}</span><i style="height:${String(Math.round((bar.value / max) * 100))}%"></i><small>${escape(bar.label)}</small></div>`).join('')}</div>`
  }

  const chartSection = (dataset: Dataset, chart: Chart, filter: { q: string; filters: readonly Filter[] }, big = false): string => {
    const bars = tables.bars(dataset.id, chart, filter)
    return `<section class="d-chart"${big ? ' style="padding:16px 18px 12px"' : ''}><header><div><b>${chart.metric === 'count' ? 'Rows' : `Sum of ${escape(chart.metric)}`} by ${escape(chart.groupBy)}</b><small>${chart.metric === 'count' ? 'COUNT(*)' : `SUM(${escape(chart.metric)})`} · grouped by ${escape(chart.groupBy)}</small></div><a href="${shell.href(`/datasets/${encodeURIComponent(dataset.id)}/chart${query({ groupBy: chart.groupBy, metric: chart.metric })}`)}" style="border:1px solid var(--line);background:white;padding:6px 8px;border-radius:4px;font-size:7px;color:#738287;text-decoration:none">Chart settings ↗</a></header>${bars.length === 0 ? '<p class="d-empty">No rows match the filter.</p>' : barsHtml(bars, chart, big)}</section>`
  }

  const tableSection = (dataset: Dataset, rows: readonly (readonly string[])[], page: number, pages: number, total: number, sort: Sort, q: string, filters: readonly Filter[], pageSize = 50): string => {
    const head = dataset.columns.map((column) => {
      const nextDir = sort.column === column.name && sort.dir === 'desc' ? 'asc' : 'desc'
      const arrow = sort.column === column.name ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : ''
      const next = query({ q, sort: column.name, dir: nextDir, page: '1', ...Object.fromEntries(filters.map((filter) => [`f_${filter.column}`, filter.value])) })
      return `<th><a href="${shell.href(`/datasets/${encodeURIComponent(dataset.id)}${next}`)}" style="color:inherit;text-decoration:none">${escape(column.name)}${sort.column === column.name ? `<i>${arrow}</i>` : ''}</a></th>`
    }).join('')
    const body = rows.map((row, index) => `<tr data-row><td>${String((page - 1) * pageSize + index + 1)}</td>${dataset.columns.map((column, columnIndex) => `<td>${cell(column, row[columnIndex] ?? '')}</td>`).join('')}</tr>`).join('')
    const pagesHtml = Array.from({ length: Math.min(pages, 5) }, (_, index) => index + 1)
      .map((value) => value === page ? `<b>${String(value)}</b>` : `<a href="${shell.href(`/datasets/${encodeURIComponent(dataset.id)}${query({ q, sort: sort.column, dir: sort.dir, page: String(value), ...Object.fromEntries(filters.map((filter) => [`f_${filter.column}`, filter.value])) })}`)}">${String(value)}</a>`)
      .join(' ')
    return `<section class="d-grid"><div class="d-grid-head"><b>Data preview</b><span>Rows ${total === 0 ? '0' : `${String((page - 1) * pageSize + 1)}–${String(Math.min(page * pageSize, total))}`} of ${number(total)}</span><div><form method="get" action="${shell.href(`/datasets/${encodeURIComponent(dataset.id)}`)}"><input name="q" value="${e(q)}" placeholder="Filter rows…" data-search="#csvrows"><button>Search</button></form></div></div><div class="d-table-wrap"><table><thead><tr><th>#</th>${head}</tr></thead><tbody id="csvrows">${body === '' ? `<tr><td colspan="${String(dataset.columns.length + 1)}">No rows match the filter. <a href="${shell.href(`/datasets/${encodeURIComponent(dataset.id)}`)}">Clear it</a></td></tr>` : body}</tbody></table></div><footer>${pagesHtml}${pages > 5 ? ' …' : ''} <span>50 rows per page</span></footer></section>`
  }

  const datasetPage = (dataset: Dataset, state: { q: string; filters: Filter[]; sort: Sort; page: number }, notice = ''): string => {
    const stats = tables.stats(dataset)
    const page = tables.page(dataset.id, { q: state.q, filters: state.filters, sort: state.sort, page: state.page })
    if (page === undefined) return ''
    const chart: Chart = { groupBy: dataset.columns.find((column) => column.type === 'category')?.name ?? dataset.columns.find((column) => column.type === 'text')?.name ?? dataset.columns[0]?.name ?? '', metric: dataset.columns.find(isMoney)?.name ?? 'count' }
    const columnRows = dataset.columns.map((column) => `<div class="d-column${state.filters.some((filter) => filter.column === column.name) ? ' active' : ''}"><i>${TYPE_ICON[column.type] ?? 'Ab'}</i><span>${escape(column.name)}</span><small>${escape(column.type)}</small></div>`).join('')
    const views = tables.views(dataset.id).map((view) => `<p><a href="${shell.href(`/views/${encodeURIComponent(view.id)}`)}" style="color:inherit;text-decoration:none">◫ &nbsp; ${escape(view.name)}</a></p>`).join('')
    const filterFields = dataset.columns.filter((column) => column.type === 'category').slice(0, 4).map((column) => {
      const distinct = [...new Set(dataset.rows.slice(0, 500).map((row) => row[dataset.columns.indexOf(column)] ?? '').filter((value) => value !== ''))].slice(0, 12)
      const active = state.filters.find((filter) => filter.column === column.name)?.value ?? ''
      return `<label>${escape(column.name)}<select name="f_${e(column.name)}" onchange="this.form.submit()"><option value="">All</option>${distinct.map((value) => `<option${value === active ? ' selected' : ''}>${escape(value)}</option>`).join('')}</select></label>`
    }).join('')
    const main = `<div class="d-layout"><aside class="d-fields"><b>DATASET</b><div class="d-dataset">▤ &nbsp; ${escape(dataset.fileName)} <small>${number(stats.rows)} rows</small></div><b>COLUMNS <span>${String(stats.columns)}</span></b>${columnRows}<b class="d-queries">SAVED VIEWS <a href="${shell.href(`/datasets/${encodeURIComponent(dataset.id)}/chart`)}" style="text-decoration:none;color:inherit">＋</a></b>${views === '' ? '<p>No saved views yet.</p>' : views}</aside><main class="d-main">${notice}<div class="d-heading"><div><small>WORKSPACE / IMPORTS / ${escape(dataset.name).toUpperCase()}</small><h1>Explore data</h1><p style="font-size:9px;color:#8a9a9e;margin:5px 0 0">${escape(dataset.name)} · ${escape(dataset.fileName)}</p></div><span class="d-valid">✓ ${(100 - stats.missingShare * 100).toFixed(1)}% valid rows</span></div><div class="d-stats"><div><small>ROWS</small><b>${number(stats.rows)}</b><span>${escape(tables.summary(dataset))}</span></div><div><small>COLUMNS</small><b>${String(stats.columns)}</b><span>${String(stats.numericColumns)} numeric · ${String(stats.dateColumns)} dates</span></div><div><small>MEMORY</small><b>${formatMemory(stats.sizeBytes * 4)}</b><span>In-memory preview</span></div><div><small>MISSING VALUES</small><b>${(stats.missingShare * 100).toFixed(1)}%</b><span>${number(stats.missingCells)} cells · ${String(dataset.columns.filter((column) => column.missing > 0).length)} columns</span></div></div>${chartSection(dataset, chart, state)}${tableSection(dataset, page.rows, page.page, page.pages, page.total, state.sort, state.q, state.filters)}<form class="d-section" method="get" action="${shell.href(`/datasets/${encodeURIComponent(dataset.id)}`)}" style="padding:12px 15px"><b style="font-size:9px">Filters</b><div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px">${filterFields}<button style="border:1px solid var(--line);background:#f6f8f8;border-radius:4px;padding:6px 9px;font-size:8px;color:#62717a;margin-top:16px">Apply</button>${state.filters.length === 0 ? '' : `<a href="${shell.href(`/datasets/${encodeURIComponent(dataset.id)}`)}" style="font-size:8px;color:#187e76;margin-top:20px;text-decoration:none">Clear filters</a>`}</div></form></main></div>`
    return shell.page({ active: 'datasets', title: `Explore ${dataset.name}`, crumbs: ['Workspace', 'Imports', dataset.name], meta: dataset.fileName, main })
  }

  const chartPage = (dataset: Dataset, chart: Chart, state: { q: string; filters: Filter[]; sort: Sort; page: number }, error?: string): string => {
    const groupOptions = dataset.columns.map((column) => `<option value="${e(column.name)}"${column.name === chart.groupBy ? ' selected' : ''}>${escape(column.name)}</option>`).join('')
    const metricOptions = [['count', 'Row count'], ...dataset.columns.filter((column) => column.type === 'number').map((column) => [column.name, `Sum of ${column.name}`])]
      .map(([value, label]) => `<option value="${e(value ?? '')}"${value === chart.metric ? ' selected' : ''}>${escape(label ?? '')}</option>`).join('')
    const main = `<div class="d-page"><header><div><small>WORKSPACE / CHART</small><h1>Chart</h1><p>${escape(dataset.fileName)} · ${number(tables.rows(dataset.id, state).length)} rows match</p></div><a href="${shell.href(`/datasets/${encodeURIComponent(dataset.id)}`)}" style="font-size:9px;color:#187e76;text-decoration:none">Back to the data ↗</a></header>${error === undefined ? '' : `<p class="notice error" role="alert">${e(error)}</p>`}<form class="d-form" method="get" action="${shell.href(`/datasets/${encodeURIComponent(dataset.id)}/chart`)}"><div class="row"><label>GROUP BY<select name="groupBy">${groupOptions}</select></label><label>METRIC<select name="metric">${metricOptions}</select></label></div><div class="actions"><button class="primary">Chart it</button></div></form>${chartSection(dataset, chart, state, true)}<form class="d-form" method="post" action="${shell.href(`/datasets/${encodeURIComponent(dataset.id)}/views`)}"><h2>Save this view</h2><p class="hint">A saved view keeps the chart and the current filter.</p><label>NAME<input name="name" required maxlength="60" placeholder="Large orders"></label><input type="hidden" name="q" value="${e(state.q)}"><input type="hidden" name="groupBy" value="${e(chart.groupBy)}"><input type="hidden" name="metric" value="${e(chart.metric)}"><div class="actions"><button class="primary">Save view</button><a href="${shell.href(`/datasets/${encodeURIComponent(dataset.id)}`)}">Cancel</a></div></form></div>`
    return shell.page({ active: 'datasets', title: `Chart · ${dataset.name}`, crumbs: ['Workspace', dataset.name, 'Chart'], meta: dataset.fileName, main })
  }

  const app = new Acryl()
    .get('/', (c) => {
      const dataset = tables.first()
      if (dataset === undefined)
        return c.html(shell.page({ active: 'datasets', title: 'CSV Explorer', crumbs: ['Workspace'], main: '<div class="d-page"><header><div><small>WORKSPACE</small><h1>No dataset yet</h1><p>Import a CSV to begin.</p></div></header><p class="d-empty">No dataset yet. <a href="/import">Import a CSV</a></p></div>' }))
      return c.html(datasetPage(dataset, readState((name) => c.req.query(name), dataset), shell.notice(c.req.url)))
    })
    .get('/datasets', (c) => {
      const rows = tables.datasets().map((dataset) => `<tr><td><a href="${shell.href(`/datasets/${encodeURIComponent(dataset.id)}`)}"><b>${escape(dataset.name)}</b></a></td><td>${escape(dataset.fileName)}</td><td>${number(dataset.rows.length)} rows</td><td>${String(dataset.columns.length)} columns</td></tr>`).join('')
      return c.html(shell.page({ active: 'datasets', title: 'Datasets', crumbs: ['Workspace', 'Datasets'], main: `<div class="d-page"><header><div><small>WORKSPACE / DATASETS</small><h1>Datasets</h1><p>${String(tables.datasets().length)} imported files</p></div><a href="${shell.href('/import')}" style="font-size:9px;color:#187e76;text-decoration:none">＋ Import CSV</a></header><section class="d-section"><header><b>Imported datasets</b><small>Local files only</small></header><table><thead><tr><th>NAME</th><th>FILE</th><th>ROWS</th><th>COLUMNS</th></tr></thead><tbody>${rows === '' ? '<tr><td colspan="4">No datasets yet.</td></tr>' : rows}</tbody></table></section></div>` }))
    })
    .get('/datasets/:id', (c) => {
      const dataset = tables.dataset(c.req.param('id'))
      if (dataset === undefined) return c.redirect(shell.url('/datasets', { kind: 'error', text: 'That dataset no longer exists.' }), 303)
      return c.html(datasetPage(dataset, readState((name) => c.req.query(name), dataset), shell.notice(c.req.url)))
    })
    .get('/datasets/:id/chart', (c) => {
      const dataset = tables.dataset(c.req.param('id'))
      if (dataset === undefined) return c.redirect(shell.url('/datasets', { kind: 'error', text: 'That dataset no longer exists.' }), 303)
      const state = readState((name) => c.req.query(name), dataset)
      const groupBy = c.req.query('groupBy') ?? dataset.columns.find((column) => column.type === 'category')?.name ?? dataset.columns[1]?.name ?? ''
      const metric = c.req.query('metric') ?? dataset.columns.find(isMoney)?.name ?? 'count'
      return c.html(chartPage(dataset, { groupBy, metric }, state))
    })
    .get('/datasets/:id/export.csv', (c) => {
      const dataset = tables.dataset(c.req.param('id'))
      if (dataset === undefined) return c.json({ error: 'not found' }, 404)
      const state = readState((name) => c.req.query(name), dataset)
      const rows = tables.rows(dataset.id, state)
      const csv = [dataset.columns.map((column) => column.name).join(','), ...rows.map((row) => row.map((value) => /[",\n]/u.test(value) ? `"${value.replaceAll('"', '""')}"` : value).join(','))].join('\n')
      return c.body(csv, 200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${dataset.fileName}"` })
    })
    .post('/datasets/:id/views', async (c) => {
      const form = await c.req.parseBody()
      const dataset = tables.dataset(c.req.param('id'))
      if (dataset === undefined) return c.redirect(shell.url('/datasets', { kind: 'error', text: 'That dataset no longer exists.' }), 303)
      const state = readState((name) => (form[name] === undefined ? undefined : String(form[name])), dataset)
      const chart: Chart = { groupBy: String(form.groupBy ?? ''), metric: String(form.metric ?? 'count') }
      try {
        const view = await tables.saveView(dataset.id, String(form.name ?? ''), state, chart)
        return c.redirect(shell.url(`/views/${encodeURIComponent(view.id)}`, { kind: 'ok', text: `“${view.name}” was saved.` }), 303)
      } catch (error) {
        if (!(error instanceof TablesError)) throw error
        return c.html(chartPage(dataset, chart, state, error.message))
      }
    })

  ctx.router.route(prefix === '' ? '/' : prefix, app)
  ctx.effect(() => shell.nav({ id: 'datasets', label: 'Datasets', icon: '▤', path: '/datasets', order: 10, count: () => tables.datasets().length }))
}

function formatMemory(bytes: number): string {
  const mb = bytes / 1024 / 1024
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${String(Math.round(bytes / 1024))} KB`
}
