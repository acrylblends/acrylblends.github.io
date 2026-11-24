// ACRYL AOS, the page (spec 052, design/aos.html). Everything it changes goes through the computer's tools (POST api/aos/tool), the same ones the chat
// calls, so a click and an agent's step are one operation. Apps open in their own OS windows; AOS's own views (Files, Activity, Settings, Workflows, the
// last run) are drawn here. The chat is the frame's right panel.
'use strict'
const $ = (s) => document.querySelector(s)
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const desk = $('#desk')
const VIEWS = {
  files: { name: 'Files', color: '#0369A1', letter: '▤' },
  activity: { name: 'Activity', color: '#52525B', letter: '≋' },
  settings: { name: 'Settings', color: '#71717A', letter: '⚙' },
}
const WALLPAPERS = { default: 'var(--desk)', dusk: 'linear-gradient(160deg,#3b3f6b 0%,#7a5f86 60%,#c0858a 100%)', mint: 'linear-gradient(160deg,#cdeee3 0%,#e7f3ee 60%,#d6e7f2 100%)', plain: 'var(--surface-2)' }
const COLORS = ['#0E7490', '#7C3AED', '#B45309', '#BE123C', '#047857', '#3652D9', '#A21CAF', '#0369A1']
let S = { apps: [], desktop: { desk: [], dock: [], folders: {}, files: {}, prefs: {} }, meter: {} }
const ui = { open: {}, z: 10, filesAt: 'desk' }

