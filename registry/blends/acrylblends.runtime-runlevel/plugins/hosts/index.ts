/** Runtime hosts and families (left column): pick a host (`?host=`); each family shows its process count across all hosts. */
import type { Context } from '@deepseek-ai/cordis'
import { escapeHtml } from '../run-shell/index.ts'
import { FAMILY_LABEL, familyCounts, unitWord } from '../runlevel/index.ts'

export const name = 'hosts'
export const inject = ['router', 'desk', 'runShell']

export function apply(ctx: Context): void {
  const shell = ctx.runShell
  const desk = ctx.desk
  const render = (sel: ReturnType<typeof shell.selection>): string => {
    const hosts = desk.state.hosts
      .map((h) => {
        const procs = desk.processes(h.id)
        const sick = procs.some((p) => p.status === 'degraded')
        return `<a class="host${h.id === sel.host.id ? ' active' : ''}" href="${shell.hrefFor('/', { hostId: h.id })}"${h.id === sel.host.id ? ' aria-current="true"' : ''} data-host="${escapeHtml(h.id)}"><b>${escapeHtml(h.id)} <span class="${sick ? 'warn' : 'good'}" aria-label="${sick ? 'degraded' : 'healthy'}">●</span></b><small>${escapeHtml(h.city)} · ${String(procs.length)} ${unitWord(h, procs.length)}</small></a>`
      })
      .join('')
    const families = familyCounts(desk.state.processes)
      .map((f) => `<div class="host"><b>${escapeHtml(FAMILY_LABEL[f.family] ?? f.family)}</b><small>${String(f.count)} ${f.unit}</small></div>`)
      .join('')
    return `<div class="cap">Runtime hosts</div><div class="hosts">${hosts}</div><div class="cap">Runtime families</div><div class="hosts">${families}</div>`
  }
  ctx.effect(() => shell.side({ id: 'hosts', order: 10, render }))
}
