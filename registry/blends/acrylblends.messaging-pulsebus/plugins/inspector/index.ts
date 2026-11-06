/** Event inspector (right column): the selected message's schema version, headers and JSON envelope, delivery details, and "Publish test message" with schema validation. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { backTo, busErrorOf, escapeHtml, fieldOf, withNotice } from '../bus-shell/index.ts'
import { STATE_LABEL, envelope } from '../pulsebus/index.ts'

export const name = 'inspector'
export const inject = ['router', 'bus', 'busShell']

export function apply(ctx: Context): void {
  const shell = ctx.busShell
  const bus = ctx.bus
  const render = (sel: ReturnType<typeof shell.selection>, url: string): string => {
    const m = sel.message
    const query = new URL(url, 'http://local').searchParams
    const draft = query.get('payload')
    const example = sel.topic.fields
      .filter((f) => f.required)
      .map((f) => [f.name, f.example ?? (f.type === 'number' ? 1 : f.type === 'array' ? [] : f.type === 'boolean' ? true : 'sample')])
    const body = draft ?? JSON.stringify(Object.fromEntries(example))
    const back = shell.hrefFor('/', { topicId: sel.topic.id, ...(m === undefined ? {} : { messageId: m.id }) })
    const detail =
      m === undefined
        ? '<h2 id="evtitle">No message selected</h2><div class="muted">This topic has no messages yet.</div>'
        : `<h2 id="evtitle">${escapeHtml(m.id)}</h2><div class="muted">Schema v${String(m.schemaVersion)} · ${escapeHtml(m.topicId)}</div>
<dl class="meta"><dt>Delivery</dt><dd>${STATE_LABEL[m.state]} · ${String(m.attempts)} ${m.attempts === 1 ? 'attempt' : 'attempts'}${m.replays > 0 ? ` · ${String(m.replays)} replays` : ''}</dd><dt>Origin</dt><dd>${m.origin === 'local' ? 'Synthetic (local)' : 'Fixture'}</dd><dt>Content-Type</dt><dd>application/json</dd>${m.lastError === undefined ? '' : `<dt>Last error</dt><dd>${escapeHtml(m.lastError)}</dd>`}</dl>
<pre id="payload">${escapeHtml(JSON.stringify(envelope(m), null, 2))}</pre>`
    return `<div class="ph">Event inspector <span class="muted">JSON</span></div><div class="detail">${detail}
<form method="post" action="${shell.href(`/topics/${encodeURIComponent(sel.topic.id)}/publish`)}"><input type="hidden" name="back" value="${escapeHtml(back)}"><label for="custom">Publish test message to ${escapeHtml(sel.topic.id)} <span class="muted">(schema v${String(sel.topic.schemaVersion)})</span></label><textarea id="custom" name="payload" rows="4" spellcheck="false">${escapeHtml(body)}</textarea>
<p class="muted" style="font-size:12px;margin:6px 0">Required: ${sel.topic.fields.filter((f) => f.required).map((f) => `${f.name} (${f.type})`).join(', ')}. Add <code>"poison": true</code> to watch retries.</p><button class="primary" style="margin-top:9px;width:100%" id="send" type="submit">Send to topic</button></form></div>`
  }
  const app = new Acryl().post('/topics/:id/publish', async (c) => {
    const body = (await c.req.parseBody()) as Record<string, unknown>
    const id = c.req.param('id')
    const to = backTo(shell, fieldOf(body, 'back'), shell.hrefFor('/', { topicId: id }))
    const payload = fieldOf(body, 'payload')
    try {
      const m = await bus.publish(id, payload)
      const target = shell.hrefFor('/', { topicId: id, messageId: m.id })
      const text = m.state === 'acked' ? `Synthetic event ${m.id} added to the local stream.` : `Synthetic event ${m.id} was rejected by the consumer; it will retry.`
      return c.redirect(withNotice(target, m.state === 'acked' ? 'ok' : 'error', text), 303)
    } catch (error) {
      const refusal = busErrorOf(error)
      if (refusal === undefined) throw error
      // Keep what was typed: the textarea is filled from `payload`, and the page is scrolled to it.
      const [path = to] = to.split('#')
      const draft = new URL(path, 'http://local')
      draft.searchParams.set('payload', payload ?? '')
      return c.redirect(withNotice(`${draft.pathname}${draft.search}#custom`, 'error', refusal.message), 303)
    }
  })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  ctx.effect(() => shell.side({ id: 'inspector', column: 'right', order: 10, render }))
}
