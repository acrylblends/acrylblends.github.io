import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import { createApp, readManifest } from '../src/app.ts'
import { pinnedInstance } from '../plugins/instance/index.ts'
import { cleanSlug, filterLinks, Shortly, ShortlyError, statsOf, validateUrl } from '../plugins/shortly/index.ts'
import type { ShortlyState } from '../plugins/shortly/domain.ts'
import { memoryStore } from '../plugins/shortly/store.ts'
import { seed } from '../plugins/shortly/seed.ts'
import { NOW, noticeOf, projectRoot, withApp } from './support.ts'
const scratch = join(projectRoot, '.acrylblends', 'test')
mkdirSync(scratch, { recursive: true })
const newId = (kind: string): string => `${kind}-${Math.random().toString(36).slice(2, 8)}`

test('a destination must be an absolute http(s) URL and an alias is short and clean', () => {
  assert.equal(validateUrl('https://acme.studio/a b'), 'https://acme.studio/a%20b')
  assert.throws(() => validateUrl('not a url'), /absolute URL/)
  assert.throws(() => validateUrl('ftp://example.com/x'), /http/)
  assert.equal(cleanSlug(' Autumn '), 'autumn')
  assert.equal(cleanSlug(''), undefined)
  assert.throws(() => cleanSlug('a'), /3 to 40/)
})

test('the seed is the mockup workspace: 39 links, 36 active, 28,491 clicks and its deltas', () => {
  const state = seed(NOW, newId)
  assert.equal(state.links.length, 39)
  assert.equal(state.domains.length, 3)
  assert.equal(state.links.reduce((sum, link) => sum + link.clicks, 0), 28_491)
  const stats = statsOf(state, NOW)
  assert.equal(stats.clicks, 28_491)
  assert.ok(Math.abs(stats.ctr - 4.82) < 0.02)
  assert.equal(stats.active, 36)
  assert.equal(stats.createdThisWeek, 6)
  assert.equal(stats.clickDelta.toFixed(1), '12.8')
  assert.equal(stats.ctrDelta.toFixed(1), '0.6')
  assert.equal(state.links.filter((link) => !link.enabled).length, 1)
  assert.equal(state.referrers.reduce((sum, item) => sum + item.clicks, 0), 28_491)
  assert.equal(state.events.length, 120)
})

test('filters find a link by text and state', () => {
  const state = seed(NOW, newId)
  assert.ok(filterLinks(state.links, { q: 'pricing' }, NOW).length >= 1)
  assert.ok(filterLinks(state.links, { state: 'disabled' }, NOW).every((link) => !link.enabled))
  assert.equal(filterLinks(state.links, { state: 'expired' }, NOW).length, 2)
})

async function open(): Promise<Shortly> {
  let ids = 0
  return Shortly.open({ store: memoryStore(), clock: () => NOW, newId: (kind) => `${kind}-${++ids}` })
}

test('creating a link validates, uses the alias and refuses a duplicate', async () => {
  const store = memoryStore<ShortlyState>()
  let ids = 0
  const shortly = await Shortly.open({ store, clock: () => NOW, newId: (kind) => `${kind}-${++ids}` })
  const link = await shortly.create({ destinationUrl: 'https://example.com/page', alias: 'new-page' })
  assert.equal(link.slug, 'new-page')
  assert.equal(link.enabled, true)
  assert.equal(link.clicks, 0)
  assert.match(shortly.shortUrl(link), /^https:\/\/go\.acme\.to\/new-page$/)
  await assert.rejects(shortly.create({ destinationUrl: 'https://example.com/other', alias: 'new-page' }), (error: unknown) => error instanceof ShortlyError && error.code === 'conflict')
  await assert.rejects(shortly.create({ destinationUrl: 'nope' }), /absolute URL/)
})

test('the redirect records a click and a disabled link refuses it', async () => {
  const shortly = await open()
  const link = shortly.links().find((item) => item.slug === 'autumn')
  assert.ok(link !== undefined)
  const before = link.clicks
  const clicked = await shortly.recordClick('autumn', { referrer: 'instagram.com', country: 'DE', device: 'mobile' })
  assert.equal(clicked.clicks, before + 1)
  assert.equal(shortly.events(link.id)[0]?.referrer, 'instagram.com')
  const disabled = shortly.links().find((item) => !item.enabled)
  assert.ok(disabled !== undefined)
  await assert.rejects(shortly.recordClick(disabled.slug), /disabled or expired/)
  const toggled = await shortly.toggle(disabled.id)
  assert.equal(toggled.enabled, true)
})

