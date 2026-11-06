/** Connected systems: a card in the pipelines page's right column and the `/connections` page, with Connect and Disconnect. A connection keeps a credential reference only. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { escapeHtml, fieldOf, studioErrorOf, withNotice } from '../craft-shell/index.ts'
import type {} from '../relaycraft/index.ts'

export const name = 'connections'
export const inject = ['router', 'studio', 'craftShell']

export function apply(ctx: Context): void {
  const shell = ctx.craftShell
  const studio = ctx.studio
  const label = (c: { connected: boolean; role: string }) => (c.connected ? (c.role === 'source' ? 'Source connector' : 'Destination connector') : 'Available connector')
  const render = (_p: unknown, url: string): string => {
    const back = new URL(url, 'http://local').pathname.replace(shell.prefix, '') || '/'
    const rows = studio.state.connectors
      .map(
        (c) =>
          `<div class="connector-row" data-connector="${escapeHtml(c.id)}"><div class="logo">${escapeHtml(c.letter)}</div><div><b>${escapeHtml(c.name)}</b><small>${label(c)}</small></div>${c.connected ? '<span class="status">Connected</span>' : `<form method="post" action="${shell.href(`/connections/${encodeURIComponent(c.id)}/connect`)}"><input type="hidden" name="back" value="${escapeHtml(back)}"><button class="small" type="submit">Connect</button></form>`}</div>`,
      )
      .join('')
    return `<div class="panel"><h2>Connected systems</h2><div class="sub">Available demo connectors</div><div class="connector-list">${rows}</div></div>`
  }
  const page = (url: string): string => {
    const rows = studio.state.connectors
      .map(
        (c) =>
          `<tr data-connector="${escapeHtml(c.id)}"><td><b>${escapeHtml(c.name)}</b></td><td>${c.role === 'source' ? 'Source' : 'Destination'}</td><td>${escapeHtml(c.object)}${c.records > 0 ? ` · ${String(c.records)} records` : ''}</td><td>${escapeHtml(c.fields.map((f) => f.name).join(', '))}</td><td><code>${escapeHtml(c.credentialRef)}</code></td><td>${c.connected ? '<span class="pill">Connected</span>' : '<span class="pill warn">Not connected</span>'}</td><td><form class="inline" method="post" action="${shell.href(`/connections/${encodeURIComponent(c.id)}/${c.connected ? 'disconnect' : 'connect'}`)}"><input type="hidden" name="back" value="/connections"><button class="small" type="submit">${c.connected ? 'Disconnect' : 'Connect'}</button></form></td></tr>`,
      )
      .join('')
    const main = `<div class="panel"><h2>Connections</h2><div class="sub">Each connection keeps a credential reference, never a secret. Capabilities (fields) are stored with the connector.</div><div class="scroll"><table class="table"><thead><tr><th scope="col">Connector</th><th scope="col">Role</th><th scope="col">Object</th><th scope="col">Fields</th><th scope="col">Credential reference</th><th scope="col">Status</th><th scope="col"></th></tr></thead><tbody>${rows}</tbody></table></div></div>`
    return shell.page({ active: 'connections', title: 'Connections', crumb: 'Connections', main, url })
  }
  const target = (raw: string | undefined) => (raw === '/connections' ? shell.href('/connections') : shell.href('/'))
  const handle = (connect: boolean) =>
    async (c: { req: { param(n: string): string; parseBody(): Promise<Record<string, unknown>> }; redirect(url: string, status: 303): Response }) => {
      const body = await c.req.parseBody()
      const to = target(fieldOf(body, 'back'))
      const id = c.req.param('id')
      try {
        const c2 = await studio.connect(id, connect)
        return c.redirect(withNotice(to, 'ok', `${c2.name} ${connect ? 'connected' : 'disconnected'}.`), 303)
      } catch (error) {
        const refusal = studioErrorOf(error)
        if (refusal === undefined) throw error
        return c.redirect(withNotice(to, 'error', refusal.message), 303)
      }
    }
  const app = new Acryl().get('/connections', (c) => c.html(page(c.req.url))).post('/connections/:id/connect', handle(true)).post('/connections/:id/disconnect', handle(false))
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  ctx.effect(() => shell.nav({ id: 'connections', label: 'Connections', icon: '▦', path: '/connections', order: 20 }))
  ctx.effect(() => shell.side({ id: 'connections', order: 10, render }))
}
