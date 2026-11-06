/** API reference (left column): the endpoints grouped by resource, method and path; picking one selects it (`?endpoint=`) for every tab. */
import type { Context } from '@deepseek-ai/cordis'
import { escapeHtml } from '../orbit-shell/index.ts'
import type {} from '../orbit/index.ts'

export const name = 'reference'
export const inject = ['router', 'orbit', 'orbitShell']

export function apply(ctx: Context): void {
  const shell = ctx.orbitShell
  const orbit = ctx.orbit
  const render = (selected: ReturnType<typeof shell.endpointOf>, url: string): string => {
    const path = new URL(url, 'http://local').pathname.replace(shell.prefix, '') || '/'
    const groups = [...new Set(orbit.endpoints().map((e) => e.group))]
    const body = groups
      .map(
        (g) =>
          `<div class="group">${escapeHtml(g)}</div>${orbit
            .endpoints()
            .filter((e) => e.group === g)
            .map((e) => `<a class="endpoint${e.id === selected.id ? ' active' : ''}" href="${shell.hrefFor(path, e.id)}"${e.id === selected.id ? ' aria-current="true"' : ''} data-endpoint="${escapeHtml(e.id)}"><span class="method${e.method === 'POST' ? ' post' : ''}">${e.method}</span><span class="path">${escapeHtml(e.path)}</span></a>`)
            .join('')}`,
      )
      .join('')
    return `<div class="cap">API reference <span class="muted">v1</span></div><div class="api">${body}</div>`
  }
  ctx.effect(() => shell.side({ id: 'reference', column: 'left', order: 10, render }))
}
