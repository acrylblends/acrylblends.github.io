/** Protected workloads (rail) and the readiness note (rail footer): the workloads with their state dot, and how many have a verified recovery point. */
import type { Context } from '@deepseek-ai/cordis'
import { latestVerified, readiness, utcLabel } from '../restorepoint/index.ts'
import { escapeHtml } from '../ops-shell/index.ts'

export const name = 'workloads'
export const inject = ['ops', 'opsShell']

export function apply(ctx: Context): void {
  const shell = ctx.opsShell
  const ops = ctx.ops
  const list = (sel: ReturnType<typeof shell.selection>): string => {
    const items = ops.state.workloads
      .map((w) => {
        const ready = latestVerified(w) !== undefined
        const failing = w.points.at(-1)?.integrity === 'failed'
        return `<a class="workload${w.id === sel.workload.id ? ' active' : ''}" data-workload="${escapeHtml(w.id)}" href="${shell.hrefFor('/', { workload: w.id })}"${w.id === sel.workload.id ? ' aria-current="page"' : ''}>${w.icon} &nbsp;${escapeHtml(w.name)} <small class="${failing ? 'bad' : ready ? '' : 'warn'}" title="${ready ? 'Has a verified recovery point' : 'No verified recovery point'}">●</small></a>`
      })
      .join('')
    return `<div class="cap">Protected workloads</div><nav aria-label="Protected workloads">${items}</nav>`
  }
  const foot = (): string => {
    const r = readiness(ops.state)
    return `<div class="leftfoot"><b>RECOVERY READINESS</b><br><span id="readiness">${String(r.ready)} of ${String(r.total)} workloads have a verified recovery point.</span><br>Last readiness check · ${escapeHtml(utcLabel(ops.state.readinessAt))}</div>`
  }
  ctx.effect(() => shell.side({ id: 'workloads', column: 'left', order: 10, render: list }))
  ctx.effect(() => shell.side({ id: 'readiness', column: 'foot', order: 90, render: foot }))
}
