/** The logbook at `/`: pilot summary, hour totals, the flight table with aircraft/role filters and the selected flight's route card. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { dateLabel, hoursText, type Flight, type Logbook, shortDate } from '../logbook/index.ts'
import type { Shell } from '../logbook-shell/index.ts'

export const name = 'overview'
export const inject = ['logbook', 'shell', 'router']

function routeArt(flight: Flight): string {
  return `<svg viewBox="0 0 400 175"><defs><pattern id="g" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#d1dce2" stroke-width="1"/></pattern></defs><rect width="400" height="175" fill="#e9f0f3"/><rect width="400" height="175" fill="url(#g)"/><path d="M42 128Q105 80 153 106T259 65T360 43" fill="none" stroke="#6a9eb9" stroke-width="3" stroke-dasharray="6 5"/><circle cx="42" cy="128" r="6" fill="#173f61" stroke="#fff" stroke-width="3"/><circle cx="360" cy="43" r="6" fill="#d08e44" stroke="#fff" stroke-width="3"/><g fill="#6d8798" font-size="9" font-family="monospace"><text x="20" y="148">${flight.departure}</text><text x="330" y="29">${flight.arrival}</text><text x="145" y="55">ROUTE / TRACK</text></g></svg>`
}

export function apply(ctx: Context): void {
  const { logbook, shell } = ctx
  const e = shell.e
  const prefix = shell.prefix

  const app = new Acryl().get('/', (c) => {
    const stats = logbook.stats()
    const aircraftId = c.req.query('aircraft')
    const role = c.req.query('role')
    const filtered = logbook.flights({ ...(aircraftId === undefined || aircraftId === '' ? {} : { aircraftId }), ...(role === undefined || role === '' ? {} : { role }) })
    const list = filtered.filter((flight) => flight.status === 'logged')
    const selected = logbook.flight(c.req.query('flight') ?? '') ?? list[0] ?? logbook.flights().find((flight) => flight.status === 'logged')
    const draft = logbook.flights().find((flight) => flight.status === 'draft')
    const pilot = logbook.pilot()
    const rows = list
      .slice(0, 6)
      .map((flight) => {
        const aircraft = logbook.aircraftOf(flight.aircraftId)
        return `<tr class="${flight.id === selected?.id ? 'selected' : ''}"><td>${e(dateLabel(flight.date).toUpperCase())}</td><td class="route"><a href="${shell.href(`/?flight=${encodeURIComponent(flight.id)}`)}">${e(flight.departure)} → ${e(flight.arrival)}</a></td><td><b>${e(aircraft?.type ?? '')}</b><small style="display:block;color:#98a6af">${e(aircraft?.registration ?? '')}</small></td><td>${e(flight.role)}</td><td><b>${hoursText(flight.durationMinutes)}</b></td></tr>`
      })
      .join('')
    const filters = `<form method="get" action="${shell.href('/')}" style="display:flex;gap:6px;margin:0"><select name="aircraft" aria-label="Filter by aircraft" onchange="this.form.submit()"><option value="">All aircraft</option>${logbook.aircraft().map((aircraft) => `<option value="${e(aircraft.id)}"${aircraft.id === aircraftId ? ' selected' : ''}>${e(aircraft.type)} ${e(aircraft.registration)}</option>`).join('')}</select><select name="role" aria-label="Filter by role" onchange="this.form.submit()"><option value="">All roles</option>${['PIC', 'Dual', 'Instructor'].map((value) => `<option value="${value}"${value === role ? ' selected' : ''}>${value}</option>`).join('')}</select></form>`
    const detail = selected === undefined
      ? '<aside class="panel"><p class="empty">No flight selected.</p></aside>'
      : `<aside class="panel"><div class="ph"><div><h2>Flight detail</h2><small>${e(dateLabel(selected.date))} · ${e(selected.departure)} → ${e(selected.arrival)}</small></div><a class="ph" href="${shell.href(`/flights/${encodeURIComponent(selected.id)}`)}" style="font-size:8px;color:#38708f">Open ↗</a></div><div class="logdetail"><h3>${e(selected.departure)} → ${e(selected.arrival)}</h3><div class="muted">${e(selected.departure)} · ${e(logbook.aircraftOf(selected.aircraftId)?.type ?? '')} &nbsp; → &nbsp; ${e(selected.arrival)} · ${e(logbook.aircraftOf(selected.aircraftId)?.registration ?? '')}</div><div class="routecard">${routeArt(selected)}</div><div class="routeinfo"><div><small>BLOCK TIME</small><b>${hoursText(selected.durationMinutes)}</b></div><div><small>LANDINGS</small><b>${String(selected.landings).padStart(2, '0')}</b></div><div><small>ROLE</small><b>${e(selected.role)}</b></div></div><div class="detailrow"><span>Aircraft</span><b>${e(logbook.aircraftOf(selected.aircraftId)?.type ?? '')} · ${e(logbook.aircraftOf(selected.aircraftId)?.registration ?? '')}</b></div><div class="detailrow"><span>Day / Night</span><b>${e(selected.dayNight)}</b></div><div class="detailrow"><span>Takeoff / Landing</span><b>${e(selected.takeoffTime)} / ${e(selected.landingTime)}</b></div><div class="curr">Currency status is informational sample data only. Actual pilot privileges and recency must be checked against official records and applicable rules.</div><div class="actions"><a href="${shell.href('/export.csv')}" style="flex:1;background:#183e5e;color:#fff;padding:9px;border-radius:4px;font-size:8px;text-align:center">Export CSV ↓</a><a href="${shell.href(`/flights/${encodeURIComponent(selected.id)}`)}" style="flex:1;background:#e9f0f4;color:#365b74;border:1px solid #d4e0e7;padding:9px;border-radius:4px;font-size:8px;text-align:center">Open record</a></div></div></aside>`
    const main = `${shell.notice(c.req.url)}<div class="hero"><div><small>PERSONAL FLIGHT RECORD / ${String(logbook.now.getUTCFullYear())}</small><h1>Flight logbook</h1><p>Flight history, currency checks and experience by aircraft class.</p></div><div class="pilot"><i>MC</i><div><b style="display:block;color:#2c465b">${e(pilot.name)}</b>Private pilot · ${e(pilot.licenceType)}</div></div></div><section class="stats"><article class="stat"><small>TOTAL FLIGHT TIME</small><strong>${hoursText(stats.totalMinutes)}</strong><span>All-time logged</span></article><article class="stat"><small>THIS YEAR</small><strong>${hoursText(stats.yearMinutes)}</strong><span>${String(stats.yearFlights)} flights</span></article><article class="stat"><small>PIC HOURS</small><strong>${hoursText(stats.picMinutes)}</strong><span>${stats.totalMinutes === 0 ? '0' : String(Math.round((stats.picMinutes / stats.totalMinutes) * 100))}% of total time</span></article><article class="stat"><small>LAST 90 DAYS</small><strong>${hoursText(stats.last90Minutes)}</strong><span>Currency period</span></article><article class="stat"><small>NEXT CHECK</small><strong style="font-size:18px">${stats.nextCheck === undefined ? '—' : e(shortDate(stats.nextCheck))}</strong><span>SEP class · simulated</span></article></section><div class="grid"><section class="panel"><div class="ph"><div><h2>Recent flights</h2><small>Flight records · sorted by date</small></div>${filters}</div><div class="table"><table><thead><tr><th>DATE</th><th>ROUTE</th><th>AIRCRAFT</th><th>ROLE</th><th>DURATION</th></tr></thead><tbody>${rows === '' ? '<tr><td colspan="5"><p class="empty">No flights match.</p></td></tr>' : rows}</tbody></table></div><div style="padding:12px 15px;color:#91a0aa;font-size:8px">Showing ${String(Math.min(6, list.length))} of ${String(aircraftId === undefined || aircraftId === '' ? logbook.stats().yearFlights : list.length)} flights · <a href="${shell.href('/export.csv')}" style="color:#38708f">Export CSV ↓</a>${draft === undefined ? '' : ` · <a href="${shell.href(`/flights/${encodeURIComponent(draft.id)}/edit`)}" style="color:#38708f">Edit draft ${e(draft.departure)} → ${e(draft.arrival)}</a>`}</div></section>${detail}</div>`
    return c.html(shell.page({ active: 'logbook', title: 'Flight logbook', main }))
  })

  ctx.router.route(prefix === '' ? '/' : prefix, app)
  ctx.effect(() => shell.nav({ id: 'logbook', label: 'Logbook', icon: '', path: '/', order: 10 }))
}
