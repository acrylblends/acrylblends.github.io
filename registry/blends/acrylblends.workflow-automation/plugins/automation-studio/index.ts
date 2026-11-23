/**
 * Workflow Automation's screen as a plugin: the page at the app's root and at each of the screen's own paths (`/workflows/<id>`, `/runs`, ...), and the
 * bundle it loads. The screen is React with React Flow (the canvas Qadam Flow uses), built once into `client/dist` by `npm run build:studio` from
 * `client/src` (the only part of the app with a build step: React Flow needs React, which the framework's bundler-free client modules do not provide).
 *
 * Config: `prefix`, where the app is mounted (the frame's `/app`; src/app.ts passes it).
 */
import { readFileSync, statSync } from 'node:fs'
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../router/src/index.ts'
import type {} from '../automation/index.ts'

export const name = 'automation-studio'
export const inject = ['automation', 'router']

const dist = new URL('./client/dist/', import.meta.url)
const PAGES = ['/', '/workflows', '/workflows/:id', '/runs', '/runs/:id', '/connections', '/integrations'] as const

const escape = (text: string): string => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

/** The bundle's version for its URL, so a rebuilt bundle is fetched again (the page itself is never cached). */
const stamp = (file: string): string => { try { return String(Math.round(statSync(new URL(file, dist)).mtimeMs)) } catch { return '0' } }

export function studioPage(prefix: string, title = 'Workflow Automation'): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escape(title)}</title>
    <link rel="stylesheet" href="${prefix}/automation/studio.css?v=${stamp('studio.css')}">
  </head>
  <body>
    <div id="automation-studio" data-base="${escape(prefix)}"></div>
    <noscript>Workflow Automation needs JavaScript.</noscript>
    <script type="module" src="${prefix}/automation/studio.js?v=${stamp('studio.js')}"></script>
  </body>
</html>`
}

export function apply(ctx: Context, config: { readonly prefix?: string } = {}): void {
  const prefix = config.prefix ?? ''
  const asset = (file: string, type: string) => (c: { body: (data: Uint8Array, status: 200, headers: Record<string, string>) => Response, text: (t: string, s: 404) => Response }) => {
    try {
      return c.body(readFileSync(new URL(file, dist)), 200, { 'content-type': type, 'cache-control': 'public, max-age=31536000, immutable' })
    } catch {
      return c.text(`${file} is not built yet: run npm run build:studio`, 404)
    }
  }
  let app = new Acryl()
    .get('/health', (c) => c.json({ ok: true }))
    .get('/automation/studio.js', asset('studio.js', 'text/javascript; charset=utf-8') as never)
    .get('/automation/studio.css', asset('studio.css', 'text/css; charset=utf-8') as never)
  for (const path of PAGES) app = app.get(path, (c) => c.html(studioPage(prefix, ctx.get('appInstance')?.name === undefined ? 'Workflow Automation' : 'Workflow Automation'), 200, { 'cache-control': 'no-store' }))
  ctx.router.route(prefix === '' ? '/' : prefix, app)
}
