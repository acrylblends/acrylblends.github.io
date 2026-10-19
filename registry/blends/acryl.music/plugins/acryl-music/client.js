// acryl-music (browser half): the drum machine IS this app's main surface.
// Type:     client plugin (claims `desktop.main` through acryl-app-shell)
// Surfaces: web desktop
// Rule:     a domain plugin's own UI is a slot registration, never a Host route (specs/036-cordis-ecosystem-and-acryl-blends/blend-instance-design.md, 0a).
//           The app opens on the sequencer; the agent's conversation sits beside it, so what you ask for is what you see and hear.
//           Data goes through the plugin's own `/api/acryl-music/*` endpoints, the same `.acryl/music.json` the agent's tools use; the surface polls every
//           1.5 s, so a change the agent makes shows up, and is heard on the next step, while the pattern keeps playing. Sound is synthesized (WebAudio).
window.__ModuleLoader__.load({ id: 'acryl-music', factory: (require) => {
var module = { exports: {} }; var exports = module.exports;

const React = require('react')
const shell = require('acryl-app-shell/client')
const h = React.createElement
const { useEffect, useRef, useState, useCallback } = React

const TRACKS = ['kick', 'snare', 'clap', 'tom']
const STYLES = ['techno', 'house', 'hiphop', 'breakbeat']
const COLORS = { kick: '#ff6b6b', snare: '#ffd43b', clap: '#63e6be', tom: '#74c0fc' }

const CSS = `
.acm { display:grid; grid-template-columns:minmax(0,1fr) minmax(360px,440px); height:100%; min-height:0; background:#0f0c1a; color:#f1eefb; font:16px/1.5 -apple-system,"Segoe UI",system-ui,sans-serif; }
.acm-studio { overflow:auto; padding:22px 28px 40px; display:grid; gap:18px; align-content:start; min-width:0; }
.acm-head { display:flex; align-items:center; gap:14px; }
.acm-head h1 { margin:0; font-size:24px; letter-spacing:-.01em; }
.acm-head .live { margin-left:auto; color:#a79fc6; font-size:13px; }
.acm-head .live i { display:inline-block; width:8px; height:8px; border-radius:50%; background:#b197fc; margin-right:6px; }
.acm-bar { display:flex; flex-wrap:wrap; gap:12px 20px; align-items:center; background:#181429; border:1px solid #2d2745; border-radius:14px; padding:12px 16px; }
.acm-studio button { font:600 15px inherit; font-family:inherit; color:#f1eefb; background:#241e3d; border:1px solid #2d2745; border-radius:10px; padding:8px 14px; cursor:pointer; }
.acm-studio button:hover { border-color:#b197fc; }
.acm-studio button:focus-visible, .acm-studio input:focus-visible { outline:2px solid #b197fc; outline-offset:2px; }
.acm-studio .play { background:#7048e8; border-color:#7048e8; min-width:104px; font-size:17px; }
.acm-studio .play.on { background:#e03131; border-color:#e03131; }
.acm-studio .seg { display:inline-flex; }
.acm-studio .seg button { border-radius:0; }
.acm-studio .seg button:first-child { border-radius:10px 0 0 10px; }
.acm-studio .seg button:last-child { border-radius:0 10px 10px 0; }
.acm-studio .seg button.on { background:#7048e8; border-color:#7048e8; }
.acm-studio .tempo { display:flex; align-items:center; gap:10px; color:#a79fc6; }
.acm-studio .tempo b { color:#f1eefb; font-size:22px; min-width:3ch; text-align:right; }
.acm-studio .grid { background:#181429; border:1px solid #2d2745; border-radius:14px; padding:14px 16px; display:grid; gap:10px; }
.acm-studio .row { display:grid; grid-template-columns:70px minmax(0,1fr); gap:12px; align-items:center; }
.acm-studio .row .name { text-transform:capitalize; font-weight:600; color:#a79fc6; }
.acm-studio .cells { display:grid; gap:6px; }
.acm-studio .cell { aspect-ratio:1; min-width:0; padding:0; border-radius:8px; background:#221c38; border:1px solid #2d2745; }
.acm-studio .cell.beat { background:#2a2346; }
.acm-studio .cell.on { background:var(--c); border-color:var(--c); }
.acm-studio .cell.now { box-shadow:0 0 0 2px #f1eefb inset; }
.acm-studio .ruler { display:grid; gap:6px; margin-left:82px; color:#6f6890; font-size:12px; }
.acm-studio .saved { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
.acm-studio .chip { display:inline-flex; }
.acm-studio .chip button:first-child { border-radius:999px 0 0 999px; }
.acm-studio .chip .x { border-radius:0 999px 999px 0; border-left:0; color:#a79fc6; }
.acm-studio input[type=text] { font:inherit; color:#f1eefb; background:#221c38; border:1px solid #2d2745; border-radius:10px; padding:8px 12px; min-width:0; }
.acm-studio .muted { color:#a79fc6; }
.acm-studio .msg { color:#ffd43b; min-height:1.5em; font-size:14px; }
.acm-agent { border-left:1px solid #2d2745; min-width:0; min-height:0; display:flex; flex-direction:column; background:var(--dsw-alias-bg-l1, #fff); }
.acm-agent > div { flex:1; min-height:0; }
`

async function api(path, body) {
  const res = await fetch('/api/acryl-music/' + path, body === undefined
    ? { credentials: 'same-origin' }
    : { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json()
  if (!res.ok) throw new Error(data && data.error ? data.error : 'request failed')
  return data
}

/** The synthesizer and its look-ahead scheduler; `getPattern` is read on every step, so edits are heard while it plays. */
function useDrumMachine(getPattern, onStep) {
  const audio = useRef({ ctx: null, timer: null, nextTime: 0, nextStep: 0, queue: [], raf: 0, noise: null })
  const [playing, setPlaying] = useState(false)
  const voice = useCallback((track, time) => {
    const ctx = audio.current.ctx
    const out = ctx.createGain(); out.connect(ctx.destination)
    const osc = (type, from, to, dur, peak) => { const o = ctx.createOscillator(); const g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(from, time); o.frequency.exponentialRampToValueAtTime(to, time + dur); g.gain.setValueAtTime(peak, time); g.gain.exponentialRampToValueAtTime(0.001, time + dur); o.connect(g).connect(out); o.start(time); o.stop(time + dur + 0.02) }
    const noiseBuf = () => { if (audio.current.noise) return audio.current.noise; const b = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i += 1) d[i] = Math.random() * 2 - 1; return (audio.current.noise = b) }
    const noise = (type, freq, dur, peak, at = time) => { const s = ctx.createBufferSource(); s.buffer = noiseBuf(); const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; const g = ctx.createGain(); g.gain.setValueAtTime(peak, at); g.gain.exponentialRampToValueAtTime(0.001, at + dur); s.connect(f).connect(g).connect(out); s.start(at); s.stop(at + dur + 0.02) }
    if (track === 'kick') osc('sine', 160, 42, 0.38, 1)
    else if (track === 'snare') { noise('highpass', 1500, 0.2, 0.7); osc('triangle', 220, 120, 0.12, 0.5) }
    else if (track === 'clap') { for (const d of [0, 0.012, 0.026]) noise('bandpass', 1500, 0.09, 0.6, time + d); noise('bandpass', 1500, 0.2, 0.5, time + 0.04) }
    else if (track === 'tom') osc('sine', 220, 95, 0.3, 0.9)
  }, [])
  const stop = useCallback(() => {
    const a = audio.current
    clearInterval(a.timer); a.timer = null; cancelAnimationFrame(a.raf); a.queue.length = 0
    setPlaying(false); onStep(-1)
  }, [onStep])
  const play = useCallback(async () => {
    const a = audio.current
    if (!a.ctx) a.ctx = new (window.AudioContext || window.webkitAudioContext)()
    await a.ctx.resume()
    a.nextTime = a.ctx.currentTime + 0.06; a.nextStep = 0; a.queue.length = 0
    const schedule = () => {
      const p = getPattern(); if (!p) return
      while (a.nextTime < a.ctx.currentTime + 0.12) {
        const step = a.nextStep % p.steps
        for (const t of TRACKS) if (p.tracks[t] && p.tracks[t][step] === 'x') voice(t, a.nextTime)
        a.queue.push({ time: a.nextTime, step })
        a.nextTime += 60 / p.tempo / (p.steps / 4); a.nextStep = (step + 1) % p.steps
      }
    }
    const frame = () => {
      while (a.queue.length > 1 && a.queue[1].time <= a.ctx.currentTime) a.queue.shift()
      onStep(a.queue.length > 0 && a.queue[0].time <= a.ctx.currentTime ? a.queue[0].step : -1)
      a.raf = requestAnimationFrame(frame)
    }
    a.timer = setInterval(schedule, 25); schedule(); a.raf = requestAnimationFrame(frame)
    setPlaying(true)
  }, [getPattern, onStep, voice])
  useEffect(() => () => { const a = audio.current; clearInterval(a.timer); cancelAnimationFrame(a.raf); if (a.ctx) a.ctx.close() }, [])
  return { playing, play, stop }
}

function Studio() {
  const [state, setState] = useState(null)
  const [now, setNow] = useState(-1)
  const [msg, setMsg] = useState('')
  const [name, setName] = useState('')
  const stateRef = useRef(null)
  const busy = useRef(0)
  stateRef.current = state
  const getPattern = useCallback(() => (stateRef.current ? stateRef.current.pattern : null), [])
  const machine = useDrumMachine(getPattern, setNow)

  const flash = useCallback(m => { setMsg(m); clearTimeout(flash.t); flash.t = setTimeout(() => setMsg(''), 3500) }, [])
  const run = useCallback(async (path, body) => {
    busy.current += 1
    try { setState(await api(path, body)) } catch (e) { flash(e.message) } finally { busy.current -= 1 }
  }, [flash])
  const local = useCallback(pattern => { setState(s => ({ ...s, pattern })); return run('pattern', { pattern }) }, [run])

  useEffect(() => {
    let alive = true
    const poll = async () => {
      if (busy.current > 0) return
      try { const next = await api('state'); if (alive) setState(s => (!s || s.version !== next.version ? next : s)) } catch {}
    }
    poll(); const t = setInterval(poll, 1500)
    return () => { alive = false; clearInterval(t) }
  }, [])
  useEffect(() => {
    const onKey = e => { if (e.code === 'Space' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName) && !document.activeElement.isContentEditable && e.target.closest && e.target.closest('.acm-studio')) { e.preventDefault(); machine.playing ? machine.stop() : machine.play() } }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [machine])

  if (state === null) return h('div', { className: 'acm-studio' }, h('p', { className: 'muted' }, 'Loading the drum machine...'))
  const p = state.pattern
  const beatEvery = p.steps / 4
  const cols = { gridTemplateColumns: 'repeat(' + p.steps + ', minmax(0, 1fr))' }
  const toggle = (track, i) => { const next = structuredClone(p); next.tracks[track] = p.tracks[track].slice(0, i) + (p.tracks[track][i] === 'x' ? '.' : 'x') + p.tracks[track].slice(i + 1); local(next) }
  const resize = steps => { if (p.steps === steps) return; const next = structuredClone(p); for (const t of TRACKS) next.tracks[t] = steps > p.steps ? p.tracks[t].repeat(steps / p.steps) : p.tracks[t].slice(0, steps); next.steps = steps; local(next) }
  const clear = () => { const next = structuredClone(p); for (const t of TRACKS) next.tracks[t] = '.'.repeat(p.steps); local(next) }
  const save = () => { const n = name.trim(); if (!n) return flash('Type a name first.'); run('save', { name: n }).then(() => { setName(''); flash('Saved "' + n + '".') }) }

  return h('div', { className: 'acm-studio', tabIndex: -1 },
    h('div', { className: 'acm-head' }, h('h1', null, 'Drum machine'), h('span', { className: 'live' }, h('i'), 'live: the agent plays this too')),
    h('div', { className: 'acm-bar' },
      h('button', { type: 'button', className: 'play' + (machine.playing ? ' on' : ''), onClick: () => (machine.playing ? machine.stop() : machine.play()) }, machine.playing ? 'Stop' : 'Play'),
      h('label', { className: 'tempo' }, 'Tempo', h('input', { type: 'range', min: 60, max: 200, value: p.tempo, onChange: e => setState(s => ({ ...s, pattern: { ...s.pattern, tempo: Number(e.target.value) } })), onMouseUp: e => local({ ...p, tempo: Number(e.target.value) }), onKeyUp: e => local({ ...p, tempo: Number(e.target.value) }) }), h('b', null, p.tempo), 'bpm'),
      h('span', { className: 'seg' }, [8, 16].map(n => h('button', { key: n, type: 'button', className: p.steps === n ? 'on' : '', onClick: () => resize(n) }, n + ' steps'))),
      h('button', { type: 'button', onClick: clear }, 'Clear all')),
    h('div', { className: 'grid' },
      h('div', { className: 'ruler', style: cols }, Array.from({ length: p.steps }, (_u, i) => h('span', { key: i }, i % beatEvery === 0 ? String(i / beatEvery + 1) : ''))),
      TRACKS.map(track => h('div', { key: track, className: 'row' },
        h('span', { className: 'name' }, track),
        h('div', { className: 'cells', style: cols }, Array.from({ length: p.steps }, (_u, i) => {
          const on = p.tracks[track][i] === 'x'
          return h('button', { key: i, type: 'button', 'aria-label': track + ' step ' + (i + 1) + (on ? ' on' : ' off'), 'aria-pressed': on, className: 'cell' + (i % beatEvery === 0 ? ' beat' : '') + (on ? ' on' : '') + (i === now ? ' now' : ''), style: { '--c': COLORS[track] }, onClick: () => toggle(track, i) })
        }))))),
    h('div', { className: 'acm-bar' },
      h('span', { className: 'muted' }, 'Style'),
      STYLES.map(s => h('button', { key: s, type: 'button', onClick: () => run('style', { style: s }) }, s === 'hiphop' ? 'hip-hop' : s))),
    h('div', { className: 'acm-bar' },
      h('span', { className: 'muted' }, 'Patterns'),
      h('div', { className: 'saved' }, Object.keys(state.saved).length === 0
        ? h('span', { className: 'muted' }, 'none saved yet')
        : Object.keys(state.saved).map(n => h('span', { key: n, className: 'chip' }, h('button', { type: 'button', onClick: () => run('load', { name: n }) }, n), h('button', { type: 'button', className: 'x', 'aria-label': 'Delete ' + n, onClick: () => run('delete', { name: n }) }, '×')))),
      h('input', { type: 'text', placeholder: 'Name this pattern', value: name, onChange: e => setName(e.target.value), onKeyDown: e => { if (e.key === 'Enter') save() } }),
      h('button', { type: 'button', onClick: save }, 'Save')),
    h('div', { className: 'msg', role: 'status' }, msg))
}

/** The app's main surface: the drum machine, and the agent beside it. */
function MusicApp(props) {
  useEffect(() => {
    const style = document.createElement('style'); style.dataset.acrylMusic = ''; style.textContent = CSS
    document.head.appendChild(style)
    return () => style.remove()
  }, [])
  return h('div', { className: 'acm' },
    h(Studio),
    h('aside', { className: 'acm-agent', 'aria-label': 'Agent' }, props.renderConversation ? props.renderConversation() : null))
}

exports.inject = ['slots', 'theme']

exports.apply = function apply(ctx) {
  const environment = shell.resolveShellEnvironment(window.location.hash)
  if (environment.mode !== 'advanced') return
  shell.applyAdvancedShell(ctx, environment)
  // Lower priority renders: below the shell's own fallback (100), which shows the plain conversation.
  ctx.slots.inject('desktop.main', () => ctx.slots.register({ name: 'desktop.main', priority: 0 }, MusicApp))
}

return module.exports; } });
