/**
 * Failover drills (`/drills`): the drill history, a form to run a failover (to a chosen healthy follower, or the best one), a quorum test, and
 * "Reset fixture". The top bar's "Run failover drill" posts here too. The rules are the mesh's; this plugin reads forms and shows what it answers.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { backTo, escapeHtml, fieldOf, meshErrorOf, withNotice } from '../mesh-shell/index.ts'
import { bestFollower, dayLabel } from '../meshwatch/index.ts'

export const name = 'drills'
export const inject = ['router', 'mesh', 'meshShell']

function pageFor(ctx: Context, url: string): string {
  const shell = ctx.meshShell
  const mesh = ctx.mesh
  const state = mesh.state
  const now = mesh.now()
  const history = mesh
    .drills()
    .map((d) => `<div class="event" data-drill="${escapeHtml(d.id)}"><b>${escapeHtml(d.name)} · ${escapeHtml(dayLabel(d.at, now))}</b><small>${escapeHtml(d.detail)}</small></div>`)
    .join('')
  const best = bestFollower(state)
  const candidates = state.nodes.filter((n) => n.id !== state.leader && n.health === 'healthy')
  const options = `<option value="">Best follower${best === undefined ? '' : ` (${best.id})`}</option>${candidates.map((n) => `<option value="${escapeHtml(n.id)}">${escapeHtml(n.id)} · ${n.lagMs === undefined ? '—' : `${String(n.lagMs)} ms`}</option>`).join('')}`
  const here = shell.hrefFor('/drills', shell.selected(url))
  const main = `<section class="board"><h3>Local failover drill history</h3>
<form class="form" method="post" action="${shell.href('/drills')}"><input type="hidden" name="back" value="${escapeHtml(here)}"><label class="field">Promote<select class="input" name="target">${options}</select></label><label class="field">Drill name<input class="input" name="name" maxlength="60" placeholder="Local failover drill"></label><button class="btn" type="submit">Run failover drill</button></form>
<form method="post" action="${shell.href('/drills/quorum')}" style="display:inline"><input type="hidden" name="back" value="${escapeHtml(here)}"><button class="btn" type="submit">Run quorum test</button></form>
<form method="post" action="${shell.href('/drills/reset')}" style="display:inline"><input type="hidden" name="back" value="${escapeHtml(here)}"><button class="btn danger" type="submit">Reset fixture</button></form>
<div id="drillHistory" style="margin-top:12px">${history === '' ? '<div class="empty">No drills yet.</div>' : history}</div></section>`
  return shell.page({ active: 'drills', title: 'Failover drills', main, url })
}

export function apply(ctx: Context): void {
  const shell = ctx.meshShell
  const mesh = ctx.mesh
  const refused = (c: { redirect(url: string, status: 303): Response }, to: string, error: unknown) => {
    const refusal = meshErrorOf(error)
    if (refusal === undefined) throw error
    return c.redirect(withNotice(to, 'error', refusal.message), 303)
  }
  const target = async (c: { req: { parseBody(): Promise<Record<string, unknown>> } }) => {
    const body = await c.req.parseBody()
    return { body, to: backTo(shell, fieldOf(body, 'back'), shell.href('/drills')) }
  }
  const app = new Acryl()
    .get('/drills', (c) => c.html(pageFor(ctx, c.req.url)))
    .post('/drills', async (c) => {
      const { body, to } = await target(c)
      try {
        const drill = await mesh.runFailover(fieldOf(body, 'target'), fieldOf(body, 'name'))
        return c.redirect(withNotice(to, 'ok', `${drill.from ?? ''} → ${drill.to ?? ''}: ${mesh.state.leader ?? ''} now leads term ${String(mesh.state.term)}.`), 303)
      } catch (error) {
        return refused(c, to, error)
      }
    })
    .post('/drills/quorum', async (c) => {
      const { to } = await target(c)
      try {
        const drill = await mesh.runQuorumDrill()
        return c.redirect(withNotice(to, 'ok', drill.detail), 303)
      } catch (error) {
        return refused(c, to, error)
      }
    })
    .post('/drills/reset', async (c) => {
      const { to } = await target(c)
      await mesh.reset()
      return c.redirect(withNotice(to, 'ok', 'Fixture reset to the seeded cluster.'), 303)
    })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  ctx.effect(() => shell.tab({ id: 'drills', label: 'Failover drills', path: '/drills', order: 40 }))
}
