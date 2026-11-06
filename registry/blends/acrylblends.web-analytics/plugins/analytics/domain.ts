/**
 * Web Analytics' types and pure rules: properties, daily metrics, pages, sources, events and conversions, and the sums a report needs. No clock, no
 * disk and no ids are made here; the {@link Analytics} class applies these rules to the saved state.
 */

export interface Property {
  readonly id: string
  readonly domain: string
  readonly trackingId: string
  readonly createdAt: string
}

export interface DailyMetric {
  readonly propertyId: string
  /** `YYYY-MM-DD`. */
  readonly date: string
  readonly visitors: number
  readonly sessions: number
  /** 0 to 100. */
  readonly bounceRate: number
  readonly conversions: number
}

export interface PageStat {
  readonly propertyId: string
  readonly path: string
  readonly title: string
  readonly views: number
  /** 0 to 100. */
  readonly bounceRate: number
}

export interface SourceStat {
  readonly propertyId: string
  readonly source: string
  readonly sessions: number
}

export interface Event {
  readonly id: string
  readonly propertyId: string
  readonly name: string
  readonly path: string
  readonly sessionId: string
  /** ISO date-time, local time without a zone. */
  readonly at: string
  readonly properties: Readonly<Record<string, string | number>>
}

export interface Conversion {
  readonly id: string
  readonly propertyId: string
  readonly name: string
  readonly eventName: string
  readonly count: number
}

export interface AnalyticsState {
  readonly version: 1
  properties: Property[]
  metrics: DailyMetric[]
  pages: PageStat[]
  sources: SourceStat[]
  events: Event[]
  conversions: Conversion[]
}

export type AnalyticsErrorCode = 'invalid' | 'not-found' | 'conflict'

export class AnalyticsError extends Error {
  readonly code: AnalyticsErrorCode

  constructor(code: AnalyticsErrorCode, message: string) {
    super(message)
    this.code = code
    this.name = 'AnalyticsError'
  }
}

const pad = (n: number): string => String(n).padStart(2, '0')

export function dayOf(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function stampOf(date: Date): string {
  return `${dayOf(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** A day moved by whole days, as `YYYY-MM-DD`. */
export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00`)
  date.setDate(date.getDate() + days)
  return dayOf(date)
}

/** The last `days` days ending at `end`, oldest first. */
export function dayRange(end: string, days: number): string[] {
  return Array.from({ length: days }, (_, index) => addDays(end, index - days + 1))
}

export function number(value: number, digits = 0): string {
  return new Intl.NumberFormat('en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)
}

/** `48,291`; a percentage as `34.6%`. */
export function percent(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`
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

/** A short date for the chart's axis: `Oct 06`. */
export function shortDay(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: '2-digit' })
}

export interface Totals {
  readonly visitors: number
  readonly sessions: number
  readonly bounceRate: number
  readonly conversions: number
  readonly conversionRate: number
}

/** Sums over a slice of days; an empty slice is all zeros. */
export function totalsOf(metrics: readonly DailyMetric[]): Totals {
  if (metrics.length === 0) return { visitors: 0, sessions: 0, bounceRate: 0, conversions: 0, conversionRate: 0 }
  const visitors = metrics.reduce((total, metric) => total + metric.visitors, 0)
  const sessions = metrics.reduce((total, metric) => total + metric.sessions, 0)
  const conversions = metrics.reduce((total, metric) => total + metric.conversions, 0)
  const bounceRate = metrics.reduce((total, metric) => total + metric.bounceRate * metric.sessions, 0) / Math.max(1, sessions)
  return { visitors, sessions, bounceRate, conversions, conversionRate: sessions === 0 ? 0 : (conversions / sessions) * 100 }
}

/** The change from the previous period as a percentage, or undefined when the previous period was empty. */
export function change(current: number, previous: number): number | undefined {
  if (previous === 0) return undefined
  return ((current - previous) / previous) * 100
}

export interface Point {
  readonly day: string
  readonly value: number
}

/** A sparkline path (`M0 12 L…`) for a list of values in a 130×30 box. */
export function sparkPath(values: readonly number[], width = 130, height = 30): string {
  if (values.length === 0) return ''
  const max = Math.max(...values, 1)
  const min = Math.min(...values)
  const span = max - min || 1
  return values
    .map((value, index) => {
      const x = (index / Math.max(1, values.length - 1)) * width
      const y = height - ((value - min) / span) * height
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
}

/** The property a tracking id belongs to. */
export function propertyByTracking(state: AnalyticsState, trackingId: string): Property | undefined {
  return state.properties.find((property) => property.trackingId === trackingId)
}

/** The source of a visit: the referrer's host, or `Direct` when it is empty or this site. */
export function sourceOf(referrer: string, domain: string): string {
  if (referrer.trim() === '') return 'Direct'
  try {
    const host = new URL(referrer).hostname.replace(/^www\./u, '')
    if (host === domain.replace(/^www\./u, '')) return 'Direct'
    if (/google|bing|duckduckgo/iu.test(host)) return 'Organic search'
    if (/facebook|twitter|x\.com|linkedin|instagram|reddit/iu.test(host)) return 'Social'
    if (/mail|newsletter/iu.test(host)) return 'Email'
    return 'Referral'
  } catch {
    return 'Referral'
  }
}

/** A domain as the property form accepts it: `northstar.app`. @throws with the form's message. */
export function cleanDomain(value: unknown): string {
  if (typeof value !== 'string') throw new AnalyticsError('invalid', 'The domain is required.')
  const domain = value.trim().toLowerCase().replace(/^https?:\/\//u, '').replace(/\/.*$/u, '')
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/u.test(domain))
    throw new AnalyticsError('invalid', 'Enter a domain like northstar.app.')
  return domain
}

/** The snippet a person pastes before `</body>`; it posts a page view to this app and stores the session id locally. */
export function trackingSnippet(trackingId: string, baseUrl: string): string {
  return `<script>
(function () {
  var key = 'acryl_sid';
  var sid = localStorage.getItem(key);
  if (!sid) { sid = Math.random().toString(36).slice(2, 12); localStorage.setItem(key, sid); }
  fetch('${baseUrl.replace(/\/$/u, '')}/collect', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ trackingId: '${trackingId}', path: location.pathname, referrer: document.referrer, sessionId: sid })
  });
}());
</script>`
}

/** The install state the tracking page shows. */
export function trackingState(state: AnalyticsState, property: Property): 'active' | 'waiting' {
  return state.events.some((event) => event.propertyId === property.id) ? 'active' : 'waiting'
}
