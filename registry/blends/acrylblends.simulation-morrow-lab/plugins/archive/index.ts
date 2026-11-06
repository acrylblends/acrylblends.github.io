/**
 * Run archive (`/archive`): every saved run with its peak, a link to its trace and field and a "compare with the latest" link; and the saved
 * snapshots, which load their parameters back into the setup or are deleted.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { escapeHtml, labErrorOf, noticeQuery, whenLabel } from '../lab-shell/index.ts'
import type {} from '../morrow-lab/index.ts'

export const name = 'archive'
export const inject = ['router', 'lab', 'labShell']

function pageFor(ctx: Context, url: string): string {
  const shell = ctx.labShell
  const lab = ctx.lab
  const now = lab.now()
  const runs = lab.runs('all')
  const latest = lab.latestRun()
  const modelName = (id: string) => lab.models().find((m) => m.id === id)?.name ?? 'Removed model'
  const runRows = runs
    .map((run) => {
      const links = [
        shell.has('traces') ? `<a class="ghost" href="${shell.href(`/traces?run=${encodeURIComponent(run.id)}`)}">Trace</a>` : '',
        shell.has('field') ? `<a class="ghost" href="${shell.href(`/field?run=${encodeURIComponent(run.id)}`)}">Field</a>` : '',
        shell.has('traces') && latest !== undefined && latest.id !== run.id
          ? `<a class="ghost" href="${shell.href(`/traces?run=${encodeURIComponent(latest.id)}&compare=${encodeURIComponent(run.id)}`)}">Compare with latest</a>`
          : '',
      ].join('')
      return `<div class="metric" data-run="${escapeHtml(run.id)}"><span><b>${escapeHtml(run.name)} · ${String(run.number)}</b><br>${escapeHtml(modelName(run.modelId))} · ${escapeHtml(whenLabel(run.createdAt, now))}</span><span class="row"><b>${run.summary.peak.toFixed(1)} °C · Completed</b>${links}</span></div>`
    })
    .join('')
  const snapshotRows = lab
    .snapshots()
    .map(
      (s) =>
        `<div class="metric" data-snapshot="${escapeHtml(s.id)}"><span><b>${escapeHtml(s.name)}</b><br>${escapeHtml(modelName(s.modelId))} · ${escapeHtml(whenLabel(s.createdAt, now))} · ${s.params.ambient} °C · heater ${s.params.heater}% · airflow ${s.params.airflow}% · insulation ${(s.params.insulation / 100).toFixed(2)}</span><span class="row"><form class="inline" method="post" action="${shell.href(`/snapshots/${encodeURIComponent(s.id)}/load`)}"><button class="ghost" type="submit">Load into setup</button></form><form class="inline" method="post" action="${shell.href(`/snapshots/${encodeURIComponent(s.id)}/delete`)}"><button class="ghost danger" type="submit" aria-label="Delete snapshot ${escapeHtml(s.name)}">Delete</button></form></span></div>`,
    )
    .join('')
  const main = `<section class="card"><h3>SAVED RUNS</h3><div id="archiveRows">${runRows === '' ? '<div class="empty">No runs yet.</div>' : runRows}</div></section>
<section class="card" style="margin-top:13px"><h3>SAVED SNAPSHOTS</h3>${snapshotRows === '' ? '<div class="empty">No snapshots yet. Save one from the run inspector.</div>' : snapshotRows}</section>`
  return shell.page({ active: 'archive', title: 'Run archive', main, url })
}

export function apply(ctx: Context): void {
  const shell = ctx.labShell
  const refused = (error: unknown, c: { redirect(url: string, status: 303): Response }) => {
    const refusal = labErrorOf(error)
    if (refusal === undefined) throw error
    return c.redirect(`${shell.href('/archive')}${noticeQuery('error', refusal.message)}`, 303)
  }
  const app = new Acryl()
    .get('/archive', (c) => c.html(pageFor(ctx, c.req.url)))
    .post('/snapshots/:id/load', async (c) => {
      try {
        const snapshot = await ctx.lab.loadSnapshot(c.req.param('id'))
        return c.redirect(`${shell.href('/')}${noticeQuery('ok', `Snapshot “${snapshot.name}” loaded into the setup.`)}`, 303)
      } catch (error) {
        return refused(error, c)
      }
    })
    .post('/snapshots/:id/delete', async (c) => {
      try {
        await ctx.lab.deleteSnapshot(c.req.param('id'))
        return c.redirect(`${shell.href('/archive')}${noticeQuery('ok', 'Snapshot deleted.')}`, 303)
      } catch (error) {
        return refused(error, c)
      }
    })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  ctx.effect(() => shell.tab({ id: 'archive', label: 'Run archive', path: '/archive', order: 40 }))
}