async function api(path, body) {
  const r = await fetch(`api/aos/${path}`, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const v = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(v.error ?? `${r.status}`)
  return v
}
async function tool(name, args = {}) {
  try {
    const v = await api('tool', { tool: name, args })
    if (v?.refused) toast(v.refused)
    await load()
    return v
  } catch (e) { toast(e.message) }
}

const app = (id) => S.apps.find((a) => a.id === id)
const kindOf = (id) => (VIEWS[id] ? 'view' : app(id) ? 'app' : S.desktop.folders[id] ? 'folder' : S.desktop.files[id] ? 'file' : undefined)
const nameOf = (id) => VIEWS[id]?.name ?? app(id)?.name ?? S.desktop.folders[id]?.name ?? S.desktop.files[id]?.name ?? id
const parentOf = (id) => (S.desktop.desk.includes(id) ? 'desk' : Object.keys(S.desktop.folders).find((f) => S.desktop.folders[f].items.includes(id)))
const listOf = (where) => (where === 'desk' ? S.desktop.desk : S.desktop.folders[where]?.items ?? [])
const colorOf = (id) => COLORS[[...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % COLORS.length]

function glyph(id, size = '') {
  const k = kindOf(id)
  if (k === 'view') { const v = VIEWS[id]; return `<span class="appicon ${size}" style="background:${v.color}">${v.letter}</span>` }
  if (k === 'app') {
    const a = app(id)
    return a.icon ? `<img class="appicon ${size}" src="api/aos/icon/${encodeURIComponent(id)}" alt="">` : `<span class="appicon ${size}" style="background:${colorOf(id)}">${esc(a.name[0]?.toUpperCase())}</span>`
  }
  if (k === 'folder') return '<span class="glyph"><svg viewBox="0 0 48 40" aria-hidden="true"><path d="M3 8a4 4 0 0 1 4-4h11l4 4h19a4 4 0 0 1 4 4v22a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z" fill="var(--secondary)" opacity=".85"/><path d="M3 14h42v20a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z" fill="var(--secondary)"/></svg></span>'
  const ext = (S.desktop.files[id]?.name.split('.').pop() ?? '').toUpperCase()
  return `<span class="glyph"><svg viewBox="0 0 40 48" aria-hidden="true"><path d="M6 2h20l10 10v32a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill="var(--surface)" stroke="var(--border)" stroke-width="2"/><path d="M26 2v10h10" fill="none" stroke="var(--border)" stroke-width="2"/></svg><span class="ext">${esc(ext)}</span></span>`
}
const running = (id) => app(id)?.state === 'running' || app(id)?.state === 'starting'
const iconButton = (id) => `<button class="dicon" draggable="true" data-item="${esc(id)}" aria-label="${esc(nameOf(id))}">${glyph(id)}${running(id) ? '<span class="run" title="running"></span>' : app(id)?.state === 'asleep' ? '<span class="run zz" title="asleep: opens again on the next click"></span>' : ''}<span class="lbl">${esc(nameOf(id))}</span></button>`

function render() {
  const p = S.desktop.prefs
  desk.style.background = WALLPAPERS[p.wallpaper] ?? WALLPAPERS.default
  $('#pc').classList.toggle('big', !!p.big)
  desk.classList.toggle('withleft', !!p.dockLeft)
  if (!document.querySelector('.dicon input')) $('#icons').innerHTML = S.desktop.desk.filter(kindOf).map(iconButton).join('')
  const extra = S.apps.filter((a) => running(a.id) && !S.desktop.dock.includes(a.id)).map((a) => a.id)
  const dockBtn = (id) => `<button data-item="${esc(id)}" aria-label="${esc(nameOf(id))}" title="${esc(nameOf(id))}">${glyph(id, 'sm')}<span class="ind ${running(id) || ui.open[id] ? 'on' : ''}"></span></button>`
  const dock = $('#dock')
  dock.classList.toggle('left', !!p.dockLeft)
  dock.innerHTML = '<button data-lp aria-label="All apps"><span class="appicon sm" style="background:linear-gradient(135deg,#3652D9,#0E7490)">⊞</span><span class="ind"></span></button><span class="sep"></span>'
    + S.desktop.dock.filter(kindOf).map(dockBtn).join('') + (extra.length ? `<span class="sep"></span>${extra.map(dockBtn).join('')}` : '')
  $('#mApps').textContent = S.apps.length
  $('#mRun').textContent = S.meter.running ?? 0
  $('#mSleep').textContent = S.apps.filter((a) => a.state === 'asleep').length
  $('#mTools').textContent = S.meter.toolCalls ?? 0
  $('#mReplay').textContent = S.meter.replays ?? 0
  $('#mTok').textContent = (S.meter.modelTokens ?? 0).toLocaleString('en')
  for (const id of ['files', 'settings']) refresh(id)
}
async function load() {
  const before = S?.exports ?? {}
  try { S = await api('state') } catch { return }
  for (const [id, job] of Object.entries(S.exports ?? {})) {
    if (before[id]?.state === 'packing' && job.state !== 'packing')
      toast(job.state === 'done' ? `${nameOf(id)} installer ready in ${job.seconds} s: ${job.out}/${job.files.join(', ')}` : `Exporting ${nameOf(id)} failed; see ${job.log}`)
  }
  render()
}

// AOS's own windows
const BODY = {
  files: () => {
    const at = ui.filesAt in S.desktop.folders || ui.filesAt === 'desk' ? ui.filesAt : 'desk'
    const side = [['desk', 'Desktop'], ...Object.entries(S.desktop.folders).map(([id, f]) => [id, f.name])]
    const items = listOf(at).filter(kindOf)
    return `<div class="files"><div class="side"><small>Places</small>${side.map(([id, n]) => `<button data-place="${esc(id)}" aria-pressed="${id === at}">${id === 'desk' ? '🖥' : '📁'} ${esc(n)}</button>`).join('')}<small>Apps</small><button data-place="apps" aria-pressed="false">All apps</button></div>
      <div><div class="fl">${items.map(iconButton).join('') || '<p class="empty">Empty. Drag apps or files here, or onto a place on the left.</p>'}</div></div></div>`
  },
  activity: () => {
    const a = S.activity
    const pill = (state) => state === 'running' ? '<span class="pill ok">running</span>' : state === 'starting' ? '<span class="pill warn">starting</span>' : state === 'asleep' ? '<span class="pill off">asleep</span>' : '<span class="pill off">stopped</span>'
    const mb = (bytes) => bytes === undefined ? '-' : `${Math.round(bytes / 1048576).toLocaleString('en')} MB`
    const rows = S.apps.map((x) => { const u = a?.apps?.[x.id]; return `<tr><td>${esc(x.name)}</td><td>${pill(u?.state ?? x.state)}</td><td class="num">${mb(u?.rss)}</td><td class="num">${u?.processes ?? '-'}</td><td class="num">${a?.sizes?.[x.id]?.own ?? '…'}</td></tr>` }).join('')
    const wakes = (a?.wakes ?? []).map((w) => `${esc(nameOf(w.id))} ${w.seconds} s`).join(', ')
    return `<table><thead><tr><th>App</th><th>State</th><th class="num">Memory</th><th class="num">Processes</th><th class="num">Own files</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="note" style="margin-top:8px">Read from this computer's processes${a ? ` at ${esc(a.at)}` : ''}: each app's window, renderers and host added up. AOS host: ${a?.hostMemory ?? '…'}.
      An app unused for ${a?.sleepAfter ? `${a.sleepAfter} min` : '(never)'} sleeps: its host stops and the next open wakes it${wakes ? `; last wakes: ${wakes}` : ''}.</p>`
  },
  settings: () => {
    const p = S.desktop.prefs
    return `<div class="set">
      <div><h4>Wallpaper</h4><div class="swatches">${Object.entries(WALLPAPERS).map(([k, v]) => `<button data-set="wallpaper" data-v="${k}" aria-pressed="${p.wallpaper === k}" aria-label="${k}" style="background:${v}"></button>`).join('')}</div></div>
      <div><h4>Icons</h4><div class="opt"><label><input type="radio" name="ic" data-set="big" data-v="0" ${p.big ? '' : 'checked'}> Small</label><label><input type="radio" name="ic" data-set="big" data-v="1" ${p.big ? 'checked' : ''}> Large</label></div></div>
      <div><h4>Dock</h4><div class="opt"><label><input type="radio" name="dk" data-set="dockLeft" data-v="0" ${p.dockLeft ? '' : 'checked'}> Bottom</label><label><input type="radio" name="dk" data-set="dockLeft" data-v="1" ${p.dockLeft ? 'checked' : ''}> Left</label></div></div>
      <div><h4>Chat</h4><div class="opt"><label><input type="checkbox" data-set="chat" ${p.chat ? 'checked' : ''}> Show the ACRYL chat beside the desktop</label></div></div>
      <div><h4>Sleep</h4><div class="opt"><label>Put an app to sleep after <select data-set="sleepAfter">${[0, 5, 15, 30, 60].map((m) => `<option value="${m}" ${p.sleepAfter === m ? 'selected' : ''}>${m === 0 ? 'never' : `${m} min`}</option>`).join('')}</select> unused</label></div></div>
      <p class="note">Saved as one file, ${esc(S.home)}/desktop.json. The agent changes it with desktop_arrange and desktop_move (deterministic, 0 tokens).</p></div>`
  },
  run: () => {
    const r = ui.run
    if (!r || r.steps.length === 0) return '<p class="empty">No chat run yet. Ask ACRYL something in the chat on the right; its tool steps and model steps show here.</p>'
    const own = r.steps.filter((s) => s.kind === 'tool' && s.ours)
    return `<div class="runs">${r.steps.map((s) => `<div class="step ${s.kind}"><span class="k"></span><span>${s.kind === 'tool' ? `<b>${esc(s.tool)}</b> ` : ''}${esc(s.text)}</span><span class="cost">${s.kind === 'model' ? `${s.tokens.toLocaleString('en')} tok` : '0 tok'}</span></div>`).join('')}</div>
      <p class="note" style="margin:10px 0 6px">${r.steps.filter((s) => s.kind === 'tool').length} tool calls, ${r.tokens.toLocaleString('en')} model tokens (the provider's usage).</p>
      ${own.length ? `<button class="btn small primary" data-save>Save as workflow</button> <span class="note">${own.length} of this computer's tool steps, replayed with no model</span>` : '<p class="note">No AOS tool steps in this run, so there is nothing to replay.</p>'}`
  },
  flow: () => {
    const w = ui.workflows
    if (w === undefined) return '<p class="empty">Reading Workflow Automation…</p>'
    if (w.error) return `<p class="empty">${esc(w.error)}</p>`
    if (w.workflows.length === 0) return '<p class="empty">No workflows yet. After a chat run, open Go > Last run and press "Save as workflow".</p>'
    return w.workflows.map((f) => `<div class="card" style="padding:10px;margin-bottom:8px"><b>${esc(f.name)}</b> <span class="pill ok">published v${esc(f.version)}</span><div style="margin-top:8px"><button class="btn small primary" data-replay="${esc(f.id)}">Run again (no model)</button></div></div>`).join('')
  },
  file: (id) => `<pre>${esc(ui.fileText?.[id] ?? 'Reading…')}</pre>`,
}
const TITLES = { files: 'Files', activity: 'Activity', settings: 'Settings', run: 'Last run', flow: 'Workflows' }

function openWindow(id, title = TITLES[id] ?? nameOf(id)) {
  $('#launchpad').hidden = true
  if (ui.open[id]) { refresh(id); focus(id); return }
  const n = Object.keys(ui.open).length
  const w = document.createElement('div')
  w.className = 'w'; w.dataset.id = id
  const width = id === 'activity' || id === 'run' ? 480 : id === 'files' ? 460 : 400
  Object.assign(w.style, { left: `${(desk.clientWidth < 600 ? 8 : 120 + (n * 34) % 260)}px`, top: `${16 + (n * 30) % 200}px`, width: `${width}px`, height: `${id === 'activity' || id === 'settings' || id === 'run' ? 400 : 320}px` })
  w.innerHTML = `<div class="bar"><button class="cl" aria-label="Close ${esc(title)}"></button><button class="mn" aria-label="Minimize ${esc(title)}"></button><span class="t">${esc(title)}</span></div><div class="wb"></div>`
  desk.appendChild(w)
  ui.open[id] = w
  w.querySelector('.cl').onclick = () => { w.remove(); delete ui.open[id]; $('#focusName').textContent = 'Desktop' }
  w.querySelector('.mn').onclick = () => { w.hidden = true }
  w.addEventListener('pointerdown', () => focus(id))
  drag(w)
  refresh(id); focus(id)
}
function refresh(id) { const w = ui.open[id]; if (w) w.querySelector('.wb').innerHTML = (id.startsWith('file-') ? BODY.file(id) : BODY[id]?.()) ?? '' }
function focus(id) { const w = ui.open[id]; if (!w) return; w.hidden = false; document.querySelectorAll('.w').forEach((x) => x.classList.remove('focused')); w.classList.add('focused'); w.style.zIndex = ++ui.z; $('#focusName').textContent = w.querySelector('.t').textContent }
function drag(w) {
  const bar = w.querySelector('.bar')
  bar.addEventListener('pointerdown', (e) => {
    if (e.target.tagName === 'BUTTON') return
    const r = w.getBoundingClientRect(), d = desk.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top
    bar.setPointerCapture(e.pointerId); bar.style.cursor = 'grabbing'
    const move = (ev) => { w.style.left = `${Math.max(0, Math.min(d.width - 80, ev.clientX - d.left - dx))}px`; w.style.top = `${Math.max(0, Math.min(d.height - 40, ev.clientY - d.top - dy))}px` }
    const up = () => { bar.removeEventListener('pointermove', move); bar.removeEventListener('pointerup', up); bar.style.cursor = '' }
    bar.addEventListener('pointermove', move); bar.addEventListener('pointerup', up)
  })
}
let toastTimer
function toast(text) { const t = $('#toast'); t.textContent = text; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true }, 4200) }

