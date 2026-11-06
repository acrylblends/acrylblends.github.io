/**
 * The property a new install starts with: northstar.app, sixty days of metrics (the last thirty are "this period", the thirty before it the
 * comparison), the top pages and sources the overview shows, a handful of recent events and three conversions. The totals are the mockup's:
 * 48,291 visitors and 62,814 sessions in the last thirty days, a 34.6% bounce rate and a 4.82% conversion rate.
 */
import { type AnalyticsState, dayOf, dayRange, stampOf } from './domain.ts'

const DAYS = 60

/** The last thirty days and the thirty before them, scaled to the totals the mockup reports. */
function metrics(propertyId: string, now: Date): AnalyticsState['metrics'] {
  const end = dayOf(now)
  const days = dayRange(end, DAYS)
  const growth = (index: number): number => 0.82 + (index / (DAYS - 1)) * 0.18
  const wave = (index: number): number => 1 + Math.sin(index / 3) * 0.06 + Math.sin(index / 7) * 0.04
  const base = days.map((_, index) => growth(index) * wave(index))
  const current = base.slice(30)
  const previous = base.slice(0, 30)
  const scale = (values: number[], total: number): number[] => {
    const sum = values.reduce((carry, value) => carry + value, 0)
    const scaled = values.map((value) => Math.round((value / sum) * total))
    const difference = total - scaled.reduce((carry, value) => carry + value, 0)
    scaled[scaled.length - 1] = (scaled[scaled.length - 1] ?? 0) + difference
    return scaled
  }
  const currentVisitors = scale(current, 48_291)
  const previousVisitors = scale(previous, 42_810)
  const currentSessions = scale(currentVisitors.map((value) => value * 1.3007), 62_814)
  const previousSessions = scale(previousVisitors.map((value) => value * 1.3007), 57_944)
  const currentConversions = scale(currentSessions.map((value) => value * 0.0482), 3_027)
  const previousConversions = scale(previousSessions.map((value) => value * 0.0412), 2_387)
  const result: AnalyticsState['metrics'] = []
  for (let index = 0; index < DAYS; index++) {
    const currentPeriod = index >= 30
    const position = index % 30
    result.push({
      propertyId,
      date: days[index] as string,
      visitors: (currentPeriod ? currentVisitors : previousVisitors)[position] as number,
      sessions: (currentPeriod ? currentSessions : previousSessions)[position] as number,
      bounceRate: Number((currentPeriod ? 33.68 + (position % 5) * 0.35 + (position % 3) * 0.2 : 36.4 + (position % 4) * 0.3).toFixed(1)),
      conversions: (currentPeriod ? currentConversions : previousConversions)[position] as number,
    })
  }
  return result
}

export function seed(now: Date, newId: (kind: string) => string): AnalyticsState {
  const propertyId = newId('property')
  const at = (hoursAgo: number): string => stampOf(new Date(now.getTime() - hoursAgo * 3_600_000))
  return {
    version: 1,
    properties: [
      {
        id: propertyId,
        domain: 'northstar.app',
        trackingId: 'acr_9f2c41a7',
        createdAt: stampOf(new Date(now.getTime() - 1000 * 60 * 60 * 24 * 40)),
      },
    ],
    metrics: metrics(propertyId, now),
    pages: [
      { propertyId, path: '/', title: 'Home', views: 18_420, bounceRate: 28.4 },
      { propertyId, path: '/pricing', title: 'Pricing', views: 9_820, bounceRate: 31.2 },
      { propertyId, path: '/docs/getting-started', title: 'Documentation', views: 7_412, bounceRate: 22.6 },
      { propertyId, path: '/blog/agent-workflows', title: 'Article', views: 4_208, bounceRate: 41.8 },
      { propertyId, path: '/signup', title: 'Sign up', views: 2_410, bounceRate: 18.2 },
      { propertyId, path: '/changelog', title: 'Changelog', views: 1_880, bounceRate: 37.5 },
      { propertyId, path: '/about', title: 'About', views: 1_210, bounceRate: 44.1 },
    ],
    sources: [
      { propertyId, source: 'Direct', sessions: 19_472 },
      { propertyId, source: 'Organic search', sessions: 17_588 },
      { propertyId, source: 'Referral', sessions: 14_447 },
      { propertyId, source: 'Social', sessions: 7_538 },
      { propertyId, source: 'Email', sessions: 3_769 },
    ],
    events: [
      { id: newId('event'), propertyId, name: 'page_view', path: '/', sessionId: 's-8f21', at: at(0.3), properties: { device: 'desktop', country: 'DE' } },
      { id: newId('event'), propertyId, name: 'page_view', path: '/pricing', sessionId: 's-8f21', at: at(0.4), properties: { device: 'desktop', country: 'DE' } },
      { id: newId('event'), propertyId, name: 'sign_up', path: '/signup', sessionId: 's-8f21', at: at(0.5), properties: { plan: 'team' } },
      { id: newId('event'), propertyId, name: 'page_view', path: '/docs/getting-started', sessionId: 's-71cc', at: at(1.2), properties: { device: 'mobile', country: 'NL' } },
      { id: newId('event'), propertyId, name: 'demo_request', path: '/pricing', sessionId: 's-71cc', at: at(1.4), properties: { seats: 12 } },
      { id: newId('event'), propertyId, name: 'page_view', path: '/blog/agent-workflows', sessionId: 's-20ab', at: at(2.1), properties: { device: 'desktop', country: 'US' } },
      { id: newId('event'), propertyId, name: 'page_view', path: '/', sessionId: 's-20ab', at: at(2.3), properties: { device: 'desktop', country: 'US' } },
      { id: newId('event'), propertyId, name: 'page_view', path: '/pricing', sessionId: 's-44de', at: at(3.5), properties: { device: 'tablet', country: 'FR' } },
      { id: newId('event'), propertyId, name: 'newsletter', path: '/blog/agent-workflows', sessionId: 's-44de', at: at(3.7), properties: { source: 'footer' } },
      { id: newId('event'), propertyId, name: 'page_view', path: '/docs/getting-started', sessionId: 's-93f0', at: at(5.2), properties: { device: 'desktop', country: 'GB' } },
      { id: newId('event'), propertyId, name: 'sign_up', path: '/signup', sessionId: 's-93f0', at: at(5.5), properties: { plan: 'solo' } },
      { id: newId('event'), propertyId, name: 'page_view', path: '/about', sessionId: 's-12aa', at: at(8.1), properties: { device: 'mobile', country: 'ES' } },
    ],
    conversions: [
      { id: newId('conversion'), propertyId, name: 'Sign up', eventName: 'sign_up', count: 1_456 },
      { id: newId('conversion'), propertyId, name: 'Demo request', eventName: 'demo_request', count: 342 },
      { id: newId('conversion'), propertyId, name: 'Newsletter', eventName: 'newsletter', count: 1_229 },
    ],
  }
}
