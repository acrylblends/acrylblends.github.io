/**
 * The swarm console shell (`ctx.swarmShell`): the header (brand, room line and the buttons plugins put there), the transfer hero, and the main and aside
 * columns. Everything in them is a part plugins register with `ctx.swarmShell.side(...)` inside `ctx.effect`, so a part leaves with its plugin; the room page
 * itself only routes. What is open is the URL's query (`?room=`, `?range=`, `?peer=`): transient, not saved.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { type Peer, type Room, type Swarm, RANGES } from '../swarmdrop/index.ts'
import { SWARM_STYLES } from './styles.ts'

export { SWARM_STYLES }

export interface Selection {
  readonly room: Room
  /** `?range=` when it is a valid range number. */
  readonly range: number | undefined
  readonly peer: Peer | undefined
}

export interface SidePart {
  readonly id: string
  readonly column: 'actions' | 'hero' | 'main' | 'aside'
  readonly order: number
  render(selection: Selection, url: string): string
}

export interface SwarmShell {
  readonly prefix: string
  href(path: string): string
  hrefFor(path: string, sel: { room: string; range?: number | undefined; peer?: string | undefined }): string
  side(part: SidePart): () => void
  selection(url: string): Selection
  fromBody(body: Record<string, unknown>): Selection
  hidden(sel: Selection): string
  notice(url: string): string
  page(input: { title: string; url: string }): string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    swarmShell: SwarmShell
  }
}

export const APP_TITLE = 'Swarmdrop'

export const escapeHtml = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')

export function withNotice(path: string, kind: 'ok' | 'error', text: string): string {
  const [base = '', hash] = path.split('#')
  return `${base}${base.includes('?') ? '&' : '?'}${kind}=${encodeURIComponent(text)}${hash === undefined ? '' : `#${hash}`}`
}

export function swarmErrorOf(error: unknown): { code: 'invalid' | 'not-found' | 'conflict'; message: string } | undefined {
  if (error instanceof Error && error.name === 'SwarmError') {
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

export function createShell(swarm: Swarm, prefix: string): SwarmShell {
  const parts = new Map<string, SidePart>()
  const href = (path: string): string => {
    const clean = path.startsWith('/') ? path : `/${path}`
    if (prefix === '') return clean
    return clean === '/' ? `${prefix}/` : `${prefix}${clean}`
  }
  const resolve = (get: (n: string) => string | undefined | null): Selection => {
    const rooms = swarm.state.rooms
    const room = rooms.find((r) => r.id === get('room')) ?? rooms[0]
    if (room === undefined) throw new Error('there is no room')
    const n = Number(get('range'))
    const range = get('range') !== null && get('range') !== undefined && get('range') !== '' && Number.isInteger(n) && n >= 0 && n < RANGES ? n : undefined
    return { room, range, peer: room.peers.find((p) => p.id === get('peer')) }
  }
  const shell: SwarmShell = {
    prefix,
    href,
    hrefFor(path, sel) {
      const q = new URLSearchParams({ room: sel.room })
      if (sel.range !== undefined) q.set('range', String(sel.range))
      if (sel.peer !== undefined) q.set('peer', sel.peer)
      return `${href(path)}?${q.toString()}`
    },
    side(part) {
      if (parts.has(part.id)) throw new Error(`the console already has a part "${part.id}"`)
      parts.set(part.id, part)
      return () => {
        if (parts.get(part.id) === part) parts.delete(part.id)
      }
    },
    selection: (url) => {
      const q = new URL(url, 'http://local').searchParams
      return resolve((n) => q.get(n))
    },
    fromBody: (body) => resolve((n) => fieldOf(body, n)),
    hidden: (sel) => `<input type="hidden" name="room" value="${escapeHtml(sel.room.id)}">`,
    notice(url) {
      const q = new URL(url, 'http://local').searchParams
      const n = (['error', 'ok'] as const).map((kind) => ({ kind, text: q.get(kind) })).find((x) => x.text !== null && x.text !== '')
      return `<div class="notice${n?.kind === 'error' ? ' error' : ''}" id="notice" aria-live="polite">${n === undefined ? '' : `<p role="${n.kind === 'ok' ? 'status' : 'alert'}">${escapeHtml(n.text ?? '')}</p>`}</div>`
    },
    page({ title, url }) {
      const sel = shell.selection(url)
      const column = (which: SidePart['column']) => [...parts.values()].filter((p) => p.column === which).sort((a, b) => a.order - b.order).map((p) => p.render(sel, url)).join('')
      return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · ${APP_TITLE}</title>
<style>${SWARM_STYLES}</style>
</head>
<body>
<main class="app"><header class="top"><div><a class="brand" href="${href('/')}">SWARM<span>DROP</span> <small>/ PEER TRANSFER ROOM</small></a><div class="sub">Room ${escapeHtml(sel.room.id)} · all peers and rates are simulated</div></div><div class="topbtns">${column('actions')}</div></header>
${column('hero')}
<div class="grid"><div class="col">${column('main')}</div><aside class="col" aria-label="Peers and rooms">${column('aside')}</aside></div></main>
</body>
</html>`
    },
  }
  return shell
}

export interface ShellConfig {
  readonly prefix?: string
}

export const name = 'swarm-shell'
export const inject = ['swarm', 'router']

export function apply(ctx: Context, config: ShellConfig = {}): void {
  const prefix = config.prefix ?? ''
  ctx.provide('swarmShell', createShell(ctx.swarm, prefix))
  ctx.router.route(prefix === '' ? '/' : prefix, new Acryl().get('/health', (c) => c.json({ ok: true })))
}

/** A same-app path from a form's `back` field, else the fallback. */
export function backTo(shell: SwarmShell, raw: string | undefined, fallback: string): string {
  if (raw !== undefined && raw.startsWith(shell.prefix === '' ? '/' : shell.prefix) && !raw.startsWith('//') && !raw.includes('\\')) {
    const url = new URL(raw, 'http://local')
    url.searchParams.delete('ok')
    url.searchParams.delete('error')
    return `${url.pathname}${url.search}`
  }
  return fallback
}