async function openItem(id) {
  const k = kindOf(id)
  if (k === 'view') { if (id === 'activity') loadActivity(); openWindow(id) }
  else if (k === 'app') {
    const a = app(id)
    if (a.state === 'running') toast(`${a.name} is open in its own window.`)
    else { toast(`Opening ${a.name} in its own window: its host starts, then the window shows.`); await tool('system_open', { app: id }) }
  } else if (k === 'folder') { ui.filesAt = id; openWindow('files') }
  else if (k === 'file') {
    const f = S.desktop.files[id]
    if (f.app && app(f.app)) { openItem(f.app); return }
    openWindow(id, f.name)
    try { ui.fileText = { ...ui.fileText, [id]: (await api(`file/${encodeURIComponent(id)}`)).text || '(empty)' } } catch (e) { ui.fileText = { ...ui.fileText, [id]: e.message } }
    refresh(id)
  }
}
async function loadActivity() { try { S.activity = await api('activity') } catch { /* shown as … */ } refresh('activity') }
async function showRun() {
  try { ui.run = await api('run') } catch (e) { ui.run = undefined; toast(e.message) }
  openWindow('run'); render()
}
async function showWorkflows() {
  openWindow('flow')
  try { ui.workflows = await api('workflows') } catch (e) { ui.workflows = { error: e.message } }
  refresh('flow')
}

