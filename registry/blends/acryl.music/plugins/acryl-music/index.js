/**
 * acryl-music: a step sequencer / drum machine, grown from the Blank Blueprint as one ordinary Cordis plugin. The agent plays it through tools ("make a 128 bpm
 * techno beat", "add a snare on 2 and 4", "slow it down to 90"); the page (`/music`) plays the pattern with WebAudio, sounds synthesized in the browser, no audio files,
 * and shows every change the agent makes within a moment. The pattern and the saved patterns live in `<app home>/.acryl/music.json`. Remove the plugin and the
 * tools and page go; the data file stays with the project.
 *
 * Surfaces: tui web desktop (tools need no browser; the page and the sound need `webServer` and a browser, web/desktop only).
 */
import { isAbsolute, join } from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'
import * as domain from './lib/domain.js'
import { pageHtml } from './lib/page.js'
import { error, finishJson, isLoopbackAddress, isSameOriginLoopbackRequest, parseJsonPostBody, INVALID_BODY } from './lib/http.js'
import { fileStore } from './lib/store.js'

export const name = 'acryl-music'
// appInstance: the data belongs to the app, not to the chat's workspace, so the tools and the page both keep it in the app's own home.
export const inject = ['tools', 'webServer', 'appInstance']

function resolveCwd(value, appHome) {
  if (value === undefined || value === null || value === '') return appHome
  if (typeof value !== 'string' || !isAbsolute(value)) throw new Error('cwd must be an absolute path')
  return value
}
const storeForCwd = cwd => fileStore(join(cwd, '.acryl', 'music.json'))

const text = (_args, value) => [{ type: 'text', text: value }]
const output = { schema: { type: 'string' }, render: text }

/** One use case = one tool: load, apply a domain rule, save, describe the result. The data is the app's own, wherever the chat's workspace is. */
const makeUseCase = openStore => (definition, run) => {
  return defineTool({
    ...definition,
    output,
    async execute(args) {
      const store = openStore()
      try {
        const next = run(store.load(), args)
        if (next.state !== undefined) store.save(next.state)
        return next.say
      } catch (cause) {
        if (cause instanceof domain.MusicError) throw new Error(cause.message)
        throw cause
      }
    },
  })
}

const changed = (state, lead) => ({ state, say: `${lead}\n${domain.describe(state)}` })
const trackParam = { type: 'string', required: true, description: `One of ${domain.TRACKS.join(', ')}` }

