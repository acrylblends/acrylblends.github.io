/** Session snapshot (session column): completion and response time of the modality's latest run (or the illustrative baseline before any run), the observed behaviour, the design consideration, the profile and the run's synthetic events. */
import type { Context } from '@deepseek-ai/cordis'
import { simulate } from '../sensepath/index.ts'
import { escapeHtml } from '../sense-shell/index.ts'

export const name = 'snapshot'
export const inject = ['lab', 'senseShell']

export function apply(ctx: Context): void {
  const shell = ctx.senseShell
  const render = (sel: ReturnType<typeof shell.selection>): string => {
    const { modality: m, settings: s, run } = sel
    const shown = run ?? { ...simulate(m, s), summary: m.observed, events: [] }
    const events = run === undefined ? '' : `<div class="obs"><b>Run events</b><ul class="events" id="events">${run.events.map((e) => `<li><span>${escapeHtml(e.label)}</span><span>${String(e.t)} ms</span></li>`).join('')}</ul></div>`
    return `<div class="panel"><h2>Session snapshot</h2><div class="sub">Illustrative test run · no real sensor data${run === undefined ? ' · baseline, not run yet' : ''}</div>
<div class="summary"><div class="metric${shown.outcome === 'missed' ? ' bad' : ''}"><strong id="completion">${String(shown.completion)}%</strong><small>Completion</small></div><div class="metric"><strong id="latency">${shown.latency.toFixed(1)}s</strong><small>Response time</small></div></div>
<div class="obs"><b>Observed behavior</b><p id="observation">${escapeHtml(shown.summary)}</p></div><div class="obs"><b>Design consideration</b><p id="consider">${escapeHtml(m.consideration)}</p></div><div class="obs"><b>Modality profile</b><p id="profile">${escapeHtml(m.profile)}</p></div>${events}</div>`
  }
  ctx.effect(() => shell.side({ id: 'snapshot', column: 'aside', order: 10, render }))
}