test('the overview page shows the composer, the totals and the recent links', () =>
  withApp(async (app) => {
    const page = await app.page('/')
    assert.equal(page.status, 200)
    assert.match(page.html, /Your links, in one place\./)
    assert.match(page.html, /Create short link/)
    assert.match(page.html, /28,491/)
    assert.match(page.html, /go\.acme\.to\/autumn/)
    assert.match(page.html, /href="\/links\/link-/)
    assert.match(page.html, /Top referrers/)
    assert.match(page.html, /36/)
    assert.match(page.html, /6 created this week/)
    assert.match(page.html, /12.8% vs previous period/)
  }))

test('the form creates a link and an invalid destination says why', () =>
  withApp(async (app) => {
    const invalid = await app.post('/links', { destinationUrl: 'not a url', alias: '' })
    assert.equal(noticeOf(invalid).kind, 'error')
    const created = await app.post('/links', { destinationUrl: 'https://example.com/new', alias: 'new-link' })
    assert.equal(created.status, 303)
    assert.equal(noticeOf(created).kind, 'ok')
    const link = app.root.shortly.links().find((item) => item.slug === 'new-link')
    assert.ok(link !== undefined)
    assert.match((await app.page(`/links/${link.id}`)).html, /new-link/)
  }))

test('a link detail shows its chart and the toggle disables it', () =>
  withApp(async (app) => {
    const link = app.root.shortly.links().find((item) => item.slug === 'pricing')
    assert.ok(link !== undefined)
    const page = await app.page(`/links/${link.id}`)
    assert.match(page.html, /Click activity/)
    assert.match(page.html, /Referrers/)
    assert.match(page.html, /Countries/)
    const toggled = await app.post(`/links/${link.id}/toggle`, { back: `/links/${link.id}` })
    assert.equal(noticeOf(toggled).kind, 'ok')
    assert.equal(app.root.shortly.link(link.id)?.enabled, false)
  }))

test('the short URL redirects and counts the click', () =>
  withApp(async (app) => {
    const link = app.root.shortly.links().find((item) => item.slug === 'webinar')
    assert.ok(link !== undefined)
    const before = link.clicks
    const response = await app.root.router.request('/s/webinar', { redirect: 'manual' })
    assert.equal(response.status, 302)
    assert.equal(response.headers.get('location'), link.destinationUrl)
    assert.equal(app.root.shortly.link(link.id)?.clicks, before + 1)
    const missing = await app.root.router.request('/s/nope')
    assert.equal(missing.status, 404)
  }))

test('the campaigns page lists the workspace tags')
  withApp(async (app) => {
    const page = await app.page('/campaigns')
    assert.equal(page.status, 200)
    assert.match(page.html, /Campaigns/)
    assert.match(page.html, /campaign/)
    assert.match(page.html, /resources/)
  })

test('the domains page lists the domains', () =>
  withApp(async (app) => {
    const page = await app.page('/domains')
    assert.equal(page.status, 200)
    assert.match(page.html, /go\.acme\.to/)
    assert.match(page.html, /Pending verification/)
  }))

test('health, 404, manifest and the prefix work; assets off leaves the app running', async () => {
  await withApp(async (app) => {
    assert.equal((await app.page('/health')).status, 200)
    assert.equal((await app.page('/nope')).status, 404)
    assert.deepEqual(readManifest().plugins.map((row) => row.id), ['router', 'home', 'shortly', 'shortly-shell', 'links', 'campaigns', 'domains', 'extensions', 'server', 'acryl-door'])
  })
  await withApp(
    async (app) => {
      const page = await app.page('/links')
      assert.match(page.html, /href="\/app\/domains"/)
    },
    { prefix: '/app' },
  )
  const manifest = readManifest()
  const without = { ...manifest, plugins: manifest.plugins.map((row) => (row.id === 'domains' ? { ...row, disabled: true } : row)) }
  const home = await mkdtemp(join(scratch, 'app-test-off-'))
  let ids = 0
  const app = await createApp(pinnedInstance(home, { root: projectRoot }), { listen: false, manifest: without, overrides: { shortly: { clock: () => NOW, newId: (kind: string) => `${kind}-${++ids}` } } })
  try {
    const page = await app.root.router.request('/', { headers: { accept: 'text/html' } })
    assert.equal(page.status, 200)
    assert.equal((await app.root.router.request('/domains')).status, 404)
  } finally {
    await app.stop()
    await rm(home, { recursive: true, force: true })
  }
})

test('the status filters split active, expired and disabled links, and an unmatched search is empty', () =>
  withApp(async (app) => {
    const active = await app.page('/links?state=active')
    assert.match(active.html, /go\.acme\.to\/autumn/)
    assert.doesNotMatch(active.html, /spring-sale/)
    const expired = await app.page('/links?state=expired')
    assert.match(expired.html, /spring-sale/)
    assert.doesNotMatch(expired.html, /go\.acme\.to\/autumn/)
    const disabled = await app.page('/links?state=disabled')
    assert.match(disabled.html, /newsletter/)
    const empty = await app.page('/links?q=nothing-matches-anything')
    assert.match(empty.html, /No links match/)
  }))

test('a link detail shows the referrer and country breakdowns and the short URL', () =>
  withApp(async (app) => {
    const link = app.root.shortly.links().find((item) => item.slug === 'autumn')
    assert.ok(link !== undefined)
    const page = await app.page(`/links/${link.id}`)
    assert.equal(page.status, 200)
    assert.match(page.html, /Referrers/)
    assert.match(page.html, /Countries/)
    assert.match(page.html, /instagram\.com/)
    assert.match(page.html, /Short link|go\.acme\.to\/autumn/)
    assert.match(page.html, /Disable/)
  }))

test('campaigns list the tags with their links and clicks', () =>
  withApp(async (app) => {
    const page = await app.page('/campaigns')
    assert.equal(page.status, 200)
    assert.match(page.html, /Campaigns/)
    assert.match(page.html, /campaign/)
    assert.match(page.html, /resources/)
    assert.match(page.html, /Open in Links/)
  }))

test('switching campaigns off removes only that page', async () => {
  const manifest = readManifest()
  const without = { ...manifest, plugins: manifest.plugins.map((row) => (row.id === 'campaigns' ? { ...row, disabled: true } : row)) }
  const home = await mkdtemp(join(scratch, 'app-test-off-campaigns-'))
  let ids = 0
  const app = await createApp(pinnedInstance(home, { root: projectRoot }), { listen: false, manifest: without, overrides: { shortly: { clock: () => NOW, newId: (kind: string) => `${kind}-${++ids}` } } })
  try {
    assert.equal((await app.root.router.request('/campaigns')).status, 404)
    assert.equal((await app.root.router.request('/', { headers: { accept: 'text/html' } })).status, 200)
  } finally {
    await app.stop()
    await rm(home, { recursive: true, force: true })
  }
})
