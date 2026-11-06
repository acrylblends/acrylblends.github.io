/** Recovery plans (`/plans`): every restore preview that was run, newest first, with its scope, destination and result; a blocked one names the preflight check that failed. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { DESTINATIONS, pointLabel, whenLabel } from '../restorepoint/index.ts'
import { escapeHtml } from '../ops-shell/index.ts'

export const name = 'plans'
export const inject = ['ops', 'opsShell', 'router']

export function apply(ctx: Context): void {
  const shell = ctx.opsShell
  const ops = ctx.ops
  const pageFor = (url: string): string => {
    const runs = [...ops.state.runs].reverse()
    const rows = runs
      .map((r) => {
        const w = ops.state.workloads.find((x) => x.id === r.workloadId)
        const p = w?.points.find((x) => x.id === r.pointId)
        return `<tr data-run="${escapeHtml(r.id)}"><td>${escapeHtml(whenLabel(r.at, ops.now()))}</td><td><b>${escapeHtml(w?.name ?? r.workloadId)}</b><br><span class="muted">${escapeHtml(p === undefined ? r.pointId : pointLabel(p.at))}</span></td><td>${escapeHtml(r.scope)}</td><td>${escapeHtml(DESTINATIONS.find((d) => d.id === r.destination)?.name ?? r.destination)}</td><td class="${r.result === 'simulated' ? 'ok' : 'err'}">${r.result === 'simulated' ? 'Simulated' : `Blocked · ${escapeHtml(r.reason ?? '')}`}</td></tr>`
      })
      .join('')
    const main = `<header class="top"><div><div class="crumb">Operations / Recovery plans</div><h1>Recovery plans</h1></div></header><div class="panel"><h2>Restore previews</h2><div class="sub">Every preview run from the Recovery page. A simulated restore moves no data; a blocked one failed a preflight check.</div>${rows === '' ? '<div class="empty-note">No restore previews yet. Pick a recovery point and run a preview from the Recovery page.</div>' : `<div class="tablewrap"><table><thead><tr><th>When</th><th>Workload / point</th><th>Scope</th><th>Destination</th><th>Result</th></tr></thead><tbody>${rows}</tbody></table></div>`}<div class="note">Demo only. No data is copied, changed or restored.</div></div>`
    return shell.page({ title: 'Recovery plans', main, url, current: 'plans' })
  }
  const app = new Acryl().get('/plans', (c) => c.html(pageFor(c.req.url)))
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  ctx.effect(() => shell.nav({ id: 'plans', label: 'Recovery plans', icon: '◇', path: '/plans', order: 30 }))
}