export function apply(ctx) {
  const useCase = makeUseCase(() => storeForCwd(ctx.appInstance.home))
  const tools = [
    useCase({ name: 'music_show', description: 'Show the pattern on the sequencer: tempo, steps and every track.', parameters: {} }, state => ({ say: domain.describe(state) })),
    useCase({ name: 'music_style', description: `Replace the pattern with a ready-made beat in a style (${domain.STYLE_NAMES.join(', ')}), at that style's usual tempo.`, parameters: { style: { type: 'string', required: true, description: domain.STYLE_NAMES.join(', ') } } },
      (state, args) => changed(domain.style(state, args.style), `Now a ${args.style} beat.`)),
    useCase({ name: 'music_tempo', description: `Set the tempo in beats per minute (${domain.TEMPO.min} to ${domain.TEMPO.max}).`, parameters: { bpm: { type: 'number', required: true, description: 'Whole beats per minute' } } },
      (state, args) => changed(domain.setTempo(state, args.bpm), `Tempo ${args.bpm} bpm.`)),
    useCase({ name: 'music_steps', description: 'Make the pattern 8 or 16 steps long (16 steps = four beats of four).', parameters: { steps: { type: 'number', required: true, description: '8 or 16' } } },
      (state, args) => changed(domain.setSteps(state, args.steps), `${args.steps} steps.`)),
    useCase({ name: 'music_beats', description: 'Put hits on a track on the named beats (1 to 4, like "2, 4" for a backbeat; 1.5 is the off-beat). Existing hits stay unless replace is true.', parameters: {
      track: trackParam,
      beats: { type: 'string', required: true, description: 'Beats, e.g. "2, 4" or "1, 2, 3, 4"' },
      replace: { type: 'boolean', description: 'Clear the track first' },
    } }, (state, args) => changed(domain.setBeats(state, args.track, args.beats, { replace: args.replace === true }), `${args.track} on beats ${args.beats}.`)),
    useCase({ name: 'music_step', description: 'Switch one step of one track on or off. Steps count from 1.', parameters: {
      track: trackParam,
      step: { type: 'number', required: true, description: 'Step from 1' },
      on: { type: 'boolean', required: true, description: 'true for a hit, false for a rest' },
    } }, (state, args) => changed(domain.setStep(state, args.track, args.step, args.on === true || args.on === 'true'), `${args.track} step ${args.step} ${args.on === true || args.on === 'true' ? 'on' : 'off'}.`)),
    useCase({ name: 'music_track', description: 'Set a whole track from text: x is a hit, . is a rest, exactly as long as the pattern ("x...x...x...x..." for 16 steps).', parameters: {
      track: trackParam,
      pattern: { type: 'string', required: true, description: 'x and . for every step' },
    } }, (state, args) => changed(domain.setTrack(state, args.track, args.pattern), `${args.track} set.`)),
    useCase({ name: 'music_clear', description: 'Clear one track of all its hits.', parameters: { track: trackParam } },
      (state, args) => changed(domain.clearTrack(state, args.track), `${args.track} cleared.`)),
    useCase({ name: 'music_save', description: 'Save the current pattern under a name.', parameters: { name: { type: 'string', required: true, description: 'A name, up to 40 characters' } } },
      (state, args) => ({ state: domain.savePattern(state, args.name), say: `Saved "${args.name}".` })),
    useCase({ name: 'music_load', description: 'Load a saved pattern onto the sequencer.', parameters: { name: { type: 'string', required: true, description: 'A saved name' } } },
      (state, args) => changed(domain.loadPattern(state, args.name), `Loaded "${args.name}".`)),
    useCase({ name: 'music_list', description: 'List the saved patterns.', parameters: {} },
      state => ({ say: Object.keys(state.saved).length === 0 ? '(no saved patterns)' : Object.entries(state.saved).map(([name, pattern]) => `${name}: ${pattern.tempo} bpm, ${pattern.steps} steps`).join('\n') })),
    useCase({ name: 'music_delete', description: 'Delete a saved pattern.', parameters: { name: { type: 'string', required: true, description: 'A saved name' } } },
      (state, args) => ({ state: domain.deletePattern(state, args.name), say: `Deleted "${args.name}".` })),
  ]
  for (const tool of tools) ctx.effect(() => ctx.tools.register(tool), `acryl-music: ${tool.name}`)

  const webOrigin = () => ctx.webServer.origin ?? `http://127.0.0.1:${String(ctx.webServer.port)}`

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/music',
    handler: (req, res) => {
      if (!isLoopbackAddress(req.socket.remoteAddress)) { res.statusCode = 403; res.end(); return }
      if (req.method !== 'GET') { res.statusCode = 405; res.setHeader('allow', 'GET'); res.end(); return }
      res.statusCode = 200
      res.setHeader('content-type', 'text/html; charset=utf-8')
      res.setHeader('cache-control', 'no-store')
      res.end(pageHtml())
    },
  }), 'acryl-music: page')

  const api = (path, method, run) => ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: `/api/acryl-music/${path}`,
    handler: async (req, res) => {
      if (req.method !== method) return finishJson(res, 405, error('method not allowed'), method)
      if (!isSameOriginLoopbackRequest(req, webOrigin(), method !== 'GET')) return finishJson(res, 403, error('forbidden'))
      const body = method === 'GET' ? {} : await parseJsonPostBody(req, res)
      if (body === INVALID_BODY) return
      try {
        const query = Object.fromEntries(new URL(req.url ?? '', webOrigin()).searchParams)
        const store = storeForCwd(resolveCwd(body?.cwd ?? query.cwd, ctx.appInstance.home))
        const next = run(store.load(), body)
        if (next !== undefined) store.save(next)
        finishJson(res, 200, next ?? store.load())
      } catch (cause) {
        finishJson(res, cause instanceof domain.MusicError ? 422 : 400, error(cause.message))
      }
    },
  }), `acryl-music: ${path} route`)

  api('state', 'GET', () => undefined)
  api('pattern', 'POST', (state, body) => domain.setPattern(state, body.pattern))
  api('style', 'POST', (state, body) => domain.style(state, body.style))
  api('save', 'POST', (state, body) => domain.savePattern(state, body.name))
  api('load', 'POST', (state, body) => domain.loadPattern(state, body.name))
  api('delete', 'POST', (state, body) => domain.deletePattern(state, body.name))
}
