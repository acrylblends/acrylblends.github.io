/** Audit summary (rail): the heuristic score of the last run with its bar, when it ran, and how many findings are queued for the next design review. */
import type { Context } from '@deepseek-ai/cordis'
import { ago, scoreOf, summarize } from '../clearpath/index.ts'

export const name = 'summary'
export const inject = ['audit', 'auditShell']

export function apply(ctx: Context): void {
  const shell = ctx.auditShell
  const audit = ctx.audit
  const render = (): string => {
    const run = audit.lastRun()
    const score = run?.score ?? scoreOf(audit.state.issues)
    const live = scoreOf(audit.state.issues)
    const s = summarize(audit.state.issues)
    return `<div class="cap">Audit summary</div><div class="score"><strong id="score">${String(score)}</strong><small>Sample audit score · heuristic preview</small><div class="bar"><span id="scorebar" style="width:${String(score)}%"></span></div><small style="margin-top:10px">${run === undefined ? 'Not run yet' : `Last run ${ago(run.at, audit.now())}`} · ${String(s.open)} open · ${String(s.resolved)} resolved${live === score ? '' : `<br>Changes since: re-run to update (now ${String(live)})`}${s.queued === 0 ? '' : `<br>${String(s.queued)} queued for the next design review`}</small></div>`
  }
  ctx.effect(() => shell.side({ id: 'summary', column: 'left', order: 10, render }))
}
