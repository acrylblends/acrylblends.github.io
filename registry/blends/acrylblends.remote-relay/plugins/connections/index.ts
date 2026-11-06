/**
 * Saved connections (left column): the workspace's connection profiles (the dot is the host's health), the workspaces themselves, and "Add
 * connection". Choosing a profile selects it for every tab (`?profile=`).
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { escapeHtml, fieldOf, relayErrorOf, withNotice } from '../relay-shell/index.ts'
import type {} from '../relay/index.ts'

export const name = 'connections'
export const inject = ['router', 'relay', 'relayShell']

export function apply(ctx: Context): void {
  const shell = ctx.relayShell
  const relay = ctx.relay
  const here = (url: string, profileId: string): string => {
    const query = new URL(url, 'http://local')
    const path = query.pathname
    return `${path}?profile=${encodeURIComponent(profileId)}`
  }
  const render = (selection: ReturnType<typeof shell.selection>, url: string): string => {
    const query = new URL(url, 'http://local').searchParams
    const workspaceId = query.get('workspace') ?? selection.profile.workspaceId
    const workspace = relay.workspaces().find((w) => w.id === workspaceId) ?? relay.workspaces()[0]
    const profiles = relay.profiles(workspace?.id)
    const rows = profiles
      .map((p) => {
        const active = p.id === selection.profile.id
        return `<a class="host${active ? ' active' : ''}" href="${here(url, p.id)}"${active ? ' aria-current="true"' : ''} data-host="${escapeHtml(p.id)}"><b><span class="dot${p.health === 'warn' ? ' warn' : ''}">●</span>${escapeHtml(p.name)}</b><small>${escapeHtml(p.user)}@${escapeHtml(p.host)} · SSH ${String(p.port)}</small></a>`
      })
      .join('')
    const workspaces = relay
      .workspaces()
      .map((w) => {
        const count = relay.profiles(w.id).length
        const first = relay.profiles(w.id)[0]
        const target = first === undefined ? shell.href('/') : `${shell.href('/')}?profile=${encodeURIComponent(first.id)}&workspace=${encodeURIComponent(w.id)}`
        return `<a class="host${w.id === workspace?.id ? ' active' : ''}" href="${target}"><b>${escapeHtml(w.name)}</b><small>${String(count)} saved ${count === 1 ? 'connection' : 'connections'}</small></a>`
      })
      .join('')
    const options = relay.workspaces().map((w) => `<option value="${escapeHtml(w.id)}"${w.id === workspace?.id ? ' selected' : ''}>${escapeHtml(w.name)}</option>`).join('')
    return `<div class="label">Saved connections</div>${rows === '' ? '<p class="muted" style="font-size:10px">No connections in this workspace.</p>' : rows}
<details class="add"><summary class="smallbtn" id="addHost" style="width:100%">＋ Add connection</summary>
<form method="post" action="${shell.href('/connections')}"><label class="field">Name<input class="input" name="name" required maxlength="40" placeholder="build-gateway" pattern="[a-z0-9][a-z0-9\\-]*"></label>
<label class="field">User<input class="input" name="user" required maxlength="32" placeholder="deploy"></label>
<label class="field">Host<input class="input" name="host" required maxlength="253" placeholder="10.20.1.30"></label>
<label class="field">Port<input class="input" name="port" type="number" min="1" max="65535" value="22"></label>
<label class="field">Workspace<select class="input" name="workspaceId">${options}</select></label>
<button class="smallbtn" type="submit">Save connection</button></form></details>
<div class="label" style="margin-top:26px">Workspaces</div>${workspaces}`
  }
  const app = new Acryl().post('/connections', async (c) => {
    const body = (await c.req.parseBody()) as Record<string, unknown>
    const fields = Object.fromEntries(['name', 'user', 'host', 'port', 'workspaceId'].map((k) => [k, fieldOf(body, k)]))
    try {
      const profile = await relay.addProfile(fields)
      return c.redirect(withNotice(`${shell.href('/')}?profile=${encodeURIComponent(profile.id)}`, 'ok', `Connection ${profile.name} saved.`), 303)
    } catch (error) {
      const refusal = relayErrorOf(error)
      if (refusal === undefined) throw error
      return c.redirect(withNotice(shell.href('/'), 'error', refusal.message), 303)
    }
  })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  ctx.effect(() => shell.side({ id: 'connections', column: 'left', order: 10, render }))
}
