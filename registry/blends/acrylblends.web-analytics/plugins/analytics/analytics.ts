/**
 * The analytics workspace: properties, metrics, pages, sources, events and conversions, and every operation a report runs. Its outside effects (where
 * the state lives, what time it is, how ids are made) come in as adapters.
 */
import {
  addDays,
  AnalyticsError,
  type AnalyticsState,
  change,
  cleanDomain,
  type Conversion,
  dayOf,
  dayRange,
  type DailyMetric,
  type Event,
  type PageStat,
  type Property,
  propertyByTracking,
  type SourceStat,
  sourceOf,
  stampOf,
  totalsOf,
  type Totals,
  trackingState,
} from './domain.ts'
import { seed } from './seed.ts'
import type { Store } from './store.ts'

export interface AnalyticsAdapters {
  readonly store: Store<AnalyticsState>
  readonly clock: () => Date
  readonly newId: (kind: string) => string
}

export interface Kpis {
  readonly current: Totals
  readonly previous: Totals
  readonly visitorsChange: number | undefined
  readonly sessionsChange: number | undefined
  readonly bounceChange: number | undefined
  readonly conversionChange: number | undefined
}

export class Analytics {
  private state: AnalyticsState
  private readonly adapters: AnalyticsAdapters

  private constructor(state: AnalyticsState, adapters: AnalyticsAdapters) {
    this.state = state
    this.adapters = adapters
  }

  static async open(adapters: AnalyticsAdapters): Promise<Analytics> {
    const saved = await adapters.store.load()
    return new Analytics(saved ?? seed(adapters.clock(), adapters.newId), adapters)
  }

  get today(): string {
    return dayOf(this.adapters.clock())
  }

  properties(): readonly Property[] {
    return this.state.properties
  }

  property(id: string): Property | undefined {
    return this.state.properties.find((property) => property.id === id)
  }

  first(): Property | undefined {
    return this.state.properties[0]
  }

  /** The property the tracking id names, or undefined. */
  byTracking(trackingId: string): Property | undefined {
    return propertyByTracking(this.state, trackingId)
  }

  /** The last `days` daily metrics ending today, oldest first. */
  series(propertyId: string, days = 30): readonly DailyMetric[] {
    const range = new Set(dayRange(this.today, days))
    return this.state.metrics
      .filter((metric) => metric.propertyId === propertyId && range.has(metric.date))
      .sort((a, b) => a.date.localeCompare(b.date))
  }

  /** This period's totals and the one before it, with the changes the KPI cards show. */
  kpis(propertyId: string, days = 30): Kpis {
    const current = totalsOf(this.series(propertyId, days))
    const beforeRange = new Set(dayRange(addDays(this.today, -days), days))
    const previous = totalsOf(this.state.metrics.filter((metric) => metric.propertyId === propertyId && beforeRange.has(metric.date)))
    return {
      current,
      previous,
      visitorsChange: change(current.visitors, previous.visitors),
      sessionsChange: change(current.sessions, previous.sessions),
      bounceChange: previous.sessions === 0 ? undefined : current.bounceRate - previous.bounceRate,
      conversionChange: previous.sessions === 0 ? undefined : current.conversionRate - previous.conversionRate,
    }
  }

  pages(propertyId: string): readonly PageStat[] {
    return [...this.state.pages.filter((page) => page.propertyId === propertyId)].sort((a, b) => b.views - a.views)
  }

  sources(propertyId: string): readonly SourceStat[] {
    return [...this.state.sources.filter((source) => source.propertyId === propertyId)].sort((a, b) => b.sessions - a.sessions)
  }

  events(propertyId: string, name?: string): readonly Event[] {
    return this.state.events
      .filter((event) => event.propertyId === propertyId && (name === undefined || event.name === name))
      .sort((a, b) => b.at.localeCompare(a.at))
  }

  eventNames(propertyId: string): readonly { name: string; count: number }[] {
    const counts = new Map<string, number>()
    for (const event of this.state.events) {
      if (event.propertyId !== propertyId) continue
      counts.set(event.name, (counts.get(event.name) ?? 0) + 1)
    }
    return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
  }