// drag and drop of icons: onto a folder icon, a place in Files, an open Files window, or the desktop
desk.addEventListener('dragstart', (e) => { const b = e.target.closest('[data-item]'); if (b) e.dataTransfer.setData('text/plain', b.dataset.item) })
const dropTarget = (e) => e.target.closest('.dicon[data-item], .side [data-place], .w[data-id="files"] .wb, #icons, .desk')
desk.addEventListener('dragover', (e) => {
  const t = dropTarget(e); if (!t) return
  if (t.matches('.dicon') && kindOf(t.dataset.item) !== 'folder') return
  e.preventDefault(); document.querySelectorAll('.drop').forEach((x) => x.classList.remove('drop')); if (t.matches('.dicon, [data-place]')) t.classList.add('drop')
})
desk.addEventListener('dragleave', (e) => e.target.closest?.('.drop')?.classList.remove('drop'))
desk.addEventListener('drop', (e) => {
  e.preventDefault(); document.querySelectorAll('.drop').forEach((x) => x.classList.remove('drop'))
  const id = e.dataTransfer.getData('text/plain'); if (!id) return
  const t = dropTarget(e)
  const to = t?.matches('.dicon') ? t.dataset.item : t?.matches('[data-place]') ? t.dataset.place : t?.matches('.wb') ? ui.filesAt : 'desk'
  if (to !== 'apps' && to !== id && parentOf(id) !== to) tool('desktop_move', { items: [id], to })
})

