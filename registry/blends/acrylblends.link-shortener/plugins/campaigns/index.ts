/** Campaigns: the tags the workspace uses, at `/campaigns`, with each tag's links, active links and clicks. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { isActive, number, type Shortly } from '../shortly/index.ts'

export const name = 'campaigns'
export const inject = ['shortly', 'shell', 'router']

export function apply(ctx: Context): void {
  const { shortly, shell } = ctx
  const e = shell.e
  const prefix = shell.prefix
  const links = shortly.links()

  const app = new Acryl().get('/campaigns', (c) => {
    const tags = [...new Set(links.flatMap((link) => link.tags))].sort()
    const rows = tags
      .map((tag) => {
        const tagged = links.filter((link) => link.tags.includes(tag))
        const active = tagged.filter((link) => isActive(link, shortly.now)).length
        const clicks = tagged.reduce((sum, link) => sum + link.clicks, 0)
        return `<tr><td><b>${e(tag)}</b><small>${String(tagged.length)} links</small></td><td>${String(active)}</td><td>${number(clicks)}</td><td><a href="${shell.href(`/links?q=${encodeURIComponent(tag)}`)}">Open in Links ↗</a></td></tr>`
      })
      .join('')
    const main = `<div class="head"><div><small>WORKSPACE / CAMPAIGNS</small><h1>Campaigns</h1><p>Every tag in the workspace, with its links and click totals.</p></div><a class="btn" href="${shell.href('/links')}">All links</a></div><section class="panel" style="margin-top:18px"><div class="panelhead"><div><h2>Tags</h2><small>${String(tags.length)} campaigns</small></div></div><table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left;padding:9px;font-size:8px;color:#82928c">CAMPAIGN</th><th style="text-align:left;padding:9px;font-size:8px;color:#82928c">ACTIVE</th><th style="text-align:left;padding:9px;font-size:8px;color:#82928c">CLICKS</th><th></th></tr></thead><tbody>${rows}</tbody></table></section>`
    return c.html(shell.page({ active: 'campaigns', title: 'Campaigns', main }))
  })

  ctx.router.route(prefix === '' ? '/' : prefix, app)
  ctx.effect(() => shell.nav({ id: 'campaigns', label: 'Campaigns', icon: '', path: '/campaigns', order: 25 }))
}
