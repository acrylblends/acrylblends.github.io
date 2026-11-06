/** Network overview: the four network metrics (latest block with its finality lag, average block time, gas price, peers), the network events and the validator summary. All synthetic. */
import type { Context } from '@deepseek-ai/cordis'
import { BLOCK_MS, FINALITY_LAG, GAS_PRICE_GWEI, PRODUCERS, ageLabel, congestion, formatHeight, producerOf, timestampOf } from '../blockscope/index.ts'
import { escapeHtml } from '../scope-shell/index.ts'

export const name = 'network'
export const inject = ['chain', 'scopeShell']

export function apply(ctx: Context): void {
  const shell = ctx.scopeShell
  const chain = ctx.chain
  const stats = (): string => {
    const head = chain.head
    return `<div class="metric" id="m-latest"><small>Latest block</small><strong>${formatHeight(head)}</strong><em>● Head · ${String(FINALITY_LAG)} blocks past the last checkpoint</em></div><div class="metric"><small>Avg. block time</small><strong>${(BLOCK_MS / 1000).toFixed(1)}s</strong><em>Stable · 24h</em></div><div class="metric"><small>Gas price</small><strong>${GAS_PRICE_GWEI.toFixed(1)} gwei</strong><em>${congestion(GAS_PRICE_GWEI)}</em></div><div class="metric"><small>Network peers</small><strong>1,284</strong><em>+2.8% today</em></div>`
  }
  const events = (): string => {
    const now = chain.now()
    const checkpoint = chain.head - FINALITY_LAG
    const rotated = new Date(new Date(chain.anchor.at).getTime() - 11 * 60_000).toISOString()
    const produced = chain.state.produced
    return `<section class="panel"><h2>Network events</h2><div class="event"><i class="dot"></i><div><b>Finality checkpoint reached</b><div class="muted">Height ${formatHeight(checkpoint)} · ${escapeHtml(ageLabel(timestampOf(chain.anchor, checkpoint), now))} ago</div></div></div><div class="event"><i class="dot"></i><div><b>Validator set rotated</b><div class="muted">Epoch 8,901 · ${escapeHtml(ageLabel(rotated, now))} ago</div></div></div>${produced === 0 ? '' : `<div class="event"><i class="dot"></i><div><b>${String(produced)} demo ${produced === 1 ? 'block' : 'blocks'} produced</b><div class="muted">Head ${formatHeight(chain.head)}</div></div></div>`}</section>`
  }
  const validators = (): string => {
    const counts = new Map<string, number>()
    for (let h = chain.head; h > chain.head - 100; h -= 1) counts.set(producerOf(h), (counts.get(producerOf(h)) ?? 0) + 1)
    const rows = PRODUCERS.map((p) => `<div class="txrow"><span>${escapeHtml(p)}</span><b>${String(counts.get(p) ?? 0)} of the last 100 blocks</b></div>`).join('')
    return `<section class="panel"><h2>Validators</h2><div class="muted">${String(PRODUCERS.length)} active producers · synthetic</div>${rows}</section>`
  }
  ctx.effect(() => shell.side({ id: 'network-stats', column: 'stats', order: 10, render: stats }))
  ctx.effect(() => shell.side({ id: 'network-events', column: 'side', order: 60, render: events }))
  ctx.effect(() => shell.side({ id: 'validators', column: 'side', order: 70, render: validators }))
}
