/** Experience summary at `/experience`: hours by aircraft class, role, day/night and period. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { hoursText, type Logbook } from '../logbook/index.ts'
import type { Shell } from '../logbook-shell/index.ts'

export const name = 'experience'
export const inject = ['logbook', 'shell', 'router']

export function apply(ctx: Context): void {
  const { logbook, shell } = ctx
  const e = shell.e
  const prefix = shell.prefix

  const app = new Acryl().get('/experience', (c) => {
    const experience = logbook.experience()
    const stats = logbook.stats()
    const bars = (rows: readonly { label: string; minutes: number; flights?: number }[]): string => {
      const max = Math.max(1, ...rows.map((row) => row.minutes))
      return rows.map((row) => `<div class="ref"><span>${e(row.label)}${row.flights === undefined ? '' : ` · ${String(row.flights)} flights`}</span><div class="bar"><i style="width:${String(Math.round((row.minutes / max) * 100))}%"></i></div><b>${hoursText(row.minutes)}</b></div>`).join('')
    }
    const main = `${shell.notice(c.req.url)}<div class="hero"><div><small>PILOT RECORDS / EXPERIENCE SUMMARY</small><h1>Experience summary</h1><p>Hours by aircraft class, role, day and night and period · demo data.</p></div><a class="btn" href="${shell.href('/')}">Back to the logbook</a></div><section class="stats"><article class="stat"><small>TOTAL TIME</small><strong>${hoursText(stats.totalMinutes)}</strong><span>All logged flights</span></article><article class="stat"><small>THIS YEAR</small><strong>${hoursText(stats.yearMinutes)}</strong><span>${String(stats.yearFlights)} flights</span></article><article class="stat"><small>PIC</small><strong>${hoursText(stats.picMinutes)}</strong><span>Command time</span></article><article class="stat"><small>LAST 90 DAYS</small><strong>${hoursText(stats.last90Minutes)}</strong><span>Currency window</span></article></section><div class="grid" style="grid-template-columns:1fr 1fr"><section class="panel"><div class="ph"><div><h2>By aircraft class</h2><small>SEP and MEP hours</small></div></div><div class="referrers">${bars(experience.classes)}</div></section><section class="panel"><div class="ph"><div><h2>By role</h2><small>PIC, dual and instructor</small></div></div><div class="referrers">${bars(experience.roles)}</div></section><section class="panel"><div class="ph"><div><h2>Day and night</h2><small>Logged conditions</small></div></div><div class="referrers">${bars(experience.dayNight)}</div></section><section class="panel"><div class="ph"><div><h2>Period</h2><small>All time and the current year</small></div></div><div class="referrers">${bars([{ label: 'All time', minutes: stats.totalMinutes }, { label: 'This year', minutes: stats.yearMinutes }, { label: 'Last 90 days', minutes: stats.last90Minutes }])}</div></section></div><p style="font-size:8px;color:#83959c;margin-top:12px">Informational sample data only. These summaries do not certify legal privileges or recency.</p>`
    return c.html(shell.page({ active: 'experience', title: 'Experience summary', main }))
  })

  ctx.router.route(prefix === '' ? '/' : prefix, app)
  ctx.effect(() => shell.nav({ id: 'experience', label: 'Experience', icon: '', path: '/experience', order: 20 }))
}
