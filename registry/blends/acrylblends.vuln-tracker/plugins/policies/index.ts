/** Policies: the vulnerability-management policy at `/policies` - the SLA by severity and the evidence rule the console enforces. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'

export const name = 'policies'
export const inject = ['vulns', 'shell', 'router']

const SLA: readonly { severity: string; acknowledge: string; remediate: string }[] = [
  { severity: 'critical', acknowledge: '4 hours', remediate: '3 days' },
  { severity: 'high', acknowledge: '1 day', remediate: '7 days' },
  { severity: 'medium', acknowledge: '3 days', remediate: '30 days' },
  { severity: 'low', acknowledge: '10 days', remediate: '90 days' },
]

export function apply(ctx: Context): void {
  const { vulns, shell } = ctx
  const e = shell.e
  const prefix = shell.prefix
  const rows = SLA.map((row) => `<tr><td><span class="sev ${row.severity}">${row.severity.toUpperCase()}</span></td><td>${e(row.acknowledge)}</td><td>${e(row.remediate)}</td></tr>`).join('')
  const main = `<div class="top"><div><div class="eyebrow">SECURITY POSTURE / POLICIES</div><h1>Policies</h1><div class="sub">The rules this console enforces on the fixture data</div></div></div><section class="panel" style="margin-top:15px"><div class="ph"><div><h2>Remediation windows</h2><small>By CVSS severity</small></div></div><table><thead><tr><th>SEVERITY</th><th>ACKNOWLEDGE</th><th>REMEDIATE</th></tr></thead><tbody>${rows}</tbody></table></section><section class="panel" style="margin-top:13px"><div class="ph"><div><h2>Verification rule</h2><small>Enforced by the console, not just written down</small></div></div><div class="right"><p>A finding can only be marked remediated with a verification record: a patch reference, a test or a scan id. The evidence is stored with the finding and appended to its audit trail; without it the transition is refused.</p><p>Accepted risk is a separate, recorded decision with its own note. It never counts as a fix.</p><p class="note">Fixture data only. This demo does not scan networks or contact external scanners.</p></div></section>`
  const app = new Acryl().get('/policies', (c) => c.html(shell.page({ active: 'policies', title: 'Policies', main })))
  ctx.router.route(prefix === '' ? '/' : prefix, app)
  ctx.effect(() => shell.nav({ id: 'policies', label: 'Policies', icon: '⚙', path: '/policies', order: 60 }))
}
