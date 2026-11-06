/**
 * Try it, the first page (`/`): the base URL and token, the endpoint's parameters (query and path) and, for a POST, the request body; "Send test
 * request" runs it against the local fixture API and the response appears in the inspector. What was typed is remembered per endpoint.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type {} from '../home/index.ts'
import { escapeHtml, fieldOf, orbitErrorOf, withNotice } from '../orbit-shell/index.ts'
import { type Inputs, urlOf } from '../orbit/index.ts'

export const name = 'try-it'
export const inject = ['router', 'orbit', 'orbitShell', 'home']

function pageFor(ctx: Context, url: string): string {
  const shell = ctx.orbitShell
  const orbit = ctx.orbit
  const endpoint = shell.endpointOf(url)
  const values = orbit.inputs(endpoint)
  const rows = endpoint.params
    .map((p) => {
      const value = values.params[p.name] ?? p.default
      const input =
        p.type === 'enum'
          ? `<select id="p-${escapeHtml(p.name)}" name="p.${escapeHtml(p.name)}" aria-label="${escapeHtml(p.name)}">${(p.options ?? []).map((o) => `<option${o === value ? ' selected' : ''}>${escapeHtml(o)}</option>`).join('')}</select>`
          : `<input id="p-${escapeHtml(p.name)}" name="p.${escapeHtml(p.name)}" value="${escapeHtml(value)}" aria-label="${escapeHtml(p.name)}">`
      return `<tr><td>${escapeHtml(p.name)}${p.in === 'path' ? ' <small class="muted">(path)</small>' : ''}</td><td>${input}</td><td>${escapeHtml(p.description)}</td></tr>`
    })
    .join('')
  const post = endpoint.method === 'POST'
  const main = `<form id="request" method="post" action="${shell.href('/send')}"><input type="hidden" name="endpoint" value="${escapeHtml(endpoint.id)}">
<div class="field"><label for="base">Base URL</label><input id="base" value="${escapeHtml(orbit.state.baseUrl)}" readonly></div>
<div class="field"><label for="auth">Authorization</label><input id="auth" value="Bearer demo-token-••••••••" readonly></div>
${endpoint.params.length === 0 ? '' : `<div class="field"><span class="l">${endpoint.params.some((p) => p.in === 'path') && endpoint.params.every((p) => p.in === 'path') ? 'Path parameters' : 'Query parameters'}</span><table class="params"><thead><tr><th scope="col">Parameter</th><th scope="col">Value</th><th scope="col">Description</th></tr></thead><tbody>${rows}</tbody></table></div>`}
${post ? `<div class="field"><label for="body">Request body</label><textarea id="body" name="body" rows="5" spellcheck="false">${escapeHtml(values.body)}</textarea></div>` : ''}
<div class="field"><span class="l">Request</span><div class="code" style="min-height:0;padding:10px">${endpoint.method} ${escapeHtml(urlOf(orbit.state.baseUrl, endpoint, values))}</div></div>
<button class="btn primary" id="send" type="submit">▶ Send test request</button><span class="muted" style="font-size:11px;margin-left:9px">Uses seeded local response fixtures</span></form>`
  return shell.page({ active: 'try-it', title: `${endpoint.method} ${endpoint.path}`, main, url })
}

export function apply(ctx: Context): void {
  const shell = ctx.orbitShell
  const orbit = ctx.orbit
  const app = new Acryl().get('/', (c) => c.html(pageFor(ctx, c.req.url))).post('/send', async (c) => {
    const body = (await c.req.parseBody()) as Record<string, unknown>
    const id = fieldOf(body, 'endpoint') ?? ''
    try {
      const endpoint = orbit.endpoint(id)
      const inputs: Inputs = { params: Object.fromEntries(endpoint.params.map((p) => [p.name, fieldOf(body, `p.${p.name}`) ?? p.default])), body: fieldOf(body, 'body') ?? orbit.inputs(endpoint).body }
      const sent = await orbit.send(id, inputs)
      return c.redirect(withNotice(shell.hrefFor('/', id), sent.status < 400 ? 'ok' : 'error', sent.status < 400 ? 'Local fixture response loaded.' : `The fixture API answered ${String(sent.status)} ${sent.statusText}.`), 303)
    } catch (error) {
      const refusal = orbitErrorOf(error)
      if (refusal === undefined) throw error
      return c.redirect(withNotice(shell.href('/'), 'error', refusal.message), 303)
    }
  })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  if (shell.prefix !== '') ctx.router.route('/', new Acryl().get(`${shell.prefix}/`, (c) => c.html(pageFor(ctx, c.req.url))))
  ctx.effect(() => shell.tab({ id: 'try-it', label: 'Try it', path: '/', order: 10 }))
  ctx.effect(() =>
    ctx.home.widget({
      id: 'try-it',
      title: 'API console',
      render: () => `<p><b>${String(orbit.endpoints().length)}</b> endpoints · <b>${String(orbit.state.requests)}</b> test requests sent</p>`,
    }),
  )
}
