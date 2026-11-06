/** The asset inventory: environment, platform, owner, criticality and the open findings on each asset. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'

export const name = 'assets'
export const inject = ['vulns', 'shell', 'router']

export function apply(ctx: Context): void {
  const { vulns, shell } = ctx
  const e = shell.e
  const prefix = shell.prefix
  const rows = vulns.assets().map((asset) => {
    const open = vulns.findings({ assetId: asset.id }).filter((finding) => ['open', 'assigned', 'in_progress'].includes(finding.status))
    const worst = open[0]
    return `<tr><td><a href="${shell.href(`/findings?asset=${encodeURIComponent(asset.id)}`)}"><strong>${e(asset.name)}</strong></a><small>${e(asset.platform)}</small></td><td>${e(asset.environment)}</td><td>${e(asset.owner)}</td><td><span class="sev ${asset.criticality === 'high' ? 'high' : asset.criticality === 'medium' ? 'medium' : 'low'}">${e(asset.criticality.toUpperCase())}</span></td><td>${String(open.length)} open${worst === undefined ? '' : ` · worst ${e(worst.severity)}`}</td></tr>`
  }).join('')
  const main = `<div class="top"><div><div class="eyebrow">SECURITY POSTURE / ASSETS</div><h1>Assets</h1><div class="sub">${String(vulns.assets().length)} registered assets · fixture inventory</div></div><div class="actions"><a class="btn" href="${shell.href('/findings')}">All findings</a></div></div><section class="panel tablewrap"><div class="ph"><div><h2>Registered assets</h2><small>Open findings per asset, highest severity first</small></div></div><table><thead><tr><th>ASSET</th><th>ENVIRONMENT</th><th>OWNER</th><th>CRITICALITY</th><th>OPEN FINDINGS</th></tr></thead><tbody>${rows}</tbody></table></section>`
  const app = new Acryl().get('/assets', (c) => c.html(shell.page({ active: 'assets', title: 'Assets', main })))
  ctx.router.route(prefix === '' ? '/' : prefix, app)
  ctx.effect(() => shell.nav({ id: 'assets', label: 'Assets', icon: '▣', path: '/assets', order: 20 }))
}
