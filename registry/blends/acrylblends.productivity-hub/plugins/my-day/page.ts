/**
 * The My Day page: the mockup's warm workbench around the domain's day view. The header, the focus card, next actions (each a one-click completion),
 * the done line, recent notes, and the other plugins' home widgets: the calendar's in the right rail, the rest below the notes in the main column.
 */
import { dayLabel, dayNumber, dueLabel, esc, excerpt, longDate, numberWord, relativeDay, timeOf, weekRange, weekdayName, weekdayShort } from './format.ts'

export interface TaskLike {
  readonly id: string
  readonly title: string
  readonly status: 'open' | 'done'
  readonly dueAt?: string
  readonly priority: 'low' | 'normal' | 'high'
  readonly projectId?: string
  readonly estimateMinutes?: number
  readonly steps: readonly { readonly title: string; readonly done: boolean }[]
}

export interface NoteLike {
  readonly id: string
  readonly title: string
  readonly body: string
  readonly updatedAt: string
  readonly projectId?: string
}

export interface ProjectLike {
  readonly id: string
  readonly name: string
  readonly color: string
}

export interface DayLike {
  readonly day: string
  readonly focus?: TaskLike
  readonly next: readonly TaskLike[]
  readonly done: readonly TaskLike[]
  readonly notes: readonly NoteLike[]
}

export interface EventLike {
  readonly id: string
  readonly title: string
  readonly startAt: string
  readonly endAt: string
  readonly calendarId: 'meeting' | 'focus' | 'personal'
  readonly detail?: string
}

export interface WeekDayLike {
  readonly day: string
  readonly events: readonly EventLike[]
}

export interface WeekLike {
  readonly start: string
  readonly days: readonly WeekDayLike[]
}

export interface WidgetLike {
  readonly id: string
  readonly title: string
  render(): string | Promise<string>
}

export interface ShellLike {
  href(path: string): string
  has(id: string): boolean
  header(input: { readonly eyebrow?: string; readonly title: string; readonly lead?: string; readonly action?: string }): string
  notice(url: string): string
  page(input: { readonly active?: string; readonly title: string; readonly main: string; readonly scripts?: string }): string
}

export interface MyDayInput {
  readonly view: DayLike
  readonly projects: readonly ProjectLike[]
  readonly openTasks: readonly TaskLike[]
  readonly week: WeekLike
  readonly widgets: readonly WidgetLike[]
  readonly shell: ShellLike
  readonly url: string
}

const WIDGET_STYLES = `<style>
.p-widget{margin-top:30px;border-top:1px solid var(--line);padding-top:22px}
.p-widget h2{font:500 24px Georgia,serif;margin:0 0 12px}
.p-widget ul,.p-widget ol{list-style:none;margin:0;padding:0}
.p-widget li{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--line-2)}
.p-widget a{color:var(--accent-text)}
.p-widget form{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 10px}
.p-widget input,.p-widget select,.p-widget textarea{padding:8px 10px;border:1px solid var(--card-line);border-radius:7px;background:var(--paper);font:inherit;color:inherit}
.p-widget button{background:var(--accent);color:var(--accent-ink);border-radius:7px;padding:8px 12px;font-weight:600}
.p-widget [role=alert]{color:var(--danger)}
.p-rail .p-arrow{border:1px solid var(--line);border-radius:5px;width:28px;height:28px;display:grid;place-items:center;color:var(--muted)}
</style>`

const QUOTE = `<blockquote class="p-quote">“You don’t need more time.<br>You need fewer priorities.”</blockquote>`

const projectName = (projects: readonly ProjectLike[], id: string | undefined): string | undefined =>
  id === undefined ? undefined : projects.find((project) => project.id === id)?.name

const projectColor = (projects: readonly ProjectLike[], id: string | undefined): string =>
  (id === undefined ? undefined : projects.find((project) => project.id === id)?.color) ?? 'amber'

/** A widget's HTML; one that throws shows a line instead of taking the page down. */
async function widgetBody(widget: WidgetLike): Promise<string> {
  try {
    return await widget.render()
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    return `<p role="alert">This part could not be shown: ${esc(message)}</p>`
  }
}

function taskMeta(task: TaskLike, projects: readonly ProjectLike[]): string {
  const space = projectName(projects, task.projectId)
  const estimate = task.estimateMinutes === undefined ? undefined : `${String(task.estimateMinutes)} min`
  return [space, estimate].filter((part): part is string => part !== undefined && part !== '').join(' · ')
}

