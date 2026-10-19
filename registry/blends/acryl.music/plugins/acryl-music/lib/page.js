/**
 * The sequencer page: plain HTML, CSS and JS (no framework, no build step), served by this plugin's own route. The sound is synthesized with WebAudio in the
 * browser (no audio files). The page reads and writes the same `.acryl/music.json` the agent's tools use, through the plugin's same-origin loopback routes, and
 * polls every 1.5 seconds, so a change the agent makes shows up, and is heard on the next step, while the pattern keeps playing. Every value from the data is put on
 * the page as text, never as HTML.
 */

export function pageHtml() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Music</title>
<style>
  :root { --bg:#0f0c1a; --panel:#181429; --line:#2d2745; --text:#f1eefb; --muted:#a79fc6; --accent:#7048e8; --accent2:#b197fc; --kick:#ff6b6b; --snare:#ffd43b; --clap:#63e6be; --tom:#74c0fc; }
  * { box-sizing:border-box; }
  body { margin:0; font:17px/1.5 -apple-system,"Segoe UI",system-ui,sans-serif; background:var(--bg); color:var(--text); }
  header { display:flex; align-items:center; gap:14px; padding:16px max(28px, calc((100% - 1180px) / 2 + 28px)); border-bottom:1px solid var(--line); }
  header h1 { font-size:22px; margin:0; }
  header .live { margin-left:auto; color:var(--muted); font-size:14px; }
  header .live i { display:inline-block; width:9px; height:9px; border-radius:50%; background:var(--accent2); margin-right:6px; }
  main { max-width:1180px; margin:0 auto; padding:22px 28px 60px; }
  .bar { display:flex; flex-wrap:wrap; gap:14px 22px; align-items:center; background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:14px 18px; margin-bottom:18px; }
  button { font:600 16px inherit; color:var(--text); background:#241e3d; border:1px solid var(--line); border-radius:10px; padding:9px 16px; cursor:pointer; }
  button:hover { border-color:var(--accent2); }
  button:focus-visible, input:focus-visible, select:focus-visible { outline:2px solid var(--accent2); outline-offset:2px; }
  #play { background:var(--accent); border-color:var(--accent); min-width:112px; font-size:18px; }
  #play.on { background:#e03131; border-color:#e03131; }
  .seg button { border-radius:0; margin:0; }
  .seg button:first-child { border-radius:10px 0 0 10px; } .seg button:last-child { border-radius:0 10px 10px 0; }
  .seg button.on { background:var(--accent); border-color:var(--accent); }
  label { display:flex; align-items:center; gap:10px; color:var(--muted); }
  #tempo { width:200px; accent-color:var(--accent2); }
  #bpm { font:700 28px inherit; color:var(--text); min-width:3.2ch; text-align:right; font-variant-numeric:tabular-nums; }
  input[type=text] { font:inherit; color:var(--text); background:#0c0916; border:1px solid var(--line); border-radius:10px; padding:9px 12px; width:190px; }
  .grid { background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:18px; }
  .track { display:grid; grid-template-columns:90px 1fr; align-items:center; gap:12px; margin:8px 0; }
  .track .name { font-weight:700; text-transform:capitalize; }
  .cells { display:grid; gap:6px; }
  .cell { height:54px; border-radius:9px; border:1px solid var(--line); background:#120f21; cursor:pointer; padding:0; }
  .cell.beat { background:#1b1630; }
  .cell.on { border-color:transparent; }
  .cell.now { outline:3px solid #fff; outline-offset:-3px; }
  .track[data-track=kick] .cell.on { background:var(--kick); } .track[data-track=snare] .cell.on { background:var(--snare); }
  .track[data-track=clap] .cell.on { background:var(--clap); } .track[data-track=tom] .cell.on { background:var(--tom); }
  .ruler { display:grid; grid-template-columns:90px 1fr; gap:12px; color:var(--muted); font-size:13px; margin-bottom:2px; padding:0 18px; }
  .ruler .cells span { text-align:left; }
  .saved { display:flex; flex-wrap:wrap; gap:10px; margin-top:16px; align-items:center; }
  .chip { display:inline-flex; align-items:center; border:1px solid var(--line); border-radius:999px; overflow:hidden; background:#241e3d; }
  .chip button { border:0; border-radius:0; background:transparent; padding:7px 14px; }
  .chip button.x { color:var(--muted); padding:7px 12px; border-left:1px solid var(--line); }
  .muted { color:var(--muted); }
  #msg { color:#ff8787; min-height:1.4em; }
  .hint { color:var(--muted); font-size:14px; margin-top:12px; }
</style>
</head>
<body>
<header><h1>Music</h1><span class="live"><i></i>live</span></header>
<main>
  <div class="bar">
    <button id="play" type="button">Play</button>
    <label>Tempo <input id="tempo" type="range" min="40" max="240" step="1"> <span id="bpm"></span> bpm</label>
    <span class="seg" role="group" aria-label="Steps"><button type="button" data-steps="8">8 steps</button><button type="button" data-steps="16">16 steps</button></span>
    <button id="clear" type="button">Clear all</button>
  </div>
  <div class="bar">
    <span class="muted">Start from a beat:</span>
    <span id="styles"></span>
  </div>
  <div class="ruler"><span></span><span class="cells" id="ruler"></span></div>
  <div class="grid" id="grid"></div>
  <div class="bar" style="margin-top:18px">
    <input id="name" type="text" placeholder="Name this pattern" maxlength="40" aria-label="Pattern name">
    <button id="save" type="button">Save pattern</button>
    <span id="msg" role="status"></span>
  </div>
  <div class="saved" id="saved"></div>
  <p class="hint">Press space to play or stop. Click a square to switch a step on or off. Ask the assistant: "make a 128 bpm techno beat", "add a snare on 2 and 4", "slow it down to 90".</p>
</main>
<script>
(() => {
  const TRACKS = ['kick', 'snare', 'clap', 'tom']
  const STYLES = ['techno', 'house', 'hiphop', 'breakbeat']
  const $ = id => document.getElementById(id)
  const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); for (const k of kids) e.append(k); return e }
  const api = async (path, body) => {
    const response = await fetch('/api/acryl-music/' + path, body === undefined ? undefined : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'request failed')
    return data
  }
  let state = null
  let busy = 0
  let playing = false, ctx = null, nextTime = 0, nextStep = 0, timer = null, lastHeard = -1
  const queue = []

  // ---- sounds: all synthesized, no files ----
  function noiseBuffer() { const b = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i += 1) d[i] = Math.random() * 2 - 1; return b }
  function voice(track, time) {
    const out = ctx.createGain(); out.connect(ctx.destination)
    const osc = (type, from, to, dur, peak) => { const o = ctx.createOscillator(); const g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(from, time); o.frequency.exponentialRampToValueAtTime(to, time + dur); g.gain.setValueAtTime(peak, time); g.gain.exponentialRampToValueAtTime(0.001, time + dur); o.connect(g).connect(out); o.start(time); o.stop(time + dur + 0.02) }
    const noise = (filterType, freq, dur, peak, at = time) => { const s = ctx.createBufferSource(); s.buffer = noise.buf ||= noiseBuffer(); const f = ctx.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; const g = ctx.createGain(); g.gain.setValueAtTime(peak, at); g.gain.exponentialRampToValueAtTime(0.001, at + dur); s.connect(f).connect(g).connect(out); s.start(at); s.stop(at + dur + 0.02) }
    if (track === 'kick') osc('sine', 160, 42, 0.38, 1)
    else if (track === 'snare') { noise('highpass', 1500, 0.2, 0.7); osc('triangle', 220, 120, 0.12, 0.5) }
    else if (track === 'clap') { for (const d of [0, 0.012, 0.026]) noise('bandpass', 1500, 0.09, 0.6, time + d); noise('bandpass', 1500, 0.2, 0.5, time + 0.04) }
    else if (track === 'tom') osc('sine', 220, 95, 0.3, 0.9)
  }

  // ---- scheduler: look ahead a little, play each step at its exact audio time ----
  function stepSeconds() { return 60 / state.pattern.tempo / (state.pattern.steps / 4) }
  function schedule() {
    while (nextTime < ctx.currentTime + 0.12) {
      const p = state.pattern
      const step = nextStep % p.steps
      for (const track of TRACKS) if (p.tracks[track][step] === 'x') voice(track, nextTime)
      queue.push({ time: nextTime, step }); lastHeard = step
      heard.push(step)
      nextTime += stepSeconds(); nextStep = (step + 1) % p.steps
    }
  }
  const heard = []
  function frame() {
    while (queue.length > 1 && queue[1].time <= ctx.currentTime) queue.shift()
    const now = playing && queue.length > 0 && queue[0].time <= ctx.currentTime ? queue[0].step : -1
    for (const c of document.querySelectorAll('.cell.now')) c.classList.remove('now')
    if (now >= 0) for (const c of document.querySelectorAll('.cell[data-step="' + now + '"]')) c.classList.add('now')
    if (playing) requestAnimationFrame(frame)
  }
  async function play() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)()
    await ctx.resume()
    playing = true; nextTime = ctx.currentTime + 0.06; nextStep = 0; queue.length = 0
    timer = setInterval(schedule, 25); schedule(); requestAnimationFrame(frame)
    paintPlay()
  }
  function stop() { playing = false; clearInterval(timer); queue.length = 0; for (const c of document.querySelectorAll('.cell.now')) c.classList.remove('now'); paintPlay() }
  function paintPlay() { const b = $('play'); b.textContent = playing ? 'Stop' : 'Play'; b.classList.toggle('on', playing) }

  // ---- rendering ----
  function render() {
    const p = state.pattern
    $('tempo').value = p.tempo; $('bpm').textContent = p.tempo
    for (const b of document.querySelectorAll('[data-steps]')) b.classList.toggle('on', Number(b.dataset.steps) === p.steps)
    const cols = 'repeat(' + p.steps + ', minmax(0, 1fr))'
    const ruler = $('ruler'); ruler.style.gridTemplateColumns = cols; ruler.replaceChildren(...Array.from({ length: p.steps }, (_u, i) => el('span', { textContent: i % (p.steps / 4) === 0 ? String(i / (p.steps / 4) + 1) : '' })))
    const grid = $('grid'); grid.replaceChildren()
    for (const track of TRACKS) {
      const cells = el('div', { className: 'cells' }); cells.style.gridTemplateColumns = cols
      for (let i = 0; i < p.steps; i += 1) {
        const on = p.tracks[track][i] === 'x'
        const cell = el('button', { type: 'button', className: 'cell' + (i % (p.steps / 4) === 0 ? ' beat' : '') + (on ? ' on' : '') })
        cell.dataset.step = i; cell.setAttribute('aria-label', track + ' step ' + (i + 1) + (on ? ' on' : ' off')); cell.setAttribute('aria-pressed', String(on))
        cell.addEventListener('click', () => edit(track, i))
        cells.append(cell)
      }
      const row = el('div', { className: 'track' }, el('span', { className: 'name', textContent: track }), cells); row.dataset.track = track
      grid.append(row)
    }
    const saved = $('saved'); saved.replaceChildren()
    const names = Object.keys(state.saved)
    if (names.length === 0) saved.append(el('span', { className: 'muted', textContent: 'No saved patterns yet.' }))
    for (const name of names) {
      const load = el('button', { type: 'button', textContent: name }); load.addEventListener('click', () => run('load', { name }))
      const del = el('button', { type: 'button', className: 'x', textContent: '×' }); del.setAttribute('aria-label', 'Delete ' + name); del.addEventListener('click', () => run('delete', { name }))
      saved.append(el('span', { className: 'chip' }, load, del))
    }
    if (playing) for (const c of document.querySelectorAll('.cell')) c.disabled = false
  }
  function flash(message) { $('msg').textContent = message; clearTimeout(flash.t); flash.t = setTimeout(() => { $('msg').textContent = '' }, 3500) }

  // ---- edits: the page changes its own copy at once, then tells the server ----
  async function run(path, body) { busy += 1; try { state = await api(path, body); render() } catch (e) { flash(e.message) } finally { busy -= 1 } }
  function edit(track, i) {
    const p = structuredClone(state.pattern)
    p.tracks[track] = p.tracks[track].slice(0, i) + (p.tracks[track][i] === 'x' ? '.' : 'x') + p.tracks[track].slice(i + 1)
    state = { ...state, pattern: p }; render(); run('pattern', { pattern: p })
  }
  function change(patch) { const p = { ...structuredClone(state.pattern), ...patch }; state = { ...state, pattern: p }; render(); run('pattern', { pattern: p }) }
  function resize(steps) {
    const p = structuredClone(state.pattern); if (p.steps === steps) return
    for (const t of TRACKS) p.tracks[t] = steps > p.steps ? p.tracks[t].repeat(steps / p.steps) : p.tracks[t].slice(0, steps)
    p.steps = steps; state = { ...state, pattern: p }; render(); run('pattern', { pattern: p })
  }

  $('play').addEventListener('click', () => (playing ? stop() : play()))
  document.addEventListener('keydown', e => { if (e.code === 'Space' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); playing ? stop() : play() } })
  let tempoTimer
  $('tempo').addEventListener('input', e => { const bpm = Number(e.target.value); $('bpm').textContent = bpm; state = { ...state, pattern: { ...state.pattern, tempo: bpm } }; clearTimeout(tempoTimer); tempoTimer = setTimeout(() => change({ tempo: bpm }), 200) })
  for (const b of document.querySelectorAll('[data-steps]')) b.addEventListener('click', () => resize(Number(b.dataset.steps)))
  $('clear').addEventListener('click', () => { const p = structuredClone(state.pattern); for (const t of TRACKS) p.tracks[t] = '.'.repeat(p.steps); state = { ...state, pattern: p }; render(); run('pattern', { pattern: p }) })
  $('styles').replaceChildren(...STYLES.map(name => { const b = el('button', { type: 'button', textContent: name === 'hiphop' ? 'hip-hop' : name }); b.style.marginRight = '8px'; b.addEventListener('click', () => run('style', { style: name })); return b }))
  $('save').addEventListener('click', () => { const name = $('name').value.trim(); if (!name) return flash('Type a name first.'); run('save', { name }).then(() => { $('name').value = ''; flash('Saved "' + name + '".') }) })
  $('name').addEventListener('keydown', e => { if (e.key === 'Enter') $('save').click() })

  async function poll() { if (busy > 0) return; try { const next = await api('state'); if (!state || next.version !== state.version) { state = next; render() } } catch {} }
  poll().then(() => setInterval(poll, 1500))
  window.__music = { get state() { return state }, get playing() { return playing }, get heard() { return heard }, get audio() { return ctx ? ctx.state : 'none' } }
})()
</script>
</body>
</html>`
}
