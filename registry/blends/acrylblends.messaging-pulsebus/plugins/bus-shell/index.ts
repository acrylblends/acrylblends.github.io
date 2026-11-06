/**
 * The explorer shell (`ctx.busShell`): the header, the title with "Publish event", and the three columns of the mockup. The centre is the page a
 * plugin renders with `ctx.busShell.page(...)`; the left and right columns are parts plugins put there with `ctx.busShell.side(...)` inside
 * `ctx.effect`, so a column leaves with its plugin. The topic and message being looked at are `?topic=` and `?message=`; `ctx.busShell.selection(url)`
 * resolves them (the topic's newest message when none is named) and links are written with `ctx.busShell.hrefFor(...)` so the selection travels.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type { Bus, Message, Topic } from '../pulsebus/index.ts'
import { BUS_STYLES } from './styles.ts'

export { BUS_STYLES }

export interface Selection {
  readonly topic: Topic
  /** The message the inspector shows: the one `?message=` names, else the topic's newest; absent when the topic has none. */
  readonly message: Message | undefined
}

export interface SidePart {
  readonly id: string
  readonly column: 'left' | 'right'
  readonly order: number
  render(selection: Selection, url: string): string
}

export interface PageInput {
  readonly title: string
  /** The centre column's HTML. */
  readonly main: string
  readonly url: string
}

export interface BusShell {
  readonly prefix: string
  href(path: string): string
  /** A path that keeps the selection: `/?topic=orders.created&message=evt_98ab21`. */
  hrefFor(path: string, selection: { topicId: string; messageId?: string }): string
  side(part: SidePart): () => void
  has(id: string): boolean
  selection(url: string): Selection
  page(input: PageInput): string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    busShell: BusShell
  }
}

export const APP_TITLE = 'Pulsebus'

export const escapeHtml = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')

export function withNotice(path: string, kind: 'ok' | 'error', text: string): string {
  const [base = '', hash] = path.split('#')
  return `${base}${base.includes('?') ? '&' : '?'}${kind}=${encodeURIComponent(text)}${hash === undefined ? '' : `#${hash}`}`
}

export function busErrorOf(error: unknown): { code: 'invalid' | 'not-found' | 'conflict'; message: string } | undefined {
  if (error instanceof Error && error.name === 'BusError') {
    const code = (error as { code?: unknown }).code
    if ((code === 'invalid' || code === 'not-found' || code === 'conflict') && error.message !== '') return { code, message: error.message }
  }
  return undefined
}

export function fieldOf(body: Record<string, unknown>, name: string): string | undefined {
  const value = body[name]
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.find((item): item is string => typeof item === 'string')
  return undefined
}

/** Where to go after an action: the page the form came from when it is a path of this app, else the fallback. */
export function backTo(shell: BusShell, raw: string | undefined, fallback: string): string {
  if (raw !== undefined && raw.startsWith(shell.prefix === '' ? '/' : shell.prefix) && !raw.startsWith('//') && !raw.includes('\\')) {
    const url = new URL(raw, 'http://local')
    url.searchParams.delete('ok')
    url.searchParams.delete('error')
    return `${url.pathname}${url.search}`
  }
  return fallback
}

export function createShell(bus: Bus, prefix: string): BusShell {
  const parts = new Map<string, SidePart>()
  const href = (path: string): string => {
    const clean = path.startsWith('/') ? path : `/${path}`
    if (prefix === '') return clean
    return clean === '/' ? `${prefix}/` : `${prefix}${clean}`
  }
  const selection = (url: string): Selection => {
    const query = new URL(url, 'http://local').searchParams
    const topics = bus.state.topics
    const topic = topics.find((t) => t.id === query.get('topic')) ?? topics[0]
    if (topic === undefined) throw new Error('the bus has no topics')
    const wanted = query.get('message')
    const messages = bus.messages(topic.id)
    return { topic, message: messages.find((m) => m.id === wanted) ?? messages[0] }
  }
  const hrefFor = (path: string, sel: { topicId: string; messageId?: string }): string =>
    `${href(path)}?topic=${encodeURIComponent(sel.topicId)}${sel.messageId === undefined ? '' : `&message=${encodeURIComponent(sel.messageId)}`}`

  return {
    prefix,
    href,
    hrefFor,
    side(part) {
      if (parts.has(part.id)) throw new Error(`the explorer already has a side part "${part.id}"`)
      parts.set(part.id, part)
      return () => {
        if (parts.get(part.id) === part) parts.delete(part.id)
      }
    },
    has: (id) => parts.has(id),
    selection,
    page({ title, main, url }) {
      const sel = selection(url)
      const column = (which: 'left' | 'right') =>
        [...parts.values()].filter((p) => p.column === which).sort((a, b) => a.order - b.order).map((p) => p.render(sel, url)).join('')
      const query = new URL(url, 'http://local').searchParams
      const notice = (['error', 'ok'] as const).map((kind) => ({ kind, text: query.get(kind) })).find((n) => n.text !== null && n.text !== '')
      const publish = parts.has('inspector') ? `<a class="btn primary" id="publish" href="${hrefFor('/', { topicId: sel.topic.id, ...(sel.message === undefined ? {} : { messageId: sel.message.id }) })}#custom">＋ Publish event</a>` : ''
      return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · ${APP_TITLE}</title>
<style>${BUS_STYLES}</style>
</head>
<body>
<header class="top"><a class="brand" href="${href('/')}">pulse<b>bus</b></a><div class="env">Workspace / ${escapeHtml(bus.state.workspace)} · Region ${escapeHtml(bus.state.region)}</div></header>
<main class="wrap"><div class="head"><div><h1>Event infrastructure</h1><div class="muted">Inspect topics, consumer groups and message flow.</div></div>${publish}</div>
${notice === undefined ? '' : `<p class="alert ${notice.kind}" role="${notice.kind === 'ok' ? 'status' : 'alert'}">${escapeHtml(notice.text ?? '')}</p>`}
<div class="grid"><section class="panel" aria-label="Topics and consumer groups">${column('left')}</section><section class="panel" aria-label="Message stream">${main}</section><section class="panel" aria-label="Event inspector">${column('right')}</section></div></main>
</body>
</html>`
    },
  }
}

export interface ShellConfig {
  readonly prefix?: string
}

export const name = 'bus-shell'
export const inject = ['bus', 'router']

export function apply(ctx: Context, config: ShellConfig = {}): void {
  const prefix = config.prefix ?? ''
  ctx.provide('busShell', createShell(ctx.bus, prefix))
  ctx.router.route(prefix === '' ? '/' : prefix, new Acryl().get('/health', (c) => c.json({ ok: true })))
}
