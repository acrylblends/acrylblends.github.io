/**
 * The week calendar (`/calendar`): the seven days as a time grid with meetings, focus blocks and personal time; overlapping events side by side and
 * marked; a form to add an event that, when the new event overlaps others, asks first and saves only on "Save anyway". On My Day it puts the week
 * strip and today's and the next day's agenda in the right rail (the `calendar` widget).
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { escapeHtml, type HubShell, noticeQuery } from '../hub-shell/index.ts'
import {
  addDays,
  CALENDARS,
  type CalendarEvent,
  dayOf,
  durationMinutes,
  type EventInput,
  type Hub,
  HubError,
  startOfDay,
  weekStart,
} from '../productivity-hub/index.ts'
import { hourRange, placeDay } from './layout.ts'

const HOUR_PX = 60

const CALENDAR_LABELS: Record<(typeof CALENDARS)[number], string> = { meeting: 'Meeting', focus: 'Focus block', personal: 'Personal' }

const fmt = (day: string, options: Intl.DateTimeFormatOptions): string => startOfDay(day).toLocaleDateString('en-US', options)
const clock = (time: string): string => time.slice(11, 16)

/** "45 min", "2 hours", "1 h 30 min". */
export function duration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (rest === 0) return hours === 1 ? '1 hour' : `${hours} hours`
  return `${hours} h ${rest} min`
}

/** "Nov 2 – 8" or "Oct 26 – Nov 1". */
export function weekLabel(monday: string): string {
  const sunday = addDays(monday, 6)
  const sameMonth = monday.slice(5, 7) === sunday.slice(5, 7)
  return `${fmt(monday, { month: 'short', day: 'numeric' })} – ${sameMonth ? fmt(sunday, { day: 'numeric' }) : fmt(sunday, { month: 'short', day: 'numeric' })}`
}

const eventLine = (event: CalendarEvent, clash: boolean): string =>
  `<article class="p-event"><time>${clock(event.startAt)}</time><i class="${event.calendarId}"></i><span><b>${escapeHtml(event.title)}</b><small>${escapeHtml(event.detail ?? CALENDAR_LABELS[event.calendarId])} · ${duration(durationMinutes(event))}${clash ? ' · <span class="clash">overlaps</span>' : ''}</small></span></article>`

/** The right rail of My Day: the week strip, today's events and the next day that has any. */
export function agendaRail(hub: Hub, shell: HubShell): string {
  const today = dayOf(hub.now())
  const week = hub.week(today)
  const strip = week.days
    .slice(0, 5)
    .map(
      ({ day }) =>
        `<a href="${shell.href(`/calendar?week=${week.start}#day-${day}`)}"${day === today ? ' class="today" aria-current="date"' : ''}>${fmt(day, { weekday: 'short' })}<b>${Number(day.slice(8))}</b></a>`,
    )
    .join('')
  const todays = week.days.find((d) => d.day === today)?.events ?? []
  const nextDay = [1, 2, 3, 4, 5, 6, 7].map((n) => addDays(today, n)).find((day) => hub.week(day).days.some((d) => d.day === day && d.events.length > 0))
  const nextEvents = nextDay === undefined ? [] : (hub.week(nextDay).days.find((d) => d.day === nextDay)?.events ?? [])
  const clash = (id: string) => week.overlapping.has(id) || hub.week(nextDay ?? today).overlapping.has(id)
  const count = (n: number) => `${n} ${n === 1 ? 'event' : 'events'}`
  return `<div class="p-week"><div><h2>This week</h2><small>${weekLabel(week.start)}</small></div><a href="${shell.href(`/calendar?week=${addDays(week.start, -7)}`)}" aria-label="Previous week">‹</a><a href="${shell.href(`/calendar?week=${addDays(week.start, 7)}`)}" aria-label="Next week">›</a></div>
<nav class="p-days" aria-label="This week">${strip}</nav><hr>
<span class="p-label">${fmt(today, { weekday: 'long' })} <small>${count(todays.length)}</small></span>
${todays.length === 0 ? '<p class="p-empty">Nothing on the calendar today.</p>' : todays.map((e) => eventLine(e, clash(e.id))).join('')}
${nextDay === undefined ? '' : `<hr><span class="p-label">Up next <small>${fmt(nextDay, { weekday: 'long' })}</small></span>${nextEvents.map((e) => eventLine(e, clash(e.id))).join('')}`}
<a class="p-add" href="${shell.href('/calendar#add')}">+ Add event</a>`
}

