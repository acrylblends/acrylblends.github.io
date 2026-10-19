// acryl-organizer (browser half): to-dos and the day's calendar ARE this app's main surface.
// Type:     client plugin (claims `desktop.main` through acryl-app-shell)
// Surfaces: web desktop
// Rule:     a domain plugin's own UI is a slot registration, never a Host route (specs/036-cordis-ecosystem-and-acryl-blends/blend-instance-design.md, 0a).
//           The app opens on today; the agent's conversation sits beside it. Data goes through the plugin's own `/api/acryl-organizer/*` endpoints,
//           the same `.acryl/organizer.json` the agent's tools use, polled every 2 s. Times are UTC, as the domain defines them.
window.__ModuleLoader__.load({ id: 'acryl-organizer', factory: (require) => {
var module = { exports: {} }; var exports = module.exports;

const React = require('react')
const shell = require('acryl-app-shell/client')
const h = React.createElement
const { useEffect, useState } = React

const START_HOUR = 8, END_HOUR = 19, HOUR_PX = 52

const CSS = `
.aco { display:grid; grid-template-columns:minmax(0,1fr) minmax(360px,440px); height:100%; min-height:0; background:#fbf8f4; color:#2b2118; font:15px/1.45 -apple-system,"Segoe UI",system-ui,sans-serif; }
.aco-day { overflow:auto; padding:22px 24px 40px; display:grid; gap:16px; align-content:start; min-width:0; }
.aco-day .head { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
.aco-day h1 { margin:0; font-size:24px; letter-spacing:-.01em; }
.aco-day .nav { display:flex; gap:6px; margin-left:auto; align-items:center; }
.aco-day button { font:600 13px inherit; font-family:inherit; color:#2b2118; background:#fff; border:1px solid #e6dccf; border-radius:8px; padding:6px 11px; cursor:pointer; }
.aco-day button:hover { border-color:#e8590c; }
.aco-day button.go { color:#fff; background:#e8590c; border-color:#e8590c; }
.aco-day .cols { display:grid; grid-template-columns:minmax(0, 1fr) minmax(0, 1.25fr); gap:16px; align-items:start; }
.aco-day .panel { background:#fff; border:1px solid #e6dccf; border-radius:12px; padding:14px; display:grid; gap:10px; min-width:0; }
.aco-day h2 { margin:0; font-size:15px; }
.aco-day .muted { color:#8a7a6a; font-size:12px; }
.aco-day form { display:flex; flex-wrap:wrap; gap:8px; align-items:flex-end; }
.aco-day label { display:grid; gap:3px; font-size:11px; font-weight:600; color:#8a7a6a; }
.aco-day input { font:inherit; font-size:14px; color:#2b2118; background:#fff; border:1px solid #d9cbb9; border-radius:8px; padding:6px 8px; min-width:0; }
.aco-day input.grow { flex:1 1 140px; }
.aco-day .todo { display:flex; align-items:center; gap:10px; padding:7px 4px; border-bottom:1px solid #f1e9df; }
.aco-day .todo:last-child { border-bottom:0; }
.aco-day .todo .t { flex:1; min-width:0; }
.aco-day .todo.done .t { color:#b3a594; text-decoration:line-through; }
.aco-day .check { width:20px; height:20px; padding:0; border-radius:50%; border:2px solid #d9cbb9; background:#fff; flex:none; }
.aco-day .todo.done .check { background:#2f9e44; border-color:#2f9e44; }
.aco-day .due { font-size:12px; color:#8a7a6a; white-space:nowrap; }
.aco-day .due.today { color:#e8590c; font-weight:600; }
.aco-day .grid { position:relative; border-top:1px solid #f1e9df; }
.aco-day .hour { height:${HOUR_PX}px; border-bottom:1px solid #f1e9df; font-size:11px; color:#b3a594; padding:2px 0 0 2px; box-sizing:border-box; }
.aco-day .meeting { position:absolute; left:52px; right:6px; background:#fff4e6; border:1px solid #ffc078; border-left:4px solid #e8590c; border-radius:8px; padding:4px 8px; font-size:13px; overflow:hidden; display:flex; gap:8px; align-items:flex-start; }
.aco-day .meeting .w { color:#8a7a6a; font-size:12px; }
.aco-day .meeting button { margin-left:auto; padding:1px 7px; font-size:11px; }
.aco-day .err { color:#c92a2a; font-size:13px; flex-basis:100%; min-height:1em; }
.aco-agent { border-left:1px solid #e6dccf; min-width:0; min-height:0; display:flex; flex-direction:column; background:var(--dsw-alias-bg-l1, #fff); }
.aco-agent > div { flex:1; min-height:0; }
`

async function api(path, body) {
  const res = await fetch('/api/acryl-organizer/' + path, body === undefined
    ? { credentials: 'same-origin' }
    : { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data && data.error ? data.error : 'HTTP ' + res.status)
  return data
}

const isoDay = d => d.toISOString().slice(0, 10)
const addDays = (day, n) => { const d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return isoDay(d) }
const hhmm = iso => iso.slice(11, 16)
const label = day => new Date(day + 'T00:00:00Z').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })

function Todos({ state, setState, today }) {
  const [err, setErr] = useState('')
  const [showDone, setShowDone] = useState(false)
  const todos = state.todos.filter(t => showDone || !t.done)
  const add = async e => {
    e.preventDefault(); setErr('')
    const form = e.currentTarget
    const body = Object.fromEntries([...new FormData(form)].filter(([, v]) => v !== ''))
    try { setState(await api('todo', body)); form.reset() } catch (x) { setErr(x.message) }
  }
  const done = async id => { try { setState(await api('todo-done', { id })) } catch (x) { setErr(x.message) } }
  return h('div', { className: 'panel' },
    h('div', { className: 'head' }, h('h2', null, 'To-dos'), h('span', { className: 'muted' }, state.todos.filter(t => !t.done).length + ' open'),
      h('button', { type: 'button', style: { marginLeft: 'auto' }, onClick: () => setShowDone(!showDone) }, showDone ? 'Hide done' : 'Show done')),
    h('form', { onSubmit: add },
      h('input', { name: 'title', className: 'grow', required: true, placeholder: 'Add a to-do', 'aria-label': 'To-do' }),
      h('input', { name: 'due', type: 'date', 'aria-label': 'Due day' }),
      h('button', { className: 'go', type: 'submit' }, 'Add'),
      h('div', { className: 'err' }, err)),
    todos.length === 0 ? h('div', { className: 'muted' }, 'Nothing to do. Add one, or ask the agent.') : h('div', null, todos.map(t => h('div', { key: t.id, className: 'todo' + (t.done ? ' done' : '') },
      h('button', { type: 'button', className: 'check', 'aria-label': (t.done ? 'Done: ' : 'Mark done: ') + t.title, disabled: t.done, onClick: () => done(t.id) }),
      h('span', { className: 't' }, t.title),
      t.due ? h('span', { className: 'due' + (t.due <= today && !t.done ? ' today' : '') }, t.due === today ? 'today' : t.due) : null))))
}

function Calendar({ state, setState, day }) {
  const [err, setErr] = useState('')
  const meetings = state.meetings.filter(m => m.start.startsWith(day)).sort((a, b) => a.start.localeCompare(b.start))
  const book = async e => {
    e.preventDefault(); setErr('')
    const form = e.currentTarget
    const f = Object.fromEntries(new FormData(form))
    try { setState(await api('meeting', { title: f.title, start: day + 'T' + f.time + ':00Z', minutes: Number(f.minutes || 30), with: f.with || undefined })); form.reset() } catch (x) { setErr(x.message) }
  }
  const cancel = async id => { try { setState(await api('meeting-cancel', { id })) } catch (x) { setErr(x.message) } }
  const top = iso => { const d = new Date(iso); return (d.getUTCHours() + d.getUTCMinutes() / 60 - START_HOUR) * HOUR_PX }
  return h('div', { className: 'panel' },
    h('div', { className: 'head' }, h('h2', null, 'Calendar'), h('span', { className: 'muted' }, meetings.length + ' meeting' + (meetings.length === 1 ? '' : 's') + ' · times in UTC')),
    h('form', { onSubmit: book },
      h('input', { name: 'title', className: 'grow', required: true, placeholder: 'Book a meeting', 'aria-label': 'Meeting title' }),
      h('input', { name: 'time', type: 'time', required: true, defaultValue: '10:00', 'aria-label': 'Start (UTC)' }),
      h('input', { name: 'minutes', type: 'number', min: '5', step: '5', defaultValue: '30', style: { width: 64 }, 'aria-label': 'Minutes' }),
      h('input', { name: 'with', placeholder: 'with', style: { width: 90 }, 'aria-label': 'With' }),
      h('button', { className: 'go', type: 'submit' }, 'Book'),
      h('div', { className: 'err', role: 'alert' }, err)),
    h('div', { className: 'grid', style: { height: (END_HOUR - START_HOUR) * HOUR_PX } },
      Array.from({ length: END_HOUR - START_HOUR }, (_u, i) => h('div', { key: i, className: 'hour' }, String(START_HOUR + i).padStart(2, '0') + ':00')),
      meetings.map(m => {
        const t = Math.max(0, top(m.start)), b = Math.min((END_HOUR - START_HOUR) * HOUR_PX, top(m.end))
        return h('div', { key: m.id, className: 'meeting', style: { top: t, height: Math.max(26, b - t - 2) } },
          h('div', null, h('b', null, hhmm(m.start) + ' to ' + hhmm(m.end)), ' ', m.title, m.with ? h('span', { className: 'w' }, ' · with ' + m.with) : null),
          h('button', { type: 'button', 'aria-label': 'Cancel ' + m.title, onClick: () => cancel(m.id) }, 'Cancel'))
      })))
}

function Organizer() {
  const today = isoDay(new Date())
  const [state, setState] = useState(null)
  const [day, setDay] = useState(today)
  useEffect(() => {
    let alive = true
    const poll = async () => { try { const next = await api('state'); if (alive) setState(s => (s && JSON.stringify(s) === JSON.stringify(next) ? s : next)) } catch {} }
    poll(); const t = setInterval(poll, 2000)
    return () => { alive = false; clearInterval(t) }
  }, [])
  if (state === null) return h('div', { className: 'aco-day' }, h('p', null, 'Loading your day...'))
  return h('div', { className: 'aco-day' },
    h('div', { className: 'head' }, h('h1', null, label(day)),
      h('div', { className: 'nav' },
        h('button', { type: 'button', 'aria-label': 'Previous day', onClick: () => setDay(addDays(day, -1)) }, '<'),
        h('button', { type: 'button', onClick: () => setDay(today) }, 'Today'),
        h('button', { type: 'button', 'aria-label': 'Next day', onClick: () => setDay(addDays(day, 1)) }, '>'))),
    h('div', { className: 'cols' }, h(Todos, { state, setState, today }), h(Calendar, { state, setState, day })))
}

/** The app's main surface: the day, and the agent beside it. */
function OrganizerApp(props) {
  useEffect(() => {
    const style = document.createElement('style'); style.dataset.acrylOrganizer = ''; style.textContent = CSS
    document.head.appendChild(style)
    return () => style.remove()
  }, [])
  return h('div', { className: 'aco' },
    h(Organizer),
    h('aside', { className: 'aco-agent', 'aria-label': 'Agent' }, props.renderConversation ? props.renderConversation() : null))
}

exports.inject = ['slots', 'theme']

exports.apply = function apply(ctx) {
  const environment = shell.resolveShellEnvironment(window.location.hash)
  if (environment.mode !== 'advanced') return
  shell.applyAdvancedShell(ctx, environment)
  // Lower priority renders: below the shell's own fallback (100), which shows the plain conversation.
  ctx.slots.inject('desktop.main', () => ctx.slots.register({ name: 'desktop.main', priority: 0 }, OrganizerApp))
}

return module.exports; } });
