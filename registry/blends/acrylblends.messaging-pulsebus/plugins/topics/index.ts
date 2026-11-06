/** Topics and consumer groups (left column): pick a topic to load its stream; each consumer group shows its consumers and lag. */
import type { Context } from '@deepseek-ai/cordis'
import { escapeHtml } from '../bus-shell/index.ts'
import { compact } from '../pulsebus/index.ts'

export const name = 'topics'
export const inject = ['router', 'bus', 'busShell']

export function apply(ctx: Context): void {
  const shell = ctx.busShell
  const bus = ctx.bus
  const render = (sel: ReturnType<typeof shell.selection>): string => {
    const topics = bus.state.topics
      .map(
        (t) =>
          `<a class="topic${t.id === sel.topic.id ? ' active' : ''}" href="${shell.hrefFor('/', { topicId: t.id })}"${t.id === sel.topic.id ? ' aria-current="true"' : ''} data-topic="${escapeHtml(t.id)}"><strong><span class="dot"></span>${escapeHtml(t.id)}</strong><small>${compact(t.perHour)} events / hour</small></a>`,
      )
      .join('')
    const groups = bus.state.groups
      .map((g) => `<div class="topic" data-group="${escapeHtml(g.id)}"><strong>${escapeHtml(g.id)}</strong><small>${String(g.consumers)} consumers · lag ${String(bus.lag(g))}</small></div>`)
      .join('')
    return `<div class="ph">Topics <span class="muted">${String(bus.state.topics.length)} active</span></div><div id="topics">${topics}</div><div class="ph">Consumer groups</div>${groups}`
  }
  ctx.effect(() => shell.side({ id: 'topics', column: 'left', order: 10, render }))
}
