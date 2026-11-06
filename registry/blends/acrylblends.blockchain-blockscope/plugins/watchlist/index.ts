/** Watchlist (inspector): the blocks, transactions and addresses the person watches (saved), and the route behind every Watch button. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { formatHeight, labelOf, short } from '../blockscope/index.ts'
import { chainErrorOf, escapeHtml, fieldOf, withNotice } from '../scope-shell/index.ts'

export const name = 'watchlist'
export const inject = ['router', 'chain', 'scopeShell']

export function apply(ctx: Context): void {
  const shell = ctx.scopeShell
  const chain = ctx.chain
  const render = (): string => {
    const items = chain.state.watch
      .map((key) => {
        const [kind = '', id = ''] = key.split(':')
        const text = kind === 'block' ? `Block ${formatHeight(Number(id))}` : kind === 'tx' ? `Transaction ${short(id)}` : (labelOf(id)?.name ?? `Address ${short(id)}`)
        const href = kind === 'block' ? shell.href(`/?block=${id}`) : kind === 'tx' ? shell.href(`/tx/${id}`) : shell.href(`/address/${id}`)
        return `<div class="txrow" data-watch-key="${escapeHtml(key)}"><a href="${href}">${escapeHtml(text)}</a><span class="muted">${escapeHtml(kind)}</span></div>`
      })
      .join('')
    return `<section class="panel" id="watchlist"><h2>Watchlist</h2><div class="muted">Saved in this local demo.</div>${items === '' ? '<div class="muted" style="margin-top:10px">Nothing watched yet. Use ☆ Watch on a block, transaction or address.</div>' : items}</section>`
  }
  const app = new Acryl().post('/watch', async (c) => {
    const body = (await c.req.parseBody()) as Record<string, unknown>
    const back = shell.backTo(fieldOf(body, 'back'), shell.href('/'))
    try {
      const r = await chain.toggleWatch(fieldOf(body, 'kind'), fieldOf(body, 'id'))
      return c.redirect(withNotice(back, 'ok', r.watching ? 'Added to the watchlist.' : 'Removed from the watchlist.'), 303)
    } catch (error) {
      const refusal = chainErrorOf(error)
      if (refusal === undefined) throw error
      return c.redirect(withNotice(back, 'error', refusal.message), 303)
    }
  })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  ctx.effect(() => shell.side({ id: 'watchlist', column: 'side', order: 50, render }))
}