const CSS = `<style>
.c-grid{display:grid;grid-template-columns:52px repeat(7,minmax(0,1fr));margin-top:22px;border-top:1px solid var(--line)}
.c-dayhead{padding:12px 6px 10px;text-align:center;border-left:1px solid var(--line);font:10px ui-monospace,monospace;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;position:sticky;top:0;background:var(--paper);z-index:2}
.c-dayhead b{display:grid;place-items:center;width:30px;height:30px;margin:5px auto 0;border-radius:50%;font:14px system-ui,sans-serif;color:var(--ink)}
.c-dayhead.today{color:var(--accent-text)}.c-dayhead.today b{background:var(--sage-fill);color:var(--accent-ink)}
.c-hours{position:relative}.c-hours span{position:absolute;right:8px;transform:translateY(-50%);font:10px ui-monospace,monospace;color:var(--faint)}
.c-col{position:relative;border-left:1px solid var(--line);background-image:linear-gradient(var(--line-2) 1px,transparent 1px);background-size:100% ${HOUR_PX}px}
.c-col.today{background-color:color-mix(in srgb,var(--sage) 45%,transparent)}
.c-ev{position:absolute;border-radius:6px;padding:5px 7px;font-size:11px;line-height:1.3;overflow:hidden;background:var(--card);border:1px solid var(--card-line);border-left:3px solid var(--bar-meeting)}
.c-ev.focus{border-left-color:var(--bar-focus);background:color-mix(in srgb,var(--bar-focus) 14%,var(--card))}.c-ev.personal{border-left-color:var(--bar-personal);background:color-mix(in srgb,var(--bar-personal) 14%,var(--card))}
.c-ev.meeting{background:color-mix(in srgb,var(--bar-meeting) 12%,var(--card))}
.c-ev b{display:block;font-weight:600}.c-ev small{color:var(--muted);display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.c-ev.short{padding:3px 7px}.c-ev.short b{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.c-ev.short small{display:none}.c-ev.clash{outline:2px solid var(--warn);outline-offset:-1px}
.c-ev form{position:absolute;right:3px;top:2px;opacity:0}.c-ev:hover form,.c-ev:focus-within form{opacity:1}.c-ev form button{color:var(--muted);font-size:12px;padding:0 3px}
.c-legend{display:flex;gap:16px;flex-wrap:wrap;font-size:12px;color:var(--muted);margin-top:14px}.c-legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:-1px;background:var(--bar-meeting)}
.c-legend i.focus{background:var(--bar-focus)}.c-legend i.personal{background:var(--bar-personal)}.c-legend .warn{color:var(--warn)}
.c-add{display:none;margin-top:22px}.c-add:target,.c-add.open{display:block}.c-add .p-form{max-width:none}.c-add .p-form .grid{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:12px}.c-add .p-form .grid2{display:grid;grid-template-columns:1fr 1fr 2fr;gap:12px}.c-add .actions{display:flex;gap:8px;align-items:center}
.c-scroll{overflow-x:auto}.c-scroll .c-grid{min-width:760px}
.c-ask ul{margin:8px 0 12px;padding-left:18px}
@media(max-width:900px){.c-add .p-form .grid,.c-add .p-form .grid2{grid-template-columns:1fr 1fr}}
</style>`

function weekGrid(hub: Hub, shell: HubShell, monday: string): string {
  const week = hub.week(monday)
  const today = dayOf(hub.now())
  const all = week.days.flatMap((d) => d.events)
  const { from, to } = hourRange(all)
  const height = (to - from) * HOUR_PX
  const heads = week.days
    .map(({ day }) => `<div class="c-dayhead${day === today ? ' today' : ''}" id="day-${day}">${fmt(day, { weekday: 'short' })}<b>${Number(day.slice(8))}</b></div>`)
    .join('')
  const hours = Array.from({ length: to - from }, (_, i) => (i === 0 ? '' : `<span style="top:${i * HOUR_PX}px">${String(from + i).padStart(2, '0')}:00</span>`)).join('')
  const columns = week.days
    .map(({ day, events }) => {
      const blocks = placeDay(events, from)
        .map(({ event, top, height: h, lane, lanes }) => {
          const clash = week.overlapping.has(event.id)
          // Overlapping events cascade: each later lane starts further right and lies on top, wide enough for its title.
          const step = 100 / lanes
          const left = lane * step
          const width = lane === lanes - 1 ? 100 - left : Math.min(step * 1.6, 100 - left)
          const short = h < 45
          return `<div class="c-ev ${event.calendarId}${clash ? ' clash' : ''}${short ? ' short' : ''}" data-event="${escapeHtml(event.id)}" style="top:${(top / 60) * HOUR_PX}px;height:${Math.max((h / 60) * HOUR_PX - 2, 22)}px;left:calc(${left}% + 2px);width:calc(${width}% - 4px);z-index:${lane + 1}" title="${escapeHtml(`${event.title}, ${clock(event.startAt)}-${clock(event.endAt)}${clash ? ', overlaps another event' : ''}`)}"><b>${escapeHtml(event.title)}</b><small>${clock(event.startAt)}-${clock(event.endAt)}${clash ? ' · overlaps' : ''}</small><form method="post" action="${shell.href(`/calendar/events/${encodeURIComponent(event.id)}/delete`)}"><input type="hidden" name="week" value="${monday}"><button aria-label="Delete ${escapeHtml(event.title)}">×</button></form></div>`
        })
        .join('')
      return `<div class="c-col${day === today ? ' today' : ''}" style="height:${height}px">${blocks}</div>`
    })
    .join('')
  return `<div class="c-scroll"><div class="c-grid"><div></div>${heads}<div class="c-hours" style="height:${height}px">${hours}</div>${columns}</div></div>`
}