function taskRow(task: TaskLike, projects: readonly ProjectLike[], today: string, shell: ShellLike): string {
  const due = dueLabel(task.dueAt, today)
  const meta = taskMeta(task, projects)
  const when = due.text === '' ? '' : `<em class="p-when${due.overdue ? ' overdue' : ''}">${esc(due.text)}</em>`
  return `<form class="p-task" method="post" action="${esc(shell.href(`/day/tasks/${task.id}/complete`))}">
  <button class="p-check" type="submit" aria-label="Complete ${esc(task.title)}" title="Complete ${esc(task.title)}">○</button>
  <span class="what"><b>${esc(task.title)}</b>${meta === '' ? '' : `<small>${esc(meta)}</small>`}</span>
  ${when}
</form>`
}

function focusCard(view: DayLike, projects: readonly ProjectLike[], openTasks: readonly TaskLike[], shell: ShellLike): string {
  const open = shell.has('tasks') && view.focus !== undefined
    ? `<a class="p-link" href="${esc(shell.href(`/tasks?edit=${encodeURIComponent(view.focus.id)}`))}">Open task ↗</a>`
    : ''
  if (view.focus === undefined) {
    const options = openTasks
      .map((task) => `<option value="${esc(task.id)}">${esc(task.title)}</option>`)
      .join('')
    const picker = openTasks.length === 0
      ? '<p>No open task to focus on yet. Capture one in the inbox first.</p>'
      : `<form class="p-form" method="post" action="${esc(shell.href('/day/focus'))}"><div class="row"><label class="p-field">Today's focus<select name="taskId">${options}</select></label><button class="p-btn" type="submit">Set focus</button></div></form>`
    return `<article class="p-focus">
  <span class="p-label">✦ Daily focus</span>
  <h3>Choose today's focus</h3>
  <p>One meaningful outcome is enough for today.</p>
  ${picker}
</article>`
  }
  const task = view.focus
  const total = task.steps.length
  const done = task.steps.filter((step) => step.done).length
  const progress = total === 0
    ? ''
    : `<div class="row"><span class="p-progress" role="img" aria-label="${String(done)} of ${String(total)} steps done"><i style="width:${String(Math.round((done / total) * 100))}%"></i></span><small>${String(done)} of ${String(total)} steps</small>${open}</div>`
  return `<article class="p-focus">
  <span class="p-label">✦ Daily focus</span>
  <h3>${esc(task.title)}</h3>
  <p>One meaningful outcome is enough for today.</p>
  ${progress === '' ? (open === '' ? '' : `<div class="row">${open}</div>`) : progress}
</article>`
}

function recentNotes(view: DayLike, projects: readonly ProjectLike[], shell: ShellLike): string {
  const viewAll = shell.has('notes') ? `<a class="p-link" href="${esc(shell.href('/notes'))}">View all →</a>` : ''
  const cards = view.notes.slice(0, 2).map((note) => {
    const space = projectName(projects, note.projectId)?.toUpperCase() ?? 'NOTE'
    const label = `${esc(space)} · ${relativeDay(note.updatedAt, view.day)}`
    const inside = `<small>${label}</small><h3>${esc(note.title)}</h3><p>${esc(excerpt(note.body))}</p>`
    const color = projectColor(projects, note.projectId)
    return shell.has('notes')
      ? `<a class="p-note ${esc(color)}" href="${esc(shell.href(`/notes/${note.id}`))}">${inside}</a>`
      : `<article class="p-note ${esc(color)}">${inside}</article>`
  })
  const grid = cards.length === 0
    ? '<div class="p-empty"><b>No notes yet.</b>Capture an idea in the inbox and turn it into a note.</div>'
    : `<div class="p-notegrid">${cards.join('')}</div>`
  return `<div class="p-section split"><h2>Recent notes</h2>${viewAll}</div>${grid}`
}

function eventRow(event: EventLike): string {
  const minutes = Math.round((new Date(event.endAt).getTime() - new Date(event.startAt).getTime()) / 60_000)
  const lines = [event.detail, minutes > 0 ? `${String(minutes)} min` : undefined].filter((part): part is string => part !== undefined && part !== '')
  const meta = lines.length === 0 ? '' : `<small>${esc(lines.join(' · '))}</small>`
  const bar = event.calendarId === 'meeting' ? '' : ` class="${event.calendarId}"`
  return `<article class="p-event"><time>${timeOf(event.startAt)}</time><i${bar}></i><span><b>${esc(event.title)}</b>${meta}</span></article>`
}

