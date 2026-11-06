/** The short domains and their verification state. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'

export const name = 'domains'
export const inject = ['shortly', 'shell', 'router']

export function apply(ctx: Context): void {
  const { shortly, shell } = ctx
  const e = shell.e
  const prefix = shell.prefix
  const rows = shortly.domains().map((domain) => `<tr><td><b>${e(domain.hostname)}</b>${domain.default ? ' <span class="state">Default</span>' : ''}</td><td>${domain.verified ? 'Verified' : 'Pending verification'}</td><td>${domain.default ? 'New links use this domain' : 'Available'}</td></tr>`).join('')
  const main = `<div class="head"><div><small>WORKSPACE / DOMAINS</small><h1>Short domains</h1><p>The domains a short link can live on. Verification is recorded here; DNS is not changed by this app.</p></div></div><section class="panel"><div class="panelhead"><div><h2>Domains</h2><small>${String(shortly.domains().length)} configured</small></div></div><table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left;padding:9px;font-size:8px;color:#82928c">DOMAIN</th><th style="text-align:left;padding:9px;font-size:8px;color:#82928c">STATE</th><th style="text-align:left;padding:9px;font-size:8px;color:#82928c">USE</th></tr></thead><tbody>${rows}</tbody></table></section>`
  const app = new Acryl().get('/domains', (c) => c.html(shell.page({ active: 'domains', title: 'Domains', main })))
  ctx.router.route(prefix === '' ? '/' : prefix, app)
  ctx.effect(() => shell.nav({ id: 'domains', label: 'Domains', icon: '', path: '/domains', order: 30 }))
}
