/**
 * The workbench shell (`ctx.senseShell`): the modality rail, the header (eyebrow, title and the buttons plugins put there), the workbench column and the
 * session column. The workbench panel is the page's `main`; the rail, the header buttons and the session column are parts plugins register with
 * `ctx.senseShell.side(...)` inside `ctx.effect`, so a part leaves with its plugin. The open modality is the URL's `?modality=` (transient).
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { type Lab, type Modality, type Run, type Settings, MODALITIES } from '../sensepath/index.ts'
import { SENSE_STYLES } from './styles.ts'

export { SENSE_STYLES }

export interface Selection {
  readonly modality: Modality
  readonly settings: Settings
  /** The modality's latest run, if it has been run. */
  readonly run: Run | undefined
}

export interface SidePart {
  readonly id: string
  readonly column: 'side' | 'top' | 'aside'
  readonly order: number
  render(selection: Selection, url: string): string
}

export interface SenseShell {
  readonly prefix: string
  href(path: string): string
  hrefFor(path: string, modalityId: string, extra?: Record<string, string>): string
  side(part: SidePart): () => void
  selection(url: string): Selection
  hidden(selection: Selection): string
  notice(url: string): string
  page(input: { title: string; main: string; url: string }): string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    senseShell: SenseShell
  }
}

export const APP_TITLE = 'Sensepath Lab'

export const escapeHtml = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')

export function withNotice(path: string, kind: 'ok' | 'error', text: string): string {
  const [base = '', hash] = path.split('#')
  return `${base}${base.includes('?') ? '&' : '?'}${kind}=${encodeURIComponent(text)}${hash === undefined ? '' : `#${hash}`}`
}

export function labErrorOf(error: unknown): { code: 'invalid' | 'not-found' | 'conflict'; message: string } | undefined {
  if (error instanceof Error && error.name === 'LabError') {
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

export function createShell(lab: Lab, prefix: string, modalities: readonly Modality[]): SenseShell {
  const parts = new Map<string, SidePart>()
  const href = (path: string): string => {
    const clean = path.startsWith('/') ? path : `/${path}`
    if (prefix === '') return clean
    return clean === '/' ? `${prefix}/` : `${prefix}${clean}`
  }
  const selection = (url: string): Selection => {
    const id = new URL(url, 'http://local').searchParams.get('modality')
    const modality = modalities.find((m) => m.id === id) ?? modalities[0]
    if (modality === undefined) throw new Error('there is no modality')
    return { modality, settings: lab.settings(modality.id), run: lab.latestRun(modality.id) }
  }
  return {
    prefix,
    href,
    hrefFor: (path, modalityId, extra = {}) => `${href(path)}?${new URLSearchParams({ modality: modalityId, ...extra }).toString()}`,
    side(part) {
      if (parts.has(part.id)) throw new Error(`the workbench already has a part "${part.id}"`)
      parts.set(part.id, part)
      return () => {
        if (parts.get(part.id) === part) parts.delete(part.id)
      }
    },
    selection,
    hidden: (sel) => `<input type="hidden" name="modality" value="${escapeHtml(sel.modality.id)}">`,
    notice(url) {
      const q = new URL(url, 'http://local').searchParams
      const n = (['error', 'ok'] as const).map((kind) => ({ kind, text: q.get(kind) })).find((x) => x.text !== null && x.text !== '')
      return `<div class="notice${n?.kind === 'error' ? ' error' : ''}" id="notice">${n === undefined ? '' : `<p role="${n.kind === 'ok' ? 'status' : 'alert'}">${escapeHtml(n.text ?? '')}</p>`}</div>`
    },
    page({ title, main, url }) {
      const sel = selection(url)
      const column = (which: SidePart['column']) => [...parts.values()].filter((p) => p.column === which).sort((a, b) => a.order - b.order).map((p) => p.render(sel, url)).join('')
      return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · ${APP_TITLE}</title>
<style>${SENSE_STYLES}</style>
</head>
<body>
<div class="app"><aside class="side" aria-label="Input modalities"><a class="brand" href="${href('/')}">sensepath <span>lab</span></a>${column('side')}<div class="sidefoot"><b>RESEARCH MODE</b><br>All device signals are simulated. No camera, microphone or sensor access is enabled.</div></aside>
<main class="main"><header class="top"><div><div class="eyebrow">Human–computer interaction / 067</div><h1>Interaction workbench</h1></div><div>${column('top')}</div></header>
<div class="grid"><div>${main}</div><aside class="aside" aria-label="Session">${column('aside')}</aside></div></main></div>
</body>
</html>`
    },
  }
}

export interface ShellConfig {
  readonly prefix?: string
}

export const name = 'sense-shell'
export const inject = ['lab', 'router']

export function apply(ctx: Context, config: ShellConfig = {}): void {
  const prefix = config.prefix ?? ''
  ctx.provide('senseShell', createShell(ctx.lab, prefix, MODALITIES))
  ctx.router.route(prefix === '' ? '/' : prefix, new Acryl().get('/health', (c) => c.json({ ok: true })))
}
