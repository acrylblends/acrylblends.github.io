/** Transaction page (`/tx/:hash`): status, block, parties, value, gas and fee, and the decoded event logs with their topics. Only transactions the demo generated (each block's first eight) exist. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { atl, findTx, formatHeight, labelOf, short } from '../blockscope/index.ts'
import { escapeHtml, watchForm } from '../scope-shell/index.ts'

export const name = 'transactions'
export const inject = ['router', 'chain', 'scopeShell']

export function apply(ctx: Context): void {
  const shell = ctx.scopeShell
  const chain = ctx.chain
  const party = (address: string): string => {
    const l = labelOf(address)
    return `<a href="${shell.href(`/address/${address}`)}" class="hash">${escapeHtml(l?.name ?? short(address))}</a>`
  }
  const pageFor = (hash: string, url: string): string => {
    const tx = findTx(chain.anchor, hash)
    if (tx === undefined) return shell.page({ title: 'Transaction not found', current: 'tx', url, main: `<section class="panel"><h2>Transaction not found</h2><div class="muted error" role="alert">No synthetic transaction ${escapeHtml(short(hash))} exists on this chain.</div><p><a class="btn" href="${shell.href('/')}">Back to blocks</a></p></section>` })
    const confirmations = chain.head - tx.height
    const logs = tx.events.length === 0 ? '<div class="muted">No event logs.</div>' : tx.events.map((e) => `<div class="detail" data-event="${escapeHtml(e.name)}"><div><span>Event</span><b>${escapeHtml(e.signature)}</b></div><div><span>Contract</span><b><a href="${shell.href(`/address/${e.contract.address}`)}" class="hash">${escapeHtml(e.contract.name)}</a></b></div>${e.args.map(([k, v]) => `<div><span>${escapeHtml(k)}</span><b class="hash">${escapeHtml(v.startsWith('0x') ? labelOf(v)?.name ?? short(v) : v)}</b></div>`).join('')}<div><span>Topics</span><b class="hash">${e.topics.map((t) => escapeHtml(short(t))).join('<br>')}</b></div></div>`).join('')
    const main = `<section class="panel"><div class="head"><div><h2>Transaction</h2><div class="muted hash">${escapeHtml(tx.hash)}</div></div>${watchForm(shell, chain.isWatched(`tx:${tx.hash}`), 'tx', tx.hash, shell.href(`/tx/${tx.hash}`))}</div><div class="detail"><div><span>Status</span><b class="${tx.status === 'success' ? 'ok' : 'error'}" id="status">${tx.status === 'success' ? 'Success' : `Failed · ${escapeHtml(tx.error ?? '')}`}</b></div><div><span>Block</span><b><a href="${shell.href(`/?block=${String(tx.height)}`)}">${formatHeight(tx.height)}</a> · ${String(confirmations)} confirmations</b></div><div><span>From</span><b>${party(tx.from)}</b></div><div><span>To</span><b>${party(tx.to)}</b></div><div><span>Method</span><b>${escapeHtml(tx.method)}</b></div><div><span>Value</span><b>${escapeHtml(atl(tx.valueAtl))}</b></div><div><span>Gas used</span><b>${tx.gasUsed.toLocaleString('en-US')}</b></div><div><span>Fee</span><b>${escapeHtml(atl(tx.feeAtl))}</b></div></div><h3>Event logs</h3>${logs}<div class="muted" style="margin-top:12px">Synthetic transaction · topics are demo values, not real hashes.</div></section>`
    return shell.page({ title: `Transaction ${short(tx.hash)}`, main, url, current: 'tx' })
  }
  const app = new Acryl().get('/tx/:hash', (c) => c.html(pageFor(c.req.param('hash'), c.req.url), 200))
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
}
