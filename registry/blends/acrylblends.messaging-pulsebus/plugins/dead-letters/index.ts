/** Dead-letter queue (`/dead-letters`): messages that failed every delivery, with the reason; redrive one (a fresh delivery attempt) or discard it. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { busErrorOf, escapeHtml, withNotice } from '../bus-shell/index.ts'
import { clockOf, summarize } from '../pulsebus/index.ts'

export const name = 'dead-letters'
export const inject = ['router', 'bus', 'busShell']

function pageFor(ctx: Context, url: string): string {
  const shell = ctx.busShell
  const bus = ctx.bus
  const sel = shell.selection(url)
  const dead = bus.deadLetters()
  const rows = dead
    .map(
      (m) =>
        `<div class="listitem" style="grid-template-columns:70px 1fr auto" data-dead="${escapeHtml(m.id)}"><span class="muted">${clockOf(m.at)}</span><div><strong>${escapeHtml(m.id)}</strong><div class="muted">${escapeHtml(m.topicId)} · ${escapeHtml(summarize(m.data))}</div><div class="muted" style="color:var(--deadink)">${escapeHtml(m.lastError ?? 'Failed')} · ${String(m.attempts)} attempts</div></div><span style="display:flex;gap:6px"><form method="post" action="${shell.href(`/dead-letters/${encodeURIComponent(m.id)}/redrive`)}"><button type="submit">Redrive</button></form><form method="post" action="${shell.href(`/dead-letters/${encodeURIComponent(m.id)}/discard`)}"><button class="danger" type="submit">Discard</button></form></span></div>`,
    )
    .join('')
  const main = `<div class="ph">Dead-letter queue <span class="muted">${String(dead.length)} ${dead.length === 1 ? 'message' : 'messages'}</span></div>
${rows === '' ? '<div class="empty"><b>The dead-letter queue is empty.</b><br>Messages that fail three deliveries land here.</div>' : rows}
<div class="actions"><a class="btn" href="${shell.hrefFor('/', { topicId: sel.topic.id })}">← Back to the stream</a></div>`
  return shell.page({ title: 'Dead-letter queue', main, url })
}

export function apply(ctx: Context): void {
  const shell = ctx.busShell
  const bus = ctx.bus
  const back = shell.href('/dead-letters')
  const refused = (c: { redirect(url: string, status: 303): Response }, error: unknown) => {
    const refusal = busErrorOf(error)
    if (refusal === undefined) throw error
    return c.redirect(withNotice(back, 'error', refusal.message), 303)
  }
  const app = new Acryl()
    .get('/dead-letters', (c) => c.html(pageFor(ctx, c.req.url)))
    .post('/dead-letters/:id/redrive', async (c) => {
      try {
        const m = await bus.replay(c.req.param('id'))
        return c.redirect(withNotice(back, m.state === 'acked' ? 'ok' : 'error', m.state === 'acked' ? `${m.id} redriven and acknowledged.` : `${m.id} failed again.`), 303)
      } catch (error) {
        return refused(c, error)
      }
    })
    .post('/dead-letters/:id/discard', async (c) => {
      try {
        await bus.discard(c.req.param('id'))
        return c.redirect(withNotice(back, 'ok', `${c.req.param('id')} discarded.`), 303)
      } catch (error) {
        return refused(c, error)
      }
    })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  ctx.effect(() => shell.side({ id: 'dead-letters', column: 'left', order: 99, render: () => '' }))
}
