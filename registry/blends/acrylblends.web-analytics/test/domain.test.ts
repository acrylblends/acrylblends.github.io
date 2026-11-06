import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  addDays,
  Analytics,
  AnalyticsError,
  change,
  cleanDomain,
  dayRange,
  percent,
  sourceOf,
  sparkPath,
  totalsOf,
  trackingSnippet,
} from '../plugins/analytics/index.ts'
import { memoryStore } from '../plugins/analytics/store.ts'
import type { AnalyticsState } from '../plugins/analytics/domain.ts'
import { seed } from '../plugins/analytics/seed.ts'
import { NOW, withApp } from './support.ts'

const newId = (kind: string): string => `${kind}-${Math.random().toString(36).slice(2, 8)}`

test('days move and a range ends at its last day', () => {
  assert.equal(addDays('2026-11-06', -1), '2026-11-05')
  assert.deepEqual(dayRange('2026-11-06', 3), ['2026-11-04', '2026-11-05', '2026-11-06'])
})

test('totals sum metrics and weigh the bounce rate by sessions', () => {
  const totals = totalsOf([
    { propertyId: 'p', date: '2026-11-05', visitors: 10, sessions: 20, bounceRate: 30, conversions: 1 },
    { propertyId: 'p', date: '2026-11-06', visitors: 10, sessions: 40, bounceRate: 60, conversions: 3 },
  ])
  assert.equal(totals.visitors, 20)
  assert.equal(totals.sessions, 60)
  assert.equal(totals.conversions, 4)
  assert.equal(totals.bounceRate, 50)
  assert.equal(totals.conversionRate, 4 / 60 * 100)
  assert.equal(change(120, 100), 20)
  assert.equal(change(100, 0), undefined)
})

test('a sparkline is a path across the values', () => {
  assert.equal(sparkPath([]), '')
  assert.match(sparkPath([1, 2, 3]), /^M0\.0 30\.0 L65\.0 15\.0 L130\.0 0\.0$/)
})

test('a source comes from the referrer, and direct visits are the site itself', () => {
  assert.equal(sourceOf('', 'northstar.app'), 'Direct')
  assert.equal(sourceOf('https://northstar.app/pricing', 'northstar.app'), 'Direct')
  assert.equal(sourceOf('https://www.google.com/search?q=x', 'northstar.app'), 'Organic search')
  assert.equal(sourceOf('https://linkedin.com/posts/1', 'northstar.app'), 'Social')
  assert.equal(sourceOf('https://example.com/article', 'northstar.app'), 'Referral')
})

test('a domain is cleaned and refused with a message', () => {
  assert.equal(cleanDomain(' HTTPS://Northstar.app/path '), 'northstar.app')
  assert.throws(() => cleanDomain('not a domain'), (error: unknown) => error instanceof AnalyticsError && /Enter a domain/.test(error.message))
})

test('the snippet carries the tracking id and the collect URL', () => {
  const snippet = trackingSnippet('acr_123', 'http://127.0.0.1:3000')
  assert.match(snippet, /acr_123/)
  assert.match(snippet, /http:\/\/127\.0\.0\.1:3000\/collect/)
  assert.match(snippet, /page_view|fetch/)
})

test('the seed has the mockup totals, pages, sources, events and conversions', () => {
  const state = seed(NOW, newId)
  const property = state.properties[0]
  assert.ok(property !== undefined)
  assert.equal(property.domain, 'northstar.app')
  const current = state.metrics.filter((metric) => metric.date >= addDays('2026-11-06', -29))
  const totals = totalsOf(current)
  assert.equal(totals.visitors, 48_291)
  assert.equal(totals.sessions, 62_814)
  assert.equal(totals.conversions, 3_027)
  assert.ok(Math.abs(totals.bounceRate - 34.6) < 0.2)
  assert.ok(Math.abs(totals.conversionRate - 4.82) < 0.01)
  assert.equal(state.pages[0]?.views, 18_420)
  assert.equal(state.sources[0]?.source, 'Direct')
  assert.equal(state.events.length, 12)
  assert.equal(state.conversions.length, 3)
})

async function open(): Promise<Analytics> {
  let ids = 0
  return Analytics.open({ store: memoryStore(), clock: () => NOW, newId: (kind) => `${kind}-${++ids}` })
}

test('the reports read the last thirty days and compare them with the thirty before', async () => {
  const analytics = await open()
  const property = analytics.first()
  assert.ok(property !== undefined)
  assert.equal(analytics.series(property.id, 30).length, 30)
  const kpis = analytics.kpis(property.id, 30)
  assert.equal(kpis.current.visitors, 48_291)
  assert.ok(kpis.visitorsChange !== undefined && kpis.visitorsChange > 10 && kpis.visitorsChange < 15)
  assert.ok(kpis.bounceChange !== undefined && kpis.bounceChange < 0)
  assert.equal(analytics.pages(property.id).length, 7)
  assert.equal(analytics.sources(property.id).length, 5)
  assert.equal(analytics.events(property.id, 'sign_up').length, 2)
  assert.equal(analytics.conversions(property.id).length, 3)
  assert.equal(analytics.installState(property), 'active')
})

test('a page view updates today, the page, the source and the event log', async () => {
  let ids = 0
  const store = memoryStore<AnalyticsState>()
  const analytics = await Analytics.open({ store, clock: () => NOW, newId: (kind) => `${kind}-${++ids}` })
  const property = analytics.first()
  assert.ok(property !== undefined)
  const before = analytics.kpis(property.id, 30).current
  const event = await analytics.collect(property.trackingId, { path: '/new-page', referrer: 'https://google.com/', sessionId: 's-test' })
  assert.equal(event.name, 'page_view')
  assert.equal(event.path, '/new-page')
  const after = analytics.kpis(property.id, 30).current
  assert.equal(after.visitors, before.visitors + 1)
  assert.equal(after.sessions, before.sessions + 1)
  assert.ok(analytics.pages(property.id).some((page) => page.path === '/new-page'))
  assert.ok(analytics.sources(property.id).some((source) => source.source === 'Organic search'))
  assert.equal(store.saved, 1)
  await assert.rejects(analytics.collect('acr_unknown', {}), /Unknown tracking id/)
})

test('a new property starts with no events and is refused twice', async () => {
  const analytics = await open()
  const property = await analytics.createProperty('https://NewSite.example/')
  assert.equal(property.domain, 'newsite.example')
  assert.match(property.trackingId, /^acr_/)
  assert.equal(analytics.installState(property), 'waiting')
  assert.equal(analytics.series(property.id, 30).length, 0)
  await assert.rejects(analytics.createProperty('newsite.example'), (error: unknown) => error instanceof AnalyticsError && error.code === 'conflict')
  assert.equal(percent(34.64), '34.6%')
})

test('the workspace the pages see is the seed', () =>
  withApp(async (app) => {
    assert.equal(app.root.analytics.first()?.domain, 'northstar.app')
    assert.equal(app.root.analytics.kpis(app.root.analytics.first()?.id ?? '', 30).current.visitors, 48_291)
  }))
