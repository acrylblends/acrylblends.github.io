/**
 * The accounting page: plain HTML, CSS and JS (no framework, no build step), served by this plugin's own route. It reads and writes the same
 * `.acryl/accounting.json` the agent's tools use, through the plugin's same-origin loopback routes, and polls every 2 seconds, so what the
 * agent does in the chat shows up here without a reload. Every value that comes from the data is put on the page as text, never as HTML.
 */

export function pageHtml() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Accounting</title>
<style>
  :root { --bg:#0e1411; --panel:#151d18; --line:#26332b; --text:#eef3ef; --muted:#9bb0a3; --accent:#2f9e44; --accent2:#51cf66; --bad:#ff6b6b; --warn:#ffd43b; }
  * { box-sizing: border-box; }
  body { margin:0; font:17px/1.5 -apple-system,"Segoe UI",system-ui,sans-serif; background:var(--bg); color:var(--text); }
  header { display:flex; align-items:center; gap:14px; padding:16px max(28px, calc((100% - 1180px) / 2 + 28px)); border-bottom:1px solid var(--line); }
  header h1 { font-size:22px; margin:0; letter-spacing:.2px; }
  header .live { margin-left:auto; color:var(--muted); font-size:14px; }
  header .live i { display:inline-block; width:9px; height:9px; border-radius:50%; background:var(--accent2); margin-right:6px; }
  nav { display:flex; gap:8px; padding:18px max(28px, calc((100% - 1180px) / 2 + 28px)) 0; }
  nav button { font:600 16px inherit; color:var(--muted); background:transparent; border:1px solid var(--line); border-radius:999px; padding:8px 20px; cursor:pointer; }
  nav button.on { background:var(--accent); border-color:var(--accent); color:#fff; }
  main { padding:18px 28px 60px; max-width:1180px; margin:0 auto; }
  section { display:none; } section.on { display:block; }
  form { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px; align-items:end; background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:16px; margin-bottom:18px; }
  label { display:flex; flex-direction:column; gap:4px; font-size:13px; color:var(--muted); }
  input, select { font:inherit; color:var(--text); background:#0b100d; border:1px solid var(--line); border-radius:8px; padding:9px 11px; min-width:0; }
  input:focus, select:focus, button:focus-visible { outline:2px solid var(--accent2); outline-offset:1px; }
  @media (min-width: 900px) { #invoice-form { grid-template-columns: repeat(4, 1fr); } #expense-form { grid-template-columns: repeat(3, 1fr); } }
  .go { font:700 16px inherit; background:var(--accent); color:#fff; border:0; border-radius:8px; padding:11px 18px; cursor:pointer; }
  .go:hover { background:#2b8a3e; }
  .err { grid-column:1/-1; color:var(--bad); min-height:1.4em; font-size:15px; }
  table { width:100%; border-collapse:collapse; }
  th { text-align:left; font:600 13px inherit; text-transform:uppercase; letter-spacing:.8px; color:var(--muted); padding:8px 10px; border-bottom:1px solid var(--line); }
  td { padding:12px 10px; border-bottom:1px solid var(--line); vertical-align:middle; }
  td.n, th.n { text-align:right; font-variant-numeric:tabular-nums; }
  .badge { display:inline-block; border-radius:999px; padding:2px 12px; font-size:13px; font-weight:700; }
  .open { background:#3a3411; color:var(--warn); } .paid { background:#12331b; color:var(--accent2); } .late { background:#3b1717; color:var(--bad); }
  .row-late td:first-child { box-shadow: inset 4px 0 0 var(--bad); }
  .pay { font:600 14px inherit; color:var(--accent2); background:transparent; border:1px solid var(--accent); border-radius:8px; padding:5px 12px; cursor:pointer; }
  .pay:hover { background:var(--accent); color:#fff; }
  #toast { position:fixed; right:24px; bottom:24px; background:#3b1717; color:var(--text); border:1px solid var(--bad); border-radius:10px; padding:12px 18px; z-index:5; }
  .empty { color:var(--muted); padding:30px 10px; text-align:center; }
  .period { display:flex; gap:10px; flex-wrap:wrap; align-items:end; margin-bottom:18px; }
  .cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:14px; }
  .card { background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:18px 20px; }
  .card .k { color:var(--muted); font-size:14px; } .card .v { font-size:32px; font-weight:700; margin-top:4px; font-variant-numeric:tabular-nums; }
  .card.hero { border-color:var(--accent); } .card .s { color:var(--muted); font-size:13px; margin-top:2px; }
  .neg { color:var(--accent2); }
  @media print { body { background:#fff; color:#000; } nav, form, .pay, header .live { display:none; } }
</style>
</head>
<body>
<header><h1>Accounting</h1><span class="live"><i></i>live</span></header>
<nav id="tabs">
  <button data-tab="invoices" class="on">Invoices</button>
  <button data-tab="expenses">Expenses</button>
  <button data-tab="summary">VAT &amp; income</button>
</nav>
<div id="toast" role="alert" hidden></div>
<main>
  <section id="invoices" class="on">
    <form id="invoice-form">
      <label>Client<input name="client" required placeholder="ACME"></label>
      <label>Description<input name="description" required placeholder="Consulting"></label>
      <label>Quantity<input name="quantity" type="number" min="0.01" step="any" value="1"></label>
      <label>Unit price (net, EUR)<input name="unitPrice" required inputmode="decimal" placeholder="1200.00"></label>
      <label>VAT<select name="vatRate"><option>20</option><option>13</option><option>10</option><option>0</option></select></label>
      <label>Issued<input name="issued" type="date"></label>
      <label>Due in (days)<input name="dueDays" type="number" min="0" value="14"></label>
      <button class="go" type="submit">Create invoice</button>
      <div class="err" data-err></div>
    </form>
    <table><thead><tr><th>No.</th><th>Client</th><th>Issued</th><th>Due</th><th class="n">Net</th><th class="n">VAT</th><th class="n">Gross</th><th>Status</th><th></th></tr></thead><tbody id="invoice-rows"></tbody></table>
  </section>
  <section id="expenses">
    <form id="expense-form">
      <label>Description<input name="description" required placeholder="Laptop"></label>
      <label>Category<input name="category" placeholder="equipment"></label>
      <label>Amount paid (gross, EUR)<input name="amount" required inputmode="decimal" placeholder="1200.00"></label>
      <label>VAT<select name="vatRate"><option>20</option><option>13</option><option>10</option><option>0</option></select></label>
      <label>Date<input name="date" type="date"></label>
      <button class="go" type="submit">Add expense</button>
      <div class="err" data-err></div>
    </form>
    <table><thead><tr><th>Date</th><th>Description</th><th>Category</th><th class="n">Net</th><th class="n">VAT</th><th class="n">Gross</th></tr></thead><tbody id="expense-rows"></tbody></table>
  </section>
  <section id="summary">
    <div class="period">
      <label>Period<select id="preset"></select></label>
      <label>From<input id="from" type="date"></label>
      <label>To<input id="to" type="date"></label>
      <button class="go" id="apply" type="button">Show</button>
      <span class="err" id="summary-err"></span>
    </div>
    <div class="cards" id="cards"></div>
  </section>
</main>
<script>
(() => {
  const money = cents => { const s = cents < 0 ? '-' : ''; const a = Math.abs(cents); return 'EUR ' + s + Math.floor(a / 100).toString().replace(/\\B(?=(\\d{3})+(?!\\d))/g, ',') + '.' + String(a % 100).padStart(2, '0'); }
  const $ = id => document.getElementById(id)
  const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); for (const k of kids) e.append(k); return e }
  const api = async (path, body) => {
    const response = await fetch('/api/acryl-accounting/' + path, body === undefined ? undefined : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'request failed')
    return data
  }
  const toast = message => { const t = $('toast'); t.textContent = message; t.hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => { t.hidden = true }, 4000) }
  const quarter = (year, q) => ({ from: year + '-' + String((q - 1) * 3 + 1).padStart(2, '0') + '-01', to: new Date(Date.UTC(year, q * 3, 0)).toISOString().slice(0, 10) })
  let state = { invoices: [], expenses: [], today: new Date().toISOString().slice(0, 10) }
  let seen = ''

  function td(text, cls) { return el('td', { textContent: text, className: cls || '' }) }
  function renderInvoices() {
    const rows = $('invoice-rows'); rows.replaceChildren()
    if (state.invoices.length === 0) { rows.append(el('tr', {}, el('td', { colSpan: 9, className: 'empty', textContent: 'No invoices yet. Create one above, or ask the assistant.' }))); return }
    for (const inv of [...state.invoices].reverse()) {
      const status = inv.status === 'paid' ? ['paid', 'paid ' + inv.paidOn] : inv.overdue ? ['late', 'overdue'] : ['open', 'open']
      const pay = inv.status === 'open' ? el('button', { className: 'pay', textContent: 'Mark paid' }) : document.createTextNode('')
      if (inv.status === 'open') pay.addEventListener('click', async () => { try { state = await api('invoice-paid', { id: inv.id }); render() } catch (e) { toast(e.message) } })
      rows.append(el('tr', { className: inv.overdue ? 'row-late' : '' }, td(inv.number), td(inv.client), td(inv.issued), td(inv.due), td(money(inv.net), 'n'), td(money(inv.vat) + ' (' + inv.vatRate + '%)', 'n'), td(money(inv.gross), 'n'),
        el('td', {}, el('span', { className: 'badge ' + status[0], textContent: status[1] })), el('td', {}, pay)))
    }
  }
  function renderExpenses() {
    const rows = $('expense-rows'); rows.replaceChildren()
    if (state.expenses.length === 0) { rows.append(el('tr', {}, el('td', { colSpan: 6, className: 'empty', textContent: 'No expenses yet.' }))); return }
    for (const exp of [...state.expenses].reverse()) rows.append(el('tr', {}, td(exp.date), td(exp.description), td(exp.category), td(money(exp.net), 'n'), td(money(exp.vat) + ' (' + exp.vatRate + '%)', 'n'), td(money(exp.gross), 'n')))
  }
  function render() { const key = JSON.stringify([state.invoices, state.expenses, state.today]); if (key === seen) return; seen = key; renderInvoices(); renderExpenses(); if ($('summary').classList.contains('on')) loadSummary() }

  function card(label, value, sub, cls) { return el('div', { className: 'card' + (cls ? ' ' + cls : '') }, el('div', { className: 'k', textContent: label }), el('div', { className: 'v', textContent: value }), sub ? el('div', { className: 's', textContent: sub }) : '') }
  async function loadSummary() {
    $('summary-err').textContent = ''
    try {
      const s = await api('summary?from=' + $('from').value + '&to=' + $('to').value)
      const cards = $('cards'); cards.replaceChildren(
        card(s.vatPayable < 0 ? 'VAT refund' : 'VAT payable', money(Math.abs(s.vatPayable)), 'output ' + money(s.outputVat) + ' minus input ' + money(s.inputVat), 'hero'),
        card('Revenue (net)', money(s.revenue), s.invoices + ' invoice' + (s.invoices === 1 ? '' : 's') + ' issued'),
        card('Expenses (net)', money(s.expensesNet), s.expenses + ' expense' + (s.expenses === 1 ? '' : 's')),
        card('Profit', money(s.profit), 'revenue minus expenses', s.profit < 0 ? '' : 'hero'),
        card('Received', money(s.received), 'paid in the period, gross'),
        card('Outstanding', money(s.outstanding), 'unpaid at the end of the period, gross'))
    } catch (e) { $('summary-err').textContent = e.message }
  }
  function presets() {
    const today = new Date(state.today + 'T00:00:00Z'); const year = today.getUTCFullYear(); const q = Math.floor(today.getUTCMonth() / 3) + 1
    const list = [['This quarter', quarter(year, q)], ['Last quarter', q === 1 ? quarter(year - 1, 4) : quarter(year, q - 1)], ['This year', { from: year + '-01-01', to: year + '-12-31' }]]
    const select = $('preset'); select.replaceChildren(...list.map(([name], i) => el('option', { value: i, textContent: name })), el('option', { value: 'custom', textContent: 'Custom' }))
    const apply = () => { if (select.value === 'custom') return; const r = list[Number(select.value)][1]; $('from').value = r.from; $('to').value = r.to }
    select.addEventListener('change', () => { apply(); loadSummary() }); apply()
  }

  for (const button of document.querySelectorAll('#tabs button')) button.addEventListener('click', () => {
    for (const b of document.querySelectorAll('#tabs button')) b.classList.toggle('on', b === button)
    for (const s of document.querySelectorAll('section')) s.classList.toggle('on', s.id === button.dataset.tab)
    if (button.dataset.tab === 'summary') loadSummary()
  })
  const submit = (form, path) => form.addEventListener('submit', async event => {
    event.preventDefault(); const err = form.querySelector('[data-err]'); err.textContent = ''
    const body = Object.fromEntries([...new FormData(form)].filter(([, value]) => value !== ''))
    try { state = await api(path, body); form.reset(); render() } catch (e) { err.textContent = e.message }
  })
  submit($('invoice-form'), 'invoice'); submit($('expense-form'), 'expense')
  for (const id of ['from', 'to']) $(id).addEventListener('change', () => { $('preset').value = 'custom'; loadSummary() })
  $('apply').addEventListener('click', loadSummary)

  async function poll() { try { state = await api('state'); render() } catch {} }
  poll().then(presets).then(() => setInterval(poll, 2000))
  window.__accounting = { get state() { return state } }
})()
</script>
</body>
</html>`
}
