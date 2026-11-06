/** Examples (`/examples`): a ready-to-paste SDK snippet for the endpoint in JavaScript, Python or Go (`?lang=`), built from the values typed in Try it. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { escapeHtml } from '../orbit-shell/index.ts'
import { LANGUAGES, type Language, snippetOf } from '../orbit/index.ts'

export const name = 'examples'
export const inject = ['router', 'orbit', 'orbitShell']

function pageFor(ctx: Context, url: string): string {
  const shell = ctx.orbitShell
  const orbit = ctx.orbit
  const endpoint = shell.endpointOf(url)
  const asked = new URL(url, 'http://local').searchParams.get('lang')
  const language: Language = LANGUAGES.find((l) => l === asked) ?? 'JavaScript'
  const snippet = snippetOf(language, orbit.state.baseUrl, endpoint, orbit.inputs(endpoint))
  const buttons = LANGUAGES.map((l) => `<a class="btn${l === language ? ' on' : ''}" href="${shell.hrefFor('/examples', endpoint.id, { lang: l })}"${l === language ? ' aria-current="true"' : ''} data-lang="${l}">${l}</a>`).join('')
  const main = `<div id="examples"><div class="snippets">${buttons}</div><pre class="code" id="snippet">${escapeHtml(snippet)}</pre><p><button class="btn small" type="button" data-copy="${escapeHtml(snippet)}">Copy snippet</button></p></div>`
  return shell.page({ active: 'examples', title: `${endpoint.method} ${endpoint.path} · ${language}`, main, url })
}

export function apply(ctx: Context): void {
  const shell = ctx.orbitShell
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, new Acryl().get('/examples', (c) => c.html(pageFor(ctx, c.req.url))))
  ctx.effect(() => shell.tab({ id: 'examples', label: 'Examples', path: '/examples', order: 30 }))
}