desk.addEventListener('click', (e) => {
  closeMenus()
  const place = e.target.closest('[data-place]')
  if (place) { if (place.dataset.place === 'apps') showLaunchpad(); else { ui.filesAt = place.dataset.place; refresh('files') } return }
  const set = e.target.closest('[data-set]'); if (set && set.tagName === 'BUTTON') { applySetting(set); return }
  if (e.target.closest('[data-save]')) { saveRun(e.target.closest('[data-save]')); return }
  const rep = e.target.closest('[data-replay]'); if (rep) { replay(rep); return }
  const b = e.target.closest('[data-item]'); if (b) { openItem(b.dataset.item); return }
  if (e.target.closest('[data-lp]')) { showLaunchpad(); return }
  if (e.target === $('#launchpad')) $('#launchpad').hidden = true
  $('#ctx').hidden = true
})
desk.addEventListener('change', (e) => { if (e.target.matches('[data-set]')) applySetting(e.target) })
function frameControl() { try { return window.parent?.[Symbol.for('acryl.frame.control')] } catch { return undefined } }
async function showChat(on) { await frameControl()?.run({ action: on ? 'open' : 'close', panel: 'right' }).catch(() => undefined) }
async function applySetting(el) {
  const k = el.dataset.set
  const args = k === 'wallpaper' ? { wallpaper: el.dataset.v } : k === 'chat' ? { chat: el.checked } : k === 'sleepAfter' ? { sleepAfter: Number(el.value) } : { [k]: el.dataset.v === '1' }
  await tool('desktop_arrange', args)
  if (k === 'chat') showChat(el.checked)
}
async function saveRun(button) {
  const steps = ui.run.steps.filter((s) => s.kind === 'tool' && s.ours).map((s) => ({ tool: s.tool, args: s.args }))
  const name = ui.run.title || 'AOS run'
  button.disabled = true; button.textContent = 'Saving…'
  try { const w = await api('workflows', { name, steps }); toast(`Saved "${w.name}" in Workflow Automation: ${w.steps} steps. It runs again with no model.`); showWorkflows() } catch (e) { toast(e.message); button.disabled = false; button.textContent = 'Save as workflow' }
}
async function replay(button) {
  button.disabled = true
  try { const r = await api('workflows/run', { id: button.dataset.replay }); toast(`Ran again from Workflow Automation: ${r.status}, 0 model tokens.`); await load() } catch (e) { toast(e.message) }
  button.disabled = false
}

