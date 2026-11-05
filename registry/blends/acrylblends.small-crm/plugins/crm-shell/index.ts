/**
 * The CRM's page shell (`ctx.shell`): the sidebar (logo, workspace, the pages that registered an entry, the signed-in person), the cool white look every
 * page shares, and the small view parts pages reuse (a company's identity mark, an owner's avatar, a page header).
 *
 * A page plugin registers its sidebar entry with `ctx.shell.nav(...)` inside `ctx.effect`, so the entry leaves with the plugin (switched off in
 * Settings > Plugins), renders with `ctx.shell.page(...)`, mounts its routes at `ctx.shell.prefix` and writes every link with `ctx.shell.href(path)`.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type { Company, Crm, Owner } from '../crm/index.ts'
import { createShell, escapeHtml, type Notice, type NavItem, noticeQuery, type Shell } from './core.ts'
import { STYLES } from './styles.ts'

export * from './core.ts'

export const APP_TITLE = 'Small CRM'

export interface HeaderInput {
  readonly eyebrow: string
  readonly title: string
  readonly lead?: string
  /** HTML for the right side (buttons or links). */
  readonly actions?: string
}

export interface CrmShell extends Shell {
  /** Escape user text for HTML. */
  e(text: string): string
  /** The URL of a path of the app with a notice for the page it lands on: `url('/contacts', { kind: 'ok', text: 'Saved.' })`. */
  url(path: string, notice?: Notice): string
  /** A same-app path from a form's `back` field, or `fallback`: only paths of the app are accepted, never another site. */
  back(value: unknown, fallback: string): string
  /** A company's identity mark: its first letter on its tint. */
  mark(company: Company, large?: boolean): string
  /** An owner's avatar, or a grey one for an unassigned deal. */
  avatar(owner: Owner | undefined): string
  header(input: HeaderInput): string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    shell: CrmShell
  }
}

export interface ShellConfig {
  /** Where the app is mounted: empty on its own server, `/app` in the ACRYL frame (src/app.ts passes it). */
  readonly prefix?: string
}

export const name = 'crm-shell'
export const inject = ['crm', 'router']

function sidebar(crm: Crm, nav: readonly NavItem[], active: string | undefined, href: (path: string) => string): string {
  const links = nav
    .map((item) => {
      const count = item.count?.() ?? 0
      return `<a href="${href(item.path)}"${item.id === active ? ' class="on" aria-current="page"' : ''}><span aria-hidden="true">${item.icon}</span><span>${escapeHtml(item.label)}</span>${count > 0 ? `<em>${count}</em>` : ''}</a>`
    })
    .join('')
  const me = crm.me()
  return `<aside class="side"><a class="logo" href="${href('/')}">◈ northstar</a><div class="work">Northstar Studio</div><label>Workspace</label><nav aria-label="Workspace">${links}</nav><div class="user"><b aria-hidden="true">${escapeHtml(me.initials)}</b><span>${escapeHtml(me.name)}<small>${escapeHtml(me.title)}</small></span></div></aside>`
}

export function apply(ctx: Context, config: ShellConfig = {}): void {
  const prefix = config.prefix ?? ''
  const crm = ctx.crm
  const core = createShell(prefix, {
    appTitle: APP_TITLE,
    css: STYLES,
    grid: 'app',
    main: 'main',
    sidebar: (nav, active, href) => sidebar(crm, nav, active, href),
  })
  const shell: CrmShell = {
    ...core,
    // A page with an inspector (`aside`) uses the three-column grid.
    page(input) {
      const html = core.page(input)
      return input.aside === undefined ? html.replace('<div class="app">', '<div class="app no-aside">') : html
    },
    e: escapeHtml,
    url: (path, notice) => {
      const [base, query] = path.split('?') as [string, string | undefined]
      const noticeText = notice === undefined ? '' : noticeQuery(notice).slice(1)
      const joined = [query, noticeText].filter((part) => part !== undefined && part !== '').join('&')
      return `${core.href(base)}${joined === '' ? '' : `?${joined}`}`
    },
    back: (value, fallback) =>
      typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') ? value : fallback,
    mark: (company, large = false) =>
      `<span class="mark ${escapeHtml(company.tint)}${large ? ' lg' : ''}" aria-hidden="true">${escapeHtml(company.name.charAt(0).toUpperCase())}</span>`,
    avatar: (owner) =>
      owner === undefined
        ? '<span class="avatar none" title="Unassigned" aria-label="Unassigned">?</span>'
        : `<span class="avatar" title="${escapeHtml(owner.name)}">${escapeHtml(owner.initials)}</span>`,
    header: ({ eyebrow, title, lead, actions }) =>
      `<header class="head"><div><small>${escapeHtml(eyebrow)}</small><h1>${escapeHtml(title)}</h1>${lead === undefined ? '' : `<p>${escapeHtml(lead)}</p>`}</div>${actions === undefined ? '' : `<div class="actions">${actions}</div>`}</header>`,
  }
  ctx.provide('shell', shell)
  ctx.router.route(prefix === '' ? '/' : prefix, new Acryl().get('/health', (c) => c.json({ ok: true })))
}
