/**
 * The reports beside the overview: acquisition (sources), pages and screens, the event explorer and conversions with a small funnel.
 *
 * Routes (under the shell's prefix): GET /acquisition, GET /pages, GET /events?name, GET /conversions.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { number, percent, whenText } from '../analytics/index.ts'

export const name = 'reports'
export const inject = ['analytics', 'shell', 'router']

export function apply(ctx: Context): void {
  const { analytics, shell } = ctx
  const e = shell.e
  const prefix = shell.prefix

  const header = (small: string, title: string, lead: string): string =>
    `<header><div><small>${small}</small><h1>${title}</h1><p>${lead}</p></div></header>`

  const acquisition = (): string => {
    const property = analytics.first()
    if (property === undefined) return header('ACQUISITION', 'No property yet', 'Add a property on the tracking page.')
    const sources = analytics.sources(property.id)
    const total = sources.reduce((sum, source) => sum + source.sessions, 0)
    const rows = sources.map((source) => `<tr><td><b>${e(source.source)}</b></td><td>${number(source.sessions)}</td><td>${percent(100 * source.sessions / Math.max(1, total))}</td><td><i style="width:${percent(100 * source.sessions / Math.max(1, sources[0]?.sessions ?? 1), 0)}"></i></td></tr>`).join('')
    return `${header('ANALYZE / ACQUISITION', 'Acquisition', 'Where the last thirty days of sessions came from.')}<section class="a-section"><header><b>Sessions by source</b><small>${number(total)} sessions</small></header><table><thead><tr><th>SOURCE</th><th>SESSIONS</th><th>SHARE</th><th></th></tr></thead><tbody>${rows === '' ? '<tr><td colspan="4">No data yet.</td></tr>' : rows}</tbody></table></section>`
  }

  const pages = (): string => {
    const property = analytics.first()
    if (property === undefined) return header('PAGES', 'No property yet', 'Add a property on the tracking page.')
    const items = analytics.pages(property.id)
    const total = items.reduce((sum, page) => sum + page.views, 0)
    const rows = items.map((page) => `<tr><td><b>${e(page.path)}</b><small>${e(page.title)}</small></td><td>${number(page.views)}</td><td>${percent(100 * page.views / Math.max(1, total))}</td><td>${percent(page.bounceRate)}</td><td><i style="width:${percent(100 * page.views / Math.max(1, items[0]?.views ?? 1), 0)}"></i></td></tr>`).join('')
    return `${header('ANALYZE / PAGES & SCREENS', 'Pages & screens', 'The pages people read, by views.')}<section class="a-section"><header><b>Top pages</b><small>${String(items.length)} pages</small></header><table><thead><tr><th>PATH</th><th>VIEWS</th><th>SHARE</th><th>BOUNCE</th><th></th></tr></thead><tbody>${rows === '' ? '<tr><td colspan="5">No data yet.</td></tr>' : rows}</tbody></table></section>`
  }

  const events = (name: string | undefined): string => {
    const property = analytics.first()
    if (property === undefined) return header('EVENTS', 'No property yet', 'Add a property on the tracking page.')
    const names = analytics.eventNames(property.id)
    const items = analytics.events(property.id, name)
    const chips = `<a href="${shell.href('/events')}"${name === undefined ? ' style="font-weight:750;color:#1c786a"' : ''}>All (${String(analytics.events(property.id).length)})</a> ${names.map((item) => `<a href="${shell.href(`/events?name=${encodeURIComponent(item.name)}`)}"${item.name === name ? ' style="font-weight:750;color:#1c786a"' : ''}>${e(item.name)} (${String(item.count)})</a>`).join(' ')}`
    const rows = items.map((event) => `<tr data-row><td>${e(whenText(event.at, new Date()))}</td><td><b>${e(event.name)}</b></td><td>${e(event.path)}</td><td>${e(event.sessionId)}</td><td>${Object.entries(event.properties).map(([key, value]) => `${e(key)}=${e(String(value))}`).join(' · ')}</td></tr>`).join('')
    return `${header('ANALYZE / EVENTS', 'Events', 'The most recent events the snippet sent.')}<p class="a-note">${chips}</p><section class="a-section"><header><b>Event explorer</b><small>${String(items.length)} shown</small></header><table><thead><tr><th>WHEN</th><th>NAME</th><th>PATH</th><th>SESSION</th><th>PROPERTIES</th></tr></thead><tbody>${rows === '' ? '<tr><td colspan="5">No events match.</td></tr>' : rows}</tbody></table></section>`
  }

  const conversions = (): string => {
    const property = analytics.first()
    if (property === undefined) return header('CONVERSIONS', 'No property yet', 'Add a property on the tracking page.')
    const kpis = analytics.kpis(property.id, 30)
    const items = analytics.conversions(property.id)
    const rows = items.map((conversion) => `<tr><td><b>${e(conversion.name)}</b></td><td>${e(conversion.eventName)}</td><td>${number(conversion.count)}</td><td>${percent(100 * conversion.count / Math.max(1, kpis.current.sessions), 2)}</td></tr>`).join('')
    const max = Math.max(1, kpis.current.visitors)
    return `${header('ANALYZE / CONVERSIONS', 'Conversions', 'The moments that count, and how often they happen.')}<section class="a-section"><header><b>Funnel</b><small>Last 30 days</small></header><div style="padding:15px"><div class="a-source"><div><span>Visitors</span><b>${number(kpis.current.visitors)}</b><i><em style="width:100%"></em></i></div><div><span>Sessions</span><b>${number(kpis.current.sessions)}</b><i><em style="width:${percent(100 * kpis.current.sessions / max, 0)}"></em></i></div><div><span>Conversions</span><b>${number(kpis.current.conversions)}</b><i><em style="width:${percent(100 * kpis.current.conversions / max, 0)}"></em></i></div></div><p class="a-note">Conversion rate: ${percent(kpis.current.conversionRate, 2)} of sessions.</p></div></section><section class="a-section"><header><b>Defined conversions</b><small>${String(items.length)} conversions</small></header><table><thead><tr><th>NAME</th><th>EVENT</th><th>COUNT</th><th>OF SESSIONS</th></tr></thead><tbody>${rows === '' ? '<tr><td colspan="4">No conversions defined.</td></tr>' : rows}</tbody></table></section>`
  }

  const app = new Acryl()
    .get('/acquisition', (c) => c.html(shell.page({ active: 'acquisition', title: 'Acquisition', crumbs: ['Analyze', 'Acquisition'], main: acquisition() })))
    .get('/pages', (c) => c.html(shell.page({ active: 'pages', title: 'Pages & screens', crumbs: ['Analyze', 'Pages'], main: pages() })))
    .get('/events', (c) => c.html(shell.page({ active: 'events', title: 'Events', crumbs: ['Analyze', 'Events'], main: events(c.req.query('name')) })))
    .get('/conversions', (c) => c.html(shell.page({ active: 'conversions', title: 'Conversions', crumbs: ['Analyze', 'Conversions'], main: conversions() })))

  ctx.router.route(prefix === '' ? '/' : prefix, app)
  ctx.effect(() => shell.nav({ id: 'acquisition', label: 'Acquisition', icon: '↗', path: '/acquisition', order: 11, group: 'ANALYZE' }))
  ctx.effect(() => shell.nav({ id: 'pages', label: 'Pages & screens', icon: '▣', path: '/pages', order: 12, group: 'ANALYZE' }))
  ctx.effect(() => shell.nav({ id: 'events', label: 'Events', icon: '◉', path: '/events', order: 13, group: 'ANALYZE', count: () => analytics.events(analytics.first()?.id ?? '').length }))
  ctx.effect(() => shell.nav({ id: 'conversions', label: 'Conversions', icon: '⌁', path: '/conversions', order: 14, group: 'ANALYZE', count: () => analytics.conversions(analytics.first()?.id ?? '').length }))
}
