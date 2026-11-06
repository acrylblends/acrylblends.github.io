/**
 * The terminal (`/`): the selected profile's simulated session. Allowlisted demo commands run through the form or the quick-command buttons and
 * answer from canned fixtures; nothing is executed. Also opens and closes sessions (`/sessions`, `/sessions/:id/close`).
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type {} from '../home/index.ts'
import { backTo, escapeHtml, fieldOf, relayErrorOf, withNotice } from '../relay-shell/index.ts'
import { type ConnectionProfile, type RemoteSession, statusOf } from '../relay/index.ts'

export const name = 'terminal'
export const inject = ['router', 'relay', 'relayShell', 'home']

const QUICK = ['git status', 'df -h', 'free -m', 'help']

const prompt = (profile: ConnectionProfile): string => `${escapeHtml(profile.user)}@${escapeHtml(profile.name)}:~$`

function pageFor(ctx: Context, url: string): string {
  const shell = ctx.relayShell
  const relay = ctx.relay
  const sel = shell.selection(url)
  const session = sel.session
  const live = session !== undefined && relay.status(session) === 'active'
  const lines =
    session === undefined
      ? ''
      : session.entries
          .map((e) => `<div class="line"><span class="prompt">${prompt(sel.profile)}</span> ${escapeHtml(e.command)}</div><div class="line out${e.exit === 0 ? '' : ' bad'}">${escapeHtml(e.output)}</div>`)
          .join('')
  const head =
    session === undefined
      ? `<div class="dim">Relay terminal simulator · no session on ${escapeHtml(sel.profile.name)} yet</div>`
      : `<div class="dim">Relay terminal simulator · session #${escapeHtml(session.id)}</div><div class="dim">Outputs are canned demonstration fixtures. No command is executed.</div>`
  const back = shell.hrefFor('/', sel)
  const input = live
    ? `<form method="post" action="${shell.href(`/sessions/${encodeURIComponent(session.id)}/run`)}" class="cmdline"><input type="hidden" name="back" value="${back}"><label class="prompt" for="command">${prompt(sel.profile)}</label><input id="command" name="command" placeholder="Try: ls, uptime, docker ps, git status…" autocomplete="off" autofocus required maxlength="80"></form>`
    : session === undefined
      ? '<p class="dim">Press New session to open a simulated session on this connection.</p>'
      : `<p class="dim">Session ${escapeHtml(session.id)} is ${relay.status(session) === 'closed' ? 'closed' : 'timed out'}. Press New session to open another.</p>`
  const quick = live
    ? `<div class="inputbar"><span class="muted" style="font-size:10px">Quick commands</span>${QUICK.map((c) => `<form method="post" action="${shell.href(`/sessions/${encodeURIComponent(session.id)}/run`)}"><input type="hidden" name="back" value="${back}"><input type="hidden" name="command" value="${c}"><button type="submit" data-cmd="${c}">${c}</button></form>`).join('')}</div>`
    : ''
  const main = `<section class="panel" style="padding:0;display:flex;flex-direction:column;min-height:0;flex:1"><div class="term" id="term">${head}<br>${lines}<br>${input}</div>${quick}</section>
<script>var t=document.getElementById('term');if(t)t.scrollTop=t.scrollHeight</script>`
  return shell.page({ active: 'terminal', title: 'Terminal', main, url, bare: true })
}

export function apply(ctx: Context): void {
  const shell = ctx.relayShell
  const relay = ctx.relay
  const refused = (c: { redirect(url: string, status: 303): Response }, to: string, error: unknown) => {
    const refusal = relayErrorOf(error)
    if (refusal === undefined) throw error
    return c.redirect(withNotice(to, 'error', refusal.message), 303)
  }
  const profileOf = (id: string): string => {
    try {
      return relay.session(id).profileId
    } catch {
      return relay.profiles()[0]?.id ?? ''
    }
  }
  const app = new Acryl()
    .get('/', (c) => c.html(pageFor(ctx, c.req.url)))
    .post('/sessions', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      const profileId = fieldOf(body, 'profileId') ?? ''
      const to = `${shell.href('/')}?profile=${encodeURIComponent(profileId)}`
      try {
        const session = await relay.openSession(profileId)
        return c.redirect(withNotice(to, 'ok', `Session ${session.id} opened on ${relay.profile(profileId).name}.`), 303)
      } catch (error) {
        return refused(c, to, error)
      }
    })
    .post('/sessions/:id/run', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      const id = c.req.param('id')
      const to = backTo(shell, fieldOf(body, 'back'), `${shell.href('/')}?profile=${encodeURIComponent(profileOf(id))}`)
      try {
        await relay.run(id, fieldOf(body, 'command'))
        return c.redirect(to, 303)
      } catch (error) {
        return refused(c, to, error)
      }
    })
    .post('/sessions/:id/close', async (c) => {
      const id = c.req.param('id')
      const to = `${shell.href('/')}?profile=${encodeURIComponent(profileOf(id))}`
      try {
        await relay.closeSession(id)
        return c.redirect(withNotice(to, 'ok', `Session ${id} closed.`), 303)
      } catch (error) {
        return refused(c, to, error)
      }
    })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  if (shell.prefix !== '') ctx.router.route('/', new Acryl().get(`${shell.prefix}/`, (c) => c.html(pageFor(ctx, c.req.url))))
  ctx.effect(() => shell.tab({ id: 'terminal', label: 'Terminal', path: '/', order: 10 }))
  ctx.effect(() =>
    ctx.home.widget({
      id: 'terminal',
      title: 'Remote sessions',
      render: () => {
        const live = relay.sessions().filter((s: RemoteSession) => statusOf(s, relay.now()) === 'active')
        return live.length === 0 ? '<p>No active sessions.</p>' : `<ul>${live.map((s) => `<li>${escapeHtml(s.id)} on ${escapeHtml(relay.profile(s.profileId).name)}</li>`).join('')}</ul>`
      },
    }),
  )
}
