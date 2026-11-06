/** Link Shortener's types and pure rules: links, domains, click events and the numbers the dashboard shows. */
export interface ShortLink {
  readonly id: string
  readonly slug: string
  readonly destinationUrl: string
  readonly title: string
  readonly tags: readonly string[]
  readonly createdAt: string
  readonly expiresAt?: string
  readonly enabled: boolean
  readonly views: number
  readonly clicks: number
  /** The clicks on each of the last thirty days, oldest first; the last one is today. */
  readonly daily: readonly number[]
}

export interface Domain {
  readonly id: string
  readonly hostname: string
  readonly verified: boolean
  readonly default: boolean
}

export interface ReferrerStat {
  readonly source: string
  readonly clicks: number
}

export interface ClickEvent {
  readonly id: string
  readonly linkId: string
  readonly at: string
  readonly referrer: string
  readonly country: string
  readonly device: string
}

export interface ShortlyState {
  readonly version: 1
  links: ShortLink[]
  domains: Domain[]
  referrers: ReferrerStat[]
  events: ClickEvent[]
  /** The previous 30-day period, for the mockup's deltas. */
  readonly previousClicks: number
  readonly previousViews: number
}

export type ShortlyErrorCode = 'invalid' | 'not-found' | 'conflict'
export class ShortlyError extends Error {
  readonly code: ShortlyErrorCode
  constructor(code: ShortlyErrorCode, message: string) {
    super(message)
    this.code = code
    this.name = 'ShortlyError'
  }
}

const pad = (n: number): string => String(n).padStart(2, '0')
export const dayOf = (date: Date): string => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
export const stampOf = (date: Date): string => `${dayOf(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`

export function whenText(stamp: string, now: Date): string {
  const minutes = Math.floor((now.getTime() - new Date(stamp).getTime()) / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  if (hours < 48) return 'Yesterday'
  return `${Math.floor(hours / 24)}d ago`
}

/** A destination as the form accepts it: an absolute http(s) URL without spaces. */
export function validateUrl(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') throw new ShortlyError('invalid', 'The destination URL is required.')
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    throw new ShortlyError('invalid', 'Enter an absolute URL, for example https://example.com/page.')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new ShortlyError('invalid', 'The destination must start with http:// or https://.')
  return url.toString()
}

/** A custom alias, or undefined when it is empty; lower case letters, digits and dashes, 3 to 40. */
export function cleanSlug(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  const text = String(value).trim().toLowerCase()
  if (text === '') return undefined
  if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/u.test(text)) throw new ShortlyError('invalid', 'An alias is 3 to 40 letters, digits or dashes, and starts and ends with a letter or digit.')
  return text
}

/** The link's public short URL on the default domain. */
export function shortUrl(link: ShortLink, domain: Domain): string {
  return `https://${domain.hostname}/${link.slug}`
}

export function isExpired(link: ShortLink, now: Date): boolean {
  return link.expiresAt !== undefined && new Date(`${link.expiresAt}T23:59:59`).getTime() < now.getTime()
}

export function isActive(link: ShortLink, now: Date): boolean {
  return link.enabled && !isExpired(link, now)
}

export interface LinkFilter {
  readonly q?: string
  readonly state?: 'active' | 'expired' | 'disabled'
}

export function filterLinks(links: readonly ShortLink[], filter: LinkFilter, now: Date): ShortLink[] {
  const q = (filter.q ?? '').trim().toLowerCase()
  return links
    .filter((link) => filter.state === undefined || (filter.state === 'active' ? isActive(link, now) : filter.state === 'expired' ? isExpired(link, now) : !link.enabled))
    .filter((link) => q === '' || [link.slug, link.destinationUrl, link.title, ...link.tags].join(' ').toLowerCase().includes(q))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export interface LinkStats {
  readonly clicks: number
  readonly active: number
  readonly topReferrer: string
  readonly ctr: number
  readonly createdThisWeek: number
  readonly clickDelta: number
  readonly ctrDelta: number
  readonly total: number
}

export function statsOf(state: ShortlyState, now: Date): LinkStats {
  const views = state.links.reduce((sum, link) => sum + link.views, 0)
  const clicks = state.links.reduce((sum, link) => sum + link.clicks, 0)
  const ctr = views === 0 ? 0 : (clicks / views) * 100
  const previousCtr = state.previousViews === 0 ? 0 : (state.previousClicks / state.previousViews) * 100
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString()
  return {
    clicks,
    active: state.links.filter((link) => isActive(link, now)).length,
    topReferrer: state.referrers[0]?.source ?? 'None',
    ctr,
    createdThisWeek: state.links.filter((link) => link.createdAt >= weekAgo).length,
    clickDelta: state.previousClicks === 0 ? 0 : ((clicks - state.previousClicks) / state.previousClicks) * 100,
    ctrDelta: ctr - previousCtr,
    total: state.links.length,
  }
}

/** The thirty daily totals, oldest first, for all links or one. */
export function seriesOf(links: readonly ShortLink[], linkId?: string): number[] {
  const chosen = linkId === undefined ? links : links.filter((link) => link.id === linkId)
  return Array.from({ length: 30 }, (_, index) => chosen.reduce((sum, link) => sum + (link.daily[index] ?? 0), 0))
}

/** The short day labels for the last thirty days, e.g. `Mon 05`. */
export function dayLabels(now: Date): string[] {
  return Array.from({ length: 30 }, (_, index) => {
    const date = new Date(now)
    date.setDate(date.getDate() - (29 - index))
    return date.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit' })
  })
}

/** `28,491`. */
export function number(value: number, digits = 0): string {
  return new Intl.NumberFormat('en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)
}

export function percent(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`
}
