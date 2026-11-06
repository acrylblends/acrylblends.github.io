/**
 * The console shell (`ctx.fleetShell`): the top bar with "Provision VM", the sidebar (the pages, the hypervisor hosts, recent activity), the page
 * header and the machine table every page shares.
 *
 * A page plugin registers its sidebar entry with `ctx.fleetShell.nav(...)` inside `ctx.effect`, so the entry leaves with the plugin, and renders
 * its page with `ctx.fleetShell.page(...)`. Every link is written with `ctx.fleetShell.href(path)`: on its own server the app is at the root, in
 * the ACRYL frame at `/app`.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { type Fleet, STATE_LABEL, type VirtualMachine, actionLabel, actionsFor, percent } from '../hyperplane/index.ts'
import { FLEET_STYLES } from './styles.ts'

export { FLEET_STYLES }

export interface NavItem {
  readonly id: string
  readonly label: string
  readonly icon: string
  readonly path: string
  readonly order: number
}

export interface PageInput {
  readonly active?: string
  readonly title: string
  readonly main: string
  /** The request URL: for the `?ok=` / `?error=` notice and the host highlighted in the rail. */
  readonly url?: string
}

export interface TableOptions {
  /** Where an action button sends the person back to. */
  readonly back: string
}

export interface FleetShell {
  readonly prefix: string
  href(path: string): string
  nav(item: NavItem): () => void
  navItems(): readonly NavItem[]
  has(id: string): boolean
  page(input: PageInput): string
  header(title: string, lead: string, extra?: string): string
  /** The machine table: name and OS, host, state, vCPU, memory, IP and the actions the state allows. */
  vmTable(vms: readonly VirtualMachine[], options: TableOptions): string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    fleetShell: FleetShell
  }
}

export const APP_TITLE = 'Hyperplane'

export const escapeHtml = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')

export const noticeQuery = (kind: 'ok' | 'error', text: string): string => `?${kind}=${encodeURIComponent(text)}`

/** The notice query joined to a path that may already carry one. */
export const withNotice = (path: string, kind: 'ok' | 'error', text: string): string => `${path}${path.includes('?') ? '&' : '?'}${kind}=${encodeURIComponent(text)}`

