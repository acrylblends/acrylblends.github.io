/**
 * The overview report: the four KPI cards with their sparklines, the visitors-over-time chart compared with the previous period, the top pages and
 * the traffic sources. It is the app's first screen, so `/` is the same page.
 *
 * Routes (under the shell's prefix): GET /, GET /overview?property.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { number, percent, shortDay, sparkPath } from '../analytics/index.ts'

export const name = 'overview'
export const inject = ['analytics', 'shell', 'router']

const changeText = (value: number | undefined, suffix = '%'): string => {
  if (value === undefined) return '<span>no previous period</span>'
  const arrow = value >= 0 ? '↑' : '↓'
  return `<span class="${value >= 0 ? 'up' : 'down'}">${arrow} ${Math.abs(value).toFixed(1)}${suffix}</span>`
}

const kpi = (label: string, value: string, delta: string, path: string): string =>
  `<article><small>${label}</small><b>${value}</b>${delta}<svg viewBox="0 0 130 30" preserveAspectRatio="none"><path d="${path}" fill="none" stroke="#3a8d7d" stroke-width="2"/></svg></article>`

export function apply(ctx: Context): void {
  const { analytics, shell } = ctx
  const e = shell.e
  const prefix = shell.prefix

  const report = (read: (name: string) => string | undefined): string => {
    const requested = read('property')
    const property = (requested === undefined ? undefined : analytics.property(requested)) ?? analytics.first()
    if (property === undefined)
      return `<header><div><small>OVERVIEW</small><h1>No property yet</h1><p>Add a property on the tracking page to start.</p></div></header><p class="a-empty">No property yet. <a href="${shell.href('/settings/tracking')}">Set up tracking</a></p>`
    const series = analytics.series(property.id, 30)
    const kpis = analytics.kpis(property.id, 30)
    if (series.length === 0)
      return `<header><div><small>OVERVIEW / ${e(property.domain).toUpperCase()}</small><h1>Website overview</h1><p>No events yet for ${e(property.domain)}.</p></div></header><p class="a-empty">No events yet. Install the tracking snippet on ${e(property.domain)} and the first page view will appear here. <a href="${shell.href('/settings/tracking')}">Get the snippet</a></p>`
    const values = series.map((metric) => metric.visitors)
    const currentPath = sparkPath(values, 800, 190)
    const previousMetrics = analytics.series(property.id, 60).slice(0, 30)
    const previousPath = sparkPath(previousMetrics.map((metric) => metric.visitors), 800, 190)
    const area = currentPath === '' ? '' : `${currentPath} L800 190 L0 190 Z`
    const labels = [0, 4, 8, 12, 16, 20, 24, 29].map((index) => shortDay(series[index]?.date ?? ''))
    const max = Math.max(1, ...values, ...previousMetrics.map((metric) => metric.visitors))
    const yLabels = [max, max * 0.75, max * 0.5, max * 0.25, 0].map((value) => value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(Math.round(value)))
    const pages = analytics.pages(property.id)
    const pageTotal = pages.reduce((total, page) => total + page.views, 0)
    const top = pages.slice(0, 4)
    const pageRows = top.map((page) => `<tr><td><b>${e(page.path)}</b><small>${e(page.title)}</small></td><td>${number(page.views)}</td><td><i><em style="width:${String(Math.round((page.views / Math.max(1, top[0]?.views ?? 1)) * 100))}%"></em></i></td><td>${percent(100 * page.views / Math.max(1, kpis.current.sessions))}</td></tr>`).join('')
    const sources = analytics.sources(property.id)
    const sourceTotal = sources.reduce((total, source) => total + source.sessions, 0)
    const sourceRows = sources.map((source) => `<div><span>${e(source.source)}</span><b>${percent(100 * source.sessions / Math.max(1, sourceTotal), 0)}</b><i><em style="width:${percent(100 * source.sessions / Math.max(1, sourceTotal), 0)}"></em></i></div>`).join('')
    return `<header><div><small>OVERVIEW / ${e(property.domain).toUpperCase()}</small><h1>Website overview</h1><p>Understand where visitors come from and what they do.</p></div><div><a href="${shell.href('/settings/tracking')}" style="background:white;border:1px solid var(--line);border-radius:4px;padding:8px 10px;font-size:8px;color:#6d7c79;text-decoration:none">Last 30 days ⌄</a> <a href="${shell.href('/settings/tracking#export')}" style="background:white;border:1px solid var(--line);border-radius:4px;padding:8px 10px;font-size:8px;color:#6d7c79;text-decoration:none">↓ Export</a></div></header><div class="a-kpis">${kpi('VISITORS', number(kpis.current.visitors), changeText(kpis.visitorsChange), sparkPath(values.slice(-10), 130, 30))}${kpi('SESSIONS', number(kpis.current.sessions), changeText(kpis.sessionsChange), sparkPath(series.slice(-10).map((metric) => metric.sessions), 130, 30))}${kpi('BOUNCE RATE', percent(kpis.current.bounceRate), changeText(kpis.bounceChange, ' pts'), sparkPath(series.slice(-10).map((metric) => metric.bounceRate), 130, 30))}${kpi('CONVERSION RATE', percent(kpis.current.conversionRate, 2), changeText(kpis.conversionChange, ' pts'), sparkPath(series.slice(-10).map((metric) => metric.conversions), 130, 30))}</div><section class="a-visitors"><header><div><b>Visitors over time</b><small>Daily unique visitors · compared to previous period</small></div><div class="a-legend"><i></i> This period <i class="prev"></i> Previous period</div></header><div class="a-chart"><div class="a-y">${yLabels.map((label) => `<span>${label}</span>`).join('')}</div><svg viewBox="0 0 800 190" preserveAspectRatio="none"><defs><linearGradient id="ag" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#4caa98" stop-opacity=".19"/><stop offset="1" stop-color="#4caa98" stop-opacity="0"/></linearGradient></defs><path d="${area}" fill="url(#ag)"/><path d="${currentPath}" fill="none" stroke="#3c9988" stroke-width="2.5"/><path d="${previousPath}" fill="none" stroke="#bac8c7" stroke-width="1.7" stroke-dasharray="4 4"/></svg></div><div class="a-x">${labels.map((label) => `<span>${label}</span>`).join('')}</div></section><div class="a-lower"><section><header><b>Top pages</b><a href="${shell.href('/pages')}">View report ↗</a></header><table><tbody>${pageRows}</tbody></table></section><section><header><b>Traffic sources</b><a href="${shell.href('/acquisition')}">Details ↗</a></header><div class="a-source">${sourceRows}</div></section></div>`
  }

  const app = new Acryl()
    .get('/', (c) => c.html(shell.page({ active: 'overview', title: 'Website overview', crumbs: ['Overview', analytics.first()?.domain ?? ''], main: report((name) => c.req.query(name)) })))
    .get('/overview', (c) => c.html(shell.page({ active: 'overview', title: 'Website overview', crumbs: ['Overview', analytics.first()?.domain ?? ''], main: report((name) => c.req.query(name)) })))

  ctx.router.route(prefix === '' ? '/' : prefix, app)
  ctx.effect(() => shell.nav({ id: 'overview', label: 'Overview', icon: '▤', path: '/overview', order: 10, group: 'ANALYZE' }))
}

