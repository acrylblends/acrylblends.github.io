/** The workspace a new install starts with: eight links, three domains, referrer totals and five recent click events. */
import type { ClickEvent, Domain, ReferrerStat, ShortLink, ShortlyState } from './domain.ts'
import { stampOf } from './domain.ts'

function distribute(total: number, seed: number): number[] {
  const jitter = (n: number): number => {
    const value = Math.sin(n * 12.9898 + seed * 78.233) * 43_758.5453
    return value - Math.floor(value)
  }
  const weights = Array.from({ length: 30 }, (_, index) => (1 + index * 0.045) * (0.7 + jitter(index) * 0.6))
  const sum = weights.reduce((carry, weight) => carry + weight, 0)
  const values = weights.map((weight) => Math.round((weight / sum) * total))
  const difference = total - values.reduce((carry, value) => carry + value, 0)
  values[values.length - 1] = (values[values.length - 1] ?? 0) + difference
  return values
}

interface LinkSeed {
  readonly slug: string
  readonly destinationUrl: string
  readonly title: string
  readonly tags: readonly string[]
  readonly clicks: number
  readonly views: number
  readonly hoursAgo: number
  readonly enabled?: boolean
  readonly expiresAt?: string
}

const LINKS: readonly LinkSeed[] = [
  { slug: 'autumn', destinationUrl: 'https://acme.studio/autumn-collection-2026', title: 'Autumn collection', tags: ['campaign', 'instagram'], clicks: 8421, views: 174_700, hoursAgo: 2 },
  { slug: 'pricing', destinationUrl: 'https://acme.studio/pricing', title: 'Pricing', tags: ['site'], clicks: 6108, views: 126_700, hoursAgo: 26 },
  { slug: 'webinar', destinationUrl: 'https://events.acme.studio/november-webinar', title: 'November webinar', tags: ['events'], clicks: 4920, views: 102_000, hoursAgo: 50 },
  { slug: 'guide', destinationUrl: 'https://acme.studio/resources/brand-guide.pdf', title: 'Brand guide', tags: ['resources'], clicks: 2814, views: 58_400, hoursAgo: 74 },
  { slug: 'partner', destinationUrl: 'https://acme.studio/partners', title: 'Partner programme', tags: ['partners'], clicks: 1203, views: 24_900, hoursAgo: 98 },
  { slug: 'launch', destinationUrl: 'https://acme.studio/launch-week', title: 'Launch week', tags: ['campaign'], clicks: 1900, views: 39_400, hoursAgo: 120 },
  { slug: 'jobs', destinationUrl: 'https://acme.studio/careers', title: 'Careers', tags: ['site'], clicks: 1605, views: 33_300, hoursAgo: 200 },
  { slug: 'newsletter', destinationUrl: 'https://acme.studio/newsletter', title: 'Newsletter', tags: ['email'], clicks: 1520, views: 31_500, hoursAgo: 300, enabled: false },
]

export function seed(now: Date, newId: (kind: string) => string): ShortlyState {
  const at = (hoursAgo: number): string => stampOf(new Date(now.getTime() - hoursAgo * 3_600_000))
  const domains: Domain[] = [
    { id: newId('domain'), hostname: 'go.acme.to', verified: true, default: true },
    { id: newId('domain'), hostname: 'acme.link', verified: true, default: false },
    { id: newId('domain'), hostname: 'short.acme.to', verified: false, default: false },
  ]
  const links: ShortLink[] = LINKS.map((item, index) => ({
    id: newId('link'),
    slug: item.slug,
    destinationUrl: item.destinationUrl,
    title: item.title,
    tags: [...item.tags],
    createdAt: at(item.hoursAgo),
    ...(item.expiresAt === undefined ? {} : { expiresAt: item.expiresAt }),
    enabled: item.enabled !== false,
    views: item.views,
    clicks: item.clicks,
    daily: distribute(item.clicks, index + 1),
  }))
  for (let index = 0; index < 29; index += 1) {
    links.push({
      id: newId('link'),
      slug: `resource-${String(index + 1)}`,
      destinationUrl: `https://acme.studio/resources/page-${String(index + 1)}`,
      title: `Resource ${String(index + 1)}`,
      tags: ['resources'],
      createdAt: at(240 + index * 8),
      enabled: true,
      views: 0,
      clicks: 0,
      daily: Array.from({ length: 30 }, () => 0),
    })
  }
  links.push({
    id: newId('link'),
    slug: 'spring-sale',
    destinationUrl: 'https://acme.studio/spring-sale',
    title: 'Spring sale',
    tags: ['campaign', 'email'],
    createdAt: at(900),
    expiresAt: '2026-10-15',
    enabled: true,
    views: 0,
    clicks: 0,
    daily: Array.from({ length: 30 }, () => 0),
  })
  links.push({
    id: newId('link'),
    slug: 'winter-preview',
    destinationUrl: 'https://acme.studio/winter-preview',
    title: 'Winter preview',
    tags: ['campaign'],
    createdAt: at(1_100),
    expiresAt: '2026-10-01',
    enabled: true,
    views: 0,
    clicks: 0,
    daily: Array.from({ length: 30 }, () => 0),
  })
  const total = links.reduce((sum, link) => sum + link.clicks, 0)
  const referrers: ReferrerStat[] = [
    { source: 'instagram.com', clicks: Math.round(total * 0.31) },
    { source: 'google.com', clicks: Math.round(total * 0.24) },
    { source: 'direct / none', clicks: Math.round(total * 0.17) },
    { source: 'linkedin.com', clicks: Math.round(total * 0.12) },
    { source: 'other', clicks: total - Math.round(total * 0.31) - Math.round(total * 0.24) - Math.round(total * 0.17) - Math.round(total * 0.12) },
  ]
  const sources = ['instagram.com', 'google.com', 'direct / none', 'linkedin.com']
  const countries = ['DE', 'NL', 'GB', 'FR', 'ES', 'AT', 'US']
  const devices = ['mobile', 'desktop', 'tablet']
  const events: ClickEvent[] = []
  for (let index = 0; index < 5; index += 1) {
    const link = links[index] as ShortLink
    for (let sample = 0; sample < 24; sample += 1) {
      events.push({
        id: newId('click'),
        linkId: link.id,
        at: at(1 + sample * 1.1 + index * 2),
        referrer: sources[(index + sample) % sources.length] as string,
        country: countries[(index * 2 + sample) % countries.length] as string,
        device: devices[(index + sample) % devices.length] as string,
      })
    }
  }
  return { version: 1, links, domains, referrers, events, previousClicks: 25_258, previousViews: 598_500 }
}
