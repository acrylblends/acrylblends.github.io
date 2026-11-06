/**
 * Blocks, the first page (`/`): the recent block ledger (height, hash, transaction count, producer, age), paged with `?before=`, "Produce next demo
 * block" and the Auto-refresh demo toggle (`?live=1`, which only re-renders), and the block inspector in the side column for the selected block (`?block=`).
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type {} from '../home/index.ts'
import { FINALITY_LAG, GENESIS, SAMPLE_TXS, ageLabel, atl, formatHeight, short } from '../blockscope/index.ts'
import { chainErrorOf, escapeHtml, fieldOf, watchForm, withNotice } from '../scope-shell/index.ts'

export const name = 'blocks'
export const inject = ['router', 'chain', 'scopeShell', 'home']

const PAGE = 8

export function apply(ctx: Context): void {
  const shell = ctx.scopeShell
  const chain = ctx.chain

  const params = (url: string) => new URL(url, 'http://local').searchParams
  const selected = (url: string): number => {
    const n = Number(params(url).get('block'))
    return Number.isInteger(n) && n >= GENESIS && n <= chain.head ? n : chain.head
  }
  const link = (url: string, patch: Record<string, string | null>): string => {
    const q = params(url)
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) q.delete(k)
      else q.set(k, v)
    }
    q.delete('ok')
    q.delete('error')
    const text = q.toString()
    return `${shell.href('/')}${text === '' ? '' : `?${text}`}`
  }

  const pageFor = (url: string): string => {
    const q = params(url)
    const now = chain.now()
    const beforeRaw = Number(q.get('before'))
    const top = Number.isInteger(beforeRaw) && beforeRaw > GENESIS && beforeRaw <= chain.head + 1 ? beforeRaw - 1 : chain.head
    const sel = selected(url)
    const blocks = Array.from({ length: PAGE }, (_, i) => top - i).filter((h) => h >= GENESIS).map((h) => chain.block(h))
    const rows = blocks
      .map((b) => `<a class="blockrow${b.height === sel ? ' sel' : ''}" data-height="${String(b.height)}" href="${link(url, { block: String(b.height) })}"${b.height === sel ? ' aria-current="true"' : ''}><b>${formatHeight(b.height)}</b><span class="hash">${escapeHtml(short(b.hash))}</span><span>${String(b.txCount)} txns</span><span>${escapeHtml(b.producer)}</span><span>${escapeHtml(ageLabel(b.timestamp, now))}</span></a>`)
      .join('')
    const live = q.get('live') === '1'
    const older = (blocks.at(-1)?.height ?? GENESIS) > GENESIS ? `<a href="${link(url, { before: String(blocks.at(-1)?.height ?? 0) })}" rel="next">Older blocks →</a>` : '<span></span>'
    const newer = top < chain.head ? `<a href="${link(url, { before: null })}">← Newest</a>` : '<span></span>'
    const main = `<section class="panel"><div class="head"><div><h2>Recent blocks</h2><div class="muted">Select a block to inspect the transaction set.</div></div><div><a class="tag${live ? '' : ' warn'}" id="live" href="${link(url, { live: live ? null : '1' })}" aria-pressed="${live ? 'true' : 'false'}">Auto-refresh demo · ${live ? 'on' : 'off'}</a> <form method="post" action="${shell.href('/advance')}" style="display:inline"><input type="hidden" name="back" value="${escapeHtml(link(url, { before: null }))}"><button class="btn primary" id="advance" type="submit">Produce next demo block</button></form></div></div>${shell.notice(url)}<div class="blockrow th" aria-hidden="true"><b>Height</b><b>Block hash</b><b>Txns</b><b>Producer</b><b>Age</b></div><div id="blocks">${rows}</div><div class="pager">${newer}${older}</div><div class="muted" style="margin-top:12px">All chain data above is fictional and for interface demonstration only.</div></section>`
    return shell.page({ title: 'Blocks', main, url, current: 'blocks', ...(live ? { refresh: 5 } : {}) })
  }

  const inspector = (url: string, current: string): string => {
    if (current !== 'blocks') return ''
    const b = chain.block(selected(url))
    const confirmations = chain.head - b.height
    const finalized = confirmations >= FINALITY_LAG
    const txs = b.txs.map((t) => `<div class="txrow"><a class="hash" href="${shell.href(`/tx/${t.hash}`)}">${escapeHtml(short(t.hash))}</a><span>${escapeHtml(atl(t.valueAtl))}</span><span class="${t.status === 'success' ? 'ok' : 'error'}">${t.status}</span></div>`).join('')
    const back = link(url, {})
    return `<section class="panel"><h2 id="detailTitle">Block ${formatHeight(b.height)}</h2><div class="muted" id="detailSub">Synthetic block record · read-only</div><div class="detail" id="detail"><div><span>Block hash</span><b class="hash">${escapeHtml(short(b.hash))}</b></div><div><span>Parent hash</span><b class="hash">${escapeHtml(short(b.parentHash))}</b></div><div><span>Transactions</span><b>${String(b.txCount)} txns</b></div><div><span>Producer</span><b>${escapeHtml(b.producer)}</b></div><div><span>Finality</span><b><span class="tag${finalized ? '' : ' warn'}">${finalized ? 'Finalized' : `Pending · ${String(confirmations)} of ${String(FINALITY_LAG)} confirmations`}</span></b></div><div><span>Time</span><b>${escapeHtml(b.timestamp.replace('T', ' ').slice(0, 19))} UTC</b></div></div><h3>First ${String(Math.min(SAMPLE_TXS, b.txCount))} of ${String(b.txCount)} transactions</h3>${txs}<div style="margin-top:12px">${watchForm(shell, chain.isWatched(`block:${String(b.height)}`), 'block', String(b.height), back)}</div></section>`
  }

  const app = new Acryl()
    .get('/', (c) => c.html(pageFor(c.req.url)))
    .post('/advance', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      const back = shell.backTo(fieldOf(body, 'back'), shell.href('/'))
      try {
        const b = await chain.advance()
        return c.redirect(withNotice(back, 'ok', `Demo block ${formatHeight(b.height)} produced (${String(b.txCount)} txns).`), 303)
      } catch (error) {
        const refusal = chainErrorOf(error)
        if (refusal === undefined) throw error
        return c.redirect(withNotice(back, 'error', refusal.message), 303)
      }
    })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  if (shell.prefix !== '') ctx.router.route('/', new Acryl().get(`${shell.prefix}/`, (c) => c.html(pageFor(c.req.url))))
  ctx.effect(() => shell.nav({ id: 'blocks', label: 'Blocks', path: '/', order: 10 }))
  ctx.effect(() => shell.side({ id: 'block-inspector', column: 'side', order: 20, render: inspector }))
  ctx.effect(() =>
    ctx.home.widget({
      id: 'blocks',
      title: 'Chain',
      render: () => `<p><b>${escapeHtml(chain.state.network)}</b> · head ${formatHeight(chain.head)}</p>`,
    }),
  )
}
