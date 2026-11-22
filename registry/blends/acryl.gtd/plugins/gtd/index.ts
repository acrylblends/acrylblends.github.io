/**
 * GTD (Getting Things Done): capture everything into an inbox, triage each item into exactly one bucket, read it back by bucket, project or day. `lib/domain.js` (the rules, pure) and
 * `lib/store.js` (one JSON file, written atomically) are the starter's own code from before it was an acrylblends app; this file is the adapter: JSON routes under `/gtd` that the
 * page and the agent call, and the first screen, which is the board itself. `client.js` is the starter's own React UI moved onto the page (same views, controls, texts and styles; React 18
 * is served from the app's node_modules).
 *
 * Routes: GET /state, GET /items?status=inbox|next|waiting|someday|reference|done|trash, GET /projects, GET /project?name=, GET /agenda?day=YYYY-MM-DD, GET /upcoming?from=&days=,
 * POST /capture {title, note?, due?, tags?}, POST /triage {id, status, project?, due?, tags?}, POST /complete {id}. A refused request answers {error} with 422 (a rule said no) or 400.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '@acryldev/blends'
import type {} from '@acryldev/instance'
import * as domain from './lib/domain.js'
import { type GtdStore, fileStore } from './lib/store.js'

export const name = 'gtd'
export const inject = ['router', 'appInstance']

export interface GtdConfig {
  /** A store for tests; absent, `gtd.json` in the app's home. */
  readonly store?: GtdStore
}

const escapeHtml = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

const body = async (request: { json(): Promise<unknown> }): Promise<Record<string, unknown>> => {
  const parsed = await request.json().catch(() => undefined)
  return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
}

type Reply = { json(value: unknown, status?: 200 | 400 | 422): Response }

export function apply(ctx: Context, config: GtdConfig = {}): void {
  const store = config.store ?? fileStore(join(ctx.appInstance.home, 'gtd.json'))
  const refused = (c: Reply, cause: unknown) => c.json({ error: (cause as Error).message }, cause instanceof domain.GtdError ? 422 : 400)
  const change = (run: (state: domain.GtdState, input: Record<string, unknown>) => domain.GtdState) =>
    async (c: Reply & { req: { json(): Promise<unknown> } }) => {
      try {
        const next = run(store.load(), await body(c.req))
        store.save(next)
        return c.json(next)
      } catch (cause) {
        return refused(c, cause)
      }
    }
  const read = (run: (state: domain.GtdState, query: (key: string) => string | undefined) => unknown) =>
    (c: Reply & { req: { query(key: string): string | undefined } }) => {
      try {
        return c.json(run(store.load(), (key) => c.req.query(key)))
      } catch (cause) {
        return refused(c, cause)
      }
    }
  // The files of the page: the UI (the starter's own client.js) and React 18's production builds, read where they are installed.
  const require = createRequire(import.meta.url)
  const installed = (spec: string) => join(dirname(require.resolve(`${spec.split('/')[0]}/package.json`)), spec.split('/').slice(1).join('/'))
  const file = (path: string) => readFileSync(path, 'utf8')
  const script = (text: string) => new Response(text, { headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache' } })
  const app = new Acryl()
    .get('/assets/client.js', () => script(file(fileURLToPath(new URL('./client.js', import.meta.url)))))
    .get('/assets/vendor/react.js', () => script(file(installed('react/umd/react.production.min.js'))))
    .get('/assets/vendor/react-dom.js', () => script(file(installed('react-dom/umd/react-dom.production.min.js'))))
    .get('/state', read((state) => state))
    .get('/items', read((state, query) => domain.byStatus(state, query('status') ?? 'inbox')))
    .get('/projects', read((state) => domain.projects(state)))
    .get('/project', read((state, query) => domain.itemsForProject(state, query('name'))))
    .get('/agenda', read((state, query) => domain.agenda(state, query('day'))))
    .get('/upcoming', read((state, query) => domain.upcoming(state, query('from'), query('days') === undefined ? 7 : Number(query('days')))))
    .post('/capture', change((state, input) => domain.capture(state, input)))
    .post('/triage', change((state, input) => domain.triage(state, { ...input, id: Number(input.id) })))
    .post('/complete', change((state, input) => domain.complete(state, Number(input.id))))
  ctx.router.route('/gtd', app)

  // The first screen: the app, to a browser. Any other client falls through to the app's own root (the JSON hello).
  const first = new Acryl().get('/', async (c, next) => {
    if (!(c.req.header('accept') ?? '').includes('text/html')) return next()
    return c.html(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(ctx.appInstance.name)}</title><style>html,body{margin:0}</style></head>
<body><div id="gtd-root"></div>
<script src="gtd/assets/vendor/react.js"></script><script src="gtd/assets/vendor/react-dom.js"></script><script src="gtd/assets/client.js"></script>
</body></html>`)
  })
  ctx.router.route('/', first)
}
