/**
 * Recovery, the first page (`/`): the workload's stats, the recovery timeline, the selected point's detail, the recent backup jobs and the restore plan with
 * its preflight and log. "Verify latest point" and "Preview restore simulation" are simulations over seeded metadata; nothing is read or restored.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type {} from '../home/index.ts'
import { DESTINATIONS, type Job, type RecoveryPoint, horizonDays, latestVerified, pointLabel, readiness, rpoMet, sizeLabel, whenLabel } from '../restorepoint/index.ts'
import { escapeHtml, fieldOf, opsErrorOf, withNotice } from '../ops-shell/index.ts'

export const name = 'recovery'
export const inject = ['router', 'ops', 'opsShell', 'home']

export function apply(ctx: Context): void {
  const shell = ctx.opsShell
  const ops = ctx.ops

  const jobStatus = (j: Job): { text: string; cls: string } => {
    if (!j.enabled) return { text: 'Paused', cls: 'muted' }
    if (j.status === 'failed') return { text: j.note ?? 'Failed', cls: 'err' }
    if (j.status === 'lag') return { text: j.note ?? 'Lagging', cls: 'warn' }
    return { text: 'Completed', cls: 'ok' }
  }
  const stateOf = (p: RecoveryPoint): { text: string; cls: string } =>
    p.integrity === 'verified' ? { text: '● Verified', cls: 'ok' } : p.integrity === 'failed' ? { text: '● Integrity check failed', cls: 'err' } : { text: '● Pending verification', cls: 'warn' }

  const pageFor = (url: string): string => {
    const sel = shell.selection(url)
    const { workload: w, point: p, scope, dest } = sel
    const now = ops.now()
    const latest = latestVerified(w)
    const n = w.points.length
    const dayOf = (iso: string) => new Date(iso).toDateString()
    const dots = w.points
      .map((pt, i) => {
        const left = n === 1 ? 50 : 7 + (i * 87) / (n - 1)
        const day = i > 0 && w.points[i - 1] !== undefined && dayOf(w.points[i - 1]?.at ?? '') === dayOf(pt.at)
        const label = day ? pointLabel(pt.at).split(' · ')[1] : pointLabel(pt.at).split(' · ')[0]
        const tag = pt.integrity === 'failed' ? 'FAILED' : pt.integrity === 'pending' ? 'PENDING' : pt.id === latest?.id ? 'LATEST' : 'VERIFIED'
        return `<a class="point${pt.id === p?.id ? ' active' : ''}${pt.integrity === 'verified' ? '' : ` ${pt.integrity}`}" style="left:${left.toFixed(0)}%" data-point="${escapeHtml(pt.id)}" href="${shell.hrefFor('/', { workload: w.id, point: pt.id, scope: scope.name, dest: dest.id })}" aria-label="${escapeHtml(pointLabel(pt.at))}, ${pt.integrity}"${pt.id === p?.id ? ' aria-current="true"' : ''}><small>${tag}</small><span>${escapeHtml(label ?? '')}</span></a>`
      })
      .join('')
    const st = p === undefined ? undefined : stateOf(p)
    const integrityRow = p === undefined ? '' : `<div class="job"><div><b>Integrity check</b><small>Checksum and catalog validation</small></div><span class="${p.integrity === 'verified' ? 'ok' : p.integrity === 'failed' ? 'err' : 'warn'}">${p.integrity === 'verified' ? 'Passed' : p.integrity === 'failed' ? 'Failed' : 'Not run'}</span></div>`
    const verifyOne = p !== undefined && p.integrity !== 'verified' ? `<form method="post" action="${shell.href('/verify')}">${shell.hidden(sel)}<input type="hidden" name="scope" value="${escapeHtml(scope.name)}"><input type="hidden" name="dest" value="${dest.id}"><button class="btn small" type="submit" id="verifyone">Verify this point</button></form>` : ''
    const pre = p === undefined ? undefined : ops.plan(w.id, p.id, scope.name, dest.id)
    const checks = pre === undefined ? '' : `<ul class="checks" id="preflight">${pre.checks.map((c) => `<li class="${c.ok ? 'yes' : 'no'}">${c.ok ? '✓' : '✗'} ${escapeHtml(c.label)} · ${escapeHtml(c.detail)}</li>`).join('')}</ul>`
    const log = w.log.map((l) => `<span class="${l.kind}">${escapeHtml(l.t)}  ${escapeHtml(l.text)}</span>`).join('<br>')
    const jobs = w.jobs.map((j) => {
      const s = jobStatus(j)
      return `<div class="job"><div>${escapeHtml(j.name)} <small>${escapeHtml(whenLabel(j.lastAt, now))} · ${escapeHtml(j.lastSize)}</small></div><span class="${s.cls}">${escapeHtml(s.text)}</span></div>`
    }).join('')
    const met = rpoMet(w)
    const main = `<header class="top"><div><div class="crumb">Protected workloads / Recovery planning</div><h1 id="worktitle">${escapeHtml(w.name)}</h1></div><div class="actions"><a class="btn" href="${shell.hrefFor('/retention', { workload: w.id })}">Retention policy</a><form method="post" action="${shell.href('/verify')}">${shell.hidden(sel)}<input type="hidden" name="scope" value="${escapeHtml(scope.name)}"><input type="hidden" name="dest" value="${dest.id}"><input type="hidden" name="latest" value="1"><button class="btn primary" id="verify" type="submit">Verify latest point</button></form></div></header>
<div class="statrow"><div class="stat"><strong>${w.successRate.toFixed(1)}%</strong><small>Backup success · 30 days</small></div><div class="stat"><strong>${String(w.rpoMin >= 60 && w.rpoMin % 60 === 0 ? `${String(w.rpoMin / 60)} hr` : `${String(w.rpoMin)} min`)}</strong><small>Configured RPO target · <span class="${met ? 'ok' : 'warn'}" id="rpo">${met ? 'met by the schedule' : 'at risk: schedule paused'}</span></small></div><div class="stat"><strong>${w.recoveryHours.toFixed(1)} hr</strong><small>Estimated recovery window</small></div></div>
<div class="grid"><section><div class="panel"><h2>Recovery timeline</h2><div class="sub">Select a recovery point to inspect snapshot status and restore scope.</div><div class="timeline"><div class="track">${dots}</div></div>${p === undefined || st === undefined ? '<div class="empty-note">No recovery points yet.</div>' : `<div class="job"><div><b id="pointname">${escapeHtml(pointLabel(p.at))}</b><small>${p.kind === 'log' ? 'Log capture' : p.kind === 'full' ? 'Full snapshot' : 'Incremental snapshot'} · ${escapeHtml(sizeLabel(p.sizeGb))}</small></div><span class="${st.cls}" id="pointstate">${st.text}</span></div>${integrityRow}`}<div class="job"><div><b>Retention</b><small>${String(w.retention.daily)} daily · ${String(w.retention.weekly)} weekly · ${String(w.retention.monthly)} monthly (${String(horizonDays(w.retention))} days)</small></div><span>Active</span></div>${verifyOne}</div>
<div class="panel"><h2>Recent backup jobs</h2>${jobs}</div></section>
<aside><div class="panel"><h2>Restore plan</h2><div class="sub">Preview the intended recovery before starting.</div><form class="restore" method="post" action="${shell.href('/restore')}">${shell.hidden(sel)}<div class="field"><label>Recovery point</label><span id="restorepoint">${p === undefined ? 'none' : `${escapeHtml(pointLabel(p.at))} / ${p.integrity === 'verified' ? 'Verified' : p.integrity === 'failed' ? 'Failed' : 'Pending'}`}</span></div><div class="field"><label for="scope">Restore scope</label><select id="scope" name="scope">${w.scopes.map((s) => `<option${s.name === scope.name ? ' selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}</select></div><div class="field"><label for="dest">Destination</label><select id="dest" name="dest">${DESTINATIONS.map((d) => `<option value="${d.id}"${d.id === dest.id ? ' selected' : ''}>${escapeHtml(d.name)}</option>`).join('')}</select></div><div class="field"><label>Pre-restore validation</label>${checks}</div><button class="restorebtn" id="restore" type="submit"${p === undefined ? ' disabled' : ''}>Preview restore simulation</button></form><div class="log" id="log" role="log">${log === '' ? 'No activity yet.' : log}</div>${shell.notice(url)}<div class="note">Demo only. No data is copied, changed or restored. Real recovery requires independent validation and approved execution controls.</div></div></aside></div>`
    return shell.page({ title: w.name, main, url, current: 'recovery' })
  }

  const back = (sel: ReturnType<typeof shell.fromBody>, pointId?: string): string => shell.hrefFor('/', { workload: sel.workload.id, point: pointId ?? sel.point?.id, scope: sel.scope.name, dest: sel.dest.id })
  const app = new Acryl()
    .get('/', (c) => c.html(pageFor(c.req.url)))
    .post('/verify', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      const sel = shell.fromBody(body)
      try {
        const r = await ops.verify(sel.workload.id, fieldOf(body, 'latest') === '1' ? undefined : sel.point?.id)
        const to = back(sel, r.point.id)
        return r.ok ? c.redirect(withNotice(to, 'ok', `${pointLabel(r.point.at)} verified in the local simulation.`), 303) : c.redirect(withNotice(to, 'error', `Verification failed for ${pointLabel(r.point.at)}: ${r.point.fault ?? 'checksum mismatch'}. The point is not a usable recovery point.`), 303)
      } catch (error) {
        const refusal = opsErrorOf(error)
        if (refusal === undefined) throw error
        return c.redirect(withNotice(back(sel), 'error', refusal.message), 303)
      }
    })
    .post('/restore', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      const sel = shell.fromBody(body)
      const scope = sel.workload.scopes.find((s) => s.name === fieldOf(body, 'scope')) ?? sel.scope
      const dest = DESTINATIONS.find((d) => d.id === fieldOf(body, 'dest')) ?? sel.dest
      const to = shell.hrefFor('/', { workload: sel.workload.id, point: sel.point?.id, scope: scope.name, dest: dest.id })
      try {
        if (sel.point === undefined) throw new Error('no point')
        const run = await ops.restore(sel.workload.id, sel.point.id, scope.name, dest.id)
        return run.result === 'simulated' ? c.redirect(withNotice(to, 'ok', 'Restore preview completed. No data was modified.'), 303) : c.redirect(withNotice(to, 'error', `Restore preview blocked: ${run.reason ?? 'a preflight check failed'}. No data was modified.`), 303)
      } catch (error) {
        const refusal = opsErrorOf(error)
        if (refusal === undefined) return c.redirect(withNotice(to, 'error', 'This workload has no recovery point to restore from.'), 303)
        return c.redirect(withNotice(to, 'error', refusal.message), 303)
      }
    })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  if (shell.prefix !== '') ctx.router.route('/', new Acryl().get(`${shell.prefix}/`, (c) => c.html(pageFor(c.req.url))))
  ctx.effect(() =>
    ctx.home.widget({
      id: 'recovery',
      title: 'Recovery readiness',
      render: () => {
        const r = readiness(ops.state)
        return `<p><b>${String(r.ready)}</b> of ${String(r.total)} workloads have a verified recovery point</p>`
      },
    }),
  )
}
