// outlay (browser half): the dashboard — full CRUD over the books, filters,
// dynamic categories, and a floating button for the agent. No build step.
window.__ModuleLoader__.load({ id: 'outlay', factory: (require) => {
var module = { exports: {} }; var exports = module.exports;

const React = require('react')
const h = React.createElement

const API = '/api/outlay/entries'
const PALETTE = ['#0b7285', '#f76707', '#5f3dc4', '#2f9e44', '#e8590c', '#c2255c', '#495057', '#1864ab', '#087f5b']

const CSS = `
.ol-root { position:relative; height:100%; min-height:100%; overflow-y:auto;
  background: var(--dsw-alias-bg-layer-1, #fff); color: var(--dsw-alias-label-primary, #111); font-size:14px; }
.ol-wrap { width:100%; max-width:1040px; margin:0 auto; padding:0 28px 110px; }

.ol-top { position:sticky; top:0; z-index:5; display:flex; align-items:center; gap:10px; flex-wrap:wrap;
  padding:18px 0 14px; background: linear-gradient(var(--dsw-alias-bg-layer-1, #fff) 80%, transparent); }
.ol-brand { display:flex; flex-direction:column; gap:2px; flex:1; min-width:180px; }
.ol-title { font-size:22px; font-weight:700; letter-spacing:-0.02em; margin:0; line-height:1.1; }
.ol-sub { margin:0; font-size:12px; color: var(--dsw-alias-label-tertiary, #666); }
.ol-pill { font-size:11px; padding:4px 10px; border-radius:999px; color: var(--dsw-alias-label-secondary, #444);
  border:1px solid var(--dsw-alias-border-l2, #e6e6e6); white-space:nowrap; }
.ol-iconbtn { display:inline-flex; align-items:center; justify-content:center; width:32px; height:32px; border-radius:9px;
  border:1px solid var(--dsw-alias-border-l2, #e6e6e6); background:transparent; color:inherit; cursor:pointer; }
.ol-iconbtn:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,0.05)); }

.ol-grid { display:grid; gap:14px; }
.ol-kpis { grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
.ol-card { background: var(--dsw-alias-bg-layer-2, #fafafa); border:1px solid var(--dsw-alias-border-l2, #e8e8e8);
  border-radius:16px; padding:16px 18px; }
.ol-kpi-label { font-size:11px; letter-spacing:0.08em; text-transform:uppercase; color: var(--dsw-alias-label-tertiary, #666); }
.ol-kpi-value { font-size:28px; font-weight:700; letter-spacing:-0.03em; margin-top:8px; font-variant-numeric: tabular-nums; }
.ol-kpi-note { margin-top:6px; font-size:12px; color: var(--dsw-alias-label-tertiary, #666); }
.ol-kpi-accent .ol-kpi-value { color: var(--acryl-accent, #0b7285); }

.ol-add { display:grid; grid-template-columns: 120px 1fr 150px auto; gap:10px; align-items:center; margin-top:14px; }
.ol-add input, .ol-add select, .ol-field input, .ol-field select { width:100%; padding:11px 13px; border-radius:11px; font-size:13px;
  border:1px solid var(--dsw-alias-border-l3, #d8d8d8); background: var(--dsw-alias-bg-layer-1, #fff); color:inherit; outline:none; }
.ol-add input:focus, .ol-add select:focus, .ol-field input:focus, .ol-field select:focus { border-color: var(--acryl-accent, #0b7285);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--acryl-accent, #0b7285) 18%, transparent); }
.ol-btn { padding:11px 18px; border-radius:11px; border:1px solid transparent; cursor:pointer; font-size:13px; font-weight:600;
  background: var(--acryl-accent, #0b7285); color:#fff; white-space:nowrap; }
.ol-btn:hover { filter: brightness(1.06); }
.ol-btn:disabled { opacity:0.5; cursor:default; }
.ol-btn-ghost { background: transparent; color: inherit; border-color: var(--dsw-alias-border-l3, #d8d8d8); font-weight:500; }
.ol-btn-ghost:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,0.05)); }
.ol-btn-sm { padding:7px 12px; border-radius:9px; font-size:12px; }
.ol-newcat { grid-column: 1 / -1; display:flex; gap:10px; }

.ol-split { display:grid; gap:14px; grid-template-columns: 1.6fr 1fr; margin-top:14px; }
@media (max-width: 860px) { .ol-split { grid-template-columns: 1fr; } .ol-add { grid-template-columns: 1fr 1fr; } }
.ol-head-row { display:flex; align-items:baseline; justify-content:space-between; gap:10px; margin-bottom:14px; }
.ol-h2 { font-size:13px; font-weight:650; }
.ol-muted { font-size:11px; color: var(--dsw-alias-label-tertiary, #666); }

.ol-bars { display:flex; align-items:flex-end; gap:12px; height:150px; padding-top:6px; }
.ol-col { flex:1; display:flex; flex-direction:column; align-items:center; gap:8px; height:100%; justify-content:flex-end; }
.ol-bar { width:100%; max-width:46px; border-radius:8px 8px 4px 4px; min-height:4px;
  background: linear-gradient(var(--acryl-accent, #0b7285), color-mix(in srgb, var(--acryl-accent, #0b7285) 55%, transparent)); }
.ol-bar.today { outline:2px solid color-mix(in srgb, var(--acryl-accent, #0b7285) 35%, transparent); outline-offset:2px; }
.ol-day { font-size:10px; color: var(--dsw-alias-label-tertiary, #666); }

.ol-donut-wrap { display:flex; align-items:center; gap:18px; }
.ol-donut { width:118px; height:118px; border-radius:50%; flex:none; position:relative; }
.ol-donut::after { content:''; position:absolute; inset:20px; border-radius:50%; background: var(--dsw-alias-bg-layer-2, #fafafa); }
.ol-donut-hole { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; z-index:1; }
.ol-donut-total { font-size:15px; font-weight:700; font-variant-numeric:tabular-nums; }
.ol-donut-cap { font-size:9px; letter-spacing:0.08em; text-transform:uppercase; color: var(--dsw-alias-label-tertiary, #666); }
.ol-legend { display:flex; flex-direction:column; gap:7px; font-size:12px; min-width:0; }
.ol-legend-row { display:grid; grid-template-columns: 9px 1fr auto; align-items:center; gap:8px; }
.ol-dot { width:9px; height:9px; border-radius:3px; }
.ol-legend-amount { font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-secondary, #444); }

.ol-toolbar { display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-top:18px; }
.ol-search { flex:1; min-width:180px; position:relative; }
.ol-search input { width:100%; padding:10px 13px 10px 34px; border-radius:11px; font-size:13px;
  border:1px solid var(--dsw-alias-border-l3, #d8d8d8); background: var(--dsw-alias-bg-layer-1, #fff); color:inherit; outline:none; }
.ol-search span { position:absolute; left:12px; top:50%; transform:translateY(-50%); font-size:12px; opacity:0.5; }
.ol-toolbar select { padding:10px 12px; border-radius:11px; font-size:13px;
  border:1px solid var(--dsw-alias-border-l3, #d8d8d8); background: var(--dsw-alias-bg-layer-1, #fff); color:inherit; outline:none; }
.ol-count { font-size:11px; color: var(--dsw-alias-label-tertiary, #666); white-space:nowrap; }

.ol-list { display:flex; flex-direction:column; margin-top:6px; }
.ol-daygroup { font-size:10px; letter-spacing:0.08em; text-transform:uppercase; color: var(--dsw-alias-label-tertiary, #777); padding:14px 4px 6px; }
.ol-row { display:grid; grid-template-columns: 60px 1fr 104px 104px 56px; align-items:center; gap:12px;
  padding:11px 6px; border-bottom:1px solid var(--dsw-alias-border-l2, #eee); font-size:13px; border-radius:8px; }
.ol-row:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,0.035)); }
.ol-time { font-size:12px; color: var(--dsw-alias-label-tertiary, #666); }
.ol-note { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ol-chip { font-size:10px; padding:3px 9px; border-radius:999px; justify-self:start; white-space:nowrap;
  background: color-mix(in srgb, var(--acryl-accent, #0b7285) 12%, transparent);
  border:1px solid color-mix(in srgb, var(--acryl-accent, #0b7285) 30%, transparent); }
.ol-amount { text-align:right; font-variant-numeric: tabular-nums; font-weight:600; }
.ol-actions { display:flex; gap:2px; justify-content:flex-end; opacity:0; }
.ol-row:hover .ol-actions { opacity:1; }
.ol-x { border:none; background:transparent; color: var(--dsw-alias-label-tertiary, #999); cursor:pointer; font-size:13px; padding:3px; border-radius:6px; }
.ol-x:hover { color: var(--dsw-alias-state-error-primary, #d9480f); background: rgba(0,0,0,0.06); }

.ol-edit { display:grid; grid-template-columns: 100px 1fr 130px 140px auto; gap:8px; align-items:center;
  padding:10px 6px; background: color-mix(in srgb, var(--acryl-accent, #0b7285) 6%, transparent); border-radius:10px; margin:4px 0; }
.ol-edit input, .ol-edit select { padding:8px 10px; border-radius:9px; font-size:12px;
  border:1px solid var(--dsw-alias-border-l3, #d8d8d8); background: var(--dsw-alias-bg-layer-1, #fff); color:inherit; outline:none; }

.ol-empty { text-align:center; padding:34px 12px; color: var(--dsw-alias-label-tertiary, #666); font-size:13px; line-height:1.8; }
.ol-chips { display:flex; gap:8px; justify-content:center; flex-wrap:wrap; margin-top:14px; }
.ol-example { font-size:11px; padding:5px 10px; border-radius:999px; border:1px dashed var(--dsw-alias-border-l3, #ccc);
  color: var(--dsw-alias-label-secondary, #555); cursor:pointer; background:transparent; }
.ol-example:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,0.05)); }
.ol-error { color: var(--dsw-alias-state-error-primary, #d9480f); font-size:12px; margin-top:8px; }

.ol-fab { position:fixed; right:24px; bottom:24px; z-index:9000; display:flex; align-items:center; gap:9px;
  padding:11px 18px 11px 14px; border-radius:999px; border:1px solid color-mix(in srgb, var(--acryl-accent, #0b7285) 45%, transparent);
  background: var(--dsw-alias-bg-layer-1, #fff); color: inherit; cursor:pointer; font-size:13px; font-weight:600;
  box-shadow: 0 12px 30px rgba(0,0,0,0.22); }
.ol-fab:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,0.04)); transform: translateY(-1px); }
.ol-fab-spark { display:inline-flex; align-items:center; justify-content:center; width:26px; height:26px; border-radius:50%;
  background: var(--acryl-accent, #0b7285); color:#fff; font-size:13px; }
.ol-fab-hint { font-size:11px; font-weight:400; color: var(--dsw-alias-label-tertiary, #666); }
@media (max-width: 720px) { .ol-row { grid-template-columns: 52px 1fr 92px 40px; } .ol-row .ol-chip { display:none; } .ol-fab-hint { display:none; } }

.ol-export { display:inline-flex; align-items:center; gap:7px; padding:8px 13px; border-radius:10px;
  border:1px solid var(--dsw-alias-border-l3, #d8d8d8); background:transparent; color:inherit;
  font-size:12px; font-weight:600; cursor:pointer; text-decoration:none; white-space:nowrap; }
.ol-export:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,0.05)); }

.ol-budget-rows { display:flex; flex-direction:column; margin-top:8px; }
.ol-budget-row { display:grid; grid-template-columns: minmax(96px, 140px) 1fr 118px 30px; gap:14px; align-items:center;
  padding:9px 0; border-bottom:1px solid var(--dsw-alias-border-l2, #eee); }
.ol-budget-name { font-size:13px; font-weight:550; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ol-track { height:9px; border-radius:999px; background: var(--dsw-alias-border-l2, #eee); overflow:hidden; }
.ol-fill { height:100%; border-radius:999px; min-width:2px; background: var(--acryl-accent, #0b7285); transition: width 0.25s ease; }
.ol-fill.warn { background: var(--dsw-alias-state-warning-primary, #f08c00); }
.ol-fill.over { background: var(--dsw-alias-state-error-primary, #d9480f); }
.ol-budget-amount { display:flex; align-items:center; justify-content:flex-end; gap:5px;
  font-size:12px; font-variant-numeric:tabular-nums; color: var(--dsw-alias-label-secondary, #444); white-space:nowrap; }
.ol-budget-amount input { width:74px; padding:5px 7px; border-radius:7px; font-size:12px; text-align:right;
  border:1px solid var(--dsw-alias-border-l3, #d8d8d8); background: var(--dsw-alias-bg-layer-1, #fff); color:inherit; outline:none; }
.ol-budget-amount input:focus { border-color: var(--acryl-accent, #0b7285);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--acryl-accent, #0b7285) 16%, transparent); }
.ol-budget-add { display:flex; gap:10px; align-items:center; margin-top:14px; flex-wrap:wrap; }
.ol-budget-add select, .ol-budget-add input { padding:9px 11px; border-radius:9px; font-size:12px;
  border:1px solid var(--dsw-alias-border-l3, #d8d8d8); background: var(--dsw-alias-bg-layer-1, #fff); color:inherit; outline:none; }
.ol-budget-add input { width:150px; }
@media (max-width: 720px) { .ol-budget-row { grid-template-columns: minmax(74px, 96px) 1fr 104px 26px; gap:9px; }
  .ol-budget-amount input { width:62px; } }
`

function ensureStyles() {
  if (document.getElementById('outlay-styles') !== null) return
  const style = document.createElement('style')
  style.id = 'outlay-styles'
  style.textContent = CSS
  document.head.appendChild(style)
}

function titleOf(id) {
  return String(id).split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

function money(value, currency) {
  const rounded = Math.round(Number(value) * 100) / 100
  return `${currency}${rounded.toLocaleString('en-US')}`
}

function dayKey(iso) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function timeOf(iso) {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function dayLabel(key) {
  const today = dayKey(new Date())
  if (key === today) return 'Today'
  if (key === dayKey(new Date(Date.now() - 86400000))) return 'Yesterday'
  return new Date(`${key}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })
}

function monthName() {
  return new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function useBooks() {
  const [state, setState] = React.useState({ loading: true })
  const apply = React.useCallback((data) => setState({ loading: false, data }), [])
  const load = React.useCallback(() => {
    fetch(API, { cache: 'no-store' })
      .then((res) => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json() })
      .then(apply)
      .catch((error) => setState({ loading: false, error: String(error.message || error) }))
  }, [apply])
  React.useEffect(() => { load() }, [load])
  const send = (path, body) => fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).then(async (res) => {
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
    apply(data)
    return data
  })
  return {
    state,
    reload: load,
    add: (entry) => send(API, entry),
    update: (entry) => send('/api/outlay/update', entry),
    remove: (id) => send('/api/outlay/delete', { id }),
    addCategory: (name) => send('/api/outlay/category', { name }),
    removeCategory: (id) => send('/api/outlay/category', { remove: id }),
    setBudget: (category, amount) => send('/api/outlay/budget', { category, amount }),
    removeBudget: (category) => send('/api/outlay/budget', { remove: category }),
  }
}

function Kpi({ label, value, note, accent }) {
  return h('div', { className: `ol-card${accent ? ' ol-kpi-accent' : ''}` },
    h('div', { className: 'ol-kpi-label' }, label),
    h('div', { className: 'ol-kpi-value' }, value),
    note !== undefined && h('div', { className: 'ol-kpi-note' }, note))
}

function WeekChart({ days, currency }) {
  const max = Math.max(...days.map(d => d.amount), 1)
  const today = dayKey(new Date())
  return h('section', { className: 'ol-card' },
    h('div', { className: 'ol-head-row' },
      h('div', { className: 'ol-h2' }, 'Last 7 days'),
      h('div', { className: 'ol-muted' }, `peak ${money(max, currency)}`)),
    h('div', { className: 'ol-bars' },
      days.map((day) => h('div', { key: day.day, className: 'ol-col', title: `${dayLabel(day.day)} — ${money(day.amount, currency)}` },
        h('div', { className: `ol-bar${day.day === today ? ' today' : ''}`, style: { height: `${Math.max((day.amount / max) * 100, 3)}%` } }),
        h('div', { className: 'ol-day' }, ['S', 'M', 'T', 'W', 'T', 'F', 'S'][new Date(`${day.day}T12:00:00`).getDay()])))))
}

function Donut({ byCategory, currency, total }) {
  const rows = Object.entries(byCategory).sort((a, b) => b[1] - a[1])
  const sum = rows.reduce((acc, row) => acc + row[1], 0) || 1
  let cursor = 0
  const stops = rows.map((row, index) => {
    const from = (cursor / sum) * 100
    cursor += row[1]
    return `${PALETTE[index % PALETTE.length]} ${from}% ${(cursor / sum) * 100}%`
  })
  const ring = stops.length === 0 ? 'var(--dsw-alias-border-l2, #eee) 0% 100%' : stops.join(', ')
  return h('section', { className: 'ol-card' },
    h('div', { className: 'ol-head-row' },
      h('div', { className: 'ol-h2' }, 'Where it goes'),
      h('div', { className: 'ol-muted' }, 'all time')),
    h('div', { className: 'ol-donut-wrap' },
      h('div', { className: 'ol-donut', style: { background: `conic-gradient(${ring})` } },
        h('div', { className: 'ol-donut-hole' },
          h('div', { className: 'ol-donut-total' }, money(total, currency)),
          h('div', { className: 'ol-donut-cap' }, 'total'))),
      h('div', { className: 'ol-legend' },
        rows.length === 0 && h('div', { className: 'ol-muted' }, 'Nothing yet'),
        rows.map(([category, amount], index) => h('div', { key: category, className: 'ol-legend-row' },
          h('span', { className: 'ol-dot', style: { background: PALETTE[index % PALETTE.length] } }),
          h('span', null, titleOf(category)),
          h('span', { className: 'ol-legend-amount' }, money(amount, currency)))))))
}

function Budgets({ rows, categories, currency, onSet, onRemove }) {
  const [chosen, setChosen] = React.useState('')
  const [amount, setAmount] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const unbudgeted = categories.filter(id => !rows.some(row => row.category === id))
  const draft = chosen === '' || !unbudgeted.includes(chosen) ? (unbudgeted[0] ?? '') : chosen
  const failing = (cause) => setError(String(cause.message || cause))

  const submit = (event) => {
    event.preventDefault()
    if (busy || draft === '' || amount.trim() === '') return
    setBusy(true)
    setError('')
    Promise.resolve(onSet(draft, Number(amount)))
      .then(() => { setAmount(''); setChosen('') })
      .catch(failing)
      .finally(() => setBusy(false))
  }

  const commit = (row, value) => {
    const next = Number(value)
    if (!Number.isFinite(next) || next <= 0 || next === row.amount) return
    setError('')
    Promise.resolve(onSet(row.category, next)).catch(failing)
  }

  const over = rows.filter(row => row.remaining < 0)
  const left = rows.reduce((sum, row) => sum + row.remaining, 0)

  return h('section', { className: 'ol-card', style: { marginTop: 14 } },
    h('div', { className: 'ol-head-row' },
      h('div', { className: 'ol-h2' }, 'Budgets'),
      h('div', { className: 'ol-muted' }, `monthly · ${monthName()}`)),
    rows.length === 0
      ? h('div', { className: 'ol-empty', style: { padding: '16px 12px' } },
          'No budgets yet. Set one below and the bar fills as the month spends.')
      : h('div', { className: 'ol-budget-rows' },
          rows.map((row) => {
            const state = row.pct > 1 ? ' over' : row.pct >= 0.8 ? ' warn' : ''
            return h('div', { key: row.category, className: 'ol-budget-row' },
              h('div', { className: 'ol-budget-name', title: titleOf(row.category) }, titleOf(row.category)),
              h('div', { className: 'ol-track', title: `${money(row.spent, currency)} of ${money(row.amount, currency)}` },
                h('div', { className: `ol-fill${state}`, style: { width: `${Math.max(Math.min(row.pct, 1) * 100, 2)}%` } })),
              h('div', { className: 'ol-budget-amount' },
                money(row.spent, currency), h('span', { className: 'ol-muted' }, '/'),
                h('input', {
                  key: `${row.category}:${row.amount}`,
                  type: 'number', step: '0.01', min: '0.01',
                  defaultValue: String(row.amount),
                  'aria-label': `Monthly budget for ${row.category}`,
                  onBlur: e => commit(row, e.target.value),
                  onKeyDown: (e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } },
                })),
              h('button', {
                type: 'button', className: 'ol-x', title: 'Remove budget',
                onClick: () => { setError(''); Promise.resolve(onRemove(row.category)).catch(failing) },
              }, '\u2715'))
          })),
    rows.length > 0 && h('div', { className: 'ol-muted', style: { marginTop: 10 } },
      over.length > 0
        ? `Over budget: ${over.map(row => `${titleOf(row.category)} by ${money(-row.remaining, currency)}`).join(', ')}`
        : `Left this month: ${money(left, currency)}`),
    unbudgeted.length > 0 && h('form', { className: 'ol-budget-add', onSubmit: submit },
      h('select', { value: draft, onChange: e => setChosen(e.target.value), 'aria-label': 'Budget category' },
        unbudgeted.map(id => h('option', { key: id, value: id }, titleOf(id)))),
      h('input', {
        type: 'number', step: '0.01', min: '0.01', value: amount,
        placeholder: 'Monthly amount', onChange: e => setAmount(e.target.value),
        required: true, 'aria-label': 'Monthly budget amount',
      }),
      h('button', { type: 'submit', className: 'ol-btn ol-btn-sm', disabled: busy }, busy ? 'Saving…' : 'Set budget')),
    rows.length > 0 && unbudgeted.length === 0 && h('div', { className: 'ol-muted', style: { marginTop: 10 } },
      'Every category has a budget. Add a category to budget more.'),
    error !== '' && h('div', { className: 'ol-error' }, error))
}

function QuickAdd({ categories, onAdd, onAddCategory }) {
  const [amount, setAmount] = React.useState('')
  const [note, setNote] = React.useState('')
  const [category, setCategory] = React.useState('other')
  const [newCategory, setNewCategory] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')

  const submit = (event) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    const chosen = category === '__new' ? newCategory : category
    Promise.resolve(category === '__new' ? onAddCategory(chosen).catch(() => undefined) : undefined)
      .then(() => onAdd({ amount: Number(amount), note, category: chosen }))
      .then(() => { setAmount(''); setNote(''); setCategory('other'); setNewCategory('') })
      .catch((cause) => setError(String(cause.message || cause)))
      .finally(() => setBusy(false))
  }

  return h('form', { onSubmit: submit, style: { display: 'flex', flexDirection: 'column' } },
    h('div', { className: 'ol-add' },
      h('input', { type: 'number', step: '0.01', min: '0.01', value: amount, placeholder: 'Amount',
        onChange: e => setAmount(e.target.value), required: true, 'aria-label': 'Amount' }),
      h('input', { type: 'text', value: note, placeholder: 'What was it for?  e.g. taxi to office',
        onChange: e => setNote(e.target.value), required: true, maxLength: 200, 'aria-label': 'Note' }),
      h('select', { value: category, onChange: e => setCategory(e.target.value), 'aria-label': 'Category' },
        categories.map(id => h('option', { key: id, value: id }, titleOf(id))),
        h('option', { value: '__new' }, '+ New category…')),
      h('button', { type: 'submit', className: 'ol-btn', disabled: busy }, busy ? 'Adding…' : 'Add expense'),
      category === '__new' && h('div', { className: 'ol-newcat' },
        h('input', { type: 'text', value: newCategory, placeholder: 'New category name', maxLength: 24,
          onChange: e => setNewCategory(e.target.value), required: true, 'aria-label': 'New category name' }))),
    error !== '' && h('div', { className: 'ol-error' }, error))
}

function EditRow({ entry, categories, onSave, onCancel }) {
  const [amount, setAmount] = React.useState(String(entry.amount))
  const [note, setNote] = React.useState(entry.note)
  const [category, setCategory] = React.useState(entry.category)
  const [date, setDate] = React.useState(dayKey(entry.ts))
  const [busy, setBusy] = React.useState(false)

  const save = (event) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    const time = new Date(entry.ts).toTimeString().slice(0, 8)
    onSave({ id: entry.id, amount: Number(amount), note, category, ts: new Date(`${date}T${time}`).toISOString() })
      .catch(() => undefined)
      .finally(() => setBusy(false))
  }

  return h('form', { className: 'ol-edit', onSubmit: save },
    h('input', { type: 'number', step: '0.01', min: '0.01', value: amount, onChange: e => setAmount(e.target.value), required: true, 'aria-label': 'Amount' }),
    h('input', { type: 'text', value: note, onChange: e => setNote(e.target.value), required: true, maxLength: 200, 'aria-label': 'Note' }),
    h('select', { value: category, onChange: e => setCategory(e.target.value), 'aria-label': 'Category' },
      categories.map(id => h('option', { key: id, value: id }, titleOf(id)))),
    h('input', { type: 'date', value: date, onChange: e => setDate(e.target.value), 'aria-label': 'Date' }),
    h('div', { style: { display: 'flex', gap: 6 } },
      h('button', { type: 'submit', className: 'ol-btn ol-btn-sm', disabled: busy }, busy ? '…' : 'Save'),
      h('button', { type: 'button', className: 'ol-btn ol-btn-ghost ol-btn-sm', onClick: onCancel }, 'Cancel')))
}

function Toolbar({ search, setSearch, category, setCategory, period, setPeriod, categories, shown, total, currency }) {
  return h('div', { className: 'ol-toolbar' },
    h('div', { className: 'ol-search' },
      h('span', null, '⌕'),
      h('input', { type: 'search', value: search, placeholder: 'Search notes, amounts…',
        onChange: e => setSearch(e.target.value), 'aria-label': 'Search entries' })),
    h('select', { value: category, onChange: e => setCategory(e.target.value), 'aria-label': 'Filter by category' },
      h('option', { value: 'all' }, 'All categories'),
      categories.map(id => h('option', { key: id, value: id }, titleOf(id)))),
    h('select', { value: period, onChange: e => setPeriod(e.target.value), 'aria-label': 'Filter by period' },
      h('option', { value: 'all' }, 'All time'),
      h('option', { value: 'month' }, 'This month'),
      h('option', { value: 'week' }, 'This week'),
      h('option', { value: 'today' }, 'Today')),
    h('span', { className: 'ol-count' }, `${shown} shown · ${money(total, currency)}`))
}

function Dashboard() {
  ensureStyles()
  const books = useBooks()
  const data = books.state.data
  const currency = data ? data.currency : '$'
  const categories = data ? data.categories : ['other']
  const totals = data ? data.totals : { today: 0, week: 0, month: 0, all: 0, count: 0 }
  const entries = data ? data.entries : []
  const budgets = data && Array.isArray(data.budgets) ? data.budgets : []

  const [search, setSearch] = React.useState('')
  const [category, setCategory] = React.useState('all')
  const [period, setPeriod] = React.useState('all')
  const [editing, setEditing] = React.useState(null)
  const [error, setError] = React.useState('')

  const today = dayKey(new Date())
  const monday = new Date()
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  const weekStart = dayKey(monday)
  const monthStart = today.slice(0, 7)

  const needle = search.trim().toLowerCase()
  const filtered = entries.filter((entry) => {
    const key = dayKey(entry.ts)
    if (category !== 'all' && entry.category !== category) return false
    if (period === 'today' && key !== today) return false
    if (period === 'week' && key < weekStart) return false
    if (period === 'month' && !key.startsWith(monthStart)) return false
    if (needle !== '' && !`${entry.note} ${entry.amount} ${entry.category}`.toLowerCase().includes(needle)) return false
    return true
  })
  const filteredTotal = filtered.reduce((sum, entry) => sum + entry.amount, 0)

  const groups = []
  for (const entry of filtered.slice().reverse()) {
    const key = dayKey(entry.ts)
    const last = groups[groups.length - 1]
    if (last !== undefined && last.key === key) last.items.push(entry)
    else groups.push({ key, items: [entry] })
  }

  const perform = (promise) => promise.catch((cause) => setError(String(cause.message || cause)))
  const askBuilder = () => {
    const layout = window.__outlayLayout
    if (typeof layout?.selectPanel === 'function') layout.selectPanel('conversation')
  }

  const row = (entry) => {
    if (editing === entry.id) {
      return h(EditRow, {
        key: entry.id,
        entry,
        categories,
        onSave: (patch) => perform(books.update(patch)).then(() => setEditing(null)),
        onCancel: () => setEditing(null),
      })
    }
    return h('div', { key: entry.id, className: 'ol-row' },
      h('span', { className: 'ol-time' }, timeOf(entry.ts)),
      h('span', { className: 'ol-note', title: entry.note }, entry.note),
      h('span', { className: 'ol-chip' }, titleOf(entry.category)),
      h('span', { className: 'ol-amount' }, money(entry.amount, currency)),
      h('span', { className: 'ol-actions' },
        h('button', { type: 'button', className: 'ol-x', title: 'Edit', onClick: () => setEditing(entry.id) }, '\u270E'),
        h('button', { type: 'button', className: 'ol-x', title: 'Delete', onClick: () => perform(books.remove(entry.id)) }, '\u2715')))
  }

  const emptyState = h('div', { className: 'ol-empty' },
    'The books are empty.', h('br'),
    'Add an expense above, or ask the assistant — it writes it down for you.',
    h('div', { className: 'ol-chips' },
      ['taxi 12', 'coffee 4.5', 'groceries 40'].map(example => h('button', {
        key: example, type: 'button', className: 'ol-example', onClick: askBuilder,
      }, example))))

  const listBody = entries.length === 0
    ? emptyState
    : h('div', { className: 'ol-list' },
        groups.length === 0 && h('div', { className: 'ol-empty' }, 'Nothing matches these filters.'),
        groups.map((group) => h('div', { key: group.key },
          h('div', { className: 'ol-daygroup' }, dayLabel(group.key)),
          group.items.map(row))))

  const entriesCard = data && h('section', { className: 'ol-card', style: { marginTop: 14 } },
    h('div', { className: 'ol-head-row' },
      h('div', { className: 'ol-h2' }, 'Entries'),
      h('div', { className: 'ol-muted' }, filtered.length === entries.length ? 'all entries' : `${filtered.length} of ${entries.length}`)),
    listBody)

  return h('div', { className: 'ol-root' },
    h('div', { className: 'ol-wrap' },
      h('div', { className: 'ol-top' },
        h('div', { className: 'ol-brand' },
          h('h1', { className: 'ol-title' }, 'Outlay'),
          h('p', { className: 'ol-sub' }, 'Say what you spent. The books keep themselves.')),
        h('span', { className: 'ol-pill' }, monthName()),
        h('span', { className: 'ol-pill' }, `in ${currency}`),
        h('a', {
          className: 'ol-export',
          href: '/api/outlay/export.csv',
          download: `outlay-${today}.csv`,
          title: 'Download every entry as a CSV file',
        }, '\u2913 CSV'),
        h('button', { type: 'button', className: 'ol-iconbtn', title: 'Refresh', onClick: books.reload }, '\u21BB')),
      books.state.loading && h('div', { className: 'ol-muted' }, 'Loading…'),
      books.state.error && h('div', { className: 'ol-error' }, `Could not load: ${books.state.error}`),
      data && h('div', { className: 'ol-grid ol-kpis' },
        h(Kpi, { label: 'Today', value: money(totals.today, currency), note: 'since midnight', accent: true }),
        h(Kpi, { label: 'This week', value: money(totals.week, currency), note: 'from Monday' }),
        h(Kpi, { label: 'This month', value: money(totals.month, currency), note: monthName() }),
        h(Kpi, { label: 'All time', value: money(totals.all, currency), note: `${totals.count} ${totals.count === 1 ? 'entry' : 'entries'}` })),
      h(QuickAdd, { categories, onAdd: books.add, onAddCategory: books.addCategory }),
      error !== '' && h('div', { className: 'ol-error' }, error),
      data && h('div', { className: 'ol-split' },
        h(WeekChart, { days: data.days, currency }),
        h(Donut, { byCategory: data.byCategory, currency, total: totals.all })),
      data && h(Budgets, {
        rows: budgets,
        categories,
        currency,
        onSet: books.setBudget,
        onRemove: books.removeBudget,
      }),
      data && h(Toolbar, {
        search, setSearch, category, setCategory, period, setPeriod, categories,
        shown: filtered.length, total: filteredTotal, currency,
      }),
      entriesCard),
    h('button', { type: 'button', className: 'ol-fab', onClick: askBuilder, title: 'Open the assistant' },
      h('span', { className: 'ol-fab-spark' }, '\u2726'),
      h('span', null, 'Ask'),
      h('span', { className: 'ol-fab-hint' }, 'add or ask anything')))
}

function OutlayIcon({ size }) {
  return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true' },
    h('path', { d: 'M4 7.5A2.5 2.5 0 0 1 6.5 5H19v14H6.5A2.5 2.5 0 0 1 4 16.5v-9Z',
      stroke: 'currentColor', strokeWidth: 1.7, strokeLinejoin: 'round' }),
    h('path', { d: 'M4 9h15', stroke: 'currentColor', strokeWidth: 1.7 }),
    h('path', { d: 'M8 14.5h4', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' }))
}

exports.inject = ['slots']

exports.apply = function apply(ctx) {
  ensureStyles()
  window.__outlayLayout = ctx.get('layout')

  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'outlay' }, Dashboard))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register(
    { name: 'sidebar.panellist', id: 'outlay', order: 40, label: 'Outlay' }, OutlayIcon))

  if (typeof window.__outlayLayout?.selectPanel === 'function') window.__outlayLayout.selectPanel('outlay')
}

return module.exports; } });
