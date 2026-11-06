/** Flights: the detail at `/flights/:id`, the new form at `/flights/new`, the draft editor and the CSV export. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { dateLabel, hoursText, LogbookError, type Flight, type Logbook } from '../logbook/index.ts'
import type { Shell } from '../logbook-shell/index.ts'

export const name = 'flights'
export const inject = ['logbook', 'shell', 'router']

const ROLES = ['PIC', 'Dual', 'Instructor']

export function apply(ctx: Context): void {
  const { logbook, shell } = ctx
  const e = shell.e
  const prefix = shell.prefix

  const form = (url: string, flight: Flight | undefined, error?: string): string => {
    const aircraft = logbook.aircraft()
    const value = (field: keyof Flight, fallback: string): string => (flight === undefined ? fallback : String(flight[field] ?? fallback))
    const date = flight?.date ?? logbook.now.toISOString().slice(0, 10)
    const main = `${shell.notice(url)}<div class="hero"><div><small>${flight === undefined ? 'PILOT RECORDS / NEW FLIGHT' : 'PILOT RECORDS / EDIT DRAFT'}</small><h1>${flight === undefined ? 'Log flight' : 'Edit draft flight'}</h1><p>Record the route, aircraft, role, times, landings and remarks.</p></div><a class="btn" href="${shell.href('/')}">Back to the logbook</a></div>${error === undefined ? '' : `<p class="notice error" role="alert">${e(error)}</p>`}<form class="panel logdetail" style="max-width:720px" method="post" action="${shell.href(flight === undefined ? '/flights' : `/flights/${encodeURIComponent(flight.id)}`)}"><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><label>DATE<input name="date" type="date" value="${e(date)}" required></label><label>AIRCRAFT<select name="aircraftId">${aircraft.map((item) => `<option value="${e(item.id)}"${item.id === flight?.aircraftId ? ' selected' : ''}>${e(item.type)} ${e(item.registration)}</option>`).join('')}</select></label><label>DEPARTURE ICAO<input name="departure" value="${e(value('departure', 'LOWW'))}" maxlength="4" required></label><label>ARRIVAL ICAO<input name="arrival" value="${e(value('arrival', 'LOWL'))}" maxlength="4" required></label><label>TAKEOFF<input name="takeoffTime" value="${e(value('takeoffTime', '09:14'))}" placeholder="09:14" required></label><label>LANDING<input name="landingTime" value="${e(value('landingTime', '10:26'))}" placeholder="10:26" required></label><label>DURATION (HH:MM)<input name="duration" value="${e(flight === undefined ? '1:12' : hoursText(flight.durationMinutes))}" placeholder="1:12" required></label><label>ROLE<select name="role">${ROLES.map((role) => `<option${role === flight?.role ? ' selected' : ''}>${role}</option>`).join('')}</select></label><label>DAY / NIGHT<select name="dayNight"><option${flight?.dayNight === 'Day' || flight === undefined ? ' selected' : ''}>Day</option><option${flight?.dayNight === 'Night' ? ' selected' : ''}>Night</option></select></label><label>LANDINGS<input name="landings" type="number" min="0" max="20" value="${e(value('landings', '1'))}" required></label></div><label>REMARKS<textarea name="remarks" rows="3">${e(value('remarks', ''))}</textarea></label><div class="actions"><button class="primary" type="submit">${flight === undefined ? 'Save flight' : 'Save and log flight'}</button><a href="${shell.href('/')}">Cancel</a></div></form>`
    return shell.page({ title: flight === undefined ? 'Log flight' : 'Edit draft flight', main })
  }

  const detail = (flight: Flight, url: string): string => {
    const aircraft = logbook.aircraftOf(flight.aircraftId)
    const main = `${shell.notice(url)}<div class="hero"><div><small>PILOT RECORDS / ${e(flight.departure)} → ${e(flight.arrival)}</small><h1>${e(flight.departure)} → ${e(flight.arrival)}</h1><p>${e(dateLabel(flight.date))} · ${e(aircraft?.type ?? '')} ${e(aircraft?.registration ?? '')} · ${e(flight.role)} · ${hoursText(flight.durationMinutes)}</p></div><div style="display:flex;gap:7px">${flight.status === 'draft' ? `<a class="btn" href="${shell.href(`/flights/${encodeURIComponent(flight.id)}/edit`)}">Edit draft</a>` : ''}<a class="btn" href="${shell.href('/')}">Back to the logbook</a></div></div><div class="grid"><section class="panel"><div class="logdetail"><h3>${e(flight.departure)} → ${e(flight.arrival)}</h3><div class="muted">${e(dateLabel(flight.date))} · ${e(flight.status === 'draft' ? 'DRAFT RECORD' : 'LOGGED')}</div><div class="routeinfo"><div><small>BLOCK TIME</small><b>${hoursText(flight.durationMinutes)}</b></div><div><small>LANDINGS</small><b>${String(flight.landings).padStart(2, '0')}</b></div><div><small>ROLE</small><b>${e(flight.role)}</b></div></div><div class="detailrow"><span>Aircraft</span><b>${e(aircraft?.type ?? '')} · ${e(aircraft?.registration ?? '')} (${e(aircraft?.class ?? '')})</b></div><div class="detailrow"><span>Departure / Arrival</span><b>${e(flight.departure)} / ${e(flight.arrival)}</b></div><div class="detailrow"><span>Takeoff / Landing</span><b>${e(flight.takeoffTime)} / ${e(flight.landingTime)}</b></div><div class="detailrow"><span>Day / Night</span><b>${e(flight.dayNight)}</b></div><div class="detailrow"><span>Remarks</span><b>${e(flight.remarks)}</b></div><div class="curr">Currency status is informational sample data only. Actual pilot privileges and recency must be checked against official records and applicable rules.</div></div></section><aside class="panel"><div class="ph"><h2>Aircraft</h2></div><div class="logdetail"><h3>${e(aircraft?.type ?? '')} ${e(aircraft?.registration ?? '')}</h3><div class="muted">${e(aircraft?.class ?? '')} · ${e(aircraft?.operator ?? '')}</div><div class="detailrow"><span>Role</span><b>${e(flight.role)}</b></div><div class="detailrow"><span>Duration</span><b>${hoursText(flight.durationMinutes)}</b></div></div></aside></div>`
    return shell.page({ title: `${flight.departure} to ${flight.arrival}`, main })
  }

  const app = new Acryl()
    .get('/flights/new', (c) => c.html(form(c.req.url, undefined)))
    .get('/flights/:id', (c) => {
      const flight = logbook.flight(c.req.param('id'))
      if (flight === undefined) return c.redirect(shell.url('/', { kind: 'error', text: 'That flight no longer exists.' }), 303)
      return c.html(detail(flight, c.req.url))
    })
    .get('/flights/:id/edit', (c) => {
      const flight = logbook.flight(c.req.param('id'))
      if (flight === undefined) return c.redirect(shell.url('/', { kind: 'error', text: 'That flight no longer exists.' }), 303)
      if (flight.status !== 'draft') return c.redirect(shell.url(`/flights/${encodeURIComponent(flight.id)}`, { kind: 'warn', text: 'Only a draft record can be edited.' }), 303)
      return c.html(form(c.req.url, flight))
    })
    .post('/flights', async (c) => {
      const body = await c.req.parseBody()
      try {
        const flight = await logbook.addFlight(body as unknown as Parameters<Logbook['addFlight']>[0])
        return c.redirect(shell.url(`/flights/${encodeURIComponent(flight.id)}`, { kind: 'ok', text: 'Flight saved to the logbook.' }), 303)
      } catch (error) {
        if (!(error instanceof LogbookError)) throw error
        return c.html(form(c.req.url, undefined, error.message))
      }
    })
    .post('/flights/:id', async (c) => {
      const body = await c.req.parseBody()
      try {
        const flight = await logbook.updateDraft(c.req.param('id'), body as unknown as Parameters<Logbook['updateDraft']>[1])
        return c.redirect(shell.url(`/flights/${encodeURIComponent(flight.id)}`, { kind: 'ok', text: 'Draft flight saved and logged.' }), 303)
      } catch (error) {
        if (!(error instanceof LogbookError)) throw error
        const flight = logbook.flight(c.req.param('id'))
        return c.html(form(c.req.url, flight, error.message))
      }
    })
    .get('/export.csv', (c) => {
      const header = 'date,departure,arrival,aircraft,registration,role,takeoff,landing,duration,day_night,landings,remarks'
      const rows = logbook
        .flights()
        .map((flight) => {
          const aircraft = logbook.aircraftOf(flight.aircraftId)
          return [flight.date, flight.departure, flight.arrival, aircraft?.type ?? '', aircraft?.registration ?? '', flight.role, flight.takeoffTime, flight.landingTime, hoursText(flight.durationMinutes), flight.dayNight, String(flight.landings), flight.remarks].map((value) => (/[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value)).join(',')
        })
      return c.body(`${[header, ...rows].join('\n')}\n`, 200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="flight-logbook.csv"' })
    })

  ctx.router.route(prefix === '' ? '/' : prefix, app)
}
