/**
 * The link workspace: the create composer, the KPI strip, the recent links, the click chart and the referrers, plus one link's detail and the
 * redirect that records a click.
 *
 * Routes: GET /, GET /links?q&state, GET /links/:id, POST /links, POST /links/:id/toggle, GET /s/:slug.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { type ShortLink, ShortlyError, number, percent, whenText } from '../shortly/index.ts'

export const name = 'links'
export const inject = ['shortly', 'shell', 'router']

function pathOf(values: readonly number[], width = 470, height = 185): string {
  const max = Math.max(...values, 1)
  return values.map((value, index) => `${index === 0 ? 'M' : 'L'}${((index / Math.max(1, values.length - 1)) * width).toFixed(1)} ${(height - (value / max) * height).toFixed(1)}`).join(' ')
}

const stateOf = (link: ShortLink, shortly: { isExpired(link: ShortLink): boolean }): string => (!link.enabled ? 'Disabled' : shortly.isExpired(link) ? 'Expired' : 'Active')

export function apply(ctx: Context): void {
  const { shortly, shell } = ctx
  const e = shell.e
  const prefix = shell.prefix

  const row = (link: ShortLink): string => {
    const url = shortly.shortUrl(link)
    return `<div class="linkrow"><div class="url"><b><a href="${shell.href(`/links/${encodeURIComponent(link.id)}`)}">${e(url.replace('https://', ''))}</a></b><small>${e(link.destinationUrl)}</small></div><div class="clicks">${number(link.clicks)}</div><div class="meta">${e(whenText(link.createdAt, shortly.now))}</div><div class="state">${e(stateOf(link, shortly))}</div><button class="dots" data-copy="short-${e(link.id)}" aria-label="Copy ${e(url)}">⧉</button><span id="short-${e(link.id)}" hidden>${e(url)}</span></div>`
  }

  const chart = (series: readonly number[], labels: readonly string[]): string => {
    const line = pathOf(series)
    const area = `${line} L470 185 L0 185 Z`
    return `<div class="chart"><div class="charttop"><div><small>CLICK ACTIVITY · 30 DAYS</small><div><strong>${number(series.reduce((sum, value) => sum + value, 0))}</strong> <small style="color:#1b8d62">last 30 days</small></div></div><span class="btn">Daily</span></div><svg viewBox="0 0 470 190" preserveAspectRatio="none" aria-label="Clicks chart"><defs><linearGradient id="fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#3ab27e" stop-opacity=".24"/><stop offset="1" stop-color="#3ab27e" stop-opacity="0"/></linearGradient></defs><g stroke="#eef2ee" stroke-width="1"><path d="M0 25H470M0 68H470M0 111H470M0 154H470"/></g><path d="${area}" fill="url(#fill)"/><path d="${line}" fill="none" stroke="#168a62" stroke-width="2.5"/></svg><div class="legend"><span><i></i>Clicks</span><span>${e(labels[0] ?? '')}</span><span>${e(labels[10] ?? '')}</span><span>${e(labels[20] ?? '')}</span><span>${e(labels[29] ?? '')}</span></div></div>`
  }

  const referrers = (): string => {
    const items = shortly.referrers()
    const total = items.reduce((sum, item) => sum + item.clicks, 0)
    const top = Math.max(1, ...items.map((item) => item.clicks))
    return `<div class="referrers">${items.map((item) => `<div class="ref"><span>${e(item.source)}</span><div class="bar"><i style="width:${percent((item.clicks / top) * 100, 0)}"></i></div><b>${percent((item.clicks / Math.max(1, total)) * 100, 0)}</b></div>`).join('')}</div>`
  }

  const breakdown = (title: string, items: readonly { readonly label: string; readonly count: number }[]): string => {
    const top = Math.max(1, ...items.map((item) => item.count))
    const total = items.reduce((sum, item) => sum + item.count, 0)
    return `<h2 style="margin-top:16px">${e(title)}</h2>${items.length === 0 ? '<p class="empty">No click events yet.</p>' : items.map((item) => `<div class="ref"><span>${e(item.label)}</span><div class="bar"><i style="width:${percent((item.count / top) * 100, 0)}"></i></div><b>${percent((item.count / Math.max(1, total)) * 100, 0)}</b></div>`).join('')}`
  }
  const countsOf = (events: readonly { referrer: string; country: string }[], key: 'referrer' | 'country'): { label: string; count: number }[] => {
    const counts = new Map<string, number>()
    for (const event of events) counts.set(event[key], (counts.get(event[key]) ?? 0) + 1)
    return [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count)
  }

  const overview = (read: (name: string) => string | undefined, url: string): string => {
    const q = (read('q') ?? '').slice(0, 100)
    const stateText = read('state')
    const state = stateText === 'active' || stateText === 'expired' || stateText === 'disabled' ? stateText : undefined
    const list = shortly.links({ q, ...(state === undefined ? {} : { state }) })
    const stats = shortly.stats()
    const series = shortly.series()
    const main = `${shell.notice(url)}<div class="head"><div><small>WORKSPACE / LINK PERFORMANCE</small><h1>Your links, in one place.</h1><p>Create memorable short links and understand which channels bring people back.</p></div><a class="btn" href="${shell.href('/links')}">Last 30 days⌄</a></div><form class="create" method="post" action="${shell.href('/links')}"><div><label for="dest">DESTINATION URL</label><input id="dest" name="destinationUrl" type="text" inputmode="url" placeholder="https://example.com/your-long-page" required></div><div><label for="alias">CUSTOM ALIAS (OPTIONAL)</label><input id="alias" name="alias" placeholder="autumn-launch"></div><button type="submit">Create short link ↗</button></form><section class="grid"><article class="card"><small>TOTAL CLICKS</small><strong>${number(stats.clicks)}</strong><span>↑ ${stats.clickDelta.toFixed(1)}% vs previous period</span></article><article class="card"><small>ACTIVE LINKS</small><strong>${String(stats.active)}</strong><span>${String(stats.createdThisWeek)} created this week</span></article><article class="card"><small>TOP CHANNEL</small><strong style="font-size:19px;margin-top:13px">${e(stats.topReferrer === 'instagram.com' ? 'Instagram' : stats.topReferrer === 'google.com' ? 'Google' : stats.topReferrer === 'linkedin.com' ? 'LinkedIn' : stats.topReferrer)}</strong><span>${percent((shortly.referrers()[0]?.clicks ?? 0) / Math.max(1, stats.clicks) * 100, 0)} of all clicks</span></article><article class="card"><small>AVG. CTR</small><strong>${percent(stats.ctr, 2)}</strong><span>↑ ${stats.ctrDelta.toFixed(1)} percentage points</span></article></section><div class="split"><section class="panel"><div class="panelhead"><div><h2>Recent links</h2><small>Manage, copy and inspect your short URLs</small></div><div class="spacer"></div><form method="get" action="${shell.href('/links')}"><input name="q" value="${e(q)}" placeholder="Search links…" aria-label="Search links"></form></div><div class="rows">${list.length === 0 ? '<p class="empty">No links match. <a href="/links">Clear the search</a>.</p>' : list.slice(0, 5).map(row).join('')}</div></section><section class="panel">${chart(series, shortly.labels())}<div class="panelhead" style="border-top:1px solid #edf1ed"><div><h2>Top referrers</h2><small>Traffic source distribution</small></div></div>${referrers()}</section></div>`
    return shell.page({ active: 'overview', title: 'Link overview', main })
  }

  const detail = (link: ShortLink, url: string): string => {
    const short = shortly.shortUrl(link)
    const series = shortly.series(link.id)
    const events = shortly.events(link.id)
    const ctr = link.views === 0 ? 0 : (link.clicks / link.views) * 100
    const main = `${shell.notice(url)}<div class="head"><div><small>WORKSPACE / LINKS</small><h1>${e(link.title)}</h1><p>${e(short)} → ${e(link.destinationUrl)}</p></div><div class="actions"><button class="btn" data-copy="short-url">Copy short link</button><span id="short-url" hidden>${e(short)}</span><form method="post" action="${shell.href(`/links/${encodeURIComponent(link.id)}/toggle`)}"><input type="hidden" name="back" value="${e(url)}"><button class="btn" type="submit">${link.enabled ? 'Disable' : 'Enable'}</button></form></div></div><section class="grid"><article class="card"><small>CLICKS</small><strong>${number(link.clicks)}</strong><span>all time</span></article><article class="card"><small>VIEWS</small><strong>${number(link.views)}</strong><span>all time</span></article><article class="card"><small>CTR</small><strong>${percent(ctr, 2)}</strong><span>clicks of views</span></article><article class="card"><small>STATE</small><strong style="font-size:19px;margin-top:13px">${e(stateOf(link, shortly))}</strong><span>created ${e(whenText(link.createdAt, shortly.now))}</span></article></section><div class="detail-grid"><section><h2>Click activity · 30 days</h2>${chart(series, shortly.labels())}</section><section><h2>Recent clicks</h2>${events.length === 0 ? '<p class="empty">No clicks recorded yet. Open the short link to record one.</p>' : events.map((event) => `<div class="meter"><span>${e(event.referrer)}</span><b>${e(event.country)} · ${e(event.device)} · ${e(whenText(event.at, shortly.now))}</b></div>`).join('')}<h2 style="margin-top:16px">The link</h2><p style="font-size:9px;color:#657570">Destination: ${e(link.destinationUrl)}<br>Alias: ${e(link.slug)}<br>${link.expiresAt === undefined ? 'No expiry' : `Expires ${e(link.expiresAt)}`}</p>${breakdown('Referrers', countsOf(events, 'referrer'))}${breakdown('Countries', countsOf(events, 'country'))}</section></div>`
    return shell.page({ active: 'links', title: link.title, main })
  }

  const app = new Acryl()
    .get('/', (c) => c.html(overview((name) => c.req.query(name), c.req.url)))
    .get('/links', (c) => c.html(overview((name) => c.req.query(name), c.req.url)))
    .get('/links/:id', (c) => {
      const link = shortly.link(c.req.param('id'))
      if (link === undefined) return c.redirect(shell.url('/links', { kind: 'error', text: 'That link no longer exists.' }), 303)
      return c.html(detail(link, c.req.url))
    })
    .post('/links', async (c) => {
      const form = await c.req.parseBody()
      try {
        const link = await shortly.create({ destinationUrl: String(form.destinationUrl ?? ''), alias: String(form.alias ?? '') })
        return c.redirect(shell.url(`/links/${encodeURIComponent(link.id)}`, { kind: 'ok', text: `${shortly.shortUrl(link)} was created.` }), 303)
      } catch (error) {
        if (!(error instanceof ShortlyError)) throw error
        return c.redirect(shell.url('/', { kind: 'error', text: error.message }), 303)
      }
    })
    .post('/links/:id/toggle', async (c) => {
      const form = await c.req.parseBody()
      const back = shell.back(form.back, `/links/${encodeURIComponent(c.req.param('id'))}`)
      try {
        const link = await shortly.toggle(c.req.param('id'))
        return c.redirect(shell.url(back, { kind: 'ok', text: link.enabled ? 'The link is enabled.' : 'The link is disabled.' }), 303)
      } catch (error) {
        if (!(error instanceof ShortlyError)) throw error
        return c.redirect(shell.url(back, { kind: 'error', text: error.message }), 303)
      }
    })
    .get('/s/:slug', async (c) => {
      const link = shortly.bySlug(c.req.param('slug'))
      if (link === undefined) return c.text('This short link does not exist.', 404)
      try {
        await shortly.recordClick(link.slug, { referrer: c.req.header('referer') === undefined ? 'direct / none' : new URL(c.req.header('referer') as string).hostname })
        return c.redirect(link.destinationUrl, 302)
      } catch (error) {
        if (!(error instanceof ShortlyError)) throw error
        return c.text(error.message, 410)
      }
    })

  ctx.router.route(prefix === '' ? '/' : prefix, app)
  ctx.effect(() => shell.nav({ id: 'overview', label: 'Overview', icon: '', path: '/', order: 10 }))
  ctx.effect(() => shell.nav({ id: 'links', label: 'Links', icon: '', path: '/links', order: 20 }))
}
