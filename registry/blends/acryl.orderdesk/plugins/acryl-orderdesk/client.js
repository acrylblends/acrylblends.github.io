// acryl-orderdesk (browser half): the order desk IS this app's main surface.
// Type:     client plugin (claims `desktop.main` through acryl-app-shell)
// Surfaces: web desktop
// Rule:     a domain plugin's own UI is a slot registration, never a Host route (specs/036-cordis-ecosystem-and-acryl-blends/blend-instance-design.md, 0a).
//           The app opens on the pipeline (inbox, approval, ready to ship, backorder, shipped); the agent's conversation sits beside it. Data goes
//           through the plugin's own `/api/acryl-orderdesk/*` endpoints, the same `.acryl/orderdesk.json` the agent's tools use, polled every 2 s,
//           so what the agent does shows up while you watch.
window.__ModuleLoader__.load({ id: 'acryl-orderdesk', factory: (require) => {
var module = { exports: {} }; var exports = module.exports;

const React = require('react')
const shell = require('acryl-app-shell/client')
const h = React.createElement
const { useEffect, useState, useCallback, useRef } = React

const CSS = `
.odk { --ink:#14232b; --dim:#5a6b73; --line:#d9e2e5; --soft:#eef3f4; --paper:#f5f7f7; --card:#fff; --accent:#0c8599; --accent-soft:#e3f6f8;
  --warn:#e67700; --warn-soft:#fff4e6; --bad:#c92a2a; --bad-soft:#fff0f0; --ok:#2b8a3e; --ok-soft:#ebfbee;
  display:grid; grid-template-columns:minmax(0,1fr) minmax(360px,420px); height:100%; min-height:0; background:var(--paper); color:var(--ink);
  font:14px/1.45 -apple-system,"Segoe UI",system-ui,sans-serif; }
.odk-desk { min-width:0; min-height:0; display:flex; flex-direction:column; }
.odk-top { padding:18px 20px 0; display:grid; gap:14px; }
.odk-title { display:flex; align-items:baseline; gap:12px; flex-wrap:wrap; }
.odk-title h1 { margin:0; font-size:22px; letter-spacing:-.01em; }
.odk-title .co { color:var(--dim); font-weight:600; }
.odk-title .live { margin-left:auto; color:var(--dim); font-size:12px; }
.odk-title .live i { display:inline-block; width:8px; height:8px; border-radius:50%; background:var(--ok); margin-right:6px; }
.odk-kpis { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:8px; }
.odk-kpi { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:8px 12px; min-width:0; }
.odk-kpi .k { font-size:11px; color:var(--dim); font-weight:600; letter-spacing:.04em; text-transform:uppercase; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.odk-kpi .v { font-size:20px; font-weight:700; font-variant-numeric:tabular-nums; }
.odk-kpi.hot { border-color:#ffc078; background:var(--warn-soft); }
.odk-kpi.bad { border-color:#ffa8a8; background:var(--bad-soft); }
.odk-tabs { display:flex; gap:2px; border-bottom:1px solid var(--line); }
.odk-tabs button { font:600 14px/1 inherit; font-family:inherit; color:var(--dim); background:none; border:0; border-bottom:2px solid transparent; padding:10px 14px; cursor:pointer; margin-bottom:-1px; }
.odk-tabs button.on { color:var(--ink); border-bottom-color:var(--accent); }
.odk-tabs .n { display:inline-block; min-width:18px; margin-left:6px; padding:2px 6px; border-radius:999px; background:var(--soft); font-size:11px; color:var(--dim); }
.odk-body { flex:1; min-height:0; overflow:auto; padding:14px 20px 28px; }
.odk-err { color:var(--bad); font-size:13px; min-height:1em; }
.odk-toast { position:absolute; left:24px; bottom:18px; max-width:520px; background:var(--ink); color:#fff; padding:10px 14px; border-radius:10px; font-size:13px; box-shadow:0 6px 24px rgba(0,0,0,.18); z-index:5; }
.odk-board { display:grid; grid-template-columns:repeat(5,minmax(168px,1fr)); gap:10px; align-items:start; }
.odk-col { background:var(--soft); border-radius:12px; padding:10px; display:grid; gap:8px; align-content:start; min-width:0; }
.odk-col > header { display:flex; align-items:center; gap:8px; padding:2px 4px 4px; }
.odk-col > header b { font-size:13px; }
.odk-col > header .c { font-size:12px; color:var(--dim); background:var(--card); border-radius:999px; padding:1px 8px; }
.odk-col > header .dot { width:8px; height:8px; border-radius:50%; }
.odk-col .hint { font-size:12px; color:var(--dim); padding:0 4px; }
.odk-col .none { font-size:12px; color:var(--dim); text-align:center; padding:16px 6px; border:1px dashed var(--line); border-radius:10px; }
.odk-card { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:10px 11px; display:grid; gap:6px; min-width:0; }
.odk-card.fresh { animation:odk-in .5s ease-out; }
@keyframes odk-in { from { background:var(--accent-soft); transform:translateY(-3px) } to { background:var(--card); transform:none } }
.odk-card .row { display:flex; align-items:baseline; gap:8px; min-width:0; }
.odk-card .who { font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0; }
.odk-card .when { margin-left:auto; color:var(--dim); font-size:11px; white-space:nowrap; }
.odk-card .subj { font-weight:600; font-size:13px; }
.odk-card .snip { color:var(--dim); font-size:12px; white-space:pre-wrap; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; cursor:pointer; }
.odk-card .snip.open { -webkit-line-clamp:unset; display:block; }
.odk-card .num { font:600 12px ui-monospace,SFMono-Regular,Menlo,monospace; color:var(--accent); }
.odk-card ul { margin:0; padding:0; list-style:none; font-size:12px; display:grid; gap:2px; }
.odk-card li { display:flex; gap:6px; }
.odk-card li .q { font-variant-numeric:tabular-nums; font-weight:600; min-width:28px; text-align:right; }
.odk-card li.short { color:var(--bad); }
.odk-card .total { font-weight:700; font-variant-numeric:tabular-nums; }
.odk-card .note { font-size:11px; color:var(--dim); }
.odk-card .acts { display:flex; gap:6px; flex-wrap:wrap; }
.odk button.b { font:600 12px/1 inherit; font-family:inherit; border-radius:7px; padding:6px 10px; cursor:pointer; border:1px solid var(--line); background:var(--card); color:var(--ink); }
.odk button.b:hover { border-color:var(--dim); }
.odk button.b.primary { background:var(--accent); border-color:var(--accent); color:#fff; }
.odk button.b.primary:hover { filter:brightness(.94); }
.odk button.b.quiet { color:var(--dim); }
.odk button.b:disabled { opacity:.5; cursor:default; }
.odk-paste { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:10px; display:grid; gap:6px; }
.odk input, .odk select, .odk textarea { font:inherit; font-size:13px; color:var(--ink); background:#fff; border:1px solid #c6d3d7; border-radius:7px; padding:6px 8px; min-width:0; box-sizing:border-box; }
.odk textarea { resize:vertical; min-height:80px; width:100%; }
.odk label { display:grid; gap:4px; font-size:11px; color:var(--dim); font-weight:600; letter-spacing:.02em; }
.odk-panel { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:14px; display:grid; gap:12px; min-width:0; }
.odk-panel h2 { margin:0; font-size:15px; }
.odk-panel p { margin:0; color:var(--dim); font-size:13px; }
.odk-banner { display:flex; gap:10px; align-items:center; flex-wrap:wrap; background:var(--warn-soft); border:1px solid #ffd8a8; border-radius:10px; padding:10px 12px; font-size:13px; }
.odk-table { overflow-x:auto; }
.odk table { width:100%; border-collapse:collapse; font-size:13px; }
.odk th { text-align:left; font-size:11px; letter-spacing:.05em; text-transform:uppercase; color:var(--dim); padding:8px 5px; border-bottom:1px solid var(--line); white-space:nowrap; }
.odk td { padding:8px 5px; border-bottom:1px solid var(--soft); white-space:nowrap; vertical-align:middle; }
.odk .n { text-align:right; font-variant-numeric:tabular-nums; }
.odk .mono { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12px; }
.odk .bar { width:56px; height:6px; background:var(--soft); border-radius:3px; overflow:hidden; display:inline-block; vertical-align:middle; margin-left:8px; }
.odk .bar i { display:block; height:100%; background:var(--ok); }
.odk .bar i.low { background:var(--warn); } .odk .bar i.out { background:var(--bad); }
.odk .badge { font-size:11px; font-weight:700; border-radius:999px; padding:2px 8px; text-transform:uppercase; letter-spacing:.04em; }
.odk .badge.ok { background:var(--ok-soft); color:var(--ok); } .odk .badge.low { background:var(--warn-soft); color:var(--warn); } .odk .badge.out { background:var(--bad-soft); color:var(--bad); }
.odk .badge.k-confirmation { background:var(--ok-soft); color:var(--ok); } .odk .badge.k-shipped { background:var(--accent-soft); color:var(--accent); }
.odk .badge.k-backorder, .odk .badge.k-purchase-order { background:var(--warn-soft); color:var(--warn); } .odk .badge.k-reply, .odk .badge.k-message { background:#f3f0ff; color:#5f3dc4; }
.odk .badge.k-cancelled { background:var(--bad-soft); color:var(--bad); }
.odk .recv { display:flex; gap:6px; }
.odk .recv input { width:58px; }
.odk-forms { display:flex; flex-wrap:wrap; gap:10px 12px; align-items:flex-end; }
.odk-mail { display:grid; grid-template-columns:minmax(240px,340px) minmax(0,1fr); gap:12px; align-items:start; }
.odk-mail .list { display:grid; gap:6px; }
.odk-mail .item { text-align:left; font:inherit; background:var(--card); border:1px solid var(--line); border-radius:10px; padding:9px 11px; cursor:pointer; display:grid; gap:3px; color:var(--ink); }
.odk-mail .item.on { border-color:var(--accent); box-shadow:0 0 0 1px var(--accent); }
.odk-mail .item .s { font-weight:600; font-size:13px; }
.odk-mail .item .m { font-size:12px; color:var(--dim); display:flex; gap:8px; align-items:center; }
.odk-mail .reader { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:16px; display:grid; gap:8px; min-width:0; position:sticky; top:0; }
.odk-mail .reader .hd { font-size:12px; color:var(--dim); display:grid; gap:2px; border-bottom:1px solid var(--soft); padding-bottom:8px; }
.odk-mail .reader pre { margin:0; white-space:pre-wrap; font:13px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace; }
.odk-flow { display:flex; align-items:stretch; gap:0; }
.odk-flow .st { background:var(--soft); border-radius:10px; padding:10px 12px; min-width:0; flex:1 1 0; }
.odk-flow .st b { display:block; font-size:13px; }
.odk-flow .st span { font-size:12px; color:var(--dim); }
.odk-flow .st.rule { background:var(--warn-soft); }
.odk-flow .arr { align-self:center; color:var(--dim); padding:0 4px; font-size:16px; }
.odk-files { display:grid; gap:4px; font-size:12px; }
.odk-files code { background:var(--soft); padding:1px 6px; border-radius:5px; font-size:12px; }
.odk-empty { max-width:620px; margin:40px auto; text-align:center; display:grid; gap:14px; justify-items:center; }
.odk-empty h2 { margin:0; font-size:22px; }
.odk-empty p { margin:0; color:var(--dim); }
.odk-empty .steps { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; width:100%; text-align:left; }
.odk-empty .steps div { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:10px; font-size:12px; color:var(--dim); }
.odk-empty .steps b { display:block; color:var(--ink); font-size:13px; }
.odk-modal { position:fixed; inset:0; background:rgba(20,35,43,.45); display:grid; place-items:center; z-index:50; padding:24px; }
.odk-modal .box { background:#fff; border-radius:12px; width:min(860px,100%); height:min(86vh,1000px); display:flex; flex-direction:column; overflow:hidden; box-shadow:0 20px 60px rgba(0,0,0,.3); }
.odk-modal .bar2 { display:flex; align-items:center; gap:8px; padding:10px 12px; border-bottom:1px solid var(--line); }
.odk-modal .bar2 b { margin-right:auto; }
.odk-modal iframe { border:0; flex:1; width:100%; }
.odk-agent { border-left:1px solid var(--line); min-width:0; min-height:0; display:flex; flex-direction:column; background:var(--dsw-alias-bg-l1, #fff); }
.odk-agent > div { flex:1; min-height:0; }
@media (max-width: 900px) { .odk-flow { flex-wrap:wrap; gap:6px; } .odk-flow .arr { display:none; } .odk-flow .st { flex-basis:40%; } }
@media (max-width: 1100px) { .odk-kpis { grid-template-columns:repeat(3,minmax(0,1fr)); } .odk-empty .steps { grid-template-columns:repeat(2,1fr); } }
`

const money = cents => '€' + (cents / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
const total = order => order.lines.reduce((sum, l) => sum + l.qty * l.priceCents, 0)
const available = p => p.onHand - p.reserved
const status = p => available(p) <= 0 ? 'out' : available(p) <= p.reorderAt ? 'low' : 'ok'
function ago(iso) {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return Math.floor(s / 60) + ' min ago'
  if (s < 86400) return Math.floor(s / 3600) + ' h ago'
  return iso.slice(0, 10)
}

async function api(path, body) {
  const res = await fetch('/api/acryl-orderdesk/' + path, body === undefined
    ? { credentials: 'same-origin' }
    : { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const type = res.headers.get('content-type') || ''
  const data = type.includes('json') ? await res.json() : await res.text()
  if (!res.ok) throw new Error(data && data.error ? data.error : 'request failed')
  return data
}

/** Remembers which ids it has seen, so a card the agent just made can flash once. */
function useFresh(ids) {
  const seen = useRef(null)
  const fresh = new Set()
  if (seen.current !== null) for (const id of ids) if (!seen.current.has(id)) fresh.add(id)
  useEffect(() => { seen.current = new Set(ids) })
  return fresh
}

function Column({ title, color, count, hint, children, empty }) {
  return h('section', { className: 'odk-col', 'aria-label': title },
    h('header', null, h('span', { className: 'dot', style: { background: color } }), h('b', null, title), h('span', { className: 'c' }, count)),
    hint ? h('div', { className: 'hint' }, hint) : null,
    count === 0 && empty ? h('div', { className: 'none' }, empty) : null,
    children)
}

function EmailCard({ email, fresh, act }) {
  const [open, setOpen] = useState(false)
  return h('article', { className: 'odk-card' + (fresh ? ' fresh' : '') },
    h('div', { className: 'row' }, h('span', { className: 'who', title: email.from.email }, email.from.name), h('span', { className: 'when' }, ago(email.received))),
    h('div', { className: 'subj' }, email.subject),
    h('div', { className: 'snip' + (open ? ' open' : ''), onClick: () => setOpen(!open), title: open ? '' : 'Show the whole email' }, open ? email.body : email.body.replace(/\s*\n\s*/g, ' ')),
    h('div', { className: 'acts' }, h('button', { className: 'b quiet', type: 'button', onClick: () => act('email-ignore', { id: email.id }) }, 'Ignore')))
}

function OrderCard({ order, products, fresh, act, onNote }) {
  const product = sku => products.find(p => p.sku === sku)
  const short = line => order.stage === 'backorder' && product(line.sku) && available(product(line.sku)) < line.qty
  const last = order.history[order.history.length - 1]
  const buttons = []
  if (order.stage === 'approval') buttons.push(h('button', { key: 'a', className: 'b primary', type: 'button', onClick: () => act('order-approve', { id: order.id }) }, 'Approve'))
  if (order.stage === 'ready') buttons.push(h('button', { key: 's', className: 'b primary', type: 'button', onClick: () => act('order-ship', { id: order.id }) }, 'Ship'))
  if (order.stage === 'shipped') buttons.push(h('button', { key: 'd', className: 'b', type: 'button', onClick: () => onNote(order) }, 'Note ' + order.deliveryNote))
  if (order.stage === 'approval' || order.stage === 'ready' || order.stage === 'backorder') buttons.push(h('button', { key: 'c', className: 'b quiet', type: 'button', onClick: () => act('order-cancel', { id: order.id, reason: 'cancelled at the desk' }) }, 'Cancel'))
  return h('article', { className: 'odk-card' + (fresh ? ' fresh' : '') },
    h('div', { className: 'row' }, h('span', { className: 'num' }, order.number), h('span', { className: 'when' }, ago(order.history[order.history.length - 1].at))),
    h('div', { className: 'who', title: order.customer.email }, order.customer.name),
    h('ul', null, order.lines.map(l => h('li', { key: l.sku, className: short(l) ? 'short' : '', title: short(l) ? 'only ' + available(product(l.sku)) + ' available' : '' }, h('span', { className: 'q' }, l.qty + '×'), h('span', null, l.name)))),
    h('div', { className: 'row' }, h('span', { className: 'total' }, money(total(order))), h('span', { className: 'when' }, 'net')),
    order.note ? h('div', { className: 'note' }, '“' + order.note + '”') : null,
    last && last.note ? h('div', { className: 'note' }, last.note) : null,
    buttons.length ? h('div', { className: 'acts' }, buttons) : null)
}

function PasteEmail({ act, onDone }) {
  return h('form', { className: 'odk-paste', onSubmit: async e => {
    e.preventDefault()
    const body = Object.fromEntries(new FormData(e.currentTarget))
    if (await act('email', body)) onDone()
  } },
    h('label', null, 'From', h('input', { name: 'from', required: true, placeholder: 'Anna Berg <anna@cafe.example>' })),
    h('label', null, 'Subject', h('input', { name: 'subject', placeholder: 'Order' })),
    h('label', null, 'Email', h('textarea', { name: 'body', required: true, placeholder: 'Hi, please send us 3 kg espresso...' })),
    h('div', { className: 'acts' }, h('button', { className: 'b primary', type: 'submit' }, 'Add to inbox'), h('button', { className: 'b quiet', type: 'button', onClick: onDone }, 'Close')))
}

function Pipeline({ state, act, onNote }) {
  const [paste, setPaste] = useState(false)
  const p = state.pipeline
  const fresh = useFresh([...p.inbox.map(e => 'e' + e.id), ...state.orders.map(o => o.id + o.stage)])
  const orders = (list, empty) => list.map(o => h(OrderCard, { key: o.id, order: o, products: state.products, fresh: fresh.has(o.id + o.stage), act, onNote }))
  return h('div', { className: 'odk-board' },
    h(Column, { title: 'Inbox', color: '#1c7ed6', count: p.inbox.length, hint: p.inbox.length ? 'Ask the agent: “Process the inbox.”' : null, empty: 'No new emails. Drop .eml files into inbox/, or paste one.' },
      paste ? h(PasteEmail, { act, onDone: () => setPaste(false) }) : h('button', { className: 'b', type: 'button', onClick: () => setPaste(true) }, '+ Paste an email'),
      p.inbox.map(e => h(EmailCard, { key: e.id, email: e, fresh: fresh.has('e' + e.id), act }))),
    h(Column, { title: 'Needs approval', color: '#e67700', count: p.approval.length, hint: p.approval.length ? 'Above ' + money(state.workflow.approvalAboveCents) + ': a person decides.' : null, empty: 'Nothing to approve.' }, orders(p.approval)),
    h(Column, { title: 'Ready to ship', color: '#0c8599', count: p.ready.length, empty: 'Nothing to ship.' }, orders(p.ready)),
    h(Column, { title: 'Backorder', color: '#c92a2a', count: p.backorder.length, hint: p.backorder.length ? 'Released automatically when stock arrives.' : null, empty: 'No backorders.' }, orders(p.backorder)),
    h(Column, { title: 'Shipped', color: '#2b8a3e', count: p.shipped.length, empty: 'Nothing shipped yet.' }, orders(p.shipped)))
}

function Stock({ state, act }) {
  const [adding, setAdding] = useState(false)
  const suggestions = state.suggestions
  return h('div', { style: { display: 'grid', gap: '12px' } },
    suggestions.length ? h('div', { className: 'odk-banner' }, h('b', null, 'Running low: '),
      suggestions.map(s => h('span', { key: s.sku }, s.name + ' (' + s.available + ' left' + (s.owed ? ', ' + s.owed + ' owed to backorders' : '') + ') ',
        h('button', { className: 'b', type: 'button', onClick: () => act('reorder', { sku: s.sku, qty: s.qty }) }, 'Order ' + s.qty + ' from supplier')))) : null,
    h('div', { className: 'odk-panel' },
      h('div', { className: 'odk-table' }, h('table', null,
        h('thead', null, h('tr', null, h('th', null, 'SKU'), h('th', null, 'Product'), h('th', { className: 'n' }, 'Price'), h('th', { className: 'n' }, 'On hand'), h('th', { className: 'n' }, 'Reserved'), h('th', null, 'Available'), h('th', { className: 'n', title: 'ordered from the supplier, not arrived yet' }, 'On order'), h('th', null, ''), h('th', null, 'Stock arrived'))),
        h('tbody', null, state.products.length === 0
          ? h('tr', null, h('td', { colSpan: 9, style: { textAlign: 'center', color: 'var(--dim)', padding: '22px' } }, 'No products yet. Add one below, or ask the agent.'))
          : state.products.map(p => {
            const s = status(p); const pct = Math.max(0, Math.min(100, available(p) / Math.max(1, p.reorderAt * 3) * 100))
            return h('tr', { key: p.sku },
              h('td', { className: 'mono' }, p.sku), h('td', null, p.name), h('td', { className: 'n' }, money(p.priceCents)),
              h('td', { className: 'n' }, p.onHand), h('td', { className: 'n' }, p.reserved),
              h('td', null, h('span', { className: 'n', style: { display: 'inline-block', minWidth: '28px' } }, available(p)), h('span', { className: 'bar', title: 'reorder at ' + p.reorderAt }, h('i', { className: s, style: { width: pct + '%' } }))),
              h('td', { className: 'n' }, p.onOrder || ''),
              h('td', null, h('span', { className: 'badge ' + s }, s)),
              h('td', null, h('form', { className: 'recv', onSubmit: async e => { e.preventDefault(); const f = e.currentTarget; if (await act('stock-receive', { sku: p.sku, qty: Number(f.qty.value) })) f.reset() } },
                h('input', { name: 'qty', type: 'number', min: '1', required: true, placeholder: 'qty', 'aria-label': 'Quantity arrived of ' + p.name }),
                h('button', { className: 'b', type: 'submit' }, 'Book'))))
          }))))),
    adding
      ? h('form', { className: 'odk-panel', onSubmit: async e => {
        e.preventDefault()
        const body = Object.fromEntries([...new FormData(e.currentTarget)].filter(([, v]) => v !== ''))
        if (await act('product', body)) setAdding(false)
      } }, h('h2', null, 'Add a product'), h('div', { className: 'odk-forms' },
        h('label', null, 'SKU', h('input', { name: 'sku', required: true, placeholder: 'TEA-250', style: { width: '100px' } })),
        h('label', null, 'Name', h('input', { name: 'name', required: true, placeholder: 'Black tea, 250 g' })),
        h('label', null, 'Price (net, EUR)', h('input', { name: 'price', required: true, inputMode: 'decimal', placeholder: '9.50', style: { width: '90px' } })),
        h('label', null, 'In stock', h('input', { name: 'stock', type: 'number', min: '0', defaultValue: '0', style: { width: '80px' } })),
        h('label', null, 'Reorder at', h('input', { name: 'reorderAt', type: 'number', min: '0', style: { width: '80px' } })),
        h('label', null, 'Reorder qty', h('input', { name: 'reorderQty', type: 'number', min: '0', style: { width: '80px' } })),
        h('label', null, 'Supplier', h('input', { name: 'supplier', placeholder: 'Tea Trade <sales@tea.example>' })),
        h('button', { className: 'b primary', type: 'submit' }, 'Add'), h('button', { className: 'b quiet', type: 'button', onClick: () => setAdding(false) }, 'Close')))
      : h('div', null, h('button', { className: 'b', type: 'button', onClick: () => setAdding(true) }, '+ Add a product')))
}

const KIND = { message: 'message', confirmation: 'confirmed', backorder: 'backorder', shipped: 'shipped', reply: 'reply', 'purchase-order': 'purchase order', cancelled: 'cancelled' }

function Outbox({ state }) {
  const messages = [...state.outbox].reverse()
  const [selected, setSelected] = useState(null)
  const current = messages.find(m => m.id === selected) || messages[0]
  if (messages.length === 0) return h('div', { className: 'odk-panel' }, h('h2', null, 'Nothing sent yet'), h('p', null, 'Order confirmations, shipping notices, replies and purchase orders appear here, and as .eml files in outbox/.'))
  return h('div', { className: 'odk-mail' },
    h('div', { className: 'list' }, messages.map(m => h('button', { key: m.id, type: 'button', className: 'item' + (current && current.id === m.id ? ' on' : ''), onClick: () => setSelected(m.id) },
      h('span', { className: 'm' }, h('span', { className: 'badge k-' + m.kind }, KIND[m.kind] || m.kind), ago(m.at)),
      h('span', { className: 's' }, m.subject), h('span', { className: 'm' }, 'to ' + m.to.name)))),
    current ? h('div', { className: 'reader' },
      h('div', { className: 'hd' }, h('span', null, h('b', null, 'From: '), state.workflow.company + ' <' + state.workflow.sender + '>'), h('span', null, h('b', null, 'To: '), current.to.name + ' <' + current.to.email + '>'), h('span', null, h('b', null, 'Subject: '), current.subject), h('span', null, new Date(current.at).toLocaleString())),
      h('pre', null, current.body)) : null)
}

function Rules({ state, act }) {
  const w = state.workflow
  return h('div', { style: { display: 'grid', gap: '12px' } },
    h('div', { className: 'odk-panel' }, h('h2', null, 'How an order moves'),
      h('div', { className: 'odk-flow' },
        h('div', { className: 'st' }, h('b', null, 'Email arrives'), h('span', null, 'inbox/ folder, pasted, or forwarded to the agent')), h('span', { className: 'arr' }, '→'),
        h('div', { className: 'st' }, h('b', null, 'Agent reads it'), h('span', null, 'any language; maps it to SKUs, or answers')), h('span', { className: 'arr' }, '→'),
        h('div', { className: 'st' }, h('b', null, 'Stock check'), h('span', null, 'reserved, or backorder until stock arrives')), h('span', { className: 'arr' }, '→'),
        h('div', { className: 'st rule' }, h('b', null, 'Approval'), h('span', null, 'only above ' + money(w.approvalAboveCents))), h('span', { className: 'arr' }, '→'),
        h('div', { className: 'st' }, h('b', null, 'Ship'), h('span', null, 'delivery note + email to the customer')))),
    h('form', { className: 'odk-panel', onSubmit: async e => { e.preventDefault(); await act('workflow', Object.fromEntries(new FormData(e.currentTarget))) } },
      h('h2', null, 'Rules'), h('p', null, 'The agent follows the same rules; ask it to change them too (“approve only orders above 2,000 euros”).'),
      h('div', { className: 'odk-forms' },
        h('label', null, 'Approval above (EUR, net)', h('input', { name: 'approvalAboveEur', inputMode: 'decimal', defaultValue: (w.approvalAboveCents / 100).toFixed(2), key: 'a' + w.approvalAboveCents, style: { width: '120px' } })),
        h('label', null, 'Company', h('input', { name: 'company', defaultValue: w.company, key: 'c' + w.company })),
        h('label', null, 'Sender address', h('input', { name: 'sender', defaultValue: w.sender, key: 's' + w.sender, style: { width: '240px' } })),
        h('button', { className: 'b primary', type: 'submit' }, 'Save rules'))),
    h('div', { className: 'odk-panel' }, h('h2', null, 'Files'), h('div', { className: 'odk-files' },
      h('span', null, h('code', null, 'inbox/'), ' drop customer emails here (.eml or .txt); they appear in the Inbox within seconds'),
      h('span', null, h('code', null, 'outbox/'), ' every message sent, as .eml (open in any mail program, or let a mail script send them)'),
      h('span', null, h('code', null, 'delivery-notes/'), ' a printable delivery note for every shipped order'),
      h('span', null, h('code', null, '.acryl/orderdesk.json'), ' all of the desk\'s data, plain JSON'),
      h('span', { style: { color: 'var(--dim)' } }, 'in ' + state.home))))
}

function Empty({ act }) {
  return h('div', { className: 'odk-empty' },
    h('h2', null, 'Your order desk is empty'),
    h('p', null, 'Customer emails come in, the agent turns them into orders, stock is reserved, large orders wait for you, and shipping sends the delivery note and the email.'),
    h('div', { className: 'steps' },
      h('div', null, h('b', null, '1. Emails'), 'drop them into inbox/ or paste them'),
      h('div', null, h('b', null, '2. Orders'), '“Process the inbox”'),
      h('div', null, h('b', null, '3. Approve'), 'only the large ones'),
      h('div', null, h('b', null, '4. Ship'), 'note + email go out')),
    h('button', { className: 'b primary', type: 'button', onClick: () => act('sample', {}) }, 'Load the sample business (a coffee roaster)'),
    h('p', null, 'or add your products under Stock, or tell the agent what you sell.'))
}

function Desk() {
  const [state, setState] = useState(null)
  const [tab, setTab] = useState('pipeline')
  const [toast, setToast] = useState('')
  const [note, setNote] = useState(null)
  useEffect(() => {
    let alive = true
    const poll = async () => { try { const next = await api('state'); if (alive) setState(s => (s && JSON.stringify(s) === JSON.stringify(next) ? s : next)) } catch {} }
    poll(); const t = setInterval(poll, 2000)
    return () => { alive = false; clearInterval(t) }
  }, [])
  const act = useCallback(async (path, body) => {
    try { setState(await api(path, body)); return true } catch (e) { setToast(e.message); setTimeout(() => setToast(''), 5000); return false }
  }, [])
  const openNote = useCallback(async order => {
    try { setNote({ order, html: await api('document?order=' + order.id) }) } catch (e) { setToast(e.message) }
  }, [])
  if (state === null) return h('div', { className: 'odk-desk' }, h('div', { className: 'odk-top' }, h('p', null, 'Opening the order desk...')))
  const s = state.stats
  const empty = state.products.length === 0 && state.emails.length === 0 && state.orders.length === 0
  const kpi = (k, v, cls) => h('div', { key: k, className: 'odk-kpi' + (cls ? ' ' + cls : '') }, h('div', { className: 'k' }, k), h('div', { className: 'v' }, v))
  const tabs = [['pipeline', 'Pipeline', s.newEmails + s.openOrders], ['stock', 'Stock', s.lowStock], ['outbox', 'Outbox', state.outbox.length], ['rules', 'Rules', null]]
  return h('div', { className: 'odk-desk', style: { position: 'relative' } },
    h('div', { className: 'odk-top' },
      h('div', { className: 'odk-title' }, h('h1', null, 'Order desk'), h('span', { className: 'co' }, state.workflow.company), h('span', { className: 'live' }, h('i'), 'live: the agent works here too')),
      empty ? null : h('div', { className: 'odk-kpis' },
        kpi('New emails', s.newEmails, s.newEmails ? 'hot' : ''), kpi('To approve', s.toApprove, s.toApprove ? 'hot' : ''), kpi('To ship', s.toShip),
        kpi('Backorders', s.backorders, s.backorders ? 'bad' : ''), kpi('Low stock', s.lowStock, s.lowStock ? 'bad' : ''), kpi('Open orders', money(s.openValueCents))),
      h('div', { className: 'odk-tabs', role: 'tablist' }, tabs.map(([id, label, n]) => h('button', { key: id, type: 'button', role: 'tab', 'aria-selected': tab === id, className: tab === id ? 'on' : '', onClick: () => setTab(id) }, label, n ? h('span', { className: 'n' }, n) : null)))),
    h('div', { className: 'odk-body' },
      empty && tab === 'pipeline' ? h(Empty, { act })
        : tab === 'pipeline' ? h(Pipeline, { state, act, onNote: openNote })
          : tab === 'stock' ? h(Stock, { state, act })
            : tab === 'outbox' ? h(Outbox, { state }) : h(Rules, { state, act })),
    toast ? h('div', { className: 'odk-toast', role: 'alert' }, toast) : null,
    note ? h('div', { className: 'odk-modal', onClick: e => { if (e.target === e.currentTarget) setNote(null) } },
      h('div', { className: 'box', role: 'dialog', 'aria-label': 'Delivery note ' + note.order.deliveryNote },
        h('div', { className: 'bar2' }, h('b', null, 'Delivery note ' + note.order.deliveryNote + ' · ' + note.order.customer.name), h('span', { style: { color: 'var(--dim)', fontSize: '12px' } }, 'delivery-notes/' + note.order.deliveryNote + '.html'), h('button', { className: 'b', type: 'button', onClick: () => setNote(null) }, 'Close')),
        h('iframe', { title: 'Delivery note', srcDoc: note.html, sandbox: '' }))) : null)
}

/** The app's main surface: the desk, and the agent beside it. */
function OrderDeskApp(props) {
  useEffect(() => {
    const style = document.createElement('style'); style.dataset.acrylOrderdesk = ''; style.textContent = CSS
    document.head.appendChild(style)
    return () => style.remove()
  }, [])
  return h('div', { className: 'odk' },
    h(Desk),
    h('aside', { className: 'odk-agent', 'aria-label': 'Agent' }, props.renderConversation ? props.renderConversation() : null))
}

exports.inject = ['slots', 'theme']

exports.apply = function apply(ctx) {
  const environment = shell.resolveShellEnvironment(window.location.hash)
  if (environment.mode !== 'advanced') return
  shell.applyAdvancedShell(ctx, environment)
  // Lower priority renders: below the shell's own fallback (100), which shows the plain conversation.
  ctx.slots.inject('desktop.main', () => ctx.slots.register({ name: 'desktop.main', priority: 0 }, OrderDeskApp))
}

return module.exports; } });