/**
 * The rail when no calendar plugin put its own week there: the mockup's read-only week agenda, built from the hub's week view (the calendar plugin's
 * widget, when mounted, replaces this in the rail).
 */
function agendaRail(week: WeekLike, today: string, hasCalendar: boolean, shell: ShellLike): string {
  const days = week.days.slice(0, 5)
  const last = week.days[week.days.length - 1]?.day ?? week.start
  const strip = days.map((entry) => {
    const href = hasCalendar ? ` href="${esc(shell.href(`/calendar?week=${entry.day}`))}"` : ''
    const current = entry.day === today ? ' class="today"' : ''
    return `<a${href}${current}><span>${weekdayShort(entry.day)}</span><b>${String(dayNumber(entry.day))}</b></a>`
  }).join('')
  const todays = week.days.find((entry) => entry.day === today)?.events ?? []
  const next = week.days.find((entry) => entry.day > today && entry.events.length > 0)
  const arrows = hasCalendar
    ? `<a href="${esc(shell.href('/calendar'))}" aria-label="Open the calendar">‹</a><a href="${esc(shell.href('/calendar'))}" aria-label="Open the calendar">›</a>`
    : '<span class="p-arrow" aria-hidden="true">‹</span><span class="p-arrow" aria-hidden="true">›</span>'
  const add = hasCalendar ? `<a class="p-add" href="${esc(shell.href('/calendar#add'))}">+ Add event</a>` : ''
  return `<div class="p-week"><div><h2>This week</h2><small>${esc(weekRange(week.start, last))}</small></div>${arrows}</div>
<div class="p-days">${strip}</div>
<hr>
<span class="p-label">${weekdayName(today)}<small>${String(todays.length)} ${todays.length === 1 ? 'EVENT' : 'EVENTS'}</small></span>
${todays.length === 0 ? '<p class="p-empty">No events today.</p>' : todays.map(eventRow).join('')}
${next === undefined ? '' : `<hr><span class="p-label">Up next<small>${weekdayName(next.day)}</small></span>${next.events.map(eventRow).join('')}`}
${add}`
}

/** The My Day page, its main column and the rail, as the shell wraps it. */
export async function myDayPage(input: MyDayInput): Promise<string> {
  const { view, projects, openTasks, widgets, shell } = input
  const today = view.day
  const plate = view.next.length + (view.focus === undefined ? 0 : 1) + view.done.length
  const lead = plate === 0
    ? 'A clear plate. Keep the day intentional.'
    : `${numberWord(plate)} ${plate === 1 ? 'thing' : 'things'} on your plate. Keep the day intentional.`
  const action = shell.has('tasks') ? `<a class="p-btn" href="${esc(shell.href('/tasks?new=1'))}">+ New task</a>` : ''
  const header = shell.header({ eyebrow: longDate(today), title: 'Make room for good work.', lead, action })

  const remaining = view.next.length
  const rows = view.next.map((task) => taskRow(task, projects, today, shell)).join('')
  const next = rows === ''
    ? '<div class="p-empty"><b>Nothing due today.</b>Capture something in the inbox, or take the day.</div>'
    : rows
  const done = view.done.length === 0
    ? ''
    : `<div class="p-done">✓ ${numberWord(view.done.length)} ${view.done.length === 1 ? 'task' : 'tasks'} completed today</div>`

  const calendar = widgets.find((widget) => widget.id === 'calendar')
  const mainWidgets = widgets.filter((widget) => widget.id !== 'calendar')
  const mainParts = await Promise.all(
    mainWidgets.map(async (widget) => `<section class="p-widget" data-widget="${esc(widget.id)}"><h2>${esc(widget.title)}</h2>${await widgetBody(widget)}</section>`),
  )

  const main = `<section>
<div class="p-section"><h2>Today</h2><small>${dayLabel(today)}</small></div>
${focusCard(view, projects, openTasks, shell)}
<div class="p-listhead"><b>Next actions</b><small>${String(remaining)} remaining</small></div>
${next}
${done}
${recentNotes(view, projects, shell)}
${mainParts.join('')}
</section>`
  const railBody = calendar === undefined
    ? agendaRail(input.week, today, shell.has('calendar'), shell)
    : await widgetBody(calendar)
  const rail = `<aside class="p-rail" data-widget="${calendar === undefined ? 'agenda' : 'calendar'}">${railBody}${QUOTE}</aside>`
  const grid = `<div class="p-grid">${main}${rail}</div>`
  const page = shell.page({ active: 'my-day', title: 'My day', main: `${header}${shell.notice(input.url)}${grid}`, scripts: WIDGET_STYLES })
  return page
}
