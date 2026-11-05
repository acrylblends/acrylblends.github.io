/**
 * Tasks: the /tasks page. Every task in one list, grouped by when it is due, with the space, the estimate and the priority beside it;
 * add, edit, complete and reopen in place. The data and its rules are the hub's (`ctx.hub`); the page is the shell's (`ctx.hubShell`).
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type {} from '../hub-shell/index.ts'
import type { Task } from '../productivity-hub/index.ts'

export const name = 'tasks'
export const inject = ['router', 'hub', 'hubShell']

const escapeHtml = (text: string): string =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

const noticeQuery = (kind: 'ok' | 'error', text: string): string => `?${kind}=${encodeURIComponent(text)}`

/** A hub refusal, told apart by its public shape: the plugin never imports the domain's class. */
function hubErrorOf(error: unknown): { code: 'invalid' | 'not-found'; message: string } | undefined {
  if (error instanceof Error && error.name === 'HubError') {
    const code = (error as { code?: unknown }).code
    if ((code === 'invalid' || code === 'not-found') && error.message !== '')
      return { code, message: error.message }
  }
  return undefined
}

const fieldOf = (body: Record<string, unknown>, name: string): string | undefined => {
  const value = body[name]
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.find((item): item is string => typeof item === 'string')
  return undefined
}