// right-click menus: an item, or the desktop itself
desk.addEventListener('contextmenu', (e) => {
  if (e.target.closest('.w .bar, input')) return
  const b = e.target.closest('[data-item]')
  if (b) { e.preventDefault(); itemMenu(b.dataset.item, e.clientX, e.clientY); return }
  if (e.target.closest('.w')) return
  e.preventDefault(); deskMenu(e.clientX, e.clientY)
})
let press
desk.addEventListener('pointerdown', (e) => { const b = e.target.closest('.dicon'); if (b && e.pointerType !== 'mouse') press = setTimeout(() => itemMenu(b.dataset.item, e.clientX, e.clientY), 550) })
desk.addEventListener('pointerup', () => clearTimeout(press))
function showMenu(x, y, entries) {
  const d = desk.getBoundingClientRect(), m = $('#ctx')
  m.innerHTML = entries.map((en) => (en === '-' ? '<hr>' : `<button role="menuitem" data-k="${en[0]}">${esc(en[1])}</button>`)).join('')
  m.hidden = false
  m.style.left = `${Math.max(4, Math.min(x - d.left, d.width - 224))}px`; m.style.top = `${Math.max(4, Math.min(y - d.top, d.height - m.offsetHeight - 6))}px`
  const acts = Object.fromEntries(entries.filter((en) => en !== '-').map((en) => [en[0], en[2]]))
  m.onclick = (ev) => { const k = ev.target.closest('[data-k]')?.dataset.k; if (!k) return; m.hidden = true; acts[k]() }
  m.querySelector('button')?.focus()
}
function moveEntries(id) {
  const where = parentOf(id)
  return [...Object.entries(S.desktop.folders).filter(([f]) => f !== id && f !== where).map(([f, v]) => [`mv-${f}`, `Move to ${v.name}`, () => tool('desktop_move', { items: [id], to: f })]),
    ...(where !== 'desk' ? [['mv-desk', 'Move to Desktop', () => tool('desktop_move', { items: [id], to: 'desk' })]] : [])]
}
function itemMenu(id, x, y) {
  const k = kindOf(id)
  const inDock = S.desktop.dock.includes(id)
  const dockEntry = ['dock', inDock ? 'Remove from Dock' : 'Keep in Dock', () => tool('desktop_dock', { item: id, keep: !inDock })]
  if (k === 'app') {
    const a = app(id)
    showMenu(x, y, [
      ['open', a.state === 'running' ? 'Open (running)' : 'Open in its own window', () => openItem(id)], '-', dockEntry, ...moveEntries(id), '-',
      ['apps', 'Add to Applications', () => api('applications', { id, on: true }).then((r) => toast(r.problems.length ? `Added, with: ${r.problems.join('; ')}` : `${a.name} is in Applications: the OS search finds it now.`), (e) => toast(e.message))],
      ['unapps', 'Remove from Applications', () => api('applications', { id, on: false }).then(() => toast(`${a.name} is no longer in Applications.`), (e) => toast(e.message))],
      ['export', 'Export as installer', () => api('export', { id }).then((r) => toast(`Exporting ${a.name} with acrylblends pack into ${r.out}; this takes a few minutes.`), (e) => toast(e.message))],
      ...(a.state === 'running' ? ['-', ['stop', 'Sleep (stop its host)', () => tool('system_stop', { app: id })]] : []),
    ])
  } else if (k === 'folder') {
    showMenu(x, y, [['open', 'Open', () => openItem(id)], ['ren', 'Rename', () => startRename(id)], '-', dockEntry, ['del', 'Remove folder (keeps what is in it)', () => tool('desktop_folder_remove', { folder: id })]])
  } else if (k === 'view') {
    showMenu(x, y, [['open', 'Open', () => openItem(id)], '-', dockEntry, ...moveEntries(id)])
  } else {
    const f = S.desktop.files[id]
    showMenu(x, y, [['open', f.app && app(f.app) ? `Open with ${nameOf(f.app)}` : 'Open', () => openItem(id)], ['ren', 'Rename', () => startRename(id)], ...moveEntries(id)])
  }
}
function deskMenu(x, y) {
  showMenu(x, y, [
    ['nf', 'New folder', () => newFolder()], ['nn', 'New note', () => newNote()], '-',
    ['sn', 'Sort by name', () => tool('desktop_arrange', { sort: 'name' })], ['sk', 'Sort by kind', () => tool('desktop_arrange', { sort: 'kind' })], '-',
    ['wp', 'Change wallpaper', () => openWindow('settings')], ['cu', 'Customize the desktop', () => openWindow('settings')],
  ])
}
async function newFolder() { const v = await tool('desktop_folder_create', { name: `New folder ${Object.keys(S.desktop.folders).length + 1}` }); if (v?.folder) startRename(v.folder) }
async function newNote() { try { const r = await api('note', { name: 'Untitled' }); await load(); startRename(r.id) } catch (e) { toast(e.message) } }
function startRename(id) {
  const holder = document.querySelector(`.dicon[data-item="${CSS.escape(id)}"] .lbl`); if (!holder) return
  const input = document.createElement('input'); input.value = nameOf(id); holder.replaceWith(input); input.focus(); input.select()
  let done = false
  const finish = async (ok) => { if (done) return; done = true; const v = input.value.trim(); input.remove(); if (ok && v && v !== nameOf(id)) await tool('desktop_rename', { item: id, name: v }); else render() }
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false) })
  input.addEventListener('blur', () => finish(true))
  input.addEventListener('click', (e) => e.stopPropagation())
}
function showLaunchpad() {
  const lp = $('#launchpad'); lp.hidden = false
  const all = [...S.apps.map((a) => a.id), ...Object.keys(VIEWS)]
  const draw = (q) => { $('#lpGrid').innerHTML = all.filter((id) => nameOf(id).toLowerCase().includes(q.toLowerCase())).map(iconButton).join('') || '<p class="empty">No app matches.</p>' }
  draw(''); const s = $('#lpSearch'); s.value = ''; s.oninput = () => draw(s.value); s.focus()
}

