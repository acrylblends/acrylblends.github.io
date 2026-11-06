/** Posture strip: control coverage, evidence current, open risks and audit actions, recalculated from the register, the evidence, the risks and the actions on every page. */
import type { Context } from '@deepseek-ai/cordis'
import { posture } from '../grc/index.ts'

export const name = 'posture'
export const inject = ['grc', 'grcShell']

export function apply(ctx: Context): void {
  const shell = ctx.grcShell
  const render = (): string => {
    const p = posture(ctx.grc.state, ctx.grc.now())
    const pad = (n: number) => String(n).padStart(2, '0')
    return `<div class="stat" id="stat-coverage"><small>Control coverage</small><strong>${String(p.coverage)}%</strong><div class="meter"><i style="width:${String(p.coverage)}%"></i></div></div><div class="stat" id="stat-evidence"><small>Evidence current</small><strong>${String(p.evidenceCurrent)} / ${String(p.evidenceTotal)}</strong><small>${String(p.needAttention)} ${p.needAttention === 1 ? 'item needs' : 'items need'} attention</small></div><div class="stat" id="stat-risks"><small>Open risks</small><strong>${pad(p.openRisks)}</strong><small>${String(p.highResidual)} high residual ${p.highResidual === 1 ? 'score' : 'scores'}</small></div><div class="stat" id="stat-actions"><small>Audit actions</small><strong>${pad(p.actions)}</strong><small>${String(p.dueThisWeek)} due this week</small></div>`
  }
  ctx.effect(() => shell.side({ id: 'posture', column: 'stats', order: 10, render }))
}