interface FormValues {
  readonly title?: string
  readonly day?: string
  readonly start?: string
  readonly end?: string
  readonly calendarId?: string
  readonly detail?: string
  readonly projectId?: string
}

function eventForm(hub: Hub, shell: HubShell, monday: string, values: FormValues | undefined): string {
  const v = values ?? {}
  const day = v.day ?? (weekStart(dayOf(hub.now())) === monday ? dayOf(hub.now()) : monday)
  const option = (value: string, label: string, chosen: string | undefined) =>
    `<option value="${escapeHtml(value)}"${value === chosen ? ' selected' : ''}>${escapeHtml(label)}</option>`
  // The panel shows when the page is opened at #add (the header's button, My Day's "+ Add event") or when it carries what the person typed.
  return `<div class="c-add${values === undefined ? '' : ' open'}" id="add">
<form class="p-card p-form" method="post" action="${shell.href('/calendar/events')}">
<h2 class="serif" style="margin:0;font-size:20px">Add event</h2>
<div class="grid"><label class="p-field">Title<input name="title" required maxlength="200" value="${escapeHtml(v.title ?? '')}" placeholder="Design critique"></label>
<label class="p-field">Day<input type="date" name="day" required value="${escapeHtml(day)}"></label>
<label class="p-field">Starts<input type="time" name="start" required value="${escapeHtml(v.start ?? '10:00')}"></label><label class="p-field">Ends<input type="time" name="end" required value="${escapeHtml(v.end ?? '10:30')}"></label></div>
<div class="grid2"><label class="p-field">Calendar<select name="calendarId">${CALENDARS.map((c) => option(c, CALENDAR_LABELS[c], v.calendarId ?? 'meeting')).join('')}</select></label>
<label class="p-field">Space<select name="projectId">${option('', 'No space', v.projectId ?? '')}${hub
    .projects()
    .map((p) => option(p.id, p.name, v.projectId))
    .join('')}</select></label>
<label class="p-field">With or about<input name="detail" maxlength="120" value="${escapeHtml(v.detail ?? '')}" placeholder="Marta"></label></div>
<div class="actions"><button class="p-btn">Save event</button><a class="p-link" href="${shell.href(`/calendar?week=${monday}`)}#">Cancel</a></div>
</form></div>`
}

/** The time the form's day and HH:MM name, as the hub reads it. */
function toInput(form: FormValues): EventInput {
  const day = form.day ?? ''
  const start = form.start ? `${day}T${form.start}` : undefined
  // An end earlier than the start is on the next day (a late block that runs past midnight).
  const end = form.end ? (form.start && form.end <= form.start ? `${addDays(day, 1)}T${form.end}` : `${day}T${form.end}`) : undefined
  return { title: form.title, startAt: day === '' ? undefined : start, endAt: day === '' ? undefined : end, calendarId: form.calendarId, detail: form.detail, projectId: form.projectId }
}

export const name = 'calendar'
export const inject = ['hub', 'hubShell', 'router', 'home']

