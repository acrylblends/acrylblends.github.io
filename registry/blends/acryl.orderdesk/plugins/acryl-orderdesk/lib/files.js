/**
 * The desk's files beside its data, so a person (or another program) can use them without ACRYL:
 * - `inbox/`: drop an email here (`.eml` or `.txt`, headers `From:` and `Subject:`, a blank line, the body) and the desk imports it,
 *   then moves the file to `inbox/imported/`. This is how a mail rule, a scanner or a script hands the desk its work.
 * - `outbox/`: every message the desk sends, as a standard `.eml` file (open it in any mail program, or let a mail script send it).
 * - `delivery-notes/`: a printable delivery note (`DN-1001.html`) for every shipped order.
 * Pure helpers (parse, render) are separate from the few functions that touch the disk.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { deliveryNoteNumber, formatMoney, orderTotal } from './domain.js'

const MAX_FILE = 64 * 1024

/** "From: ...\nSubject: ...\n\nbody" -> { from, subject, body, received }; folded headers and CRLF are handled. */
export function parseEmailFile(raw) {
  const normalized = raw.replace(/\r\n/gu, '\n')
  const split = normalized.indexOf('\n\n')
  const head = split === -1 ? '' : normalized.slice(0, split)
  const body = split === -1 ? normalized : normalized.slice(split + 2)
  const headers = {}
  let last = null
  for (const line of head.split('\n')) {
    if (/^[ \t]/u.test(line) && last) { headers[last] += ` ${line.trim()}`; continue }
    const m = /^([A-Za-z-]+):\s*(.*)$/u.exec(line)
    if (m) { last = m[1].toLowerCase(); headers[last] = m[2] }
  }
  return { from: headers.from ?? '', subject: headers.subject ?? '', body: body.trim(), received: headers.date }
}

const header = value => String(value).replace(/[\r\n]+/gu, ' ')
const address = who => `${header(who.name)} <${header(who.email)}>`

export function renderEml(message, sender, company) {
  return [
    `From: ${header(company)} <${header(sender)}>`,
    `To: ${address(message.to)}`,
    `Subject: ${header(message.subject)}`,
    `Date: ${new Date(message.at).toUTCString()}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    `X-Order-Desk-Kind: ${message.kind}`,
    '',
    message.body,
    '',
  ].join('\r\n')
}

const esc = value => String(value).replace(/[&<>"']/gu, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

export function renderDeliveryNote(order, workflow) {
  const rows = order.lines.map(l => `<tr><td>${esc(l.sku)}</td><td>${esc(l.name)}</td><td class="n">${l.qty}</td><td class="n">${esc(formatMoney(l.priceCents))}</td><td class="n">${esc(formatMoney(l.qty * l.priceCents))}</td></tr>`).join('')
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(deliveryNoteNumber(order))} - ${esc(order.customer.name)}</title>
<style>body{font:14px/1.5 -apple-system,"Segoe UI",system-ui,sans-serif;color:#1d2a30;max-width:760px;margin:40px auto;padding:0 24px}
h1{font-size:22px;margin:0 0 4px}.meta{display:flex;justify-content:space-between;gap:24px;margin:24px 0;flex-wrap:wrap}.meta div{min-width:200px}
.k{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#5b6b72}table{width:100%;border-collapse:collapse;margin-top:12px}
th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#5b6b72;border-bottom:2px solid #1d2a30;padding:6px}
td{padding:8px 6px;border-bottom:1px solid #dde4e6}.n{text-align:right;font-variant-numeric:tabular-nums}tfoot td{font-weight:700;border-bottom:0}
.sign{margin-top:64px;display:flex;gap:48px}.sign div{flex:1;border-top:1px solid #1d2a30;padding-top:6px;font-size:12px;color:#5b6b72}</style></head><body>
<h1>Delivery note ${esc(deliveryNoteNumber(order))}</h1><div>${esc(workflow.company)} &middot; ${esc(workflow.sender)}</div>
<div class="meta"><div><div class="k">Deliver to</div>${esc(order.customer.name)}<br>${esc(order.customer.email)}</div>
<div><div class="k">Order</div>${esc(order.number)}<br>ordered ${esc(order.created.slice(0, 10))}</div>
<div><div class="k">Shipped</div>${esc((order.shipped ?? '').slice(0, 10))}</div></div>
<table><thead><tr><th>Item</th><th>Description</th><th class="n">Qty</th><th class="n">Unit (net)</th><th class="n">Amount (net)</th></tr></thead>
<tbody>${rows}</tbody><tfoot><tr><td colspan="4">Total (net)</td><td class="n">${esc(formatMoney(orderTotal(order)))}</td></tr></tfoot></table>
${order.note ? `<p><span class="k">Note</span><br>${esc(order.note)}</p>` : ''}
<div class="sign"><div>Packed by</div><div>Received by (name, date, signature)</div></div></body></html>
`
}

const slug = value => String(value).toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '').slice(0, 40) || 'message'

/** Writes the outbox messages and delivery notes that are not on disk yet. Idempotent: a file that exists is left alone. */
export function writeFiles(home, state) {
  const outbox = join(home, 'outbox')
  const notes = join(home, 'delivery-notes')
  for (const message of state.outbox) {
    const file = join(outbox, `${String(message.id).padStart(4, '0')}-${message.kind}-${slug(message.to.name)}.eml`)
    if (existsSync(file)) continue
    mkdirSync(outbox, { recursive: true })
    writeFileSync(file, renderEml(message, state.workflow.sender, state.workflow.company))
  }
  for (const order of state.orders.filter(o => o.stage === 'shipped')) {
    const file = join(notes, `${deliveryNoteNumber(order)}.html`)
    if (existsSync(file)) continue
    mkdirSync(notes, { recursive: true })
    writeFileSync(file, renderDeliveryNote(order, state.workflow))
  }
}

/** The email files waiting in `inbox/`, oldest first. Each is read and then handed to `done(file)` to be moved away. */
export function pendingEmailFiles(home) {
  const inbox = join(home, 'inbox')
  if (!existsSync(inbox)) return []
  return readdirSync(inbox)
    .filter(name => /\.(eml|txt)$/iu.test(name))
    .map(name => join(inbox, name))
    .filter(file => { const s = statSync(file); return s.isFile() && s.size <= MAX_FILE })
    .sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs)
    .map(file => ({ file, raw: readFileSync(file, 'utf8') }))
}

export function moveAway(file, folder) {
  const target = join(file, '..', folder)
  mkdirSync(target, { recursive: true })
  renameSync(file, join(target, file.split(/[\\/]/u).pop()))
}

export function ensureInbox(home) {
  const inbox = join(home, 'inbox')
  mkdirSync(inbox, { recursive: true })
  const readme = join(inbox, 'README.md')
  if (!existsSync(readme)) writeFileSync(readme, 'Drop customer emails here as .eml or .txt files (From:, Subject:, a blank line, the body).\nThe order desk imports each one into its Inbox within a few seconds and moves the file to imported/.\n')
}
