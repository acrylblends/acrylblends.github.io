/** Featured building blocks, the first page (`/`): the package cards that match the search and filters, two to a row; picking a card loads it in the detail column. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type {} from '../home/index.ts'
import { escapeHtml } from '../foundry-shell/index.ts'
import { latestOf } from '../foundry/index.ts'

export const name = 'catalogue'
export const inject = ['router', 'atlas', 'foundryShell', 'home']

function pageFor(ctx: Context, url: string): string {
  const shell = ctx.foundryShell
  const atlas = ctx.atlas
  const q = shell.query(url)
  const results = atlas.search({ q: q.q, group: q.group, framework: q.framework, language: q.language })
  const selected = q.package !== '' ? q.package : (results[0]?.id ?? '')
  const cards = results
    .map((p) => {
      const on = p.id === selected
      const inStack = atlas.inStack(p.id) !== undefined
      return `<a class="pkg${on ? ' active' : ''}" href="${shell.link('/', url, { package: p.id })}"${on ? ' aria-current="true"' : ''} data-package="${escapeHtml(p.id)}"><div class="pkghead"><div class="icon" aria-hidden="true">${escapeHtml(p.name.charAt(0).toUpperCase())}</div><span class="version">v${escapeHtml(latestOf(p))}</span></div><h3>${escapeHtml(p.name)}</h3><p>${escapeHtml(p.summary)}</p><div class="chips">${p.tags.map((t) => `<span class="chip">${escapeHtml(t)}</span>`).join('')}${inStack ? '<span class="chip in">In stack</span>' : ''}</div></a>`
    })
    .join('')
  const main = `<div class="cap">Featured building blocks <span class="muted" id="count">${String(results.length)} ${results.length === 1 ? 'result' : 'results'}</span></div>
<div class="cards" id="cards">${cards === '' ? `<div class="empty" style="grid-column:1/-1"><b>No packages match.</b><br>Try another word, or clear the filters.</div>` : cards}</div>`
  return shell.page({ title: 'Libraries & frameworks', main, url })
}

export function apply(ctx: Context): void {
  const shell = ctx.foundryShell
  const app = new Acryl().get('/', (c) => c.html(pageFor(ctx, c.req.url)))
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  if (shell.prefix !== '') ctx.router.route('/', new Acryl().get(`${shell.prefix}/`, (c) => c.html(pageFor(ctx, c.req.url))))
  ctx.effect(() =>
    ctx.home.widget({
      id: 'catalogue',
      title: 'Package atlas',
      render: () => `<p><b>${String(ctx.atlas.state.packages.length)}</b> packages · <b>${String(ctx.atlas.state.stack.length)}</b> in your stack</p>`,
    }),
  )
}