// the menu bar
const MENUS = [
  ['ACRYL AOS', [['About AOS', () => toast('ACRYL AOS: your ACRYL apps as a computer. Each app opens in its own window with its own host; the chat drives them with tools.')], ['Settings…', () => openWindow('settings'), '⌘,']]],
  ['File', [['New folder', () => newFolder(), '⇧⌘N'], ['New note', () => newNote(), '⌘N'], '-', ['Open Files', () => { ui.filesAt = 'desk'; openWindow('files') }]]],
  ['View', [['Sort by name', () => tool('desktop_arrange', { sort: 'name' })], ['Sort by kind', () => tool('desktop_arrange', { sort: 'kind' })], '-', ['Large icons', () => tool('desktop_arrange', { big: !S.desktop.prefs.big })], ['Dock on the left', () => tool('desktop_arrange', { dockLeft: !S.desktop.prefs.dockLeft })], ['Show the chat', () => { const on = !S.desktop.prefs.chat; tool('desktop_arrange', { chat: on }); showChat(on) }]]],
  ['Go', [['Files', () => { ui.filesAt = 'desk'; openWindow('files') }], ['Last run', () => showRun()], ['Workflows', () => showWorkflows()], ['Activity', () => openItem('activity')], ['All apps', () => showLaunchpad()]]],
  ['Help', [['Ask ACRYL', () => showChat(true)]]],
]
const ticks = { 'Large icons': () => S.desktop.prefs.big, 'Dock on the left': () => S.desktop.prefs.dockLeft, 'Show the chat': () => S.desktop.prefs.chat }
$('#menus').innerHTML = MENUS.map(([t, items], i) => `<div><button aria-haspopup="menu" aria-expanded="false" data-menu="${i}" ${i === 0 ? 'style="font-weight:800;letter-spacing:.03em"' : ''}>${esc(t)}</button><div class="menu" role="menu" hidden>${items.map((it, j) => (it === '-' ? '<hr>' : `<button role="menuitem" data-mi="${i}.${j}"><span>${esc(it[0])}</span><kbd>${it[2] ?? ''}</kbd></button>`)).join('')}</div></div>`).join('')
function closeMenus() { document.querySelectorAll('.menus .menu').forEach((m) => { m.hidden = true; m.previousElementSibling.setAttribute('aria-expanded', 'false') }) }
$('#menus').addEventListener('click', (e) => {
  e.stopPropagation()
  const mi = e.target.closest('[data-mi]')
  if (mi) { const [i, j] = mi.dataset.mi.split('.').map(Number); closeMenus(); MENUS[i][1][j][1](); return }
  const top = e.target.closest('[data-menu]'); if (!top) return
  const m = top.nextElementSibling, wasOpen = !m.hidden
  closeMenus(); if (wasOpen) return
  m.querySelectorAll('[data-mi]').forEach((b) => { const label = b.querySelector('span').textContent; if (ticks[label]) b.querySelector('kbd').textContent = ticks[label]() ? '✓' : '' })
  m.hidden = false; top.setAttribute('aria-expanded', 'true'); m.querySelector('button')?.focus()
})
document.addEventListener('click', (e) => { if (!e.target.closest('.menus')) closeMenus() })
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { $('#launchpad').hidden = true; $('#ctx').hidden = true; closeMenus() } })

// The frame around AOS: no left panel (branches are one app's history; AOS is a computer), the chat on the right as the person chose.
async function tidyFrame() {
  const control = frameControl(); if (!control) return
  await control.run({ action: 'close', panel: 'left' }).catch(() => undefined)
  if (S.desktop.prefs.chat !== false) await control.run({ action: 'open', panel: 'right' }).catch(() => undefined)
}
// The last run follows the chat: a new turn with this computer's tools opens the Last run window.
let lastTurn
async function watchRun() {
  try {
    const r = await api('run')
    if (r.turn && r.turn !== lastTurn) { const first = lastTurn === undefined; lastTurn = r.turn; ui.run = r; if (!first && r.steps.some((s) => s.ours)) openWindow('run'); refresh('run') }
  } catch { /* no chat yet */ }
}
load().then(tidyFrame)
setInterval(load, 2500)
setInterval(watchRun, 3000)
