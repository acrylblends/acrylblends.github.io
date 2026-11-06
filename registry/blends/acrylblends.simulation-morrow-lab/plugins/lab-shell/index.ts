/**
 * The workbench shell (`ctx.labShell`): the top bar with the Run button, the three columns of the mockup (model library, the experiment, the run
 * inspector), the experiment heading and the tabs every page shares.
 *
 * A page plugin registers its tab with `ctx.labShell.tab(...)` inside `ctx.effect`, so the tab leaves with the plugin; a side plugin puts its part in
 * the left or right column with `ctx.labShell.side(...)`. Every link is written with `ctx.labShell.href(path)`: on its own server the app is at the
 * root, in the ACRYL frame at `/app`.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type { Lab } from '../morrow-lab/index.ts'
import { LAB_STYLES } from './styles.ts'

export { LAB_STYLES }

export interface Tab {
  /** The page plugin's name. */
  readonly id: string
  readonly label: string
  readonly path: string
  readonly order: number
}

export interface SidePart {
  readonly id: string
  readonly column: 'left' | 'right'
  readonly order: number
  /** HTML, rendered at each request; escape any user text in it. */
  render(): string
}

export interface PageInput {
  readonly active?: string
  /** The browser tab's title (the app name is added). */
  readonly title: string
  readonly main: string
  /** The request URL, for the `?ok=` / `?error=` notice. */
  readonly url?: string
  readonly scripts?: string
}

export interface LabShell {
  readonly prefix: string
  href(path: string): string
  tab(tab: Tab): () => void
  tabs(): readonly Tab[]
  side(part: SidePart): () => void
  has(id: string): boolean
  page(input: PageInput): string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    labShell: LabShell
  }
}

export const APP_TITLE = 'Morrow Lab'

export const escapeHtml = (text: string): string =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

export function noticeQuery(kind: 'ok' | 'error', text: string): string {
  return `?${kind}=${encodeURIComponent(text)}`
}

/** A refusal of the lab, told apart by its public shape. */
export function labErrorOf(error: unknown): { code: 'invalid' | 'not-found'; message: string } | undefined {
  if (error instanceof Error && error.name === 'LabError') {
    const code = (error as { code?: unknown }).code
    if ((code === 'invalid' || code === 'not-found') && error.message !== '') return { code, message: error.message }
  }
  return undefined
}

/** A form field as one string (the first when the field repeats). */
export function fieldOf(body: Record<string, unknown>, name: string): string | undefined {
  const value = body[name]
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.find((item): item is string => typeof item === 'string')
  return undefined
}

/** "Today, 10:42", "Yesterday", "Nov 2". */
export function whenLabel(iso: string, now: Date): string {
  const at = new Date(iso)
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((day(now) - day(at)) / 86_400_000)
  if (days === 0) return `Today, ${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
  if (days === 1) return 'Yesterday'
  return at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function createShell(lab: Lab, prefix: string): LabShell {
  const tabs = new Map<string, Tab>()
  const parts = new Map<string, SidePart>()
  const href = (path: string): string => {
    const clean = path.startsWith('/') ? path : `/${path}`
    if (prefix === '') return clean
    return clean === '/' ? `${prefix}/` : `${prefix}${clean}`
  }
  const sortedTabs = () => [...tabs.values()].sort((a, b) => a.order - b.order)
  const column = (which: 'left' | 'right') =>
    [...parts.values()]
      .filter((part) => part.column === which)
      .sort((a, b) => a.order - b.order)
      .map((part) => part.render())
      .join('')

  const notice = (url: string | undefined): string => {
    if (url === undefined) return ''
    const query = new URL(url, 'http://local').searchParams
    for (const kind of ['error', 'ok'] as const) {
      const text = query.get(kind)
      if (text !== null && text !== '') return `<p class="alert ${kind}" role="${kind === 'ok' ? 'status' : 'alert'}">${escapeHtml(text)}</p>`
    }
    return ''
  }

  const runButton = (): string => {
    if (!tabs.has('setup')) return ''
    const d = lab.state.draft
    return `<form method="post" action="${href('/run')}" class="inline"><input type="hidden" name="ambient" value="${d.ambient}"><input type="hidden" name="heater" value="${d.heater}"><input type="hidden" name="airflow" value="${d.airflow}"><input type="hidden" name="insulation" value="${d.insulation}"><button class="btn" id="run" type="submit">▶ Run simulation</button></form>`
  }

  return {
    prefix,
    href,
    tab(tab) {
      if (tabs.has(tab.id)) throw new Error(`the workbench already has a tab "${tab.id}"`)
      tabs.set(tab.id, tab)
      return () => {
        if (tabs.get(tab.id) === tab) tabs.delete(tab.id)
      }
    },
    tabs: sortedTabs,
    side(part) {
      if (parts.has(part.id)) throw new Error(`the workbench already has a side part "${part.id}"`)
      parts.set(part.id, part)
      return () => {
        if (parts.get(part.id) === part) parts.delete(part.id)
      }
    },
    has: (id) => tabs.has(id),
    page({ active, title, main, url, scripts }) {
      const model = lab.activeModel()
      const latest = lab.latestRun()
      const state = lab.state.dirty
        ? '<span class="pill changed" id="state">● Parameters changed</span>'
        : latest === undefined
          ? '<span class="pill" id="state">● Draft parameters</span>'
          : '<span class="pill done" id="state">● Run completed</span>'
      const experiment = latest === undefined ? 'New experiment' : `Experiment ${String(latest.number)}`
      const nav = sortedTabs()
        .map(
          (tab) =>
            `<a href="${href(tab.path)}"${tab.id === active ? ' class="active" aria-current="page"' : ''}>${escapeHtml(tab.label)}</a>`,
        )
        .join('')
      return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · ${APP_TITLE}</title>
<style>${LAB_STYLES}</style>
</head>
<body>
<header class="top"><a class="brand" href="${href('/')}">morrow<i>lab</i></a><span class="crumb">Models / ${escapeHtml(model.name)} / ${experiment}</span><span class="spacer"></span><span class="pill">LOCAL MODEL · v0.8</span>${runButton()}</header>
<div class="shell"><aside class="left" aria-label="Model library">${column('left')}</aside>
<main class="main"><div class="heading"><div><h1 id="title">${escapeHtml(model.name)} / ${escapeHtml(latest?.name ?? 'New experiment')}</h1><p>Transient heat distribution · 20-minute horizon</p></div><span class="spacer"></span>${state}</div>
<nav class="tabs" aria-label="Experiment">${nav}</nav>
${notice(url)}${main}</main>
<aside class="right" aria-label="Run inspector">${column('right')}</aside></div>
${scripts ?? ''}
</body>
</html>`
    },
  }
}

export interface ShellConfig {
  /** Where the app is mounted: empty on its own server, `/app` in the frame (src/app.ts passes it). */
  readonly prefix?: string
}

export const name = 'lab-shell'
export const inject = ['lab', 'router']

export function apply(ctx: Context, config: ShellConfig = {}): void {
  const prefix = config.prefix ?? ''
  ctx.provide('labShell', createShell(ctx.lab, prefix))
  ctx.router.route(prefix === '' ? '/' : prefix, new Acryl().get('/health', (c) => c.json({ ok: true })))
}
