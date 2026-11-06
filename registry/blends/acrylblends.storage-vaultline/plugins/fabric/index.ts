/** Fabric overview, the first page (`/`): pool capacity with health, and the fabric's health card (nodes, replication lag, pending scrubs, last integrity scan). */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type {} from '../home/index.ts'
import { escapeHtml } from '../vault-shell/index.ts'
import { formatGb, percent, poolUsedGb } from '../vaultline/index.ts'

export const name = 'fabric'
export const inject = ['router', 'vault', 'vaultShell', 'home']

function pageFor(ctx: Context, url: string): string {
  const shell = ctx.vaultShell
  const vault = ctx.vault
  const { pools, volumes, fabric } = vault.state
  const poolRows = pools
    .map((p, i) => {
      const used = poolUsedGb(p, volumes)
      const pct = percent(used, p.totalGb)
      const tone = p.watch ? 'rust' : i === 1 ? 'sage' : ''
      return `<div class="pool" data-pool="${escapeHtml(p.id)}"><div class="poolhead"><b>${escapeHtml(p.name)} <span class="${p.watch ? 'warn' : 'ok'}">● ${p.watch ? 'Watch' : 'Healthy'}</span></b><span>${formatGb(used).replace(' TB', '')} / ${formatGb(p.totalGb)}</span></div><div class="meter" role="img" aria-label="${escapeHtml(p.name)} ${String(pct)}% used"><i class="${tone}" style="width:${String(pct)}%"></i></div><small class="muted">${escapeHtml(p.note)}</small></div>`
    })
    .join('')
  const scrubs = vault.pendingScrubs()
  const main = `<div class="grid"><div class="card"><h3>Pool capacity</h3>${poolRows}</div>
<div class="card"><h3>Fabric health</h3>
<div class="snap"><span>Node availability</span><strong class="${fabric.nodesUp === fabric.nodesTotal ? 'ok' : 'warn'}">${String(fabric.nodesUp)} / ${String(fabric.nodesTotal)}</strong></div>
<div class="snap"><span>Replication lag</span><strong>${fabric.replicationLagSec.toFixed(1)} sec</strong></div>
<div class="snap"><span>Pending scrub</span><strong>${String(scrubs)} ${scrubs === 1 ? 'volume' : 'volumes'}</strong></div>
<div class="snap"><span>Last integrity scan</span><strong>${new Date(fabric.lastScanAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} local</strong></div></div></div>`
  return shell.page({ active: 'fabric', title: 'Fabric overview', main, url })
}

export function apply(ctx: Context): void {
  const shell = ctx.vaultShell
  const app = new Acryl().get('/', (c) => c.html(pageFor(ctx, c.req.url)))
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  if (shell.prefix !== '') ctx.router.route('/', new Acryl().get(`${shell.prefix}/`, (c) => c.html(pageFor(ctx, c.req.url))))
  ctx.effect(() => shell.tab({ id: 'fabric', label: 'Fabric overview', nav: 'Fabric', path: '/', order: 10 }))
  ctx.effect(() =>
    ctx.home.widget({
      id: 'fabric',
      title: 'Storage fabric',
      render: () => {
        const t = ctx.vault.totals()
        return `<p><b>${formatGb(t.allocatedGb)}</b> of ${formatGb(t.rawGb)} allocated (${String(t.provisionedPercent)}%)</p><p>Snapshot coverage ${String(t.protectionPercent)}%</p>`
      },
    }),
  )
}
