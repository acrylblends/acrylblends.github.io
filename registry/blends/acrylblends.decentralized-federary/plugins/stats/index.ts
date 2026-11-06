/** Network stats: known instances, healthy peers, pending requests and the moderation queue. */
import type { Context } from '@deepseek-ai/cordis'
import { counts } from '../federary/index.ts'

export const name = 'stats'
export const inject = ['fed', 'fedShell']

export function apply(ctx: Context): void {
  const render = (): string => {
    const c = counts(ctx.fed.state)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `<div class="stat" id="stat-known"><small>Known instances</small><strong>${String(c.known)}</strong></div><div class="stat" id="stat-healthy"><small>Healthy peers</small><strong>${String(c.healthy)} / ${String(c.known)}</strong></div><div class="stat" id="stat-pending"><small>Pending requests</small><strong>${pad(c.pendingIn)}</strong></div><div class="stat" id="stat-queue"><small>Moderation queue</small><strong>${pad(c.openReports)}</strong></div>`
  }
  ctx.effect(() => ctx.fedShell.side({ id: 'stats', column: 'stats', order: 10, render }))
}
