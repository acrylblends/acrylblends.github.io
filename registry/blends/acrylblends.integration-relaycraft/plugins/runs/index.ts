/**
 * Runs: the "Latest run" card in the pipelines page's right column, `/runs` (every run with its counts and the rows that were skipped or failed), and
 * `POST /pipelines/:id/run`, which runs the pipeline over the sample rows. A run is refused until the destination's required fields are mapped.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { escapeHtml, studioErrorOf, withNotice } from '../craft-shell/index.ts'
import { clockOf, runStatus } from '../relaycraft/index.ts'

export const name = 'runs'
export const inject = ['router', 'studio', 'craftShell']

const TONE = { Success: '', Warnings: ' warn', Failed: ' bad' } as const

export function apply(ctx: Context): void {
  const shell = ctx.craftShell
  const studio = ctx.studio
  const render = (p: ReturnType<typeof shell.selected>): string => {
    const run = studio.latestRun(p.id)
    if (run === undefined) return `<div class="panel"><div class="runhead"><h2>Latest run</h2></div><div class="empty">No runs yet. Run the pipeline.</div></div>`
    const status = runStatus(run)
    const lines = run.lines.map((l) => `<div>${clockOf(l.at)}  <span class="${l.level}">${l.level === 'ok' ? '✓' : l.level === 'warn' ? '!' : '✕'}</span> ${escapeHtml(l.text)}</div>`).join('')
    return `<div class="panel"><div class="runhead"><h2>Latest run</h2><span class="pill${TONE[status]}">${status}</span></div><div class="runbox" id="runlog">${lines}</div>
<div class="logline"><span>Processed</span><b id="processed">${String(run.synced)} / ${String(run.fetched)}</b></div><div class="logline"><span>Skipped</span><b>${String(run.skipped)}</b></div>${run.failed > 0 ? `<div class="logline"><span>Failed</span><b>${String(run.failed)}</b></div>` : ''}<div class="logline"><span>Duration</span><b id="duration">${run.durationSec.toFixed(1)} sec</b></div></div>`
  }
  const page = (url: string): string => {
    const p = shell.selected(url)
    const runs = studio.runs()
    const body = runs
      .map((r) => {
        const pipeline = studio.state.pipelines.find((x) => x.id === r.pipelineId)
        const status = runStatus(r)
        const issues = r.issues.slice(0, 8).map((i) => `<li><span class="pill ${i.kind === 'failed' ? 'bad' : 'warn'}">${i.kind}</span> row ${String(i.row)} · ${escapeHtml(i.text)}</li>`).join('')
        return `<div class="panel" data-run="${escapeHtml(r.id)}"><div class="runhead"><div><h2>${escapeHtml(pipeline?.name ?? r.pipelineId)}</h2><div class="sub">${escapeHtml(clockOf(r.at))} · ${String(r.fetched)} fetched · ${String(r.synced)} synced · ${String(r.skipped)} skipped · ${String(r.failed)} failed · ${r.durationSec.toFixed(1)} sec</div></div><span class="pill${TONE[status]}">${status}</span></div>${r.issues.length === 0 ? '' : `<ul class="issues">${issues}${r.issues.length > 8 ? `<li class="sub">… and ${String(r.issues.length - 8)} more</li>` : ''}</ul>`}</div>`
      })
      .join('')
    return shell.page({ active: 'runs', title: 'Run history', crumb: 'Run history', main: body === '' ? '<div class="panel"><div class="empty">No runs yet.</div></div>' : body, url, actions: `<a class="btn" href="${shell.hrefFor('/', p.id)}">Back to ${escapeHtml(p.name)}</a>` })
  }
  const app = new Acryl().get('/runs', (c) => c.html(page(c.req.url))).post('/pipelines/:id/run', async (c) => {
    const id = c.req.param('id')
    const to = shell.hrefFor('/', id)
    try {
      const run = await studio.run(id)
      const status = runStatus(run)
      return c.redirect(withNotice(to, status === 'Failed' ? 'error' : 'ok', `Run completed: ${String(run.synced)} of ${String(run.fetched)} rows synced, ${String(run.skipped)} skipped${run.failed > 0 ? `, ${String(run.failed)} failed` : ''}.`), 303)
    } catch (error) {
      const refusal = studioErrorOf(error)
      if (refusal === undefined) throw error
      return c.redirect(withNotice(to, 'error', refusal.message), 303)
    }
  })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  ctx.effect(() => shell.nav({ id: 'runs', label: 'Run history', icon: '⌁', path: '/runs', order: 30 }))
  ctx.effect(() => shell.side({ id: 'runs', order: 20, render }))
}
