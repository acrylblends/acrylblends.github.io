// acryl-gtd (browser half): the GTD board IS this app's main surface.
// Type:     client plugin (claims `desktop.main` through acryl-app-shell)
// Surfaces: web desktop
// Rule:     a domain plugin's own UI is a slot registration, never a Host route (specs/036-cordis-ecosystem-and-acryl-blends/blend-instance-design.md, 0a).
//           The app opens on the board; the agent's conversation sits beside it. Data goes through the plugin's own `/api/acryl-gtd/*` endpoints, the
//           same store the agent's tools use, polled every 2 s, so what the agent captures or triages shows up while you watch.
window.__ModuleLoader__.load({ id: 'acryl-gtd', factory: (require) => {
var module = { exports: {} }; var exports = module.exports;

const React = require('react')
const shell = require('acryl-app-shell/client')
const h = React.createElement
const { useEffect, useState } = React

const BUCKETS = ['inbox', 'next', 'waiting', 'someday', 'reference']
const LABEL = { inbox: 'Inbox', next: 'Next Actions', waiting: 'Waiting For', someday: 'Someday/Maybe', reference: 'Reference' }
const DOT = { inbox: '#f59f00', next: '#1971c2', waiting: '#e03131', someday: '#868e96', reference: '#2f9e44' }

const CSS = `
.acg { display:grid; grid-template-columns:minmax(0,1fr) minmax(360px,440px); height:100%; min-height:0; background:#f5f7fa; color:#1b2330; font:15px/1.45 -apple-system,"Segoe UI",system-ui,sans-serif; }
.acg-board { overflow:auto; padding:22px 24px 40px; display:grid; gap:14px; align-content:start; min-width:0; }
.acg-board .head { display:flex; align-items:center; gap:14px; }
.acg-board h1 { margin:0; font-size:24px; letter-spacing:-.01em; }
.acg-board .live { margin-left:auto; color:#5d6878; font-size:13px; }
.acg-board .live i { display:inline-block; width:8px; height:8px; border-radius:50%; background:#1971c2; margin-right:6px; }
.acg-board .tabs { display:flex; gap:4px; border-bottom:1px solid #dde3ea; }
.acg-board .tabs button { font:600 14px inherit; font-family:inherit; color:#5d6878; background:none; border:0; border-bottom:2px solid transparent; padding:8px 14px; cursor:pointer; margin-bottom:-1px; }
.acg-board .tabs button.on { color:#1b2330; border-bottom-color:#1971c2; }
.acg-board .capture { font:inherit; width:100%; box-sizing:border-box; padding:11px 14px; border:1px solid #cdd6e0; border-radius:10px; background:#fff; color:#1b2330; }
.acg-board .capture:focus-visible { outline:2px solid #1971c2; outline-offset:1px; }
.acg-board .cols { display:grid; grid-template-columns:repeat(5, minmax(120px, 1fr)); gap:10px; overflow-x:auto; }
.acg-board .col { background:#eaeef3; border-radius:12px; padding:10px; display:grid; grid-template-columns:minmax(0, 1fr); gap:8px; align-content:start; min-width:0; }
.acg-board .col h3 { margin:0; font-size:13px; display:flex; align-items:center; gap:6px; }
.acg-board .col h3 .n { margin-left:auto; color:#5d6878; font-weight:500; }
.acg-board .dot { width:8px; height:8px; border-radius:50%; flex:none; }
.acg-board .card { background:#fff; border:1px solid #dde3ea; border-radius:10px; padding:9px 10px; display:grid; grid-template-columns:minmax(0, 1fr); gap:6px; font-size:14px; min-width:0; overflow-wrap:anywhere; }
.acg-board select.chip { flex:1 1 76px; min-width:76px; }
.acg-board .card .p { font-size:11px; font-weight:600; color:#1971c2; text-transform:uppercase; letter-spacing:.04em; }
.acg-board .meta { font-size:12px; color:#5d6878; }
.acg-board .chips { display:flex; flex-wrap:wrap; gap:4px; }
.acg-board .chip { font:600 11px inherit; font-family:inherit; color:#5d6878; background:#f5f7fa; border:1px solid #dde3ea; border-radius:999px; padding:3px 8px; cursor:pointer; max-width:100%; }
.acg-board .chip:hover { color:#1b2330; border-color:#1971c2; }
.acg-board .chip.done { color:#2f9e44; border-color:#b2f2bb; }
.acg-board .empty { color:#8a94a3; font-size:13px; padding:6px 2px; }
.acg-board .row { display:flex; align-items:center; gap:10px; background:#fff; border:1px solid #dde3ea; border-radius:10px; padding:9px 12px; flex-wrap:wrap; }
.acg-board .row .t { flex:1; min-width:180px; }
.acg-board .buckets { display:flex; flex-wrap:wrap; gap:6px; }
.acg-board .bucket { font:600 13px inherit; font-family:inherit; display:flex; align-items:center; gap:6px; background:#fff; border:1px solid #dde3ea; border-radius:999px; padding:5px 12px; cursor:pointer; color:#1b2330; }
.acg-board .bucket.on { border-color:#1971c2; background:#e7f5ff; }
.acg-board .cal { display:grid; grid-template-columns:repeat(7, minmax(0, 1fr)); gap:6px; }
.acg-board .day { background:#fff; border:1px solid #dde3ea; border-radius:10px; padding:8px; min-height:84px; display:grid; gap:4px; align-content:start; font-size:12px; }
.acg-board .day.today { border-color:#1971c2; }
.acg-board .day b { font-size:12px; color:#5d6878; }
.acg-board .proj { background:#fff; border:1px solid #dde3ea; border-radius:12px; padding:12px 14px; display:grid; gap:6px; }
.acg-board .bar { height:6px; border-radius:999px; background:#eaeef3; overflow:hidden; }
.acg-board .bar i { display:block; height:100%; background:#2f9e44; }
.acg-board .err { color:#c92a2a; font-size:13px; }
.acg-agent { border-left:1px solid #dde3ea; min-width:0; min-height:0; display:flex; flex-direction:column; background:var(--dsw-alias-bg-l1, #fff); }
.acg-agent > div { flex:1; min-height:0; }
`

async function api(path, body) {
  const res = await fetch('/api/acryl-gtd/' + path, body === undefined
    ? { credentials: 'same-origin' }
    : { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data && data.error ? data.error : 'HTTP ' + res.status)
  return data
}

const isoDay = d => d.toISOString().slice(0, 10)
const addDays = (day, n) => { const d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return isoDay(d) }
const startOfWeek = day => { const d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); return isoDay(d) }

function Chips({ item, move }) {
  return h('div', { className: 'chips' },
    h('select', { className: 'chip', 'aria-label': 'Move "' + item.title + '"', value: '', onChange: e => { if (e.target.value) move(item.id, e.target.value) } },
      h('option', { value: '' }, 'Move to...'),
      BUCKETS.filter(b => b !== item.status).map(b => h('option', { key: b, value: b }, LABEL[b]))),
    h('button', { type: 'button', className: 'chip done', onClick: () => move(item.id, 'done') }, 'Done'))
}

function Title({ item }) {
  return h('span', null, item.title,
    item.due ? h('span', { className: 'meta' }, '  due ' + item.due) : null,
    item.tags && item.tags.length ? h('span', { className: 'meta' }, '  ' + item.tags.map(t => '@' + t).join(' ')) : null)
}

function BoardView({ items, move }) {
  return h('div', { className: 'cols' }, BUCKETS.map(b => {
    const list = items.filter(i => i.status === b)
    return h('div', { key: b, className: 'col' },
      h('h3', null, h('span', { className: 'dot', style: { background: DOT[b] } }), LABEL[b], h('span', { className: 'n' }, list.length)),
      list.length === 0 ? h('div', { className: 'empty' }, 'empty') : list.map(i => h('div', { key: i.id, className: 'card' },
        i.project ? h('div', { className: 'p' }, i.project) : null, h(Title, { item: i }), h(Chips, { item: i, move }))))
  }))
}

function ListView({ items, move }) {
  const [bucket, setBucket] = useState('next')
  const list = items.filter(i => i.status === bucket)
  return h('div', { style: { display: 'grid', gap: 10 } },
    h('div', { className: 'buckets' }, BUCKETS.map(b => h('button', { key: b, type: 'button', className: 'bucket' + (bucket === b ? ' on' : ''), onClick: () => setBucket(b) },
      h('span', { className: 'dot', style: { background: DOT[b] } }), LABEL[b], h('span', { className: 'meta' }, items.filter(i => i.status === b).length)))),
    list.length === 0 ? h('div', { className: 'empty' }, 'nothing here') : list.map(i => h('div', { key: i.id, className: 'row' },
      h('span', { className: 'meta' }, '#' + i.id), h('span', { className: 't' }, i.project ? h('b', null, i.project + ': ') : null, h(Title, { item: i })), h(Chips, { item: i, move }))))
}

function CalendarView({ items }) {
  const today = isoDay(new Date())
  const [anchor, setAnchor] = useState(today)
  const start = startOfWeek(anchor)
  const days = [0, 1, 2, 3, 4, 5, 6].map(n => addDays(start, n))
  const due = d => items.filter(i => i.due === d && i.status !== 'done' && i.status !== 'trash')
  return h('div', { style: { display: 'grid', gap: 10 } },
    h('div', { className: 'buckets' },
      h('button', { type: 'button', className: 'bucket', onClick: () => setAnchor(addDays(anchor, -7)) }, '< Previous week'),
      h('button', { type: 'button', className: 'bucket', onClick: () => setAnchor(today) }, 'This week'),
      h('button', { type: 'button', className: 'bucket', onClick: () => setAnchor(addDays(anchor, 7)) }, 'Next week >')),
    h('div', { className: 'cal' }, days.map(d => h('div', { key: d, className: 'day' + (d === today ? ' today' : '') },
      h('b', null, new Date(d + 'T00:00:00Z').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', timeZone: 'UTC' })),
      due(d).map(i => h('div', { key: i.id }, i.title))))))
}

function ProjectsView({ items }) {
  const names = [...new Set(items.filter(i => i.project).map(i => i.project))].sort()
  if (names.length === 0) return h('div', { className: 'empty' }, 'No item has a project yet. Ask the agent to plan one.')
  return h('div', { style: { display: 'grid', gap: 10 } }, names.map(p => {
    const list = items.filter(i => i.project === p)
    const done = list.filter(i => i.status === 'done').length
    return h('div', { key: p, className: 'proj' },
      h('div', null, h('b', null, p), h('span', { className: 'meta' }, '  ' + (list.length - done) + ' open, ' + done + ' done')),
      h('div', { className: 'bar' }, h('i', { style: { width: Math.round(done / list.length * 100) + '%' } })),
      list.map(i => h('div', { key: i.id, className: 'meta', style: i.status === 'done' ? { textDecoration: 'line-through' } : null }, i.title)))
  }))
}

function Board() {
  const [state, setState] = useState(null)
  const [tab, setTab] = useState('board')
  const [err, setErr] = useState('')
  const [title, setTitle] = useState('')
  useEffect(() => {
    let alive = true
    const poll = async () => { try { const next = await api('state'); if (alive) { setErr(''); setState(s => (s && JSON.stringify(s) === JSON.stringify(next) ? s : next)) } } catch (e) { if (alive) setErr(e.message) } }
    poll(); const t = setInterval(poll, 2000)
    return () => { alive = false; clearInterval(t) }
  }, [])
  const move = async (id, status) => { try { setState(await api('triage', { id, status })) } catch (e) { setErr(e.message) } }
  const capture = async () => { const t = title.trim(); if (!t) return; try { setState(await api('capture', { title: t })); setTitle('') } catch (e) { setErr(e.message) } }
  if (state === null) return h('div', { className: 'acg-board' }, err ? h('div', { className: 'err' }, err) : h('p', null, 'Loading the board...'))
  const items = state.items.filter(i => i.status !== 'trash')
  const open = items.filter(i => i.status !== 'done').length
  const tabs = [['board', 'Board'], ['list', 'List'], ['calendar', 'Calendar'], ['projects', 'Projects']]
  return h('div', { className: 'acg-board' },
    h('div', { className: 'head' }, h('h1', null, 'Getting Things Done'), h('span', { className: 'live' }, h('i'), open + ' open · the agent plans here too')),
    h('input', { className: 'capture', placeholder: 'Capture anything - press Enter', value: title, onChange: e => setTitle(e.target.value), onKeyDown: e => { if (e.key === 'Enter') capture() } }),
    err ? h('div', { className: 'err', role: 'alert' }, err) : null,
    h('div', { className: 'tabs', role: 'tablist' }, tabs.map(([id, label]) => h('button', { key: id, type: 'button', role: 'tab', 'aria-selected': tab === id, className: tab === id ? 'on' : '', onClick: () => setTab(id) }, label))),
    tab === 'board' ? h(BoardView, { items, move }) : tab === 'list' ? h(ListView, { items, move }) : tab === 'calendar' ? h(CalendarView, { items }) : h(ProjectsView, { items }))
}

/** The app's main surface: the board, and the agent beside it. */
function GtdApp(props) {
  useEffect(() => {
    const style = document.createElement('style'); style.dataset.acrylGtd = ''; style.textContent = CSS
    document.head.appendChild(style)
    return () => style.remove()
  }, [])
  return h('div', { className: 'acg' },
    h(Board),
    h('aside', { className: 'acg-agent', 'aria-label': 'Agent' }, props.renderConversation ? props.renderConversation() : null))
}

exports.inject = ['slots', 'theme']

exports.apply = function apply(ctx) {
  const environment = shell.resolveShellEnvironment(window.location.hash)
  if (environment.mode !== 'advanced') return
  shell.applyAdvancedShell(ctx, environment)
  // Lower priority renders: below the shell's own fallback (100), which shows the plain conversation.
  ctx.slots.inject('desktop.main', () => ctx.slots.register({ name: 'desktop.main', priority: 0 }, GtdApp))
}

return module.exports; } });
