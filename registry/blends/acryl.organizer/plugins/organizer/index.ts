/**
 * The organizer: to-dos, a calendar and meeting booking that refuses overlaps, as one feature plugin. `lib/domain.js` (the rules, pure) and `lib/store.js` (one JSON file,
 * written atomically) are the starter's own code from before it was an acrylblends app; this file is the adapter: JSON routes under `/organizer` that the page and the agent
 * call, and the first screen, which is the organizer itself. `client.js` is the starter's own React UI moved onto the page (same views, controls, texts and styles; React 18 is served from the app's node_modules).
 *
 * Routes: GET /state, POST /todo {title, due?}, POST /todo-done {id}, POST /meeting {title, start, minutes?, with?}, POST /meeting-cancel {id},
 * GET /agenda?day=YYYY-MM-DD, GET /free-slots?day=YYYY-MM-DD&minutes=30. A refused request answers {error} with 422 (a rule said no) or 400 (a bad body).
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '@acryldev/blends'
import type {} from '@acryldev/instance'
import * as domain from './lib/domain.js'
import { fileStore, type OrganizerStore } from './lib/store.js'

export const name = 'organizer'
export const inject = ['router', 'appInstance']

export interface OrganizerConfig {
  /** A store for tests; absent, `organizer.json` in the app's home. */
  readonly store?: OrganizerStore
}

const escapeHtml = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

const body = async (request: { json(): Promise<unknown> }): Promise<Record<string, unknown>> => {
  const parsed = await request.json().catch(() => undefined)
  return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
}

export function apply(ctx: Context, config: OrganizerConfig = {}): void {
  const store = config.store ?? fileStore(join(ctx.appInstance.home, 'organizer.json'))
  // The files of the page: the UI (the starter's own client.js) and React 18's production builds, read where they are installed.
  const require = createRequire(import.meta.url)
  const installed = (spec: string) => join(dirname(require.resolve(`${spec.split('/')[0]}/package.json`)), spec.split('/').slice(1).join('/'))
  const file = (path: string) => readFileSync(path, 'utf8')
  const script = (text: string) => new Response(text, { headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache' } })
  const app = new Acryl()
    .get('/assets/client.js', () => script(file(fileURLToPath(new URL('./client.js', import.meta.url)))))
    .get('/assets/vendor/react.js', () => script(file(installed('react/umd/react.production.min.js'))))
    .get('/assets/vendor/react-dom.js', () => script(file(installed('react-dom/umd/react-dom.production.min.js'))))
  // One use case per route: load, apply a domain rule, save, answer with the state. A rule that says no is a 422 with its own words.
  const change = (run: (state: domain.OrganizerState, input: Record<string, unknown>) => domain.OrganizerState) =>
    async (c: { req: { json(): Promise<unknown> }; json(value: unknown, status?: 200 | 400 | 422): Response }) => {
      try {
        const next = run(store.load(), await body(c.req))
        store.save(next)
        return c.json(next)
      } catch (cause) {
        return c.json({ error: (cause as Error).message }, cause instanceof domain.OrganizerError ? 422 : 400)
      }
    }
  const read = (run: (state: domain.OrganizerState, query: (key: string) => string | undefined) => unknown) =>
    (c: { req: { query(key: string): string | undefined }; json(value: unknown, status?: 200 | 400 | 422): Response }) => {
      try {
        return c.json(run(store.load(), (key) => c.req.query(key)))
      } catch (cause) {
        return c.json({ error: (cause as Error).message }, cause instanceof domain.OrganizerError ? 422 : 400)
      }
    }
  app
    .get('/state', read((state) => state))
    .get('/agenda', read((state, query) => domain.agenda(state, query('day'))))
    .get('/free-slots', read((state, query) => domain.freeSlots(state, query('day'), query('minutes') === undefined ? 30 : Number(query('minutes')))))
    .post('/todo', change((state, input) => domain.addTodo(state, input)))
    .post('/todo-done', change((state, input) => domain.completeTodo(state, Number(input.id))))
    .post('/meeting', change((state, input) => domain.bookMeeting(state, input)))
    .post('/meeting-cancel', change((state, input) => domain.cancelMeeting(state, Number(input.id))))
  ctx.router.route('/organizer', app)

  // The first screen: the app, to a browser. Any other client falls through to the app's own root (the JSON hello).
  const first = new Acryl().get('/', async (c, next) => {
    if (!(c.req.header('accept') ?? '').includes('text/html')) return next()
    return c.html(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(ctx.appInstance.name)}</title><style>html,body{margin:0}</style></head>
<body><div id="organizer-root"></div>
<script src="organizer/assets/vendor/react.js"></script><script src="organizer/assets/vendor/react-dom.js"></script><script src="organizer/assets/client.js"></script>
</body></html>`)
  })
  ctx.router.route('/', first)
}
