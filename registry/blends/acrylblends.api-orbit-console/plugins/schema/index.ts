/** Schema (`/schema`): the resource the endpoint returns (an Order, a Customer or an Event) as a type map, and for a POST the request body's fields with whether they are required. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { escapeHtml, highlight } from '../orbit-shell/index.ts'
import { SCHEMAS } from '../orbit/index.ts'

export const name = 'schema'
export const inject = ['router', 'orbit', 'orbitShell']

function pageFor(ctx: Context, url: string): string {
  const shell = ctx.orbitShell
  const endpoint = shell.endpointOf(url)
  const body =
    endpoint.body === undefined
      ? ''
      : `<div class="field"><span class="l">Request body</span><table class="params"><thead><tr><th scope="col">Field</th><th scope="col">Type</th><th scope="col">Description</th></tr></thead><tbody>${endpoint.body.fields.map((f) => `<tr><td>${escapeHtml(f.name)}${f.required ? ' <small class="muted">required</small>' : ''}</td><td>${escapeHtml(f.type)}</td><td>${escapeHtml(f.description)}</td></tr>`).join('')}</tbody></table></div>`
  const main = `<div id="schema"><div class="field"><span class="l">${endpoint.resource} object</span><pre class="code">${highlight(SCHEMAS[endpoint.resource])}</pre></div>${body}</div>`
  return shell.page({ active: 'schema', title: `${endpoint.resource} schema`, main, url })
}

export function apply(ctx: Context): void {
  const shell = ctx.orbitShell
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, new Acryl().get('/schema', (c) => c.html(pageFor(ctx, c.req.url))))
  ctx.effect(() => shell.tab({ id: 'schema', label: 'Schema', path: '/schema', order: 20 }))
}
