/**
 * Music: a step sequencer / drum machine as one feature plugin. `lib/domain.js` (the rules and the ready-made styles, pure) and `lib/store.js` (one JSON file, written atomically) are the
 * starter's own code from before it was an acrylblends app; this file is the adapter: JSON routes under `/music` that the page and the agent call, and the sequencer as a widget on the
 * first screen. The page plays the pattern with WebAudio (synthesized, no audio files) and picks up every change the agent makes within a moment.
 *
 * Routes: GET /state, GET /describe (the pattern as text), POST /pattern {pattern}, /style {style}, /tempo {bpm}, /steps {steps}, /beats {track, beats, replace?}, /step {track, step, on},
 * /track {track, pattern}, /clear {track}, /save {name}, /load {name}, /delete {name}. A refused request answers {error} with 422 (a rule said no) or 400 (a bad body).
 */
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '@acryldev/blends'
import type {} from '../home/index.ts'
import type {} from '@acryldev/instance'
import * as domain from './lib/domain.js'
import { type MusicStore, fileStore } from './lib/store.js'

export const name = 'music'
export const inject = ['router', 'home', 'appInstance']

export interface MusicConfig {
  /** A store for tests; absent, `music.json` in the app's home. */
  readonly store?: MusicStore
}

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
  const app = new Acryl()
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

  ctx.effect(() =>
    ctx.home.widget({
      id: 'music',
      title: 'Drum machine',
      render: () => `<div id="music" data-test="music">
<style>#music .bar{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;margin:.5rem 0}#music .row{display:grid;grid-template-columns:4rem 1fr;gap:.5rem;align-items:center;margin:.2rem 0}#music .cells{display:grid;gap:3px}#music .cell{height:1.8rem;border:1px solid #8886;border-radius:4px;background:transparent;padding:0}#music .cell.beat{border-color:#8888}#music .cell.on{background:#7c5cff;border-color:#7c5cff}#music .cell.now{outline:2px solid #ffa94d}#music .play.on{background:#e03131;color:#fff}#music .chip{display:inline-flex;gap:.15rem}</style>
<div class="bar"><button type="button" class="play" data-play>Play</button><label>Tempo <input type="range" id="music-tempo" min="60" max="200" value="120"> <output id="music-bpm">120</output> bpm</label><span><button type="button" data-steps="8">8 steps</button> <button type="button" data-steps="16">16 steps</button></span><button type="button" data-clear>Clear all</button></div>
<div id="music-grid"></div>
<div class="bar">Style <span id="music-styles"></span></div>
<div class="bar">Patterns <span id="music-saved"></span> <input id="music-name" placeholder="Name this pattern" maxlength="40"> <button type="button" data-save>Save</button></div>
<p id="music-error" role="alert" hidden></p>
</div>
<script type="module">
  const url = (path) => 'music/' + path
  const TRACKS = ['kick', 'snare', 'clap', 'tom']
  const STYLES = ${JSON.stringify(domain.STYLE_NAMES)}
  const esc = (value) => { const node = document.createElement('span'); node.textContent = String(value ?? ''); return node.innerHTML }
  const error = document.getElementById('music-error')
  async function call(path, payload) {
    const response = await fetch(url(path), payload === undefined ? undefined : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
    const data = await response.json()
    if (!response.ok) { error.textContent = data.error; error.hidden = false; return undefined }
    error.hidden = true
    return data
  }
  let state
  let now = -1
  const root = document.getElementById('music')
  function draw() {
    const p = state.pattern
    document.getElementById('music-tempo').value = p.tempo
    document.getElementById('music-bpm').textContent = p.tempo
    const every = p.steps / 4
    document.getElementById('music-grid').innerHTML = TRACKS.map((track) => '<div class="row"><span>' + track + '</span><div class="cells" style="grid-template-columns:repeat(' + p.steps + ',minmax(0,1fr))">' + Array.from({ length: p.steps }, (_u, i) => '<button type="button" class="cell' + (i % every === 0 ? ' beat' : '') + (p.tracks[track][i] === 'x' ? ' on' : '') + (i === now ? ' now' : '') + '" data-track="' + track + '" data-step="' + i + '" aria-label="' + track + ' step ' + (i + 1) + (p.tracks[track][i] === 'x' ? ' on' : ' off') + '" aria-pressed="' + (p.tracks[track][i] === 'x') + '"></button>').join('') + '</div></div>').join('')
    document.getElementById('music-styles').innerHTML = STYLES.map((s) => '<button type="button" data-style="' + s + '">' + (s === 'hiphop' ? 'hip-hop' : s) + '</button>').join(' ')
    const names = Object.keys(state.saved)
    document.getElementById('music-saved').innerHTML = names.length === 0 ? '<em>none saved yet</em>' : names.map((n) => '<span class="chip"><button type="button" data-load="' + esc(n) + '">' + esc(n) + '</button><button type="button" data-delete="' + esc(n) + '" aria-label="Delete ' + esc(n) + '">x</button></span>').join(' ')
  }
  const apply = async (path, payload) => { const next = await call(path, payload); if (next) { state = next; draw() } }
  // The synthesizer and its look-ahead scheduler: the pattern is read at every step, so an edit (yours or the agent's) is heard while it plays.
  const audio = { ctx: null, timer: null, nextTime: 0, nextStep: 0, queue: [], raf: 0, noise: null }
  function voice(track, time) {
    const ctx = audio.ctx
    const out = ctx.createGain(); out.connect(ctx.destination)
    const osc = (type, from, to, dur, peak) => { const o = ctx.createOscillator(); const g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(from, time); o.frequency.exponentialRampToValueAtTime(to, time + dur); g.gain.setValueAtTime(peak, time); g.gain.exponentialRampToValueAtTime(0.001, time + dur); o.connect(g).connect(out); o.start(time); o.stop(time + dur + 0.02) }
    const noiseBuf = () => { if (audio.noise) return audio.noise; const b = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i += 1) d[i] = Math.random() * 2 - 1; return (audio.noise = b) }
    const noise = (type, freq, dur, peak, at = time) => { const s = ctx.createBufferSource(); s.buffer = noiseBuf(); const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; const g = ctx.createGain(); g.gain.setValueAtTime(peak, at); g.gain.exponentialRampToValueAtTime(0.001, at + dur); s.connect(f).connect(g).connect(out); s.start(at); s.stop(at + dur + 0.02) }
    if (track === 'kick') osc('sine', 160, 42, 0.38, 1)
    else if (track === 'snare') { noise('highpass', 1500, 0.2, 0.7); osc('triangle', 220, 120, 0.12, 0.5) }
    else if (track === 'clap') { for (const d of [0, 0.012, 0.026]) noise('bandpass', 1500, 0.09, 0.6, time + d); noise('bandpass', 1500, 0.2, 0.5, time + 0.04) }
    else if (track === 'tom') osc('sine', 220, 95, 0.3, 0.9)
  }
  const playButton = root.querySelector('[data-play]')
  function stop() {
    clearInterval(audio.timer); audio.timer = null; cancelAnimationFrame(audio.raf); audio.queue.length = 0
    playButton.textContent = 'Play'; playButton.classList.remove('on'); now = -1; draw()
  }
  async function play() {
    if (!audio.ctx) audio.ctx = new (window.AudioContext || window.webkitAudioContext)()
    await audio.ctx.resume()
    audio.nextTime = audio.ctx.currentTime + 0.06; audio.nextStep = 0; audio.queue.length = 0
    const schedule = () => {
      const p = state.pattern
      while (audio.nextTime < audio.ctx.currentTime + 0.12) {
        const step = audio.nextStep % p.steps
        for (const t of TRACKS) if (p.tracks[t][step] === 'x') voice(t, audio.nextTime)
        audio.queue.push({ time: audio.nextTime, step })
        audio.nextTime += 60 / p.tempo / (p.steps / 4); audio.nextStep = (step + 1) % p.steps
      }
    }
    const frame = () => {
      while (audio.queue.length > 1 && audio.queue[1].time <= audio.ctx.currentTime) audio.queue.shift()
      const at = audio.queue.length > 0 && audio.queue[0].time <= audio.ctx.currentTime ? audio.queue[0].step : -1
      if (at !== now) { now = at; for (const cell of root.querySelectorAll('.cell')) cell.classList.toggle('now', Number(cell.dataset.step) === now) }
      audio.raf = requestAnimationFrame(frame)
    }
    audio.timer = setInterval(schedule, 25); schedule(); audio.raf = requestAnimationFrame(frame)
    playButton.textContent = 'Stop'; playButton.classList.add('on')
  }
  root.addEventListener('click', async (event) => {
    const cell = event.target.closest('[data-track]')
    if (cell) { const p = state.pattern; const row = p.tracks[cell.dataset.track]; const i = Number(cell.dataset.step); apply('step', { track: cell.dataset.track, step: i + 1, on: row[i] !== 'x' }); return }
    if (event.target.closest('[data-play]')) { audio.timer ? stop() : await play(); return }
    const steps = event.target.closest('[data-steps]')
    if (steps) { apply('steps', { steps: Number(steps.dataset.steps) }); return }
    if (event.target.closest('[data-clear]')) { const p = state.pattern; apply('pattern', { ...p, tracks: Object.fromEntries(TRACKS.map((t) => [t, '.'.repeat(p.steps)])) }); return }
    const style = event.target.closest('[data-style]')
    if (style) { apply('style', { style: style.dataset.style }); return }
    const load = event.target.closest('[data-load]')
    if (load) { apply('load', { name: load.dataset.load }); return }
    const del = event.target.closest('[data-delete]')
    if (del) { apply('delete', { name: del.dataset.delete }); return }
    if (event.target.closest('[data-save]')) { const name = document.getElementById('music-name').value.trim(); if (name) { await apply('save', { name }); document.getElementById('music-name').value = '' } }
  })
  document.getElementById('music-tempo').addEventListener('change', (event) => apply('tempo', { bpm: Number(event.target.value) }))
  document.getElementById('music-tempo').addEventListener('input', (event) => { document.getElementById('music-bpm').textContent = event.target.value })
  async function poll() { const next = await call('state'); if (next && JSON.stringify(next) !== JSON.stringify(state)) { state = next; draw() } }
  await poll()
  setInterval(poll, 1500)
</script>`,
    }),
  )
}
