/**
 * The node inspector (right column): the selected node's role, region, term, commit index, lag and heartbeat, a control that sets its health (to
 * rehearse a failure), the safe-drill note, and the recent events.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { backTo, escapeHtml, fieldOf, meshErrorOf, withNotice } from '../mesh-shell/index.ts'
import { HEALTH_LABEL, type NodeHealth, clockOf, commitIndex, formatNumber, heartbeatLabel } from '../meshwatch/index.ts'

export const name = 'inspector'
export const inject = ['router', 'mesh', 'meshShell']

export function apply(ctx: Context): void {
  const shell = ctx.meshShell
  const mesh = ctx.mesh
  const render = (node: ReturnType<typeof shell.selected>, url: string): string => {
    const state = mesh.state
    const leader = state.leader === node.id
    const options = (['healthy', 'degraded', 'down'] as const).map((h) => `<option value="${h}"${h === node.health ? ' selected' : ''}>${HEALTH_LABEL[h]}</option>`).join('')
    const back = shell.hrefFor(new URL(url, 'http://local').pathname.replace(shell.prefix, '') || '/', node)
    const events = mesh
      .events(3)
      .map((e) => `<div class="event">${clockOf(e.at)} · ${escapeHtml(e.text)}<small>${escapeHtml(e.detail)}</small></div>`)
      .join('')
    return `<div class="label">Node inspector</div><h3 id="nodeTitle">${escapeHtml(node.id)} · ${leader ? 'Leader' : 'Follower'}</h3>
<div class="metric"><span>Region</span><b>${escapeHtml(node.zone)}</b></div>
<div class="metric"><span>Status</span><b class="${node.health === 'healthy' ? 'ok' : node.health === 'degraded' ? 'warn' : 'bad'}">${HEALTH_LABEL[node.health]}</b></div>
<div class="metric"><span>Consensus term</span><b>${String(state.term)}</b></div>
<div class="metric"><span>Commit index</span><b id="nodeCommit">${formatNumber(commitIndex(state))}</b></div>
<div class="metric"><span>Replication lag</span><b>${node.lagMs === undefined || leader ? '—' : `${String(node.lagMs)} ms`}</b></div>
<div class="metric"><span>Last heartbeat</span><b>${heartbeatLabel(node, leader)}</b></div>
<form method="post" action="${shell.href(`/nodes/${encodeURIComponent(node.id)}/health`)}" class="form" style="margin-top:12px"><input type="hidden" name="back" value="${escapeHtml(back)}"><label class="field">Set health<select class="input" name="health">${options}</select></label><button class="btn" type="submit">Apply</button></form>
<div class="drill"><b>Safe drill mode</b>This demo changes only the visible leader state. No live node is contacted and no data is moved.</div>
<div class="label" style="margin-top:25px">Recent events</div>${events}`
  }
  const app = new Acryl().post('/nodes/:id/health', async (c) => {
    const body = (await c.req.parseBody()) as Record<string, unknown>
    const id = c.req.param('id')
    const to = backTo(shell, fieldOf(body, 'back'), `${shell.href('/')}?node=${encodeURIComponent(id)}`)
    try {
      const health = fieldOf(body, 'health') ?? ''
      if (!(['healthy', 'degraded', 'down'] as string[]).includes(health)) return c.redirect(withNotice(to, 'error', 'Pick healthy, degraded or down.'), 303)
      await mesh.setHealth(id, health as NodeHealth)
      return c.redirect(withNotice(to, 'ok', `${id} is now ${health}.`), 303)
    } catch (error) {
      const refusal = meshErrorOf(error)
      if (refusal === undefined) throw error
      return c.redirect(withNotice(to, 'error', refusal.message), 303)
    }
  })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  ctx.effect(() => shell.side({ id: 'inspector', order: 10, render }))
}