const dayOf = (time: Date): string => {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${String(time.getFullYear())}-${pad(time.getMonth() + 1)}-${pad(time.getDate())}`
}

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const
const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

/** `Thu 6 Nov` for another day; empty when the task has no date. */
function shortDay(day: string): string {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number)
  const value = new Date(year, month - 1, date)
  return `${dayNames[value.getDay()] ?? ''} ${String(date)} ${monthNames[month - 1] ?? ''}`
}

/** What the right of a row says: Overdue, the time today, or the day. */
function dueLabel(task: Task, nowDay: string, overdue: boolean): string {
  if (task.dueAt === undefined) return ''
  if (overdue) return 'Overdue'
  const day = task.dueAt.slice(0, 10)
  const time = task.dueAt.slice(11, 16)
  if (day === nowDay) return time === '17:00' ? 'Today' : time
  return shortDay(day)
}

const priorityLabel = { low: 'Low', normal: 'Normal', high: 'High' } as const

interface PageQuery {
  readonly status: 'open' | 'done' | 'all'
  readonly space: string
  readonly q: string
  readonly newTask: boolean
  readonly editId: string | undefined
}

function queryOf(url: string): PageQuery {
  const search = new URL(url, 'http://local').searchParams
  const status = search.get('status')
  return {
    status: status === 'done' || status === 'all' ? status : 'open',
    space: search.get('space') ?? '',
    q: search.get('q') ?? '',
    newTask: search.get('new') === '1',
    editId: search.get('edit') ?? undefined,
  }
}

const SCOPED_STYLE = `<style>
.p-tasks .p-toolbar .p-input{width:auto;min-width:150px}
.p-tasks .p-toolbar form{display:flex;gap:8px;align-items:center;margin-left:auto}
.p-tasks .p-task form{margin:0;display:flex}
.p-tasks .p-task .p-tag{margin-left:2px}
.p-tasks .p-form{margin-top:18px}
.p-tasks .p-form .p-field.grow{flex:2 1 280px}
.p-tasks .p-card h3{font:500 18px Georgia,serif;margin:0 0 12px}
.p-tasks .p-task .p-link{margin-left:6px}
</style>`

function taskRow(ctx: Context, task: Task, nowDay: string): string {
  const shell = ctx.hubShell
  const project = task.projectId === undefined ? undefined : ctx.hub.projects().find((p) => p.id === task.projectId)
  const overdue = ctx.hub.isOverdue(task)
  const done = task.status === 'done'
  const meta = [
    project?.name ?? 'No space',
    task.estimateMinutes === undefined ? undefined : `${String(task.estimateMinutes)} min`,
    priorityLabel[task.priority],
  ]
    .filter((part): part is string => part !== undefined)
    .join(' · ')
  const action = done ? shell.href(`/tasks/${task.id}/reopen`) : shell.href(`/tasks/${task.id}/complete`)
  return `<div class="p-task${done ? ' done' : ''}" data-task="${escapeHtml(task.id)}" data-priority="${task.priority}">
<form method="post" action="${action}"><button class="p-check" type="submit" aria-label="${done ? 'Reopen' : 'Complete'} ${escapeHtml(task.title)}">${done ? '✓' : ''}</button></form>
<span class="what"><b>${escapeHtml(task.title)}</b><small>${escapeHtml(meta)}</small></span>
<em class="p-when${overdue ? ' overdue' : ''}">${escapeHtml(dueLabel(task, nowDay, overdue))}</em>
<a class="p-link" href="${shell.href(`/tasks?edit=${encodeURIComponent(task.id)}`)}">Edit</a>
</div>`
}

function groupOf(task: Task, nowDay: string): 'overdue' | 'today' | 'upcoming' | 'undated' {
  if (task.status === 'open' && task.dueAt !== undefined && task.dueAt.slice(0, 10) < nowDay) return 'overdue'
  if (task.dueAt === undefined) return 'undated'
  return task.dueAt.slice(0, 10) === nowDay ? 'today' : 'upcoming'
}

function section(ctx: Context, title: string, note: string, tasks: readonly Task[], nowDay: string): string {
  if (tasks.length === 0) return ''
  return `<div class="p-section" style="margin-top:26px"><h2>${escapeHtml(title)}</h2><small>${escapeHtml(note)}</small></div>
${tasks.map((task) => taskRow(ctx, task, nowDay)).join('')}`
}

function formFor(ctx: Context, task: Task | undefined, values: Record<string, string>): string {
  const shell = ctx.hubShell
  const projects = ctx.hub.projects()
  const editing = task !== undefined
  const title = values.title ?? task?.title ?? ''
  const projectId = values.projectId ?? task?.projectId ?? ''
  const dueAt = values.dueAt ?? (task?.dueAt === undefined ? '' : task.dueAt.slice(0, 10))
  const priority = values.priority ?? task?.priority ?? 'normal'
  const estimate = values.estimateMinutes ?? (task?.estimateMinutes === undefined ? '' : String(task.estimateMinutes))
  const option = (value: string, label: string, selected: boolean): string =>
    `<option value="${escapeHtml(value)}"${selected ? ' selected' : ''}>${escapeHtml(label)}</option>`
  return `<section class="p-card p-form-card" id="task-form">
<h3>${editing ? 'Edit task' : 'New task'}</h3>
<form class="p-form" method="post" action="${editing ? shell.href(`/tasks/${encodeURIComponent(task.id)}`) : shell.href('/tasks')}">
<div class="row">
<label class="p-field grow">Task<input name="title" value="${escapeHtml(title)}" required maxlength="200" placeholder="What needs doing?"></label>
<label class="p-field">Space<select name="projectId">${option('', 'No space', projectId === '')}${projects.map((project) => option(project.id, project.name, project.id === projectId)).join('')}</select></label>
<label class="p-field">Due<input name="dueAt" type="date" value="${escapeHtml(dueAt)}"></label>
<label class="p-field">Priority<select name="priority">${option('low', 'Low', priority === 'low')}${option('normal', 'Normal', priority === 'normal')}${option('high', 'High', priority === 'high')}</select></label>
<label class="p-field">Estimate (minutes)<input name="estimateMinutes" type="number" min="1" max="1440" step="5" value="${escapeHtml(estimate)}" placeholder="30"></label>
</div>
<div class="row"><button class="p-btn" type="submit">${editing ? 'Save task' : 'Add task'}</button><a class="p-link" href="${shell.href('/tasks')}">Cancel</a></div>
</form>
</section>`
}

function pageFor(ctx: Context, url: string): string {
  const shell = ctx.hubShell
  const hub = ctx.hub
  const query = queryOf(url)
  const projectId = query.space === '' ? undefined : query.space
  const tasks = hub.tasks({ status: query.status, ...(projectId === undefined ? {} : { projectId }), q: query.q })
  const openCount = hub.tasks({ status: 'open', ...(projectId === undefined ? {} : { projectId }), q: query.q }).length
  const doneCount = hub.tasks({ status: 'done', ...(projectId === undefined ? {} : { projectId }), q: query.q }).length
  const nowDay = dayOf(hub.now())
  const spaces = hub.projects()
  const space = projectId === undefined ? undefined : spaces.find((project) => project.id === projectId)
  let editing: Task | undefined
  if (query.editId !== undefined) {
    try {
      editing = hub.task(query.editId)
    } catch {
      editing = undefined
    }
  }
  const pageHref = (over: { status?: 'open' | 'done' | 'all'; space?: string; q?: string }): string => {
    const search = new URLSearchParams()
    const status = over.status ?? query.status
    const spaceId = over.space ?? query.space
    const q = over.q ?? query.q
    if (status !== 'open') search.set('status', status)
    if (spaceId !== '') search.set('space', spaceId)
    if (q !== '') search.set('q', q)
    const text = search.toString()
    return `${shell.href('/tasks')}${text === '' ? '' : `?${text}`}`
  }
  const chip = (value: 'open' | 'done' | 'all', label: string, count: number): string =>
    `<a class="p-chip${query.status === value ? ' on' : ''}" href="${pageHref({ status: value })}">${label} <b>${String(count)}</b></a>`
  const toolbar = `<div class="p-toolbar">${chip('open', 'Open', openCount)}${chip('done', 'Done', doneCount)}${chip(
    'all',
    'All',
    openCount + doneCount,
  )}${space === undefined ? '' : `<a class="p-chip on" href="${pageHref({ space: '' })}">${escapeHtml(space.name)} ×</a>`}
<form method="get" action="${shell.href('/tasks')}">
${query.status === 'open' ? '' : `<input type="hidden" name="status" value="${query.status}">`}
${query.space === '' ? '' : `<input type="hidden" name="space" value="${escapeHtml(query.space)}">`}
<input class="p-input" type="search" name="q" value="${escapeHtml(query.q)}" placeholder="Search tasks" aria-label="Search tasks">
<button class="p-btn ghost" type="submit">Search</button>
</form>
</div>`
  const showForm = query.newTask || editing !== undefined
  const open = tasks.filter((task) => task.status === 'open')
  const done = tasks.filter((task) => task.status === 'done')
  const groups = {
    overdue: open.filter((task) => groupOf(task, nowDay) === 'overdue'),
    today: open.filter((task) => groupOf(task, nowDay) === 'today'),
    upcoming: open.filter((task) => groupOf(task, nowDay) === 'upcoming'),
    undated: open.filter((task) => groupOf(task, nowDay) === 'undated'),
  }
  const remaining = open.length
  const doneToday = hub
    .tasks({ status: 'done' })
    .filter((task) => task.completedAt !== undefined && task.completedAt.slice(0, 10) === nowDay).length
  const body = `<div class="p-tasks">${SCOPED_STYLE}
${shell.header({
  eyebrow: 'Workspace',
  title: 'All tasks.',
  lead: 'Everything in one list. Keep only what moves today.',
  action: `<a class="p-btn" href="${shell.href('/tasks?new=1')}">+ New task</a>`,
})}
${shell.notice(url)}
${showForm ? formFor(ctx, editing, {}) : ''}
${toolbar}
${query.q === '' ? '' : `<p class="p-listhead" style="margin-top:18px"><small>${String(tasks.length)} ${tasks.length === 1 ? 'task' : 'tasks'} matching “${escapeHtml(query.q)}”</small></p>`}
${groups.overdue.length === 0 ? '' : section(ctx, 'Overdue', 'Before today', groups.overdue, nowDay)}
${groups.today.length === 0 ? '' : section(ctx, 'Today', `${String(groups.today.length)} remaining`, groups.today, nowDay)}
${groups.upcoming.length === 0 ? '' : section(ctx, 'Upcoming', 'Later', groups.upcoming, nowDay)}
${groups.undated.length === 0 ? '' : section(ctx, 'No date', 'Whenever there is room', groups.undated, nowDay)}
${done.length === 0 ? '' : section(ctx, 'Completed', '', done, nowDay)}
${tasks.length === 0 ? `<div class="p-empty"><b>Nothing here yet.</b>Add a task, or clear the filters.</div>` : ''}
${query.status === 'open' && remaining > 0 ? `<p class="p-done">${String(remaining)} open ${remaining === 1 ? 'task' : 'tasks'}${doneToday === 0 ? '' : ` · ${String(doneToday)} completed today`}</p>` : ''}
</div>`
  return shell.page({ active: 'tasks', title: 'All tasks', main: body })
}

export function apply(ctx: Context): void {
  const shell = ctx.hubShell
  const prefix = shell.prefix === '' ? '/' : shell.prefix
  const app = new Acryl()
    .get('/tasks', (c) => c.html(pageFor(ctx, c.req.url)))
    .post('/tasks', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      try {
        await ctx.hub.addTask({
          title: fieldOf(body, 'title'),
          dueAt: fieldOf(body, 'dueAt'),
          priority: fieldOf(body, 'priority'),
          projectId: fieldOf(body, 'projectId'),
          estimateMinutes: fieldOf(body, 'estimateMinutes'),
        })
        return c.redirect(`${shell.href('/tasks')}${noticeQuery('ok', 'Task added.')}`, 303)
      } catch (error) {
        const refusal = hubErrorOf(error)
        if (refusal === undefined) throw error
        return c.redirect(`${shell.href('/tasks?new=1')}${noticeQuery('error', refusal.message).replace('?', '&')}`, 303)
      }
    })
    .post('/tasks/:id', async (c) => {
      const id = c.req.param('id')
      const body = (await c.req.parseBody()) as Record<string, unknown>
      try {
        await ctx.hub.updateTask(id, {
          title: fieldOf(body, 'title'),
          dueAt: fieldOf(body, 'dueAt') ?? '',
          priority: fieldOf(body, 'priority'),
          projectId: fieldOf(body, 'projectId') ?? '',
          estimateMinutes: fieldOf(body, 'estimateMinutes') ?? '',
        })
        return c.redirect(`${shell.href('/tasks')}${noticeQuery('ok', 'Task saved.')}`, 303)
      } catch (error) {
        const refusal = hubErrorOf(error)
        if (refusal === undefined) throw error
        return c.redirect(
          `${shell.href(`/tasks?edit=${encodeURIComponent(id)}`)}${noticeQuery('error', refusal.message).replace('?', '&')}`,
          303,
        )
      }
    })
    .post('/tasks/:id/complete', async (c) => {
      try {
        await ctx.hub.completeTask(c.req.param('id'))
        return c.redirect(`${shell.href('/tasks')}${noticeQuery('ok', 'Task completed.')}`, 303)
      } catch (error) {
        const refusal = hubErrorOf(error)
        if (refusal === undefined) throw error
        return c.redirect(`${shell.href('/tasks')}${noticeQuery('error', refusal.message)}`, 303)
      }
    })
    .post('/tasks/:id/reopen', async (c) => {
      try {
        await ctx.hub.reopenTask(c.req.param('id'))
        return c.redirect(`${shell.href('/tasks')}${noticeQuery('ok', 'Task reopened.')}`, 303)
      } catch (error) {
        const refusal = hubErrorOf(error)
        if (refusal === undefined) throw error
        return c.redirect(`${shell.href('/tasks')}${noticeQuery('error', refusal.message)}`, 303)
      }
    })
  ctx.router.route(prefix, app)
  ctx.effect(() => shell.nav({ id: 'tasks', label: 'All tasks', icon: '☷', path: '/tasks', order: 30 }))
}
