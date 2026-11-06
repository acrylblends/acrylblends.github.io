/** Search results (inspector): what the explorer's search box (`?q=`) found among the synthetic blocks, transactions, addresses and labels, or why it found nothing. */
import type { Context } from '@deepseek-ai/cordis'
import { ChainError, type Hit, formatHeight, short } from '../blockscope/index.ts'
import { escapeHtml } from '../scope-shell/index.ts'

export const name = 'search'
export const inject = ['chain', 'scopeShell']

export function apply(ctx: Context): void {
  const shell = ctx.scopeShell
  const chain = ctx.chain
  const row = (h: Hit): string => {
    if (h.kind === 'block') return `<li data-kind="block"><a href="${shell.href(`/?block=${String(h.block.height)}`)}"><b>Block ${formatHeight(h.block.height)}</b></a><div class="muted"><span class="hash">${escapeHtml(short(h.block.hash))}</span> · ${String(h.block.txCount)} txns · ${escapeHtml(h.block.producer)}</div></li>`
    if (h.kind === 'tx') return `<li data-kind="tx"><a href="${shell.href(`/tx/${h.tx.hash}`)}"><b>Transaction</b> <span class="hash">${escapeHtml(short(h.tx.hash))}</span></a><div class="muted">Block ${formatHeight(h.tx.height)} · ${escapeHtml(h.tx.method)} · ${h.tx.status}</div></li>`
    return `<li data-kind="address"><a href="${shell.href(`/address/${h.address}`)}"><b>${escapeHtml(h.label?.name ?? 'Address')}</b> <span class="hash">${escapeHtml(short(h.address))}</span></a><div class="muted">${escapeHtml(h.label === undefined ? 'Unlabelled address' : `${h.label.kind === 'contract' ? 'Contract' : 'Account'} · ${h.label.note}`)}</div></li>`
  }
  const render = (url: string): string => {
    const q = new URL(url, 'http://local').searchParams.get('q')
    if (q === null) return ''
    try {
      const hits = chain.search(q)
      if (hits.length === 0) return `<section class="panel" id="results"><h2>Search result</h2><div class="muted">Demo search across synthetic explorer fixtures</div><div class="detail"><div><span>Query</span><b>${escapeHtml(q)}</b></div><div><span>Matches</span><b>0 synthetic records</b></div><div><span>Mode</span><b>Read-only</b></div></div></section>`
      return `<section class="panel" id="results"><h2>Search result</h2><div class="muted">Demo search across synthetic explorer fixtures</div><div class="detail"><div><span>Query</span><b>${escapeHtml(q)}</b></div><div><span>Matches</span><b>${String(hits.length)} synthetic ${hits.length === 1 ? 'record' : 'records'}</b></div><div><span>Mode</span><b>Read-only</b></div></div><ul class="results">${hits.map(row).join('')}</ul></section>`
    } catch (error) {
      if (!(error instanceof ChainError)) throw error
      return `<section class="panel" id="results"><h2>Enter a query</h2><div class="muted error" role="alert">${escapeHtml(error.message)}</div></section>`
    }
  }
  ctx.effect(() => shell.side({ id: 'search-results', column: 'side', order: 10, render }))
}
