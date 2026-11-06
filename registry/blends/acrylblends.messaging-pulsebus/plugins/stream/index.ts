/**
 * The message stream, the first page (`/`): the selected topic's throughput, latency and delivery, its messages newest first with their delivery state,
 * "Replay selected" and a link to the dead-letter queue.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type {} from '../home/index.ts'
import { backTo, busErrorOf, escapeHtml, fieldOf, withNotice } from '../bus-shell/index.ts'
import { STATE_LABEL, clockOf, compact, summarize } from '../pulsebus/index.ts'

export const name = 'stream'
export const inject = ['router', 'bus', 'busShell', 'home']

function pageFor(ctx: Context, url: string): string {
  const shell = ctx.busShell
  const bus = ctx.bus
  const sel = shell.selection(url)
  const messages = bus.messages(sel.topic.id)
  const dead = bus.deadLetters().length
  const rows = messages
    .map((m) => {
      const tag = m.state === 'acked' ? (m.origin === 'local' ? 'LOCAL' : STATE_LABEL.acked) : STATE_LABEL[m.state]
      const cls = m.state === 'retry' ? ' retry' : m.state === 'dead' ? ' dead' : ''
      const selected = sel.message?.id === m.id
      return `<a class="listitem${selected ? ' sel' : ''}" href="${shell.hrefFor('/', { topicId: sel.topic.id, messageId: m.id })}"${selected ? ' aria-current="true"' : ''} data-message="${escapeHtml(m.id)}"><span class="muted">${clockOf(m.at)}</span><div><strong>${escapeHtml(m.id)}</strong><div class="muted">${escapeHtml(summarize(m.data))}</div></div><span class="tag${cls}">${tag}</span></a>`
    })
    .join('')
  const replay =
    sel.message === undefined
      ? '<button id="replay" disabled>↻ Replay selected</button>'
      : `<form method="post" action="${shell.href(`/messages/${encodeURIComponent(sel.message.id)}/replay`)}"><input type="hidden" name="back" value="${escapeHtml(shell.hrefFor('/', { topicId: sel.topic.id, messageId: sel.message.id }))}"><button id="replay" type="submit">↻ Replay selected</button></form>`
  const dlq = shell.has('dead-letters') ? `<a class="btn" id="dlq" href="${shell.href('/dead-letters')}">View dead-letter queue${dead > 0 ? ` (${String(dead)})` : ''}</a>` : ''
  const main = `<div class="ph">Message stream <span class="muted" id="streamtitle">${escapeHtml(sel.topic.id)}</span></div>
<div class="metrics"><div class="metric"><b id="mps">${compact(sel.topic.perMin)}</b><small>messages / min</small></div><div class="metric"><b>${String(sel.topic.p95Ms)} ms</b><small>p95 latency</small></div><div class="metric"><b>${String(sel.topic.deliveryPercent)}%</b><small>delivery</small></div></div>
<div id="messages">${rows === '' ? '<div class="empty"><b>No messages on this topic yet.</b><br>Publish a test event from the inspector.</div>' : rows}</div>
<div class="actions">${replay}${dlq}</div>`
  return shell.page({ title: 'Message stream', main, url })
}

export function apply(ctx: Context): void {
  const shell = ctx.busShell
  const bus = ctx.bus
  const app = new Acryl().get('/', (c) => c.html(pageFor(ctx, c.req.url))).post('/messages/:id/replay', async (c) => {
    const body = (await c.req.parseBody()) as Record<string, unknown>
    const id = c.req.param('id')
    const to = backTo(shell, fieldOf(body, 'back'), shell.href('/'))
    try {
      const before = bus.message(id)
      const m = await bus.replay(id)
      const text = before.state === 'acked' ? `${m.id} replayed (replay ${String(m.replays)}).` : m.state === 'acked' ? `${m.id} delivered on attempt ${String(m.attempts)}.` : m.state === 'dead' ? `${m.id} failed again and moved to the dead-letter queue.` : `${m.id} failed again (attempt ${String(m.attempts)}); it will retry.`
      return c.redirect(withNotice(to, m.state === 'acked' ? 'ok' : 'error', text), 303)
    } catch (error) {
      const refusal = busErrorOf(error)
      if (refusal === undefined) throw error
      return c.redirect(withNotice(to, 'error', refusal.message), 303)
    }
  })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  if (shell.prefix !== '') ctx.router.route('/', new Acryl().get(`${shell.prefix}/`, (c) => c.html(pageFor(ctx, c.req.url))))
  ctx.effect(() =>
    ctx.home.widget({
      id: 'stream',
      title: 'Event bus',
      render: () => `<p><b>${String(bus.state.topics.length)}</b> topics · <b>${String(bus.deadLetters().length)}</b> dead letters</p>`,
    }),
  )
}
