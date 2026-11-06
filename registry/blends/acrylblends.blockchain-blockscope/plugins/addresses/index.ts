/** Address page (`/address/:address`): the label and kind, a synthetic balance, and the recent transactions among the generated blocks that involve it. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { atl, formatHeight, hex, labelOf, short, txsOf } from '../blockscope/index.ts'
import { escapeHtml, watchForm } from '../scope-shell/index.ts'

export const name = 'addresses'
export const inject = ['router', 'chain', 'scopeShell']

export function apply(ctx: Context): void {
  const shell = ctx.scopeShell
  const chain = ctx.chain
  const pageFor = (address: string, url: string): string => {
    const a = address.toLowerCase()
    if (!/^0x[0-9a-f]{40}$/.test(a)) return shell.page({ title: 'Address not found', current: 'address', url, main: `<section class="panel"><h2>Not an address</h2><div class="muted error" role="alert">An address is 0x followed by 40 hexadecimal characters.</div><p><a class="btn" href="${shell.href('/')}">Back to blocks</a></p></section>` })
    const l = labelOf(a)
    const txs = txsOf(chain.anchor, a)
    const balance = (Number.parseInt(hex(`balance:${a}`, 6), 16) % 90000) / 10 + 12
    const rows = txs.map((t) => `<tr><td><a class="hash" href="${shell.href(`/tx/${t.hash}`)}">${escapeHtml(short(t.hash))}</a></td><td>${formatHeight(t.height)}</td><td>${t.from === a ? 'Out' : 'In'}</td><td>${escapeHtml(t.method)}</td><td>${escapeHtml(atl(t.valueAtl))}</td><td class="${t.status === 'success' ? 'ok' : 'error'}">${t.status}</td></tr>`).join('')
    const main = `<section class="panel"><div class="head"><div><h2 id="addrTitle">${escapeHtml(l?.name ?? 'Unlabelled address')}</h2><div class="muted hash">${escapeHtml(a)}</div></div>${watchForm(shell, chain.isWatched(`address:${a}`), 'address', a, shell.href(`/address/${a}`))}</div><div class="detail"><div><span>Type</span><b>${l === undefined ? 'Account (unlabelled)' : l.kind === 'contract' ? 'Contract' : 'Account'}</b></div><div><span>Note</span><b>${escapeHtml(l?.note ?? 'No label in the demo address book')}</b></div><div><span>Balance</span><b>${escapeHtml(atl(Math.round(balance * 100) / 100))} (synthetic)</b></div></div><h3>Recent transactions</h3>${rows === '' ? '<div class="muted">No transactions among the recent generated blocks.</div>' : `<div class="tablewrap"><table><thead><tr><th>Hash</th><th>Block</th><th>Dir</th><th>Method</th><th>Value</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>`}<div class="muted" style="margin-top:12px">Only the first eight transactions of each recent block are generated.</div></section>`
    return shell.page({ title: l?.name ?? short(a), main, url, current: 'address' })
  }
  const app = new Acryl().get('/address/:address', (c) => c.html(pageFor(c.req.param('address'), c.req.url)))
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
}
