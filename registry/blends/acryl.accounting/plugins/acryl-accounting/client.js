// acryl-accounting (browser half): the books ARE this app's main surface.
// Type:     client plugin (claims `desktop.main` through acryl-app-shell)
// Surfaces: web desktop
// Rule:     a domain plugin's own UI is a slot registration, never a Host route (specs/036-cordis-ecosystem-and-acryl-blends/blend-instance-design.md, 0a).
//           The app opens on the invoices; the agent's conversation sits beside them. Data goes through the plugin's own `/api/acryl-accounting/*`
//           endpoints, the same `.acryl/accounting.json` the agent's tools use, polled every 2 s, so what the agent books shows up while you watch.
window.__ModuleLoader__.load({ id: 'acryl-accounting', factory: (require) => {
var module = { exports: {} }; var exports = module.exports;

const React = require('react')
const shell = require('acryl-app-shell/client')
const h = React.createElement
const { useEffect, useState, useCallback } = React

const CSS = `
.aca { display:grid; grid-template-columns:minmax(0,1fr) minmax(360px,440px); height:100%; min-height:0; background:#f6f8f6; color:#16231a; font:15px/1.5 -apple-system,"Segoe UI",system-ui,sans-serif; }
.aca-books { overflow:auto; padding:22px 28px 40px; display:grid; gap:16px; align-content:start; min-width:0; }
.aca-books .head { display:flex; align-items:center; gap:14px; }
.aca-books h1 { margin:0; font-size:24px; letter-spacing:-.01em; }
.aca-books .live { margin-left:auto; color:#5c6f62; font-size:13px; }
.aca-books .live i { display:inline-block; width:8px; height:8px; border-radius:50%; background:#2f9e44; margin-right:6px; }
.aca-books .tabs { display:flex; gap:4px; border-bottom:1px solid #dbe4dd; }
.aca-books .tabs button { font:600 14px inherit; font-family:inherit; color:#5c6f62; background:none; border:0; border-bottom:2px solid transparent; padding:8px 14px; cursor:pointer; margin-bottom:-1px; }
.aca-books .tabs button.on { color:#16231a; border-bottom-color:#2f9e44; }
.aca-books .panel { background:#fff; border:1px solid #dbe4dd; border-radius:12px; padding:16px; display:grid; gap:14px; min-width:0; }
.aca-books form, .aca-books .period { display:flex; flex-wrap:wrap; gap:10px 12px; align-items:flex-end; }
.aca-books label { display:grid; gap:4px; font-size:12px; color:#5c6f62; font-weight:600; }
.aca-books input, .aca-books select { font:inherit; font-size:14px; color:#16231a; background:#fff; border:1px solid #c9d6cc; border-radius:8px; padding:7px 9px; min-width:0; }
.aca-books input[name=client], .aca-books input[name=description] { width:150px; }
.aca-books input[type=number] { width:80px; }
.aca-books button.go { font:600 14px inherit; font-family:inherit; color:#fff; background:#2f9e44; border:1px solid #2f9e44; border-radius:8px; padding:8px 14px; cursor:pointer; }
.aca-books button.go:hover { background:#2b8a3e; }
.aca-books .err { color:#c92a2a; font-size:13px; flex-basis:100%; min-height:1em; }
.aca-books .table { overflow-x:auto; }
.aca-books table { width:100%; border-collapse:collapse; font-size:13px; }
.aca-books th { text-align:left; font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:#5c6f62; padding:8px 6px; border-bottom:1px solid #dbe4dd; white-space:nowrap; }
.aca-books td { padding:9px 6px; border-bottom:1px solid #eef2ef; white-space:nowrap; }
.aca-books .n { text-align:right; font-variant-numeric:tabular-nums; }
.aca-books tr.late td { background:#fff5f5; }
.aca-books .badge { font-size:12px; font-weight:600; border-radius:999px; padding:2px 9px; }
.aca-books .badge.open { background:#e7f5ff; color:#1971c2; }
.aca-books .badge.paid { background:#ebfbee; color:#2b8a3e; }
.aca-books .badge.late { background:#ffe3e3; color:#c92a2a; }
.aca-books button.pay { font:600 12px inherit; font-family:inherit; color:#2f9e44; background:#fff; border:1px solid #2f9e44; border-radius:7px; padding:3px 8px; cursor:pointer; white-space:nowrap; }
.aca-books .empty { color:#5c6f62; text-align:center; padding:22px; }
.aca-books .cards { display:grid; grid-template-columns:repeat(auto-fill, minmax(190px, 1fr)); gap:12px; }
.aca-books .card { border:1px solid #dbe4dd; border-radius:12px; padding:14px; display:grid; gap:4px; background:#fff; }
.aca-books .card.hero { background:#ebfbee; border-color:#b2f2bb; }
.aca-books .card .k { font-size:12px; color:#5c6f62; font-weight:600; }
.aca-books .card .v { font-size:22px; font-weight:700; font-variant-numeric:tabular-nums; }
.aca-books .card .s { font-size:12px; color:#5c6f62; }
.aca-agent { border-left:1px solid #dbe4dd; min-width:0; min-height:0; display:flex; flex-direction:column; background:var(--dsw-alias-bg-l1, #fff); }
.aca-agent > div { flex:1; min-height:0; }
`

const money = cents => { const s = cents < 0 ? '-' : ''; const a = Math.abs(cents); return s + '€' + Math.floor(a / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + String(a % 100).padStart(2, '0') }
const quarter = (year, q) => ({ from: year + '-' + String((q - 1) * 3 + 1).padStart(2, '0') + '-01', to: new Date(Date.UTC(year, q * 3, 0)).toISOString().slice(0, 10) })

async function api(path, body) {
  const res = await fetch('/api/acryl-accounting/' + path, body === undefined
    ? { credentials: 'same-origin' }
    : { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json()
  if (!res.ok) throw new Error(data && data.error ? data.error : 'request failed')
  return data
}

function presetsFor(today) {
  const d = new Date(today + 'T00:00:00Z'); const year = d.getUTCFullYear(); const q = Math.floor(d.getUTCMonth() / 3) + 1
  return [['This quarter', quarter(year, q)], ['Last quarter', q === 1 ? quarter(year - 1, 4) : quarter(year, q - 1)], ['This year', { from: year + '-01-01', to: year + '-12-31' }]]
}

function Form({ path, onState, fields, submit }) {
  const [err, setErr] = useState('')
  return h('form', { onSubmit: async e => {
    e.preventDefault(); setErr('')
    const form = e.currentTarget
    const body = Object.fromEntries([...new FormData(form)].filter(([, v]) => v !== ''))
    try { onState(await api(path, body)); form.reset() } catch (x) { setErr(x.message) }
  } }, ...fields, h('button', { className: 'go', type: 'submit' }, submit), h('div', { className: 'err' }, err))
}

const field = (label, props) => h('label', { key: props.name }, label, h('input', props))
const vat = () => h('label', { key: 'vatRate' }, 'VAT', h('select', { name: 'vatRate', defaultValue: '20' }, ['20', '13', '10', '0'].map(v => h('option', { key: v, value: v }, v + '%'))))

function Invoices({ state, onState, onError }) {
  const rows = [...state.invoices].reverse()
  return h('div', { className: 'panel' },
    h(Form, { path: 'invoice', onState, submit: 'Create invoice', fields: [
      field('Client', { name: 'client', required: true, placeholder: 'ACME' }),
      field('Description', { name: 'description', required: true, placeholder: 'Consulting' }),
      field('Quantity', { name: 'quantity', type: 'number', min: '0.01', step: 'any', defaultValue: '1' }),
      field('Unit price (net, EUR)', { name: 'unitPrice', required: true, inputMode: 'decimal', placeholder: '1200.00' }),
      vat(),
      field('Issued', { name: 'issued', type: 'date' }),
      field('Due in (days)', { name: 'dueDays', type: 'number', min: '0', defaultValue: '14' }),
    ] }),
    h('div', { className: 'table' }, h('table', null,
      h('thead', null, h('tr', null, ['No.', 'Client', 'Due'].map(t => h('th', { key: t }, t)), ['Net', 'VAT', 'Gross'].map(t => h('th', { key: t, className: 'n' }, t)), h('th', null, 'Status'), h('th', null))),
      h('tbody', null, rows.length === 0
        ? h('tr', null, h('td', { colSpan: 8, className: 'empty' }, 'No invoices yet. Create one above, or ask the agent.'))
        : rows.map(inv => {
          const status = inv.status === 'paid' ? ['paid', 'paid ' + inv.paidOn] : inv.overdue ? ['late', 'overdue'] : ['open', 'open']
          return h('tr', { key: inv.id, className: inv.overdue ? 'late' : '' },
            h('td', null, inv.number), h('td', null, inv.client), h('td', { title: 'issued ' + inv.issued }, inv.due),
            h('td', { className: 'n' }, money(inv.net)), h('td', { className: 'n', title: inv.vatRate + '% VAT' }, money(inv.vat)), h('td', { className: 'n' }, money(inv.gross)),
            h('td', null, h('span', { className: 'badge ' + status[0] }, status[1])),
            h('td', null, inv.status === 'open' ? h('button', { className: 'pay', type: 'button', onClick: async () => { try { onState(await api('invoice-paid', { id: inv.id })) } catch (e) { onError(e.message) } } }, 'Mark paid') : null))
        })))))
}

function Expenses({ state, onState }) {
  const rows = [...state.expenses].reverse()
  return h('div', { className: 'panel' },
    h(Form, { path: 'expense', onState, submit: 'Add expense', fields: [
      field('Description', { name: 'description', required: true, placeholder: 'Laptop' }),
      field('Category', { name: 'category', placeholder: 'equipment' }),
      field('Amount paid (gross, EUR)', { name: 'amount', required: true, inputMode: 'decimal', placeholder: '1200.00' }),
      vat(),
      field('Date', { name: 'date', type: 'date' }),
    ] }),
    h('div', { className: 'table' }, h('table', null,
      h('thead', null, h('tr', null, ['Date', 'Description', 'Category'].map(t => h('th', { key: t }, t)), ['Net', 'VAT', 'Gross'].map(t => h('th', { key: t, className: 'n' }, t)))),
      h('tbody', null, rows.length === 0
        ? h('tr', null, h('td', { colSpan: 6, className: 'empty' }, 'No expenses yet.'))
        : rows.map(x => h('tr', { key: x.id },
          h('td', null, x.date), h('td', null, x.description), h('td', null, x.category),
          h('td', { className: 'n' }, money(x.net)), h('td', { className: 'n', title: x.vatRate + '% VAT' }, money(x.vat)), h('td', { className: 'n' }, money(x.gross))))))))
}

function Summary({ state }) {
  const presets = presetsFor(state.today)
  const [preset, setPreset] = useState('0')
  const [range, setRange] = useState(presets[0][1])
  const [s, setS] = useState(null)
  const [err, setErr] = useState('')
  const key = JSON.stringify([state.invoices, state.expenses])
  useEffect(() => {
    let alive = true
    api('summary?from=' + range.from + '&to=' + range.to).then(v => { if (alive) { setS(v); setErr('') } }, e => { if (alive) setErr(e.message) })
    return () => { alive = false }
  }, [range.from, range.to, key])
  const card = (k, v, sub, hero) => h('div', { key: k, className: 'card' + (hero ? ' hero' : '') }, h('div', { className: 'k' }, k), h('div', { className: 'v' }, v), sub ? h('div', { className: 's' }, sub) : null)
  return h('div', { className: 'panel' },
    h('div', { className: 'period' },
      h('label', null, 'Period', h('select', { value: preset, onChange: e => { setPreset(e.target.value); if (e.target.value !== 'custom') setRange(presets[Number(e.target.value)][1]) } },
        presets.map(([name], i) => h('option', { key: i, value: String(i) }, name)), h('option', { value: 'custom' }, 'Custom'))),
      h('label', null, 'From', h('input', { type: 'date', value: range.from, onChange: e => { setPreset('custom'); setRange({ ...range, from: e.target.value }) } })),
      h('label', null, 'To', h('input', { type: 'date', value: range.to, onChange: e => { setPreset('custom'); setRange({ ...range, to: e.target.value }) } })),
      h('span', { className: 'err' }, err)),
    s === null ? null : h('div', { className: 'cards' },
      card(s.vatPayable < 0 ? 'VAT refund' : 'VAT payable', money(Math.abs(s.vatPayable)), 'output ' + money(s.outputVat) + ' minus input ' + money(s.inputVat), true),
      card('Revenue (net)', money(s.revenue), s.invoices + ' invoice' + (s.invoices === 1 ? '' : 's') + ' issued'),
      card('Expenses (net)', money(s.expensesNet), s.expenses + ' expense' + (s.expenses === 1 ? '' : 's')),
      card('Profit', money(s.profit), 'revenue minus expenses', s.profit >= 0),
      card('Received', money(s.received), 'paid in the period, gross'),
      card('Outstanding', money(s.outstanding), 'unpaid at the end of the period, gross')))
}

function Books() {
  const [state, setState] = useState(null)
  const [tab, setTab] = useState('invoices')
  const [toast, setToast] = useState('')
  useEffect(() => {
    let alive = true
    const poll = async () => { try { const next = await api('state'); if (alive) setState(s => (s && JSON.stringify(s) === JSON.stringify(next) ? s : next)) } catch {} }
    poll(); const t = setInterval(poll, 2000)
    return () => { alive = false; clearInterval(t) }
  }, [])
  const onError = useCallback(m => { setToast(m); setTimeout(() => setToast(''), 4000) }, [])
  if (state === null) return h('div', { className: 'aca-books' }, h('p', null, 'Loading the books...'))
  const tabs = [['invoices', 'Invoices'], ['expenses', 'Expenses'], ['summary', 'VAT & income']]
  return h('div', { className: 'aca-books' },
    h('div', { className: 'head' }, h('h1', null, 'Accounting'), h('span', { className: 'live' }, h('i'), 'live: the agent books here too')),
    h('div', { className: 'tabs', role: 'tablist' }, tabs.map(([id, label]) => h('button', { key: id, type: 'button', role: 'tab', 'aria-selected': tab === id, className: tab === id ? 'on' : '', onClick: () => setTab(id) }, label))),
    toast ? h('div', { className: 'err', role: 'alert' }, toast) : null,
    tab === 'invoices' ? h(Invoices, { state, onState: setState, onError }) : tab === 'expenses' ? h(Expenses, { state, onState: setState }) : h(Summary, { state }))
}

/** The app's main surface: the books, and the agent beside them. */
function AccountingApp(props) {
  useEffect(() => {
    const style = document.createElement('style'); style.dataset.acrylAccounting = ''; style.textContent = CSS
    document.head.appendChild(style)
    return () => style.remove()
  }, [])
  return h('div', { className: 'aca' },
    h(Books),
    h('aside', { className: 'aca-agent', 'aria-label': 'Agent' }, props.renderConversation ? props.renderConversation() : null))
}

exports.inject = ['slots', 'theme']

exports.apply = function apply(ctx) {
  const environment = shell.resolveShellEnvironment(window.location.hash)
  if (environment.mode !== 'advanced') return
  shell.applyAdvancedShell(ctx, environment)
  // Lower priority renders: below the shell's own fallback (100), which shows the plain conversation.
  ctx.slots.inject('desktop.main', () => ctx.slots.register({ name: 'desktop.main', priority: 0 }, AccountingApp))
}

return module.exports; } });
