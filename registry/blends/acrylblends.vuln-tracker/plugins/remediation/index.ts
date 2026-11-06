/** Remediation: the console-wide audit trail at `/remediation`, newest first, with an action filter and the finding each event belongs to. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { stampText, type Vulns } from '../vulns/index.ts'

export const name = 'remediation'
export const inject = ['vulns', 'shell', 'router']

export function apply(ctx: Context): void {
  const { vulns, shell } = ctx
  const e = shell.e
  const prefix = shell.prefix

  const app = new Acryl().get('/remediation', (c) => {
    const action = (c.req.query('action') ?? '').slice(0, 40)
    const events = vulns
      .allEvents()
      .filter((event) => action === '' || event.action === action)
      .slice(0, 80)
    const rows = events
      .map((event) => {
        const finding = vulns.finding(event.findingId)
        return `<tr><td><a href="${shell.href(`/findings/${encodeURIComponent(event.findingId)}`)}"><strong>${e(event.action)}</strong></a><small>${e(finding?.title ?? 'Finding')} · ${e(finding?.cve ?? '')}</small></td><td>${e(event.actor)}</td><td>${e(stampText(event.timestamp))}</td><td>${e(event.note)}</td></tr>`
      })
      .join('')
    const actions = ['', 'opened', 'assigned', 'in_progress', 'remediated', 'accepted']
    const filters = actions
      .map((value) => `<a href="${shell.href('/remediation')}${value === '' ? '' : `?action=${encodeURIComponent(value)}`}"><button class="${action === value ? 'sel' : ''}" type="button">${value === '' ? 'All' : e(value)}</button></a>`)
      .join('')
    const main = `${shell.notice(c.req.url)}<div class="top"><div><div class="eyebrow">SECURITY POSTURE / REMEDIATION</div><h1>Remediation trail</h1><div class="sub">${String(vulns.allEvents().length)} recorded events · append-only in this demo</div></div><div class="actions"><a class="btn" href="${shell.href('/findings')}">All findings</a></div></div><section class="panel tablewrap" style="margin-top:15px"><div class="ph"><div><h2>Audit trail</h2><small>Newest first · every state change keeps its note</small></div><div class="spacer"></div><div class="filters">${filters}</div></div><table><thead><tr><th>ACTION / FINDING</th><th>ACTOR</th><th>WHEN</th><th>NOTE</th></tr></thead><tbody>${rows === '' ? '<tr><td colspan="4"><p class="empty">No events match.</p></td></tr>' : rows}</tbody></table></section>`
    return c.html(shell.page({ active: 'remediation', title: 'Remediation trail', main }))
  })

  ctx.router.route(prefix === '' ? '/' : prefix, app)
  ctx.effect(() => shell.nav({ id: 'remediation', label: 'Remediation', icon: '◷', path: '/remediation', order: 40 }))
}
