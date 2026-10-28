// outlay (browser half): the books as a modern dashboard — hero month total, stat tiles,
// entries with filters, budgets, recurring rules, CSV, and a floating assistant button.
// No build step: React.createElement only, one injected stylesheet.
window.__ModuleLoader__.load({ id: 'outlay', factory: (require) => {
var module = { exports: {} }; var exports = module.exports;

const React = require('react')
const h = React.createElement

const API = '/api/outlay/entries'
const PALETTE = ['#0b7285', '#f76707', '#5f3dc4', '#2f9e44', '#e8590c', '#c2255c', '#495057', '#1864ab', '#087f5b']

const CSS = `
.ol-root { --ol-accent: var(--acryl-accent, #0b7285);
  --ol-surface: var(--dsw-alias-bg-layer-1, #ffffff);
  --ol-page: var(--dsw-alias-bg-layer-2, #f6f7f8);
  --ol-ink: var(--dsw-alias-label-primary, #0b0b0c);
  --ol-ink-2: var(--dsw-alias-label-secondary, #4b5563);
  --ol-ink-3: var(--dsw-alias-label-tertiary, #6b7280);
  --ol-border: var(--dsw-alias-border-l2, #e6e8eb);
  --ol-radius: 16px;
  --ol-radius-sm: 10px;
  position: relative; height: 100%; min-height: 100%; overflow-y: auto;
  background: var(--ol-page); color: var(--ol-ink);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, 'Helvetica Neue', Arial, sans-serif;
  font-size: 14px; line-height: 1.45; -webkit-font-smoothing: antialiased; }
.ol-root *, .ol-root *::before, .ol-root *::after { box-sizing: border-box; }
.ol-root ::selection { background: color-mix(in srgb, var(--ol-accent) 24%, transparent); }

.ol-nav { position: sticky; top: 0; z-index: 30; border-bottom: 1px solid var(--ol-border);
  background: color-mix(in srgb, var(--ol-page) 84%, transparent); backdrop-filter: blur(14px); }
.ol-nav-inner { max-width: 1200px; margin: 0 auto; padding: 13px 28px; display: flex; align-items: center; gap: 14px; }
.ol-brand { display: flex; align-items: center; gap: 11px; flex: 1; min-width: 0; }
.ol-logo { width: 36px; height: 36px; border-radius: 11px; flex: none; display: flex; align-items: center; justify-content: center;
  color: #fff; background: linear-gradient(140deg, var(--ol-accent), color-mix(in srgb, var(--ol-accent) 62%, #000));
  box-shadow: 0 1px 2px rgba(0,0,0,0.14), inset 0 1px 0 rgba(255,255,255,0.18); }
.ol-title { font-size: 16px; font-weight: 700; letter-spacing: -0.02em; margin: 0; line-height: 1.2; }
.ol-sub { font-size: 12px; color: var(--ol-ink-3); margin: 1px 0 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ol-nav-actions { display: flex; align-items: center; gap: 8px; flex: none; }
.ol-pill { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 11px; border-radius: 999px;
  border: 1px solid var(--ol-border); background: var(--ol-surface); color: var(--ol-ink-2); font-size: 12px; white-space: nowrap; }
.ol-iconbtn { width: 32px; height: 32px; border-radius: 9px; border: 1px solid var(--ol-border); background: var(--ol-surface);
  color: var(--ol-ink-2); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; font-size: 15px;
  transition: background .15s, color .15s, border-color .15s; }
.ol-iconbtn:hover { color: var(--ol-ink); background: color-mix(in srgb, var(--ol-ink) 5%, transparent); }
.ol-export { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 11px; border-radius: 9px;
  border: 1px solid var(--ol-border); background: var(--ol-surface); color: var(--ol-ink-2); font-size: 12px; font-weight: 600;
  text-decoration: none; white-space: nowrap; transition: background .15s, color .15s; }
.ol-export:hover { color: var(--ol-ink); background: color-mix(in srgb, var(--ol-ink) 5%, transparent); }

.ol-wrap { max-width: 1200px; margin: 0 auto; padding: 24px 28px 124px; }
.ol-hero { display: grid; grid-template-columns: 1.15fr .85fr; gap: 26px; border: 1px solid var(--ol-border);
  border-radius: var(--ol-radius); padding: 24px 26px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--ol-accent) 7%, var(--ol-surface)), var(--ol-surface) 56%); }
.ol-hero-label { font-size: 11px; text-transform: uppercase; letter-spacing: .09em; color: var(--ol-ink-3); font-weight: 650; }
.ol-hero-value { font-size: 44px; font-weight: 750; letter-spacing: -0.045em; line-height: 1.04; margin: 8px 0 10px;
  font-variant-numeric: tabular-nums; }
.ol-hero-note { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 12px; color: var(--ol-ink-3); }
.ol-delta { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 650; }
.ol-delta.down { color: #0f766e; background: color-mix(in srgb, #10b981 15%, transparent); }
.ol-delta.up { color: #b45309; background: color-mix(in srgb, #f59e0b 17%, transparent); }
.ol-hero-side { border-left: 1px solid var(--ol-border); padding-left: 26px; display: flex; flex-direction: column; justify-content: center; }
.ol-hero-side-label { font-size: 11px; text-transform: uppercase; letter-spacing: .09em; color: var(--ol-ink-3); font-weight: 650; }
.ol-hero-side-value { font-size: 20px; font-weight: 700; letter-spacing: -0.02em; margin-top: 7px; font-variant-numeric: tabular-nums; }
.ol-hero-side .ol-track { margin-top: 11px; }
.ol-track { height: 8px; border-radius: 999px; background: color-mix(in srgb, var(--ol-ink) 8%, transparent); overflow: hidden; }
.ol-track.thin { height: 6px; }
.ol-fill { height: 100%; border-radius: 999px; background: var(--ol-accent); transition: width .35s ease; }
.ol-fill.warn { background: #d97706; }
.ol-fill.over { background: #dc2626; }

.ol-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-top: 16px; }
.ol-stat { border: 1px solid var(--ol-border); border-radius: var(--ol-radius); background: var(--ol-surface); padding: 15px 18px; }
.ol-stat-label { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: var(--ol-ink-3); font-weight: 650; }
.ol-stat-value { font-size: 24px; font-weight: 700; letter-spacing: -0.03em; margin-top: 5px; font-variant-numeric: tabular-nums; }
.ol-stat-note { font-size: 11px; color: var(--ol-ink-3); margin-top: 3px; }

.ol-layout { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(330px, 1fr); gap: 18px; margin-top: 18px; align-items: start; }
.ol-stack { display: flex; flex-direction: column; gap: 18px; min-width: 0; }

.ol-card { border: 1px solid var(--ol-border); border-radius: var(--ol-radius); background: var(--ol-surface); }
.ol-card-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 18px 20px 0; }
.ol-h2 { font-size: 14px; font-weight: 650; letter-spacing: -0.01em; margin: 0; }
.ol-muted { font-size: 12px; color: var(--ol-ink-3); }

.ol-input, .ol-select { height: 40px; padding: 0 12px; border-radius: var(--ol-radius-sm); border: 1px solid var(--ol-border);
  background: var(--ol-surface); color: var(--ol-ink); font: inherit; font-size: 13px; outline: none; min-width: 0;
  transition: border-color .15s, box-shadow .15s; }
.ol-input:focus, .ol-select:focus { border-color: var(--ol-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--ol-accent) 16%, transparent); }
.ol-input::placeholder { color: var(--ol-ink-3); }
.ol-btn { height: 38px; padding: 0 16px; border-radius: var(--ol-radius-sm); border: 1px solid transparent; cursor: pointer;
  background: var(--ol-accent); color: #fff; font: inherit; font-size: 13px; font-weight: 650; white-space: nowrap;
  transition: filter .15s, transform .1s; }
.ol-btn:hover { filter: brightness(1.07); }
.ol-btn:active { transform: translateY(1px); }
.ol-btn:disabled { opacity: .55; cursor: default; }
.ol-btn-sm { height: 33px; padding: 0 12px; font-size: 12px; }
.ol-btn-ghost { background: transparent; color: var(--ol-ink); border-color: var(--ol-border); }
.ol-btn-ghost:hover { background: color-mix(in srgb, var(--ol-ink) 5%, transparent); filter: none; }

.ol-add { display: grid; grid-template-columns: 116px minmax(0, 1fr) 148px auto; gap: 10px; padding: 14px 20px 20px;
  grid-template-areas: "amount note category submit"; }
.ol-add .ol-amount-field { grid-area: amount; }
.ol-add .ol-note-field { grid-area: note; }
.ol-add .ol-cat-field { grid-area: category; }
.ol-add .ol-btn { grid-area: submit; }
.ol-add .ol-newcat { grid-column: 1 / -1; display: flex; gap: 10px; }

.ol-controls { display: flex; gap: 10px; padding: 14px 20px 0; align-items: center; flex-wrap: wrap; }
.ol-search { position: relative; flex: 1; min-width: 170px; }
.ol-search .ol-input { width: 100%; padding-left: 34px; padding-right: 46px; }
.ol-search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--ol-ink-3);
  font-size: 13px; pointer-events: none; }
.ol-kbd { position: absolute; right: 9px; top: 50%; transform: translateY(-50%); font-size: 10px; color: var(--ol-ink-3);
  border: 1px solid var(--ol-border); border-radius: 5px; padding: 1px 5px; background: var(--ol-page); pointer-events: none; }
.ol-seg { display: inline-flex; padding: 3px; gap: 2px; border-radius: 999px; background: color-mix(in srgb, var(--ol-ink) 6%, transparent); }
.ol-seg button { border: none; background: transparent; color: var(--ol-ink-3); font: inherit; font-size: 12px; font-weight: 550;
  padding: 6px 11px; border-radius: 999px; cursor: pointer; white-space: nowrap; transition: background .15s, color .15s; }
.ol-seg button.active { background: var(--ol-surface); color: var(--ol-ink); box-shadow: 0 1px 2px rgba(0,0,0,0.08); }

.ol-chipsrow { display: flex; gap: 7px; padding: 12px 20px 2px; overflow-x: auto; scrollbar-width: none; }
.ol-chipsrow::-webkit-scrollbar { display: none; }
.ol-chipbtn { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 12px; border-radius: 999px;
  border: 1px solid var(--ol-border); background: var(--ol-surface); color: var(--ol-ink-2); font: inherit; font-size: 12px;
  cursor: pointer; white-space: nowrap; transition: background .15s, color .15s, border-color .15s; }
.ol-chipbtn:hover { border-color: color-mix(in srgb, var(--ol-ink) 22%, var(--ol-border)); }
.ol-chipbtn.active { background: var(--ol-ink); color: var(--ol-page); border-color: var(--ol-ink); }
.ol-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; }

.ol-list { padding: 4px 12px 12px; }
.ol-daygroup { display: flex; justify-content: space-between; align-items: baseline; gap: 10px;
  padding: 14px 9px 5px; font-size: 11px; font-weight: 650; letter-spacing: .06em; text-transform: uppercase; color: var(--ol-ink-3); }
.ol-row { display: grid; grid-template-columns: minmax(0, 1fr) auto 64px; align-items: center; gap: 12px;
  padding: 9px 10px; border-radius: 12px; transition: background .12s; }
.ol-row:hover { background: color-mix(in srgb, var(--ol-ink) 4%, transparent); }
.ol-row-main { min-width: 0; }
.ol-note { font-size: 13px; font-weight: 550; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ol-row-meta { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--ol-ink-3); margin-top: 2px; }
.ol-amount { font-size: 13px; font-weight: 650; font-variant-numeric: tabular-nums; text-align: right; }
.ol-actions { display: flex; gap: 2px; justify-content: flex-end; opacity: 0; transition: opacity .12s; }
.ol-row:hover .ol-actions { opacity: 1; }
.ol-x { border: none; background: transparent; color: var(--ol-ink-3); cursor: pointer; width: 28px; height: 28px;
  border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; font: inherit; font-size: 13px;
  transition: color .12s, background .12s; }
.ol-x:hover { color: var(--ol-ink); background: color-mix(in srgb, var(--ol-ink) 8%, transparent); }
.ol-x.danger:hover { color: var(--dsw-alias-state-error-primary, #dc2626); background: color-mix(in srgb, #dc2626 10%, transparent); }

.ol-edit { display: grid; grid-template-columns: 92px minmax(0, 1fr) 124px 136px auto; gap: 8px; align-items: center;
  padding: 9px 10px; margin: 4px 0; border-radius: 12px; background: color-mix(in srgb, var(--ol-accent) 6%, transparent); }
.ol-edit .ol-input, .ol-edit .ol-select { height: 34px; font-size: 12px; }

.ol-empty { padding: 42px 20px; text-align: center; color: var(--ol-ink-3); font-size: 13px; line-height: 1.7; }
.ol-empty-icon { width: 44px; height: 44px; border-radius: 14px; margin: 0 auto 12px; display: flex; align-items: center;
  justify-content: center; background: color-mix(in srgb, var(--ol-accent) 11%, transparent); color: var(--ol-accent); }
.ol-chips { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; margin-top: 14px; }
.ol-example { height: 30px; padding: 0 12px; border-radius: 999px; border: 1px dashed var(--ol-border); color: var(--ol-ink-2);
  background: transparent; cursor: pointer; font: inherit; font-size: 12px; transition: border-color .15s, color .15s; }
.ol-example:hover { border-color: var(--ol-accent); color: var(--ol-accent); }
.ol-error { color: var(--dsw-alias-state-error-primary, #dc2626); font-size: 12px; padding: 12px 20px 16px; }

.ol-bars { display: flex; align-items: flex-end; gap: 10px; height: 140px; padding: 16px 20px 20px; }
.ol-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 8px; height: 100%; justify-content: flex-end; }
.ol-bar { width: 100%; max-width: 34px; border-radius: 6px 6px 3px 3px; min-height: 4px;
  background: color-mix(in srgb, var(--ol-accent) 24%, transparent); transition: height .3s ease; }
.ol-bar.today { background: var(--ol-accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--ol-accent) 14%, transparent); }
.ol-day { font-size: 10px; color: var(--ol-ink-3); }

.ol-donut-wrap { display: flex; align-items: center; gap: 18px; padding: 16px 20px 20px; }
.ol-donut { width: 112px; height: 112px; border-radius: 50%; flex: none; position: relative; }
.ol-donut::after { content: ''; position: absolute; inset: 18px; border-radius: 50%; background: var(--ol-surface); }
.ol-donut-hole { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 1; }
.ol-donut-total { font-size: 14px; font-weight: 700; font-variant-numeric: tabular-nums; }
.ol-donut-cap { font-size: 9px; letter-spacing: .08em; text-transform: uppercase; color: var(--ol-ink-3); }
.ol-legend { display: flex; flex-direction: column; gap: 8px; font-size: 12px; min-width: 0; flex: 1; }
.ol-legend-row { display: grid; grid-template-columns: 8px minmax(0, 1fr) auto; align-items: center; gap: 8px; }
.ol-legend-row > span:nth-child(2) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ol-legend-amount { font-variant-numeric: tabular-nums; color: var(--ol-ink-2); }

.ol-budgets { display: flex; flex-direction: column; gap: 15px; padding: 16px 20px 4px; }
.ol-budget { display: flex; flex-direction: column; gap: 7px; }
.ol-budget-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.ol-budget-name { display: flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 600; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ol-budget-money { display: flex; align-items: center; gap: 4px; font-size: 12px; color: var(--ol-ink-2);
  font-variant-numeric: tabular-nums; white-space: nowrap; }
.ol-budget input { width: 66px; height: 26px; padding: 0 6px; text-align: right; font: inherit; font-size: 11px;
  border-radius: 7px; border: 1px solid var(--ol-border); background: var(--ol-surface); color: var(--ol-ink);
  outline: none; font-variant-numeric: tabular-nums; }
.ol-budget input:focus { border-color: var(--ol-accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--ol-accent) 14%, transparent); }
.ol-budget-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 11px; color: var(--ol-ink-3); }
.ol-budget-foot > span:nth-child(2) { margin-left: auto; }
.ol-budget-foot .ol-x { width: 24px; height: 24px; font-size: 11px; }
.ol-budget-add { display: grid; grid-template-columns: minmax(0, 1fr) 96px; gap: 8px; padding: 16px 20px 20px; }
.ol-budget-add .ol-input, .ol-budget-add .ol-select { height: 34px; font-size: 12px; }
.ol-budget-add .ol-btn { grid-column: 1 / -1; }

.ol-rules { display: flex; flex-direction: column; padding: 6px 12px 4px; }
.ol-rule { display: grid; grid-template-columns: minmax(0, 1fr) auto 58px; align-items: center; gap: 10px;
  padding: 9px 8px; border-radius: 12px; transition: background .12s; }
.ol-rule:hover { background: color-mix(in srgb, var(--ol-ink) 4%, transparent); }
.ol-rule.paused { opacity: .55; }
.ol-rule-main { min-width: 0; }
.ol-rule-note { font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ol-rule-meta { font-size: 11px; color: var(--ol-ink-3); margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ol-rule-amount { font-size: 12px; font-weight: 650; font-variant-numeric: tabular-nums; text-align: right; }
.ol-rule .ol-actions { opacity: 1; }
.ol-rule-form { display: grid; grid-template-columns: minmax(0, 1fr) 92px; gap: 8px; padding: 16px 20px 20px; }
.ol-rule-form .ol-input, .ol-rule-form .ol-select { height: 34px; font-size: 12px; }
.ol-rule-form .full { grid-column: 1 / -1; }
.ol-rule-form .ol-btn { grid-column: 1 / -1; }

.ol-fab { position: fixed; right: 26px; bottom: 26px; z-index: 9000; display: inline-flex; align-items: center; gap: 9px;
  height: 46px; padding: 0 18px 0 8px; border-radius: 999px; cursor: pointer;
  border: 1px solid color-mix(in srgb, var(--ol-accent) 38%, transparent);
  background: var(--ol-surface); color: var(--ol-ink); font: inherit; font-size: 13px; font-weight: 650;
  box-shadow: 0 10px 30px rgba(0,0,0,0.16); transition: transform .15s, box-shadow .15s; }
.ol-fab:hover { transform: translateY(-1px); box-shadow: 0 14px 34px rgba(0,0,0,0.2); }
.ol-fab-spark { width: 30px; height: 30px; border-radius: 50%; display: inline-flex; align-items: center;
  justify-content: center; background: var(--ol-accent); color: #fff; font-size: 14px; }
.ol-fab-hint { font-size: 11px; font-weight: 400; color: var(--ol-ink-3); }

@media (max-width: 1060px) { .ol-layout { grid-template-columns: 1fr; } }
@media (max-width: 880px) {
  .ol-hero { grid-template-columns: 1fr; gap: 18px; }
  .ol-hero-side { border-left: none; border-top: 1px solid var(--ol-border); padding-left: 0; padding-top: 18px; }
  .ol-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ol-add { grid-template-columns: 1fr 1fr; grid-template-areas: "amount category" "note note" "submit submit"; }
}
@media (max-width: 640px) {
  .ol-nav-inner, .ol-wrap { padding-left: 16px; padding-right: 16px; }
  .ol-optional { display: none; }
  .ol-hero-value { font-size: 36px; }
  .ol-edit { grid-template-columns: 1fr 1fr; }
  .ol-edit .ol-btn-row { grid-column: 1 / -1; }
}
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

function colorOf(category, categories) {
  const index = categories.indexOf(category)
  return PALETTE[(index < 0 ? 0 : index) % PALETTE.length]
}

function dayKey(iso) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function monthKey(iso) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
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

function shortDate(key) {
  return new Date(`${key}T12:00:00`).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
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
    addRecurring: (rule) => send('/api/outlay/recurring', rule),
    removeRecurring: (id) => send('/api/outlay/recurring', { remove: id }),
    toggleRecurring: (id) => send('/api/outlay/recurring', { toggle: id }),
  }
}

function LogoGlyph({ size }) {
  return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true' },
    h('path', { d: 'M4 7.5A2.5 2.5 0 0 1 6.5 5H19v14H6.5A2.5 2.5 0 0 1 4 16.5v-9Z',
      stroke: 'currentColor', strokeWidth: 1.8, strokeLinejoin: 'round' }),
    h('path', { d: 'M4 9h15', stroke: 'currentColor', strokeWidth: 1.8 }),
    h('path', { d: 'M8 14.5h4', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' }))
}

function Kpi({ label, value, note }) {
  return h('div', { className: 'ol-stat' },
    h('div', { className: 'ol-stat-label' }, label),
    h('div', { className: 'ol-stat-value' }, value),
    note !== undefined && h('div', { className: 'ol-stat-note' }, note))
}

function Segmented({ value, options, onChange }) {
  return h('div', { className: 'ol-seg', role: 'group', 'aria-label': 'Period' },
    options.map(option => h('button', {
      key: option.value,
      type: 'button',
      className: option.value === value ? 'active' : undefined,
      'aria-pressed': option.value === value,
      onClick: () => onChange(option.value),
    }, option.label)))
}

function WeekChart({ days, currency }) {
  const max = Math.max(...days.map(d => d.amount), 1)
  const today = dayKey(new Date())
  return h('section', { className: 'ol-card' },
    h('div', { className: 'ol-card-head' },
      h('h2', { className: 'ol-h2' }, 'Last 7 days'),
      h('span', { className: 'ol-muted' }, `peak ${money(max, currency)}`)),
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
  const ring = stops.length === 0 ? 'var(--ol-border) 0% 100%' : stops.join(', ')
  return h('section', { className: 'ol-card' },
    h('div', { className: 'ol-card-head' },
      h('h2', { className: 'ol-h2' }, 'Where it goes'),
      h('span', { className: 'ol-muted' }, 'all time')),
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

  return h('section', { className: 'ol-card' },
    h('div', { className: 'ol-card-head' },
      h('h2', { className: 'ol-h2' }, 'Budgets'),
      h('span', { className: 'ol-muted' }, 'monthly')),
    rows.length === 0
      ? h('div', { className: 'ol-empty', style: { padding: '18px 20px 22px' } },
          'No budgets yet. Set one below and the bar fills as the month spends.')
      : h('div', { className: 'ol-budgets' },
          rows.map((row) => {
            const state = row.pct > 1 ? ' over' : row.pct >= 0.8 ? ' warn' : ''
            return h('div', { key: row.category, className: 'ol-budget' },
              h('div', { className: 'ol-budget-top' },
                h('div', { className: 'ol-budget-name', title: titleOf(row.category) },
                  h('span', { className: 'ol-dot', style: { background: colorOf(row.category, categories) } }),
                  titleOf(row.category)),
                h('div', { className: 'ol-budget-money' },
                  money(row.spent, currency), h('span', { className: 'ol-muted' }, '/'),
                  h('input', {
                    key: `${row.category}:${row.amount}`,
                    type: 'number', step: '0.01', min: '0.01',
                    defaultValue: String(row.amount),
                    'aria-label': `Monthly budget for ${row.category}`,
                    onBlur: e => commit(row, e.target.value),
                    onKeyDown: (e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } },
                  }))),
              h('div', { className: 'ol-track' },
                h('div', { className: `ol-fill${state}`, style: { width: `${Math.max(Math.min(row.pct, 1) * 100, 2)}%` } })),
              h('div', { className: 'ol-budget-foot' },
                h('span', null, row.remaining < 0 ? `over by ${money(-row.remaining, currency)}` : `${money(row.remaining, currency)} left`),
                h('span', null, `${Math.round(row.pct * 100)}%`),
                h('button', {
                  type: 'button', className: 'ol-x danger', title: 'Remove budget',
                  onClick: () => { setError(''); Promise.resolve(onRemove(row.category)).catch(failing) },
                }, '\u2715')))
          })),
    unbudgeted.length > 0 && h('form', { className: 'ol-budget-add', onSubmit: submit },
      h('select', { className: 'ol-select', value: draft, onChange: e => setChosen(e.target.value), 'aria-label': 'Budget category' },
        unbudgeted.map(id => h('option', { key: id, value: id }, titleOf(id)))),
      h('input', {
        className: 'ol-input', type: 'number', step: '0.01', min: '0.01', value: amount,
        placeholder: 'Monthly amount', onChange: e => setAmount(e.target.value),
        required: true, 'aria-label': 'Monthly budget amount',
      }),
      h('button', { type: 'submit', className: 'ol-btn ol-btn-sm', disabled: busy }, busy ? 'Saving…' : 'Set budget')),
    rows.length > 0 && unbudgeted.length === 0 && h('div', { className: 'ol-muted', style: { padding: '0 20px 18px' } },
      'Every category has a budget.'),
    error !== '' && h('div', { className: 'ol-error' }, error))
}

function Recurring({ rules, categories, currency, onAdd, onRemove, onToggle }) {
  const [note, setNote] = React.useState('')
  const [amount, setAmount] = React.useState('')
  const [category, setCategory] = React.useState(categories.includes('bills') ? 'bills' : categories[0])
  const [day, setDay] = React.useState('1')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const failing = (cause) => setError(String(cause.message || cause))
  const act = (promise) => { setError(''); Promise.resolve(promise).catch(failing) }

  const submit = (event) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    Promise.resolve(onAdd({ amount: Number(amount), note, category, day: Number(day) }))
      .then(() => { setNote(''); setAmount(''); setDay('1') })
      .catch(failing)
      .finally(() => setBusy(false))
  }

  return h('section', { className: 'ol-card' },
    h('div', { className: 'ol-card-head' },
      h('h2', { className: 'ol-h2' }, 'Recurring'),
      h('span', { className: 'ol-muted' }, `${rules.length} ${rules.length === 1 ? 'rule' : 'rules'}`)),
    rules.length === 0
      ? h('div', { className: 'ol-empty', style: { padding: '18px 20px 22px' } },
          'Rent, a subscription — add it once and it posts itself every month.')
      : h('div', { className: 'ol-rules' },
          rules.map(rule => h('div', { key: rule.id, className: `ol-rule${rule.active ? '' : ' paused'}` },
            h('div', { className: 'ol-rule-main' },
              h('div', { className: 'ol-rule-note', title: rule.note }, rule.note),
              h('div', { className: 'ol-rule-meta' },
                `${titleOf(rule.category)} · day ${rule.day}${rule.active ? (rule.next ? ` · next ${shortDate(rule.next)}` : '') : ' · paused'}`)),
            h('div', { className: 'ol-rule-amount' }, money(rule.amount, currency)),
            h('div', { className: 'ol-actions' },
              h('button', {
                type: 'button', className: 'ol-x', title: rule.active ? 'Pause' : 'Resume',
                onClick: () => act(onToggle(rule.id)),
              }, rule.active ? '\u275A\u275A' : '\u25B6'),
              h('button', { type: 'button', className: 'ol-x danger', title: 'Remove', onClick: () => act(onRemove(rule.id)) }, '\u2715'))))),
    h('form', { className: 'ol-rule-form', onSubmit: submit },
      h('input', {
        className: 'ol-input full', type: 'text', value: note, placeholder: 'What is it for?  e.g. rent', maxLength: 200,
        onChange: e => setNote(e.target.value), required: true, 'aria-label': 'Recurring note',
      }),
      h('input', {
        className: 'ol-input', type: 'number', step: '0.01', min: '0.01', value: amount, placeholder: 'Amount',
        onChange: e => setAmount(e.target.value), required: true, 'aria-label': 'Recurring amount',
      }),
      h('select', { className: 'ol-select', value: category, onChange: e => setCategory(e.target.value), 'aria-label': 'Recurring category' },
        categories.map(id => h('option', { key: id, value: id }, titleOf(id)))),
      h('input', {
        className: 'ol-input', type: 'number', min: '1', max: '31', step: '1', value: day, title: 'Day of the month to post',
        onChange: e => setDay(e.target.value), required: true, 'aria-label': 'Day of month',
      }),
      h('button', { type: 'submit', className: 'ol-btn ol-btn-sm', disabled: busy }, busy ? 'Saving…' : 'Add rule')),
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

  return h('form', { className: 'ol-card', onSubmit: submit },
    h('div', { className: 'ol-card-head' },
      h('h2', { className: 'ol-h2' }, 'Add expense'),
      h('span', { className: 'ol-muted' }, 'or ask the assistant')),
    h('div', { className: 'ol-add' },
      h('input', {
        className: 'ol-input ol-amount-field', type: 'number', step: '0.01', min: '0.01', value: amount,
        placeholder: '0.00', onChange: e => setAmount(e.target.value), required: true, 'aria-label': 'Amount',
      }),
      h('input', {
        className: 'ol-input ol-note-field', type: 'text', value: note, placeholder: 'What was it for?  e.g. taxi to office',
        onChange: e => setNote(e.target.value), required: true, maxLength: 200, 'aria-label': 'Note',
      }),
      h('select', { className: 'ol-select ol-cat-field', value: category, onChange: e => setCategory(e.target.value), 'aria-label': 'Category' },
        categories.map(id => h('option', { key: id, value: id }, titleOf(id))),
        h('option', { value: '__new' }, '+ New category…')),
      h('button', { type: 'submit', className: 'ol-btn', disabled: busy }, busy ? 'Adding…' : 'Add expense'),
      category === '__new' && h('div', { className: 'ol-newcat' },
        h('input', {
          className: 'ol-input', type: 'text', value: newCategory, placeholder: 'New category name', maxLength: 24,
          onChange: e => setNewCategory(e.target.value), required: true, 'aria-label': 'New category name',
        }))),
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
    h('input', { className: 'ol-input', type: 'number', step: '0.01', min: '0.01', value: amount, onChange: e => setAmount(e.target.value), required: true, 'aria-label': 'Amount' }),
    h('input', { className: 'ol-input', type: 'text', value: note, onChange: e => setNote(e.target.value), required: true, maxLength: 200, 'aria-label': 'Note' }),
    h('select', { className: 'ol-select', value: category, onChange: e => setCategory(e.target.value), 'aria-label': 'Category' },
      categories.map(id => h('option', { key: id, value: id }, titleOf(id)))),
    h('input', { className: 'ol-input', type: 'date', value: date, onChange: e => setDate(e.target.value), 'aria-label': 'Date' }),
    h('div', { className: 'ol-btn-row', style: { display: 'flex', gap: 6 } },
      h('button', { type: 'submit', className: 'ol-btn ol-btn-sm', disabled: busy }, busy ? '…' : 'Save'),
      h('button', { type: 'button', className: 'ol-btn ol-btn-ghost ol-btn-sm', onClick: onCancel }, 'Cancel')))
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
  const recurring = data && Array.isArray(data.recurring) ? data.recurring : []

  const [search, setSearch] = React.useState('')
  const [category, setCategory] = React.useState('all')
  const [period, setPeriod] = React.useState('all')
  const [editing, setEditing] = React.useState(null)
  const [error, setError] = React.useState('')
  const searchRef = React.useRef(null)

  React.useEffect(() => {
    const onKey = (event) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return
      if (event.defaultPrevented) return
      event.preventDefault()
      searchRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const now = new Date()
  const today = dayKey(now)
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
  const weekStart = dayKey(monday)
  const monthStart = today.slice(0, 7)

  const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const previousKey = monthKey(previous)
  const previousTotal = entries.filter(entry => monthKey(entry.ts) === previousKey)
    .reduce((sum, entry) => sum + entry.amount, 0)
  const delta = previousTotal > 0 ? (totals.month - previousTotal) / previousTotal : null
  const monthEntries = entries.filter(entry => monthKey(entry.ts) === monthStart).length
  const budgetTotal = budgets.reduce((sum, row) => sum + Number(row.amount), 0)
  const budgetSpent = budgets.reduce((sum, row) => sum + Number(row.spent), 0)

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
  const clearFilters = () => { setSearch(''); setCategory('all'); setPeriod('all') }
  const filtersActive = search !== '' || category !== 'all' || period !== 'all'

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
      h('div', { className: 'ol-row-main' },
        h('div', { className: 'ol-note', title: entry.note }, entry.note),
        h('div', { className: 'ol-row-meta' },
          h('span', { className: 'ol-dot', style: { background: colorOf(entry.category, categories) } }),
          h('span', null, titleOf(entry.category)),
          h('span', null, '\u00B7'),
          h('span', null, timeOf(entry.ts)))),
      h('div', { className: 'ol-amount' }, money(entry.amount, currency)),
      h('div', { className: 'ol-actions' },
        h('button', { type: 'button', className: 'ol-x', title: 'Edit', onClick: () => setEditing(entry.id) }, '\u270E'),
        h('button', { type: 'button', className: 'ol-x danger', title: 'Delete', onClick: () => perform(books.remove(entry.id)) }, '\u2715')))
  }

  const emptyState = h('div', { className: 'ol-empty' },
    h('div', { className: 'ol-empty-icon' }, h(LogoGlyph, { size: 20 })),
    h('div', { style: { fontWeight: 600, color: 'var(--ol-ink)', marginBottom: 4 } }, 'The books are empty.'),
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
          h('div', { className: 'ol-daygroup' },
            h('span', null, dayLabel(group.key)),
            h('span', null, money(group.items.reduce((sum, entry) => sum + entry.amount, 0), currency))),
          group.items.map(row))))

  const entriesCard = data && h('section', { className: 'ol-card' },
    h('div', { className: 'ol-card-head' },
      h('h2', { className: 'ol-h2' }, 'Entries'),
      h('span', { className: 'ol-muted' },
        filtered.length === entries.length
          ? `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`
          : `${filtered.length} of ${entries.length}`)),
    h('div', { className: 'ol-controls' },
      h('div', { className: 'ol-search' },
        h('span', { className: 'ol-search-icon' }, '\u2315'),
        h('input', {
          ref: searchRef, className: 'ol-input', type: 'search', value: search,
          placeholder: 'Search notes, amounts…', onChange: e => setSearch(e.target.value), 'aria-label': 'Search entries',
        }),
        h('span', { className: 'ol-kbd' }, '\u2318K')),
      h(Segmented, {
        value: period,
        options: [
          { value: 'all', label: 'All' },
          { value: 'month', label: 'Month' },
          { value: 'week', label: 'Week' },
          { value: 'today', label: 'Today' },
        ],
        onChange: setPeriod,
      })),
    h('div', { className: 'ol-chipsrow' },
      h('button', { type: 'button', className: `ol-chipbtn${category === 'all' ? ' active' : ''}`, onClick: () => setCategory('all') }, 'All'),
      categories.map(id => h('button', {
        key: id, type: 'button', className: `ol-chipbtn${category === id ? ' active' : ''}`, onClick: () => setCategory(id),
      }, h('span', { className: 'ol-dot', style: { background: colorOf(id, categories) } }), titleOf(id))),
      filtersActive && h('button', { type: 'button', className: 'ol-chipbtn', onClick: clearFilters }, 'Clear')),
    listBody,
    error !== '' && h('div', { className: 'ol-error' }, error))

  return h('div', { className: 'ol-root' },
    h('header', { className: 'ol-nav' },
      h('div', { className: 'ol-nav-inner' },
        h('div', { className: 'ol-brand' },
          h('span', { className: 'ol-logo' }, h(LogoGlyph, { size: 19 })),
          h('div', { style: { minWidth: 0 } },
            h('h1', { className: 'ol-title' }, 'Outlay'),
            h('p', { className: 'ol-sub' }, 'Say what you spent. The books keep themselves.'))),
        h('div', { className: 'ol-nav-actions' },
          h('span', { className: 'ol-pill ol-optional' }, monthName()),
          h('span', { className: 'ol-pill ol-optional' }, `in ${currency}`),
          h('a', {
            className: 'ol-export', href: '/api/outlay/export.csv', download: `outlay-${today}.csv`,
            title: 'Download every entry as a CSV file',
          }, '\u2913 CSV'),
          h('button', { type: 'button', className: 'ol-iconbtn', title: 'Refresh', onClick: books.reload }, '\u21BB')))),

    h('main', { className: 'ol-wrap' },
      books.state.loading && h('div', { className: 'ol-muted', style: { padding: '24px 0' } }, 'Loading…'),
      books.state.error && h('div', { className: 'ol-error' }, `Could not load: ${books.state.error}`),

      data && h('section', { className: 'ol-hero' },
        h('div', null,
          h('div', { className: 'ol-hero-label' }, 'This month'),
          h('div', { className: 'ol-hero-value' }, money(totals.month, currency)),
          h('div', { className: 'ol-hero-note' },
            delta === null
              ? h('span', null, 'No spending last month to compare')
              : h('span', { className: `ol-delta ${delta <= 0 ? 'down' : 'up'}` },
                  delta <= 0 ? '\u25BC' : '\u25B2', ` ${Math.abs(Math.round(delta * 100))}%`),
            delta !== null && h('span', null, 'vs last month'),
            h('span', null, '\u00B7'),
            h('span', null, `${monthEntries} ${monthEntries === 1 ? 'entry' : 'entries'}`))),
        h('div', { className: 'ol-hero-side' },
          h('div', { className: 'ol-hero-side-label' }, 'Budget'),
          budgets.length === 0
            ? h('div', null,
                h('div', { className: 'ol-hero-side-value' }, 'None yet'),
                h('div', { className: 'ol-muted', style: { marginTop: 4 } }, 'Set one in the Budgets card.'))
            : h('div', null,
                h('div', { className: 'ol-hero-side-value' },
                  `${money(budgetSpent, currency)} of ${money(budgetTotal, currency)}`),
                h('div', { className: 'ol-track thin' },
                  h('div', {
                    className: `ol-fill${budgetSpent > budgetTotal ? ' over' : ''}`,
                    style: { width: `${Math.max(Math.min(budgetSpent / (budgetTotal || 1), 1) * 100, 2)}%` },
                  })),
                h('div', { className: 'ol-muted', style: { marginTop: 8 } },
                  budgetSpent > budgetTotal
                    ? `over by ${money(budgetSpent - budgetTotal, currency)}`
                    : `${money(budgetTotal - budgetSpent, currency)} left this month`)))),

      data && h('div', { className: 'ol-kpis' },
        h(Kpi, { label: 'Today', value: money(totals.today, currency), note: 'since midnight' }),
        h(Kpi, { label: 'This week', value: money(totals.week, currency), note: 'from Monday' }),
        h(Kpi, { label: 'Per day', value: money(totals.month / Math.max(now.getDate(), 1), currency), note: 'this month' }),
        h(Kpi, { label: 'Entries', value: totals.count, note: 'all time' })),

      data && h('div', { className: 'ol-layout' },
        h('div', { className: 'ol-stack' },
          h(QuickAdd, { categories, onAdd: books.add, onAddCategory: books.addCategory }),
          entriesCard),
        h('div', { className: 'ol-stack' },
          h(WeekChart, { days: data.days, currency }),
          h(Donut, { byCategory: data.byCategory, currency, total: totals.all }),
          h(Budgets, {
            rows: budgets, categories, currency,
            onSet: books.setBudget, onRemove: books.removeBudget,
          }),
          h(Recurring, {
            rules: recurring, categories, currency,
            onAdd: books.addRecurring, onRemove: books.removeRecurring, onToggle: books.toggleRecurring,
          })))),

    h('button', { type: 'button', className: 'ol-fab', onClick: askBuilder, title: 'Open the assistant' },
      h('span', { className: 'ol-fab-spark' }, '\u2726'),
      h('span', null, 'Ask'),
      h('span', { className: 'ol-fab-hint' }, 'add or ask anything')))
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

function OutlayIcon({ size }) {
  return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true' },
    h('path', { d: 'M4 7.5A2.5 2.5 0 0 1 6.5 5H19v14H6.5A2.5 2.5 0 0 1 4 16.5v-9Z',
      stroke: 'currentColor', strokeWidth: 1.7, strokeLinejoin: 'round' }),
    h('path', { d: 'M4 9h15', stroke: 'currentColor', strokeWidth: 1.7 }),
    h('path', { d: 'M8 14.5h4', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' }))
}

return module.exports; } });