export function apply(ctx: Context): void {
  const { hub, hubShell: shell } = ctx
  ctx.effect(() => shell.nav({ id: 'calendar', label: 'Calendar', icon: '▥', path: '/calendar', order: 50 }))
  ctx.effect(() => ctx.home.widget({ id: 'calendar', title: 'This week', render: () => agendaRail(hub, shell) }))

  const weekOf = (value: string | undefined): string =>
    weekStart(value !== undefined && /^\d{4}-\d{2}-\d{2}$/u.test(value) && !Number.isNaN(startOfDay(value).getTime()) ? value : dayOf(hub.now()))

  const page = (monday: string, extra: { notice?: string; ask?: string; values?: FormValues } = {}): string => {
    const week = hub.week(monday)
    const count = week.days.reduce((n, d) => n + d.events.length, 0)
    const clashes = week.overlapping.size
    const action = `<div style="display:flex;gap:6px"><a class="p-btn ghost" href="${shell.href(`/calendar?week=${addDays(monday, -7)}`)}" aria-label="Previous week">‹</a><a class="p-btn ghost" href="${shell.href('/calendar')}">This week</a><a class="p-btn ghost" href="${shell.href(`/calendar?week=${addDays(monday, 7)}`)}" aria-label="Next week">›</a><a class="p-btn" href="#add">+ Add event</a></div>`
    const main = `${CSS}${shell.header({ eyebrow: `Week of ${fmt(monday, { month: 'long', day: 'numeric', year: 'numeric' })}`, title: `${weekLabel(monday)}.`, lead: count === 0 ? 'A clear week. Block time for what matters before it fills up.' : `${count} ${count === 1 ? 'event' : 'events'} this week${clashes > 0 ? `, ${clashes} of them overlapping` : ''}.`, action })}
${extra.notice ?? ''}${extra.ask ?? ''}
${eventForm(hub, shell, monday, extra.values)}
<section>${weekGrid(hub, shell, monday)}<div class="c-legend"><span><i></i>Meetings</span><span><i class="focus"></i>Focus blocks</span><span><i class="personal"></i>Personal</span>${clashes > 0 ? '<span class="warn">Outlined: overlaps another event</span>' : ''}</div></section>`
    return shell.page({ active: 'calendar', title: 'Calendar', main })
  }

  const app = new Acryl()
    .get('/calendar', (c) => c.html(page(weekOf(c.req.query('week')), { notice: shell.notice(c.req.url) })))
    .get('/calendar/week', (c) => {
      const week = hub.week(weekOf(c.req.query('week')))
      return c.json({ start: week.start, days: week.days, overlapping: [...week.overlapping] })
    })
    .post('/calendar/events', async (c) => {
      const form = Object.fromEntries(Object.entries(await c.req.parseBody()).map(([k, v]) => [k, typeof v === 'string' ? v : ''])) as FormValues & { confirm?: string }
      const monday = weekOf(form.day)
      try {
        const result = await hub.addEvent(toInput(form), { confirm: form.confirm === '1' })
        if (result.kind === 'overlap') {
          const hidden = Object.entries(form)
            .filter(([k]) => k !== 'confirm')
            .map(([k, v]) => `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(String(v))}">`)
            .join('')
          const list = result.overlaps.map((e) => `<li><b>${escapeHtml(e.title)}</b>, ${fmt(dayOf(e.startAt), { weekday: 'long' })} ${clock(e.startAt)}-${clock(e.endAt)}</li>`).join('')
          const ask = `<div class="p-alert warn c-ask" role="alertdialog" aria-labelledby="ask-title"><b id="ask-title">${escapeHtml(result.candidate.title)} (${clock(result.candidate.startAt)}-${clock(result.candidate.endAt)}) overlaps ${result.overlaps.length === 1 ? 'an event' : `${result.overlaps.length} events`}:</b><ul>${list}</ul><form method="post" action="${shell.href('/calendar/events')}" style="display:flex;gap:8px">${hidden}<input type="hidden" name="confirm" value="1"><button class="p-btn">Save anyway</button><a class="p-btn ghost" href="#add">Change the time</a></form></div>`
          return c.html(page(monday, { ask, values: form }), 409)
        }
        return c.redirect(`${shell.href('/calendar')}${noticeQuery({ kind: 'ok', text: `Saved ${result.event.title}${result.overlaps.length > 0 ? ', overlapping as you confirmed' : ''}.` })}&week=${monday}`, 303)
      } catch (error) {
        if (!(error instanceof HubError)) throw error
        return c.html(page(monday, { notice: `<p class="p-alert error" role="alert">${escapeHtml(error.message)}</p>`, values: form }), error.code === 'invalid' ? 400 : 404)
      }
    })
    .post('/calendar/events/:id/delete', async (c) => {
      const form = await c.req.parseBody()
      const week = typeof form.week === 'string' ? form.week : ''
      try {
        const event = hub.event(c.req.param('id'))
        await hub.deleteEvent(event.id)
        return c.redirect(`${shell.href('/calendar')}${noticeQuery({ kind: 'ok', text: `Deleted ${event.title}.` })}&week=${weekOf(week)}`, 303)
      } catch (error) {
        if (!(error instanceof HubError)) throw error
        return c.redirect(`${shell.href('/calendar')}${noticeQuery({ kind: 'error', text: error.message })}`, 303)
      }
    })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
}
