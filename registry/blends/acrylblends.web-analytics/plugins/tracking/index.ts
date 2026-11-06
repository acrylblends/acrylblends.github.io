/**
 * Tracking: the endpoint the site's snippet posts page views to, and the setup page with the snippet, the property and its install state.
 *
 * Routes (under the shell's prefix): POST /collect (JSON, CORS), OPTIONS /collect, GET /settings/tracking?property,
 * POST /settings/tracking/properties.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { AnalyticsError, trackingSnippet, whenText } from '../analytics/index.ts'

export const name = 'tracking'
export const inject = ['analytics', 'shell', 'router']

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'cache-control': 'no-store',
}

export function apply(ctx: Context): void {
  const { analytics, shell } = ctx
  const e = shell.e
  const prefix = shell.prefix

  const page = (read: (name: string) => string | undefined, requestUrl: string, error?: string, ok?: string): string => {
    const requested = read('property')
    const property = (requested === undefined ? undefined : analytics.property(requested)) ?? analytics.first()
    const origin = new URL(requestUrl).origin
    const baseUrl = `${origin}${prefix}`
    if (property === undefined)
      return `<header><div><small>CONFIGURE / TRACKING SETUP</small><h1>Tracking setup</h1><p>Add a property to get its snippet.</p></div></header><form class="a-form" method="post" action="${shell.href('/settings/tracking/properties')}"><h2>Add a property</h2><p class="hint">A domain the snippet will run on.</p><label>DOMAIN<input name="domain" required placeholder="northstar.app"></label><div class="actions"><button class="primary">Add property</button></div></form>`
    const state = analytics.installState(property)
    const last = analytics.lastEvent(property.id)
    const snippet = trackingSnippet(property.trackingId, baseUrl)
    const properties = analytics.properties().map((item) => `<option value="${e(item.id)}"${item.id === property.id ? ' selected' : ''}>${e(item.domain)}</option>`).join('')
    return `<header><div><small>CONFIGURE / TRACKING SETUP</small><h1>Tracking setup</h1><p>${e(property.domain)} · ${state === 'active' ? 'events are arriving' : 'waiting for the first event'}</p></div><span class="a-tracking-status"><i></i>${state === 'active' ? 'Tracking active' : 'Not installed yet'}</span></header>${error === undefined ? '' : `<p class="notice error" role="alert">${e(error)}</p>`}${ok === undefined ? '' : `<p class="notice ok" role="status">${e(ok)}</p>`}<form method="get" action="${shell.href('/settings/tracking')}" style="margin-top:12px"><select name="property" onchange="this.form.submit()" style="border:1px solid var(--line);border-radius:4px;padding:6px;font-size:8px;background:white">${properties}</select></form><section class="a-section" style="margin-top:12px"><header><b>${state === 'active' ? 'Events arriving' : 'No events yet'}</b><small>${last === undefined ? 'The snippet has not posted yet' : `Last event ${e(whenText(last.at, new Date()))}`}</small></header><div style="padding:15px"><p style="font-size:9px;color:#6b7c78;margin:0 0 10px">Paste this before <code>&lt;/body&gt;</code> on ${e(property.domain)}. It sends a page view and a session id; the app stores neither the ip nor any cookie.</p><div class="a-snippet"><button data-copy="snippet">Copy snippet</button><pre id="snippet" style="margin:0">${e(snippet)}</pre></div><p class="a-note">Tracking id: <code>${e(property.trackingId)}</code> · Collect URL: <code>${e(baseUrl)}/collect</code></p></div></section><form class="a-form" method="post" action="${shell.href('/settings/tracking/properties')}"><h2>Add another property</h2><p class="hint">Each property has its own tracking id and its own reports.</p><label>DOMAIN<input name="domain" required placeholder="another.app"></label><div class="actions"><button class="primary">Add property</button><a href="${shell.href('/overview')}">Back to the overview</a></div></form><p class="a-note">Privacy: the snippet sends the path, the referrer and a random session id kept in local storage. No ip address, no cookie and no cross-site id is stored.</p>`
  }

  const app = new Acryl()
    .options('/collect', (c) => c.body(null, 204, CORS))
    .post('/collect', async (c) => {
      let body: unknown
      try {
        body = await c.req.json()
      } catch {
        return c.json({ error: 'invalid json' }, 400, CORS)
      }
      const record = typeof body === 'object' && body !== null ? body as Record<string, unknown> : {}
      try {
        const event = await analytics.collect(String(record.trackingId ?? ''), { path: record.path, referrer: record.referrer, sessionId: record.sessionId })
        return c.json({ ok: true, id: event.id }, 202, CORS)
      } catch (error) {
        if (!(error instanceof AnalyticsError)) throw error
        return c.json({ error: error.message }, 400, CORS)
      }
    })
    .get('/settings/tracking', (c) => c.html(shell.page({ active: 'tracking', title: 'Tracking setup', crumbs: ['Configure', 'Tracking setup'], main: page((name) => c.req.query(name), c.req.url, c.req.query('error'), c.req.query('ok')) })))
    .post('/settings/tracking/properties', async (c) => {
      const form = await c.req.parseBody()
      try {
        const property = await analytics.createProperty(String(form.domain ?? ''))
        return c.redirect(shell.url(`/settings/tracking?property=${encodeURIComponent(property.id)}`, { kind: 'ok', text: `${property.domain} was added. Paste its snippet to start receiving page views.` }), 303)
      } catch (error) {
        if (!(error instanceof AnalyticsError)) throw error
        return c.html(shell.page({ active: 'tracking', title: 'Tracking setup', crumbs: ['Configure', 'Tracking setup'], main: page(() => undefined, c.req.url, error.message) }))
      }
    })

  ctx.router.route(prefix === '' ? '/' : prefix, app)
  ctx.effect(() => shell.nav({ id: 'tracking', label: 'Tracking setup', icon: '⌗', path: '/settings/tracking', order: 30, group: 'CONFIGURE' }))
}
