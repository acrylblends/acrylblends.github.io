/** Contract events (`/events`): the decoded event logs of the recent blocks, filtered by event name and time range, with the contracts that emit them and their log topics. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { EVENT_DEFS, EVENT_NAMES, RANGES, eventsIn, formatHeight, labelOf, short } from '../blockscope/index.ts'
import { escapeHtml } from '../scope-shell/index.ts'

export const name = 'contract-events'
export const inject = ['router', 'chain', 'scopeShell']

export function apply(ctx: Context): void {
  const shell = ctx.scopeShell
  const chain = ctx.chain
  const pageFor = (url: string): string => {
    const q = new URL(url, 'http://local').searchParams
    const event = EVENT_NAMES.find((e) => e === q.get('event'))
    const range = RANGES.find((r) => r.id === q.get('range')) ?? RANGES[0]
    if (range === undefined) throw new Error('no range')
    const found = eventsIn(chain.anchor, range.blocks, event)
    const shown = found.slice(0, 25)
    const rows = shown
      .map(({ log, tx }) => `<tr data-event="${escapeHtml(log.name)}"><td><b>${escapeHtml(log.name)}</b><div class="muted">${escapeHtml(log.contract.name)}</div></td><td>${log.args.map(([k, v]) => `${escapeHtml(k)}: <span class="hash">${escapeHtml(v.startsWith('0x') ? labelOf(v)?.name ?? short(v) : v)}</span>`).join('<br>')}</td><td class="hash">${log.topics.slice(0, 1).map((t) => escapeHtml(short(t))).join('')}</td><td><a class="hash" href="${shell.href(`/tx/${tx.hash}`)}">${escapeHtml(short(tx.hash))}</a><div class="muted">Block ${formatHeight(tx.height)}</div></td></tr>`)
      .join('')
    const opts = (items: readonly { v: string; l: string }[], cur: string) => items.map((i) => `<option value="${escapeHtml(i.v)}"${i.v === cur ? ' selected' : ''}>${escapeHtml(i.l)}</option>`).join('')
    const contracts = EVENT_DEFS.map((d) => `<tr><td>${escapeHtml(d.contract)}</td><td>${escapeHtml(d.name)}(${escapeHtml(d.args.join(', '))})</td></tr>`).join('')
    const main = `<section class="panel"><h2>Contract activity</h2><div class="muted">Filter decoded event logs by event name and time range.</div><form class="filters" method="get" action="${shell.href('/events')}"><label class="sr" for="event">Event name</label><select id="event" name="event">${opts([{ v: '', l: 'All events' }, ...EVENT_NAMES.map((n) => ({ v: n, l: n }))], event ?? '')}</select><label class="sr" for="range">Time range</label><select id="range" name="range">${opts(RANGES.map((r) => ({ v: r.id, l: r.label })), range.id)}</select><button class="btn primary" type="submit">Apply filters</button></form><div class="muted" id="count">${String(found.length)} ${found.length === 1 ? 'event' : 'events'} in the ${escapeHtml(range.label.toLowerCase())}${event === undefined ? '' : ` · ${escapeHtml(event)}`}${found.length > shown.length ? ` · showing the newest ${String(shown.length)}` : ''}</div>${rows === '' ? '<p class="muted">No events match these filters.</p>' : `<div class="tablewrap"><table><thead><tr><th>Event</th><th>Decoded arguments</th><th>Topic 0</th><th>Transaction</th></tr></thead><tbody>${rows}</tbody></table></div>`}<h3>Log topics</h3><div class="tablewrap"><table><thead><tr><th>Contract</th><th>Event signature</th></tr></thead><tbody>${contracts}</tbody></table></div><div class="muted" style="margin-top:12px">Synthetic logs; topic hashes are demo values.</div></section>`
    return shell.page({ title: 'Contract events', main, url, current: 'events' })
  }
  const app = new Acryl().get('/events', (c) => c.html(pageFor(c.req.url)))
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  ctx.effect(() => shell.nav({ id: 'events', label: 'Contract events', path: '/events', order: 20 }))
}