export function fleetErrorOf(error: unknown): { code: 'invalid' | 'not-found' | 'conflict'; message: string } | undefined {
  if (error instanceof Error && error.name === 'FleetError') {
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

/** "Today 09:42", "Yesterday", "Nov 2". */
export function whenLabel(iso: string, now: Date, withTime = true): string {
  const at = new Date(iso)
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((day(now) - day(at)) / 86_400_000)
  const time = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
  if (days === 0) return withTime ? `Today ${time}` : 'Today'
  if (days === 1) return 'Yesterday'
  return at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function createShell(fleet: Fleet, prefix: string): FleetShell {
  const items = new Map<string, NavItem>()
  const href = (path: string): string => {
    const clean = path.startsWith('/') ? path : `/${path}`
    if (prefix === '') return clean
    return clean === '/' ? `${prefix}/` : `${prefix}${clean}`
  }
  const navItems = () => [...items.values()].sort((a, b) => a.order - b.order)

  const notice = (url: string | undefined): string => {
    if (url === undefined) return ''
    const query = new URL(url, 'http://local').searchParams
    for (const kind of ['error', 'ok'] as const) {
      const text = query.get(kind)
      if (text !== null && text !== '') return `<p class="alert ${kind}" role="${kind === 'ok' ? 'status' : 'alert'}">${escapeHtml(text)}</p>`
    }
    return ''
  }

  const sidebar = (active: string | undefined, url: string | undefined): string => {
    const nav = navItems()
      .map((item) => `<a class="navitem${item.id === active ? ' active' : ''}"${item.id === active ? ' aria-current="page"' : ''} href="${href(item.path)}">${item.icon} &nbsp; ${escapeHtml(item.label)}</a>`)
      .join('')
    const selected = url === undefined ? '' : (new URL(url, 'http://local').searchParams.get('host') ?? '')
    const hosts = fleet
      .hosts()
      .map((host) => {
        const vms = fleet.state.vms.filter((v) => v.hostId === host.id)
        const label = host.health === 'healthy' ? 'Healthy' : 'Warning'
        const target = items.has('overview') ? href(`/?host=${encodeURIComponent(host.id)}`) : undefined
        const body = `<b>${escapeHtml(host.name)}</b><small>${String(vms.length)} VMs · ${String(host.memoryGb)} GB RAM · <span class="${host.health === 'warning' ? 'warn' : ''}">${label}</span></small>`
        return target === undefined ? `<div class="host">${body}</div>` : `<a class="host${host.id === selected ? ' active' : ''}" href="${target}"${host.id === selected ? ' aria-current="true"' : ''} data-host="${escapeHtml(host.id)}">${body}</a>`
      })
      .join('')
    const now = fleet.now()
    const activity = fleet
      .events(3)
      .map((e) => `${escapeHtml(e.text)} · ${escapeHtml(whenLabel(e.at, now))}`)
      .join('<br><br>')
    return `<aside class="sidebar" aria-label="Infrastructure"><div class="navtitle">Infrastructure</div>${nav}<div class="navtitle" style="margin-top:24px">Hypervisor hosts</div>${hosts}<div class="navtitle" style="margin-top:24px">Recent activity</div><p class="muted" style="font-size:10px">${activity === '' ? 'Nothing yet.' : activity}</p></aside>`
  }

  return {
    prefix,
    href,
    nav(item) {
      if (items.has(item.id)) throw new Error(`the sidebar already has "${item.id}"`)
      items.set(item.id, item)
      return () => {
        if (items.get(item.id) === item) items.delete(item.id)
      }
    },
    navItems,
    has: (id) => items.has(id),
    header(title, lead, extra) {
      return `<div class="head"><div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(lead)}</p></div><div class="spacer"></div>${extra ?? ''}</div>`
    },
    vmTable(vms, { back }) {
      const rows = vms
        .map((vm) => {
          const host = fleet.hosts().find((h) => h.id === vm.hostId)
          const buttons = !items.has('machines') ? '' : [
            ...actionsFor(vm.state)
              .filter((a) => a !== 'stop' || vm.state === 'paused')
              .map((a) => `<form method="post" action="${href(`/machines/${encodeURIComponent(vm.id)}/${a}`)}"><input type="hidden" name="back" value="${escapeHtml(back)}"><button type="submit" data-action="${a}">${actionLabel(a, vm.state)}</button></form>`),
            vm.state === 'provisioning'
              ? ''
              : `<form method="post" action="${href(`/machines/${encodeURIComponent(vm.id)}/snapshot`)}"><input type="hidden" name="back" value="${escapeHtml(back)}"><button type="submit" data-action="snapshot">Snapshot</button></form>`,
          ].join('')
          const name = items.has('machines')
            ? `<a class="vmname" href="${href(`/machines/${encodeURIComponent(vm.id)}`)}">${escapeHtml(vm.name)}</a>`
            : `<span class="vmname">${escapeHtml(vm.name)}</span>`
          return `<tr data-vm="${escapeHtml(vm.id)}" data-host="${escapeHtml(vm.hostId)}"><td>${name}<br><span class="muted">${escapeHtml(vm.os)} · ${escapeHtml(vm.code)}</span></td><td>${escapeHtml(host?.name ?? '')}</td><td><span class="state ${vm.state}">● ${STATE_LABEL[vm.state]}</span></td><td>${String(vm.vcpu)}</td><td>${String(vm.memoryGb)} GB</td><td>${vm.ip === '' ? 'Pending' : escapeHtml(vm.ip)}</td><td class="actions">${buttons}</td></tr>`
        })
        .join('')
      if (rows === '') return '<div class="empty"><b>No machines match.</b><br>Clear the search or pick another host.</div>'
      return `<div class="scroll"><table class="table"><thead><tr><th scope="col">Virtual machine</th><th scope="col">Host</th><th scope="col">State</th><th scope="col">vCPU</th><th scope="col">Memory</th><th scope="col">IP address</th><th scope="col">Actions</th></tr></thead><tbody id="vmRows">${rows}</tbody></table></div>`
    },
    page({ active, title, main, url }) {
      const provision = items.has('machines') ? `<a class="btn" id="addVm" href="${href('/machines/new')}">＋ Provision VM</a>` : ''
      return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · ${APP_TITLE}</title>
<style>${FLEET_STYLES}</style>
</head>
<body>
<header class="top"><a class="logo" href="${href('/')}">hyper<span>plane</span></a><span class="crumb">Private cloud / Compute / ${escapeHtml(fleet.state.cluster)}</span>${provision}</header>
<div class="layout">${sidebar(active, url)}<main class="main">${notice(url)}${main}</main></div>
</body>
</html>`
    },
  }
}

export { percent }

export interface ShellConfig {
  readonly prefix?: string
}

export const name = 'fleet-shell'
export const inject = ['fleet', 'router']

export function apply(ctx: Context, config: ShellConfig = {}): void {
  const prefix = config.prefix ?? ''
  ctx.provide('fleetShell', createShell(ctx.fleet, prefix))
  ctx.router.route(prefix === '' ? '/' : prefix, new Acryl().get('/health', (c) => c.json({ ok: true })))
}
