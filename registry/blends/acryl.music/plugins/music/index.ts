/**
 * Music: a step sequencer / drum machine as one feature plugin. `lib/domain.js` (the rules and the ready-made styles, pure) and `lib/store.js` (one JSON file, written atomically) are the
 * starter's own code from before it was an acrylblends app; this file is the adapter: JSON routes under `/music` that the page and the agent call, and the first screen, which is the
 * drum machine itself. `client.js` is the starter's own React UI moved onto the page (same views, controls, texts and styles; React 18 is served from the app's node_modules), which plays the
 * pattern with WebAudio (synthesized, no audio files) and picks up every change the agent makes within a moment.
 *
 * Routes: GET /state, GET /describe (the pattern as text), POST /pattern {pattern}, /style {style}, /tempo {bpm}, /steps {steps}, /beats {track, beats, replace?}, /step {track, step, on},
 * /track {track, pattern}, /clear {track}, /save {name}, /load {name}, /delete {name}. A refused request answers {error} with 422 (a rule said no) or 400 (a bad body).
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '@acryldev/blends'
import type {} from '@acryldev/instance'
import * as domain from './lib/domain.js'
import { type MusicStore, fileStore } from './lib/store.js'

export const name = 'music'
export const inject = ['router', 'appInstance']

export interface MusicConfig {
  /** A store for tests; absent, `music.json` in the app's home. */
  readonly store?: MusicStore
}

const escapeHtml = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

const body = async (request: { json(): Promise<unknown> }): Promise<Record<string, unknown>> => {
  const parsed = await request.json().catch(() => undefined)
  return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
}

type Reply = { json(value: unknown, status?: 200 | 400 | 422): Response; text(value: string): Response }

export function apply(ctx: Context, config: MusicConfig = {}): void {
  const store = config.store ?? fileStore(join(ctx.appInstance.home, 'music.json'))
  const refused = (c: Reply, cause: unknown) => c.json({ error: (cause as Error).message }, cause instanceof domain.MusicError ? 422 : 400)
  const change = (run: (state: domain.MusicState, input: Record<string, unknown>) => domain.MusicState) =>
    async (c: Reply & { req: { json(): Promise<unknown> } }) => {
      try {
        const next = run(store.load(), await body(c.req))
        store.save(next)
        return c.json(next)
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
    .get('/state', (c: Reply) => { try { return c.json(store.load()) } catch (cause) { return refused(c, cause) } })
    .get('/describe', (c: Reply) => { try { return c.text(domain.describe(store.load())) } catch (cause) { return refused(c, cause) } })
    .post('/pattern', change((state, input) => domain.setPattern(state, input.pattern)))
    .post('/style', change((state, input) => domain.style(state, input.style)))
    .post('/tempo', change((state, input) => domain.setTempo(state, input.bpm)))
    .post('/steps', change((state, input) => domain.setSteps(state, input.steps)))
    .post('/beats', change((state, input) => domain.setBeats(state, input.track, input.beats, { replace: input.replace === true })))
    .post('/step', change((state, input) => domain.setStep(state, input.track, input.step, input.on === true || input.on === 'true')))
    .post('/track', change((state, input) => domain.setTrack(state, input.track, input.pattern)))
    .post('/clear', change((state, input) => domain.clearTrack(state, input.track)))
    .post('/save', change((state, input) => domain.savePattern(state, input.name)))
    .post('/load', change((state, input) => domain.loadPattern(state, input.name)))
    .post('/delete', change((state, input) => domain.deletePattern(state, input.name)))
  ctx.router.route('/music', app)
  // The first screen: the drum machine, to a browser. Any other client falls through to the app's own root (the JSON hello).
  const first = new Acryl().get('/', async (c, next) => {
    if (!(c.req.header('accept') ?? '').includes('text/html')) return next()
    return c.html(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(ctx.appInstance.name)}</title><style>html,body{margin:0;background:#0f0c1a}</style></head>
<body><div id="music-root"></div>
<script src="music/assets/vendor/react.js"></script><script src="music/assets/vendor/react-dom.js"></script><script src="music/assets/client.js"></script>
</body></html>`)
  })
  ctx.router.route('/', first)
}
