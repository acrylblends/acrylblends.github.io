/** Reports: the severity and status distribution at `/reports`, with the JSON record and the findings CSV at `/export.json` and `/export.csv`. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { isOpen, SEVERITIES, STATUSES, type Vulns } from '../vulns/index.ts'

export const name = 'reports'
export const inject = ['vulns', 'shell', 'router']

export function apply(ctx: Context): void {
  const { vulns, shell } = ctx
  const e = shell.e
  const prefix = shell.prefix

  const app = new Acryl()
    .get('/reports', (c) => {
      const stats = vulns.stats()
      const findings = vulns.findings()
      const open = findings.filter((finding) => isOpen(finding.status))
      const severityRows = SEVERITIES.map((severity) => {
        const rows = open.filter((finding) => finding.severity === severity)
        return `<tr><td><span class="sev ${severity}">${severity.toUpperCase()}</span></td><td>${String(rows.length)}</td><td>${rows.filter((finding) => finding.dueDate < '2026-11-06').length}</td><td>${rows.reduce((sum, finding) => sum + finding.cvss, 0).toFixed(1)}</td></tr>`
      }).join('')
      const statusRows = STATUSES.map((status) => {
        const rows = findings.filter((finding) => finding.status === status)
        return `<tr><td>${e(status.replace('_', ' '))}</td><td>${String(rows.length)}</td></tr>`
      }).join('')
      const risky = vulns
        .assets()
        .map((asset) => ({ asset, open: open.filter((finding) => finding.assetId === asset.id) }))
        .filter((row) => row.open.some((finding) => finding.severity === 'critical' || finding.severity === 'high'))
        .map((row) => `<tr><td><a href="${shell.href(`/assets`)}"><strong>${e(row.asset.name)}</strong></a><small>${e(row.asset.environment)} · ${e(row.asset.owner)}</small></td><td>${String(row.open.length)}</td><td>${e(row.open[0]?.severity ?? '')}</td></tr>`)
        .join('')
      const main = `${shell.notice(c.req.url)}<div class="top"><div><div class="eyebrow">SECURITY POSTURE / REPORTS</div><h1>Reports</h1><div class="sub">${String(stats.open)} open findings · ${String(stats.assetsAtRisk)} assets at risk · fixture data</div></div><div class="actions"><a class="btn" href="${shell.href('/export.json')}">↓ JSON</a><a class="btn" href="${shell.href('/export.csv')}">↓ CSV</a></div></div><div class="content" style="margin-top:15px"><section class="panel"><div class="ph"><div><h2>Open findings by severity</h2><small>Count, overdue and total CVSS</small></div></div><table><thead><tr><th>SEVERITY</th><th>OPEN</th><th>OVERDUE</th><th>CVSS TOTAL</th></tr></thead><tbody>${severityRows}</tbody></table></section><aside class="panel right"><div class="eyebrow">STATUS</div><h3>Lifecycle</h3><table><thead><tr><th>STATUS</th><th>FINDINGS</th></tr></thead><tbody>${statusRows}</tbody></table></aside></div><section class="panel" style="margin-top:13px"><div class="ph"><div><h2>Assets at risk</h2><small>Open critical or high findings</small></div></div><table><thead><tr><th>ASSET</th><th>OPEN</th><th>WORST</th></tr></thead><tbody>${risky}</tbody></table></section>`
      return c.html(shell.page({ active: 'reports', title: 'Reports', main }))
    })
    .get('/export.json', (c) => {
      c.header('content-disposition', 'attachment; filename="sentinel-findings.json"')
      return c.json({ generatedAt: vulns.now.toISOString(), assets: vulns.assets(), findings: vulns.findings(), events: vulns.allEvents(), stats: vulns.stats() })
    })
    .get('/export.csv', (c) => {
      const escape = (value: string): string => (/[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value)
      const rows = ['finding_id,cve,title,asset,severity,cvss,status,due_date,owner,evidence']
      for (const finding of vulns.findings()) {
        const asset = vulns.asset(finding.assetId)
        rows.push(
          [finding.id, finding.cve, finding.title, asset?.name ?? '', finding.severity, finding.cvss.toFixed(1), finding.status, finding.dueDate, finding.ownerId ?? '', finding.evidence]
            .map((value) => escape(String(value)))
            .join(','),
        )
      }
      return c.body(`${rows.join('\n')}\n`, 200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="sentinel-findings.csv"' })
    })

  ctx.router.route(prefix === '' ? '/' : prefix, app)
  ctx.effect(() => shell.nav({ id: 'reports', label: 'Reports', icon: '▤', path: '/reports', order: 50 }))
}
