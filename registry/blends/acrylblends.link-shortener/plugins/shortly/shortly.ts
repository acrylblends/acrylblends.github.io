/** The short-link workspace: links, domains, referrers and click events, and the operations the pages run. */
import {
  cleanSlug,
  type ClickEvent,
  type Domain,
  dayLabels,
  dayOf,
  filterLinks,
  type LinkFilter,
  type LinkStats,
  number,
  type ReferrerStat,
  type ShortLink,
  type ShortlyState,
  ShortlyError,
  isActive,
  isExpired,
  seriesOf,
  shortUrl,
  stampOf,
  statsOf,
  validateUrl,
  whenText,
} from './domain.ts'
import { seed } from './seed.ts'
import type { Store } from './store.ts'

export interface ShortlyAdapters {
  readonly store: Store<ShortlyState>
  readonly clock: () => Date
  readonly newId: (kind: string) => string
}

export interface CreateLinkInput {
  readonly destinationUrl: string
  readonly alias?: string
  readonly expiresAt?: string
}

export class Shortly {
  private state: ShortlyState
  private readonly adapters: ShortlyAdapters

  private constructor(state: ShortlyState, adapters: ShortlyAdapters) {
    this.state = state
    this.adapters = adapters
  }

  static async open(adapters: ShortlyAdapters): Promise<Shortly> {
    const saved = await adapters.store.load()
    return new Shortly(saved ?? seed(adapters.clock(), adapters.newId), adapters)
  }

  get now(): Date {
    return this.adapters.clock()
  }

  links(filter: LinkFilter = {}): readonly ShortLink[] {
    return filterLinks(this.state.links, filter, this.now)
  }

  link(id: string): ShortLink | undefined {
    return this.state.links.find((link) => link.id === id)
  }

  bySlug(slug: string): ShortLink | undefined {
    return this.state.links.find((link) => link.slug === slug)
  }

  domains(): readonly Domain[] {
    return this.state.domains
  }

  defaultDomain(): Domain | undefined {
    return this.state.domains.find((domain) => domain.default) ?? this.state.domains[0]
  }

  referrers(): readonly ReferrerStat[] {
    return [...this.state.referrers].sort((a, b) => b.clicks - a.clicks)
  }

  events(linkId?: string): readonly ClickEvent[] {
    return this.state.events.filter((event) => linkId === undefined || event.linkId === linkId).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 20)
  }

  stats(): LinkStats {
    return statsOf(this.state, this.now)
  }

  series(linkId?: string): number[] {
    return seriesOf(this.state.links, linkId)
  }

  labels(): string[] {
    return dayLabels(this.now)
  }

  shortUrl(link: ShortLink): string {
    const domain = this.defaultDomain()
    return domain === undefined ? `/${link.slug}` : shortUrl(link, domain)
  }

  isActive(link: ShortLink): boolean {
    return isActive(link, this.now)
  }

  isExpired(link: ShortLink): boolean {
    return isExpired(link, this.now)
  }

  /** Create a link; the slug is the alias, or a unique one made from the new id. */
  async create(input: CreateLinkInput): Promise<ShortLink> {
    const destinationUrl = validateUrl(input.destinationUrl)
    const alias = cleanSlug(input.alias)
    const slug = alias ?? `lnk-${this.adapters.newId('slug').replace(/[^a-z0-9]/giu, '').slice(0, 6).toLowerCase()}`
    if (this.bySlug(slug) !== undefined) throw new ShortlyError('conflict', `The alias “${slug}” is already taken.`)
    if (input.expiresAt !== undefined && input.expiresAt !== '' && !/^\d{4}-\d{2}-\d{2}$/u.test(input.expiresAt))
      throw new ShortlyError('invalid', 'The expiry date is YYYY-MM-DD.')
    let title = destinationUrl
    try {
      const url = new URL(destinationUrl)
      title = url.hostname.replace(/^www\./u, '')
    } catch {}
    const link: ShortLink = {
      id: this.adapters.newId('link'),
      slug,
      destinationUrl,
      title,
      tags: [],
      createdAt: stampOf(this.adapters.clock()),
      ...(input.expiresAt === undefined || input.expiresAt === '' ? {} : { expiresAt: input.expiresAt }),
      enabled: true,
      views: 0,
      clicks: 0,
      daily: Array.from({ length: 30 }, () => 0),
    }
    this.state.links.push(link)
    await this.save()
    return link
  }

  /** Enable or disable a link; a disabled link no longer redirects. */
  async toggle(id: string): Promise<ShortLink> {
    const link = this.link(id)
    if (link === undefined) throw new ShortlyError('not-found', 'That link no longer exists.')
    const next = { ...link, enabled: !link.enabled }
    this.state.links = this.state.links.map((item) => (item.id === id ? next : item))
    await this.save()
    return next
  }

  /** A click from the redirect: the link's count and today's bar go up, and the event is kept. */
  async recordClick(slug: string, input: { referrer?: string; country?: string; device?: string } = {}): Promise<ShortLink> {
    const link = this.bySlug(slug)
    if (link === undefined) throw new ShortlyError('not-found', 'That short link does not exist.')
    if (!isActive(link, this.now)) throw new ShortlyError('conflict', 'That link is disabled or expired.')
    const daily = [...link.daily]
    daily[daily.length - 1] = (daily[daily.length - 1] ?? 0) + 1
    const next = { ...link, clicks: link.clicks + 1, daily }
    this.state.links = this.state.links.map((item) => (item.id === link.id ? next : item))
    this.state.events.push({
      id: this.adapters.newId('click'),
      linkId: link.id,
      at: stampOf(this.adapters.clock()),
      referrer: input.referrer ?? 'direct / none',
      country: input.country ?? 'unknown',
      device: input.device ?? 'unknown',
    })
    await this.save()
    return next
  }

  /** The chart the dashboard shows: the thirty totals and the total. */
  overview(): { series: number[]; labels: string[]; total: number; ctr: string; active: number; topReferrer: string } {
    const series = this.series()
    const stats = this.stats()
    return { series, labels: this.labels(), total: stats.clicks, ctr: `${stats.ctr.toFixed(2)}%`, active: stats.active, topReferrer: stats.topReferrer }
  }

  totalText(value: number): string {
    return number(value)
  }

  when(stamp: string): string {
    return whenText(stamp, this.now)
  }

  today(): string {
    return dayOf(this.now)
  }

  private async save(): Promise<void> {
    this.state = { ...this.state, links: [...this.state.links], domains: [...this.state.domains], referrers: [...this.state.referrers], events: [...this.state.events] }
    await this.adapters.store.save(this.state)
  }
}
