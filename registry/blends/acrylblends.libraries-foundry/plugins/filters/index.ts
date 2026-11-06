/** Explore catalogue (left column): the Type, Framework and Language filters with the number of packages each has; one value per group, picking it again clears it. */
import type { Context } from '@deepseek-ai/cordis'
import { escapeHtml } from '../foundry-shell/index.ts'
import { FRAMEWORKS, LANGUAGES, TYPE_GROUPS, counts } from '../foundry/index.ts'

export const name = 'filters'
export const inject = ['router', 'atlas', 'foundryShell']

export function apply(ctx: Context): void {
  const shell = ctx.foundryShell
  const atlas = ctx.atlas
  const render = (q: ReturnType<typeof shell.query>, url: string): string => {
    const c = counts(atlas.state.packages)
    const group = (title: string, key: 'group' | 'framework' | 'language', values: readonly string[], n: Record<string, number>) => {
      const rows = values
        .filter((v) => (n[v] ?? 0) > 0)
        .map((v) => {
          const on = q[key] === v
          return `<a class="filter${on ? ' on' : ''}" href="${shell.link('/', url, { [key]: on ? '' : v, package: '' })}"${on ? ' aria-current="true"' : ''} data-filter="${key}:${escapeHtml(v)}">${escapeHtml(v)} <span>${String(n[v] ?? 0)}</span></a>`
        })
        .join('')
      return `<div class="group"><b>${title}</b>${rows}</div>`
    }
    return `<div class="cap">Explore catalogue</div><div class="filters">${group('Type', 'group', TYPE_GROUPS, c.group)}${group('Framework', 'framework', FRAMEWORKS, c.framework)}${group('Language', 'language', LANGUAGES, c.language)}</div>`
  }
  ctx.effect(() => shell.side({ id: 'filters', column: 'left', order: 10, render }))
}
