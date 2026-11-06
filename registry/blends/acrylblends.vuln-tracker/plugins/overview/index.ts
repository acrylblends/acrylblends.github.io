/**
 * The vulnerability overview: the metrics, the prioritized table and the finding inspector, with the remediation actions that keep the audit trail.
 * It also answers /findings and /findings/:id (the same page with that finding selected).
 *
 * Routes: GET /, GET /findings?severity&status&q&asset&finding, GET /findings/:id,
 * POST /findings/:id/assign, /findings/:id/start, /findings/:id/accept, /findings/:id/evidence.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import {
  type Finding,
  type FindingStatus,
  isOpen,
  SEVERITIES,
  type Severity,
  shortDate,
  STATUSES,
  whenText,
} from '../vulns/index.ts'

export const name = 'overview'
export const inject = ['vulns', 'shell', 'router']

const STATUS_LABEL: Readonly<Record<FindingStatus, string>> = {
  open: 'Open',
  assigned: 'Assigned',
  in_progress: 'In progress',
  remediated: 'Remediated',
  accepted: 'Accepted risk',
}
const SEVERITY_LABEL: Readonly<Record<Severity, string>> = { critical: 'CRITICAL', high: 'HIGH', medium: 'MEDIUM', low: 'LOW' }

const query = (parts: Record<string, string | undefined>): string => {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(parts)) if (value !== undefined && value !== '') search.set(key, value)
  const text = search.toString()
  return text === '' ? '' : `?${text}`
}

export function apply(ctx: Context): void {
  const { vulns, shell } = ctx
  const e = shell.e
  const prefix = shell.prefix

  const page = (read: (name: string) => string | undefined, url: string, requested?: string): string => {
    const severityText = read('severity')
    const severity = SEVERITIES.includes(severityText as Severity) ? (severityText as Severity) : undefined
    const statusText = read('status')
    const status = STATUSES.includes(statusText as FindingStatus) ? (statusText as FindingStatus) : undefined
    const q = (read('q') ?? '').slice(0, 120)
    const asset = read('asset')
    const list = vulns.findings({ ...(severity === undefined ? {} : { severity }), ...(status === undefined ? {} : { status }), q, ...(asset === undefined || asset === '' ? {} : { assetId: asset }) })
    const selected = (requested === undefined ? undefined : vulns.finding(requested)) ?? (read('finding') === undefined ? undefined : vulns.finding(read('finding') as string)) ?? list[0]
    const stats = vulns.stats()
    const keep = { severity, status, q: q === '' ? undefined : q, asset: asset === undefined || asset === '' ? undefined : asset }
    const rows = list.map((finding) => {
      const target = vulns.asset(finding.assetId)
      return `<tr data-vuln><td><a href="${shell.href(`/findings/${encodeURIComponent(finding.id)}${query(keep)}`)}"><strong>${e(finding.title)}</strong></a><small>${e(finding.cve)} · fixture CVE</small></td><td>${e(target?.name ?? '')}<small>${e(target?.environment ?? '')} / ${e(target?.platform ?? '')}</small></td><td><span class="sev ${finding.severity}">${SEVERITY_LABEL[finding.severity]}</span></td><td>${finding.cvss.toFixed(1)}</td><td>${e(shortDate(finding.dueDate))}</td><td class="status">${STATUS_LABEL[finding.status]}</td></tr>`
    }).join('')
    const selectedAsset = selected === undefined ? undefined : vulns.asset(selected.assetId)
    const events = selected === undefined ? [] : vulns.eventsOf(selected.id)
    const inspector = selected === undefined
      ? '<aside class="panel right"><div class="eyebrow">FINDING INSPECTOR</div><p class="empty">No finding matches. Clear the filters to see the seeded findings.</p></aside>'
      : `<aside class="panel right"><div class="eyebrow">FINDING INSPECTOR</div><h3>${e(selected.title)}</h3><p>${e(selected.cve)} · fixture CVE · selected finding</p><div class="riskbar"><i style="width:${String(selected.cvss * 10)}%"></i></div><div class="asset"><small>RISK SCORE</small><b>${selected.cvss.toFixed(1)} / 10 · ${SEVERITY_LABEL[selected.severity].toLowerCase()}</b></div><div class="asset"><small>AFFECTED ASSET</small><b>${e(selectedAsset?.name ?? '')}</b><small>${e(selectedAsset?.environment ?? '')} environment</small></div><div class="asset"><small>AFFECTED / FIXED VERSION</small><b>${e(selected.affectedVersion)} → ${e(selected.fixedVersion)}</b><small>Due ${e(shortDate(selected.dueDate))}</small></div><div class="asset"><small>REMEDIATION OWNER</small><b>${e(selected.ownerId ?? 'Unassigned')}</b><small>${e(selectedAsset?.owner ?? '')} owns the asset</small></div><div class="asset"><small>RECOMMENDED ACTIONS</small><div class="tag">Upgrade package</div><div class="tag">Rebuild image</div><div class="tag">Verify exposure</div></div><div class="asset"><small>REMEDIATION CHECKLIST</small><ul class="checklist">${selected.checklist.map((item) => `<li class="${item.done ? 'done' : ''}">${item.done ? '✓' : '○'} ${e(item.label)}</li>`).join('')}</ul></div><div class="asset"><small>STATUS · ${STATUS_LABEL[selected.status].toUpperCase()}</small><p class="note">${e(selected.remediationNotes)}</p>${selected.evidence === '' ? '' : `<p class="note"><b>Evidence:</b> ${e(selected.evidence)}</p>`}</div><div class="detail"><small class="eyebrow">VERIFICATION RECORD</small>${events.map((event) => `<p class="note">${e(event.action)} · ${e(whenText(event.timestamp, vulns.now))}<br>${e(event.note)}</p>`).join('') || '<p class="note">No events yet.</p>'}</div>${isOpen(selected.status) ? `<div class="detail"><form method="post" action="${shell.href(`/findings/${encodeURIComponent(selected.id)}/assign`)}"><input type="hidden" name="back" value="${e(url)}"><label class="eyebrow" for="owner">ASSIGN OWNER</label><select id="owner" name="owner" class="evidence" onchange="this.form.submit()">${vulns.owners().map((owner) => `<option${owner === selected.ownerId ? ' selected' : ''}>${e(owner)}</option>`).join('')}</select><noscript><button>Assign</button></noscript></form><form method="post" action="${shell.href(`/findings/${encodeURIComponent(selected.id)}/start`)}"><input type="hidden" name="back" value="${e(url)}"><button style="margin-top:8px;background:#1b2a3a;color:#c7d5e5;border:1px solid #33485f;border-radius:4px;padding:8px;width:100%;font-size:8px">Start remediation</button></form><form method="post" action="${shell.href(`/findings/${encodeURIComponent(selected.id)}/evidence`)}"><input type="hidden" name="back" value="${e(url)}"><input class="evidence" name="evidence" placeholder="Verification evidence (patch, test, scan ref)" aria-label="Verification evidence"><button style="margin-top:8px;background:#f56c53;color:#1b1110;border:0;border-radius:4px;padding:9px;width:100%;font-size:8px;font-weight:750">Record verified remediation</button></form><form method="post" action="${shell.href(`/findings/${encodeURIComponent(selected.id)}/accept`)}"><input type="hidden" name="back" value="${e(url)}"><input class="evidence" name="note" placeholder="Why is the risk accepted?" aria-label="Acceptance note"><button style="margin-top:8px;background:#1b2a3a;color:#c7d5e5;border:1px solid #33485f;border-radius:4px;padding:8px;width:100%;font-size:8px">Accept risk</button></form><p class="note">Demo workflow only. A production scanner and ticketing integration must be connected separately; a finding is remediated only with the evidence recorded here.</p></div>` : `<div class="detail"><small class="eyebrow">AUDIT TRAIL</small>${events.map((event) => `<p class="note">${e(event.action)} · ${e(whenText(event.timestamp, vulns.now))}<br>${e(event.note)}</p>`).join('')}</div>`}</aside>`
    const filter = (label: string, value: Severity | undefined): string => `<a href="${shell.href(`/findings${query({ severity: value, status, q: keep.q, asset: keep.asset })}`)}"><button class="${severity === value ? 'sel' : ''}" type="button">${label}</button></a>`
    const main = `${shell.notice(url)}<div class="top"><div><div class="eyebrow">SECURITY POSTURE / OVERVIEW</div><h1>Vulnerability overview</h1><div class="sub">Findings across registered assets · Snapshot 04 Nov 2026, 14:32 UTC · fixture data</div></div><div class="actions"><a class="btn" href="${shell.href('/export.json')}">↓ Export</a><button class="btn hot" type="button" data-toast="Demo scan is fixture data only; no network is scanned">＋ Run demo scan</button></div></div><section class="metrics"><article class="metric"><label>OPEN FINDINGS</label><strong>${String(stats.open)}</strong><small><em>+${String(stats.openedThisWeek)} this week</em> across ${String(stats.trackedAssets)} assets</small></article><article class="metric"><label>CRITICAL</label><strong style="color:#ff887b">${String(stats.critical).padStart(2, '0')}</strong><small>${String(stats.overdue)} overdue for remediation</small></article><article class="metric"><label>FIXED THIS MONTH</label><strong style="color:#81d5b1">${String(stats.fixedThisMonth).padStart(2, '0')}</strong><small>${stats.velocity >= 0 ? '↑' : '↓'} ${String(Math.abs(stats.velocity))}% versus October</small></article><article class="metric"><label>ASSETS AT RISK</label><strong>${String(stats.assetsAtRisk).padStart(2, '0')}</strong><small>Out of ${String(stats.trackedAssets)} tracked assets</small></article></section><div class="content"><section class="panel tablewrap"><div class="ph"><div><h2>Prioritized vulnerabilities</h2><small>Sort by risk score · Select a row to inspect</small></div><div class="spacer"></div><div class="filters" id="filters">${filter('All', undefined)}${filter('Critical', 'critical')}${filter('High', 'high')}${filter('Medium', 'medium')}</div><form method="get" action="${shell.href('/findings')}" class="tablefilters">${keep.severity === undefined ? '' : `<input type="hidden" name="severity" value="${e(keep.severity)}">`}<input name="q" value="${e(q)}" placeholder="Search CVE, title or asset" aria-label="Search findings"><select name="status" aria-label="Filter by status" onchange="this.form.submit()"><option value="">All statuses</option>${STATUSES.map((value) => `<option value="${value}"${status === value ? ' selected' : ''}>${STATUS_LABEL[value]}</option>`).join('')}</select></form></div><table><thead><tr><th>FINDING / CVE</th><th>ASSET</th><th>SEVERITY</th><th>CVSS</th><th>FIX BY</th><th>STATUS</th></tr></thead><tbody>${rows === '' ? '<tr><td colspan="6"><p class="empty">No findings match. <a href="/findings">Clear the filters</a>.</p></td></tr>' : rows}</tbody></table></section>${inspector}</div>`
    return shell.page({ active: 'overview', title: 'Vulnerability overview', main })
  }

  const app = new Acryl()
    .get('/', (c) => c.html(page((name) => c.req.query(name), c.req.url)))
    .get('/findings', (c) => c.html(page((name) => c.req.query(name), c.req.url)))
    .get('/findings/:id', (c) => {
      if (vulns.finding(c.req.param('id')) === undefined) return c.redirect(shell.url('/findings', { kind: 'error', text: 'That finding no longer exists.' }), 303)
      return c.html(page((name) => c.req.query(name), c.req.url, c.req.param('id')))
    })
    .post('/findings/:id/assign', async (c) => {
      const form = await c.req.parseBody()
      const id = c.req.param('id')
      const backUrl = shell.back(form.back, `/findings/${encodeURIComponent(id)}`)
      try {
        await vulns.assign(id, String(form.owner ?? ''))
        return c.redirect(shell.url(backUrl, { kind: 'ok', text: 'Owner assigned.' }), 303)
      } catch (error) {
        return c.redirect(shell.url(backUrl, { kind: 'error', text: (error as Error).message }), 303)
      }
    })
    .post('/findings/:id/start', async (c) => {
      const form = await c.req.parseBody()
      const id = c.req.param('id')
      const backUrl = shell.back(form.back, `/findings/${encodeURIComponent(id)}`)
      try {
        await vulns.start(id)
        return c.redirect(shell.url(backUrl, { kind: 'ok', text: 'Remediation started.' }), 303)
      } catch (error) {
        return c.redirect(shell.url(backUrl, { kind: 'error', text: (error as Error).message }), 303)
      }
    })
    .post('/findings/:id/accept', async (c) => {
      const form = await c.req.parseBody()
      const id = c.req.param('id')
      const backUrl = shell.back(form.back, `/findings/${encodeURIComponent(id)}`)
      try {
        await vulns.accept(id, String(form.note ?? ''))
        return c.redirect(shell.url(backUrl, { kind: 'ok', text: 'The risk is accepted and recorded.' }), 303)
      } catch (error) {
        return c.redirect(shell.url(backUrl, { kind: 'error', text: (error as Error).message }), 303)
      }
    })
    .post('/findings/:id/evidence', async (c) => {
      const form = await c.req.parseBody()
      const id = c.req.param('id')
      const backUrl = shell.back(form.back, `/findings/${encodeURIComponent(id)}`)
      try {
        await vulns.remediate(id, String(form.evidence ?? ''))
        return c.redirect(shell.url(backUrl, { kind: 'ok', text: 'Remediation verified and recorded.' }), 303)
      } catch (error) {
        return c.redirect(shell.url(backUrl, { kind: 'error', text: (error as Error).message }), 303)
      }
    })

  ctx.router.route(prefix === '' ? '/' : prefix, app)
  ctx.effect(() => shell.nav({ id: 'overview', label: 'Overview', icon: '◈', path: '/', order: 10, count: () => vulns.stats().open }))
  ctx.effect(() => shell.nav({ id: 'findings', label: 'Vulnerabilities', icon: '⚑', path: '/findings', order: 30 }))
}
