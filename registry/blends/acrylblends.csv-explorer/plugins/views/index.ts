/**
 * A saved view: the dataset with the view's filter, sort and chart applied, in a compact report. The view's name and settings are the dataset's, so
 * the page needs nothing but the saved view.
 *
 * Route (under the shell's prefix): GET /views/:id.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { type Column, euro, euroShort, number, type SavedView } from '../tables/index.ts'

export const name = 'views'
export const inject = ['tables', 'shell', 'router']

const escape = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

const badgeClass = (value: string): string => (value.toLowerCase() === 'paid' ? 'paid' : value.toLowerCase() === 'open' ? 'open' : 'late')
const isMoney = (column: Column): boolean => column.type === 'number' && /revenue|amount|price|cost/iu.test(column.name)

const cell = (column: Column, value: string): string => {
  if (value === '') return '<span style="color:#bcc4c7">—</span>'
  if (column.type === 'number') return isMoney(column) ? euro(Number(value)) : number(Number(value))
  if (/status|state/iu.test(column.name)) return `<i class="${badgeClass(value)}">${escape(value)}</i>`
  return escape(value)
}

export function apply(ctx: Context): void {
  const { tables, shell } = ctx
  const e = shell.e
  const prefix = shell.prefix

  const viewPage = (view: SavedView): string | undefined => {
    const dataset = tables.dataset(view.datasetId)
    if (dataset === undefined) return undefined
    const page = tables.page(dataset.id, { q: view.q, filters: view.filters, sort: view.sort, page: 1, pageSize: 50 })
    if (page === undefined) return undefined
    const filterText = view.filters.length === 0 ? 'All rows' : view.filters.map((filter) => `${filter.column} = ${filter.value}`).join(' · ')
    const bars = tables.bars(dataset.id, view.chart, { q: view.q, filters: view.filters })
    const max = Math.max(1, ...bars.map((bar) => bar.value))
    const head = dataset.columns.map((column) => `<th>${escape(column.name)}</th>`).join('')
    const body = page.rows.map((row) => `<tr>${dataset.columns.map((column, index) => `<td>${cell(column, row[index] ?? '')}</td>`).join('')}</tr>`).join('')
    const main = `<div class="d-page"><header><div><small>WORKSPACE / SAVED VIEW</small><h1>${e(view.name)}</h1><p>${e(dataset.name)} · ${filterText} · sorted by ${e(view.sort.column)} ${e(view.sort.dir)}</p></div><div><a href="${shell.href(`/datasets/${encodeURIComponent(dataset.id)}`)}" style="font-size:9px;color:#187e76;text-decoration:none">Open the dataset ↗</a></div></header><section class="d-chart"><header><div><b>${view.chart.metric === 'count' ? 'Rows' : `Sum of ${e(view.chart.metric)}`} by ${e(view.chart.groupBy)}</b><small>From the saved view</small></div><a href="${shell.href(`/datasets/${encodeURIComponent(dataset.id)}/chart?groupBy=${encodeURIComponent(view.chart.groupBy)}&metric=${encodeURIComponent(view.chart.metric)}`)}" style="border:1px solid var(--line);background:white;padding:6px 8px;border-radius:4px;font-size:7px;color:#738287;text-decoration:none">Change chart ↗</a></header><div class="d-bars">${bars.map((bar) => `<div><span>${e(view.chart.metric === 'count' ? number(bar.value) : euroShort(bar.value))}</span><i style="height:${String(Math.round((bar.value / max) * 100))}%"></i><small>${escape(bar.label)}</small></div>`).join('')}</div></section><section class="d-section"><header><b>${number(page.total)} rows</b><small>First ${String(page.rows.length)} shown</small></header><table><thead><tr>${head}</tr></thead><tbody>${body === '' ? `<tr><td colspan="${String(dataset.columns.length)}">No rows match this view.</td></tr>` : body}</tbody></table></section></div>`
    return shell.page({ active: '', title: view.name, crumbs: ['Workspace', dataset.name, view.name], meta: dataset.fileName, main })
  }

  const app = new Acryl().get('/views/:id', (c) => {
    const view = tables.view(c.req.param('id'))
    const main = view === undefined ? undefined : viewPage(view)
    if (main === undefined) return c.redirect(shell.url('/datasets', { kind: 'error', text: 'That saved view no longer exists.' }), 303)
    return c.html(main)
  })

  ctx.router.route(prefix === '' ? '/' : prefix, app)
}