  conversions(propertyId: string): readonly Conversion[] {
    return [...this.state.conversions.filter((conversion) => conversion.propertyId === propertyId)].sort((a, b) => b.count - a.count)
  }

  /** `active` once any event arrived, `waiting` before the snippet is installed. */
  installState(property: Property): 'active' | 'waiting' {
    return trackingState(this.state, property)
  }

  /** The last event a property received, for the tracking page. */
  lastEvent(propertyId: string): Event | undefined {
    return this.events(propertyId)[0]
  }

  /** A new property, with no events yet: the tracking page then shows the waiting state. */
  async createProperty(domain: string): Promise<Property> {
    const clean = cleanDomain(domain)
    if (this.state.properties.some((property) => property.domain.toLowerCase() === clean))
      throw new AnalyticsError('conflict', `${clean} is already tracked.`)
    const property: Property = {
      id: this.adapters.newId('property'),
      domain: clean,
      trackingId: `acr_${this.adapters.newId('track').replace(/[^a-z0-9]/giu, '').slice(0, 8).padEnd(8, '0')}`,
      createdAt: stampOf(this.adapters.clock()),
    }
    this.state.properties.push(property)
    await this.save()
    return property
  }

  /**
   * A page view from the tracking snippet: today's metric and the page's views go up by one, its source by one session, and the event is kept. The
   * snippet is stateless, so two hits with the same session id still count twice; a server that sees the visitor's ip could dedupe, this one does not.
   */
  async collect(trackingId: string, input: { path?: unknown; referrer?: unknown; sessionId?: unknown }): Promise<Event> {
    const property = this.byTracking(trackingId)
    if (property === undefined) throw new AnalyticsError('invalid', 'Unknown tracking id.')
    const path = typeof input.path === 'string' && input.path.startsWith('/') ? input.path.slice(0, 300) : '/'
    const sessionId = typeof input.sessionId === 'string' && input.sessionId !== '' ? input.sessionId.slice(0, 80) : this.adapters.newId('session')
    const day = this.today
    const at = stampOf(this.adapters.clock())
    const existingMetric = this.state.metrics.find((metric) => metric.propertyId === property.id && metric.date === day)
    if (existingMetric === undefined)
      this.state.metrics.push({ propertyId: property.id, date: day, visitors: 1, sessions: 1, bounceRate: 0, conversions: 0 })
    else
      this.state.metrics = this.state.metrics.map((metric) =>
        metric === existingMetric ? { ...metric, visitors: metric.visitors + 1, sessions: metric.sessions + 1 } : metric,
      )
    const page = this.state.pages.find((item) => item.propertyId === property.id && item.path === path)
    if (page === undefined)
      this.state.pages.push({ propertyId: property.id, path, title: path === '/' ? 'Home' : path, views: 1, bounceRate: 0 })
    else
      this.state.pages = this.state.pages.map((item) => (item === page ? { ...item, views: item.views + 1 } : item))
    const sourceName = sourceOf(typeof input.referrer === 'string' ? input.referrer : '', property.domain)
    const source = this.state.sources.find((item) => item.propertyId === property.id && item.source === sourceName)
    if (source === undefined) this.state.sources.push({ propertyId: property.id, source: sourceName, sessions: 1 })
    else this.state.sources = this.state.sources.map((item) => (item === source ? { ...item, sessions: item.sessions + 1 } : item))
    const event: Event = {
      id: this.adapters.newId('event'),
      propertyId: property.id,
      name: 'page_view',
      path,
      sessionId,
      at,
      properties: { source: sourceName },
    }
    this.state.events.push(event)
    await this.save()
    return event
  }

  private async save(): Promise<void> {
    this.state = {
      ...this.state,
      properties: [...this.state.properties],
      metrics: [...this.state.metrics],
      pages: [...this.state.pages],
      sources: [...this.state.sources],
      events: [...this.state.events],
      conversions: [...this.state.conversions],
    }
    await this.adapters.store.save(this.state)
  }
}
