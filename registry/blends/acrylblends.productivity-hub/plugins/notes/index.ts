/**
 * Notes: the /notes list and the /notes/:id editor. Cards keep every note's words, space and tags in sight; the editor saves the title, the body,
 * the space and the tags, shows when there are unsaved changes, and links the note to the tasks it belongs with. Recent notes also sit on My Day.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type {} from '../hub-shell/index.ts'
import type { Note } from '../productivity-hub/index.ts'

export const name = 'notes'
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

const fieldsOf = (body: Record<string, unknown>, name: string): string[] => {
  const value = body[name]
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string')
  return []
}

const dayOf = (time: Date): string => {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${String(time.getFullYear())}-${pad(time.getMonth() + 1)}-${pad(time.getDate())}`
}

const previousDay = (day: string): string => {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number)
  const value = new Date(year, month - 1, date)
  value.setDate(value.getDate() - 1)
  return dayOf(value)
}

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const
const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

function shortDay(day: string): string {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number)
  const value = new Date(year, month - 1, date)
  return `${dayNames[value.getDay()] ?? ''} ${String(date)} ${monthNames[month - 1] ?? ''}`
}

function updatedLabel(updatedAt: string, nowDay: string): string {
  const day = updatedAt.slice(0, 10)
  if (day === nowDay) return 'Today'
  if (day === previousDay(nowDay)) return 'Yesterday'
  return shortDay(day)
}

const snippetOf = (body: string): string => {
  const text = body.replace(/\s+/gu, ' ').trim()
  return text.length <= 140 ? text : `${text.slice(0, 137).trimEnd()}…`
}

function noteCard(ctx: Context, note: Note): string {
  const shell = ctx.hubShell
  const project = note.projectId === undefined ? undefined : ctx.hub.projects().find((p) => p.id === note.projectId)
  const color = project === undefined ? '' : ` ${project.color}`
  const where = project?.name ?? 'No space'
  return `<a class="p-note${color}" href="${shell.href(`/notes/${encodeURIComponent(note.id)}`)}" data-note="${escapeHtml(note.id)}">
<small>${escapeHtml(where)} · ${escapeHtml(updatedLabel(note.updatedAt, dayOf(ctx.hub.now())))}</small>
<h3>${escapeHtml(note.title)}</h3>
<p>${escapeHtml(snippetOf(note.body))}</p>
<span>${note.tags.map((tag) => `<span class="p-tag">${escapeHtml(tag)}</span>`).join('')}</span>
</a>`
}

const SCOPED_STYLE = `<style>
.p-notes .p-toolbar{justify-content:space-between}
.p-notes .p-toolbar form{display:flex;gap:8px;align-items:center}
.p-notes .p-toolbar .p-input{width:auto;min-width:180px}
.p-notes .p-card h3{font:500 18px Georgia,serif;margin:0 0 12px}
.p-notes .p-note .p-tag{margin-top:8px}
.p-notes .notes-state{font-size:11px;letter-spacing:.04em}
.p-notes .notes-state[data-state=saved]{color:var(--muted)}
.p-notes .notes-state[data-state=unsaved]{color:var(--warn);background:var(--warn-soft);padding:3px 8px;border-radius:5px;font-weight:600}
.p-notes .notes-meta{display:flex;align-items:baseline;justify-content:space-between;gap:12px;font-size:11px;color:var(--muted);margin-bottom:14px}
.p-notes .notes-links{display:grid;gap:8px}
.p-notes .notes-links label{display:flex;align-items:flex-start;gap:9px;font-size:13px;color:var(--ink-2)}
.p-notes .notes-links input{margin:3px 0 0;width:15px;height:15px;accent-color:var(--accent)}
.p-notes .notes-links small{display:block;color:var(--muted);font-size:11px;margin-top:2px}
.p-notes .notes-danger{margin-top:22px;display:flex;justify-content:flex-end}
.p-notes .p-form .row{align-items:end}
.p-notes .p-field textarea[name=body]{min-height:280px}
</style>`

const DIRTY_SCRIPT = `<script>
(() => {
  const form = document.getElementById('notes-form')
  const state = document.getElementById('notes-state')
  if (form === null || state === null) return
  const snapshot = () => [...new FormData(form).entries()].map(([key, value]) => key + '=' + String(value)).join('&')
  const saved = snapshot()
  let saving = false
  const update = () => {
    const changed = snapshot() !== saved
    state.textContent = changed ? 'Unsaved changes' : 'Saved'
    state.dataset.state = changed ? 'unsaved' : 'saved'
  }
  form.addEventListener('input', update)
  form.addEventListener('change', update)
  form.addEventListener('submit', () => { saving = true })
  addEventListener('beforeunload', (event) => {
    if (saving || snapshot() === saved) return
    event.preventDefault()
    event.returnValue = ''
  })
  update()
})()
</script>`

function listPage(ctx: Context, url: string): string {
  const shell = ctx.hubShell
  const search = new URL(url, 'http://local').searchParams
  const q = search.get('q') ?? ''
  const creating = search.get('new') === '1'
  const notes = ctx.hub.notes(q)
  const projects = ctx.hub.projects()
  const option = (value: string, label: string): string =>
    `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`
  const createForm = creating
    ? `<section class="p-card" id="notes-new" style="margin-top:22px">
<h3>New note</h3>
<form class="p-form" method="post" action="${shell.href('/notes')}">
<label class="p-field">Title<input name="title" required maxlength="200" placeholder="What is this about?"></label>
<div class="row"><label class="p-field">Space<select name="projectId">${option('', 'No space')}${projects.map((project) => option(project.id, project.name)).join('')}</select></label><label class="p-field">Tags<input name="tags" placeholder="comma separated, for example onboarding, ux"></label></div>
<label class="p-field">Note<textarea name="body" maxlength="20000" style="min-height:160px" placeholder="Write it down while it is fresh."></textarea></label>
<div class="row"><button class="p-btn" type="submit">Add note</button><a class="p-link" href="${shell.href('/notes')}">Cancel</a></div>
</form>
</section>`
    : ''
  const grid =
    notes.length === 0
      ? `<div class="p-empty"><b>No notes yet.</b>Write the first one, or clear the search.</div>`
      : `<div class="p-notegrid">${notes.map((note) => noteCard(ctx, note)).join('')}</div>`
  const body = `<div class="p-notes">${SCOPED_STYLE}
${shell.header({
  eyebrow: 'Workspace',
  title: 'Notes.',
  lead: 'Loose thoughts, kept close to the work they belong to.',
  action: `<a class="p-btn" href="${shell.href('/notes?new=1')}">+ New note</a>`,
})}
${shell.notice(url)}
${createForm}
<div class="p-toolbar">
<small class="p-link">${String(notes.length)} ${notes.length === 1 ? 'note' : 'notes'}${q === '' ? '' : ` matching “${escapeHtml(q)}”`}</small>
<form method="get" action="${shell.href('/notes')}"><input class="p-input" type="search" name="q" value="${escapeHtml(q)}" placeholder="Search notes" aria-label="Search notes"><button class="p-btn ghost" type="submit">Search</button></form>
</div>
${grid}
</div>`
  return shell.page({ active: 'notes', title: 'Notes', main: body })
}

function editorPage(ctx: Context, id: string, url: string): string {
  const shell = ctx.hubShell
  const hub = ctx.hub
  const note = hub.note(id)
  const projects = hub.projects()
  const nowDay = dayOf(hub.now())
  const project = note.projectId === undefined ? undefined : projects.find((p) => p.id === note.projectId)
  const linked = hub.linkedTasks(note.id)
  const candidates = [
    ...hub.tasks({ status: 'open' }),
    ...linked.filter((task) => task.status === 'done'),
  ].sort((a, b) => a.title.localeCompare(b.title))
  const option = (value: string, label: string, selected: boolean): string =>
    `<option value="${escapeHtml(value)}"${selected ? ' selected' : ''}>${escapeHtml(label)}</option>`
  const taskLine = candidates.length === 0
    ? `<p class="p-empty">No tasks to link yet. Add one on the tasks page.</p>`
    : `<form class="p-form" method="post" action="${shell.href(`/notes/${encodeURIComponent(note.id)}/links`)}">
<div class="notes-links">${candidates
  .map(
    (task) => `<label><input type="checkbox" name="taskIds" value="${escapeHtml(task.id)}"${task.noteId === note.id ? ' checked' : ''}><span><b>${escapeHtml(task.title)}</b><small>${escapeHtml(
      (task.projectId === undefined ? undefined : projects.find((p) => p.id === task.projectId)?.name) ?? 'No space',
    )}${task.dueAt === undefined ? '' : ` · due ${escapeHtml(shortDay(task.dueAt.slice(0, 10)))}`}</small></span></label>`,
  )
  .join('')}</div>
<div class="row"><button class="p-btn ghost" type="submit">Save linked tasks</button></div>
</form>`
  const body = `<div class="p-notes">${SCOPED_STYLE}
${shell.header({
  eyebrow: 'Notes',
  title: 'Note.',
  lead: 'Edit the words, the space, the tags, or the tasks it belongs with.',
  action: `<a class="p-link" href="${shell.href('/notes')}">← All notes</a>`,
})}
${shell.notice(url)}
<section class="p-card" style="margin-top:22px">
<div class="notes-meta"><span>${escapeHtml(project?.name ?? 'No space')} · edited ${escapeHtml(updatedLabel(note.updatedAt, nowDay))}</span><span class="notes-state" id="notes-state" data-state="saved">Saved</span></div>
<form class="p-form" id="notes-form" method="post" action="${shell.href(`/notes/${encodeURIComponent(note.id)}`)}">
<label class="p-field">Title<input name="title" value="${escapeHtml(note.title)}" required maxlength="200"></label>
<label class="p-field">Note<textarea name="body" maxlength="20000">${escapeHtml(note.body)}</textarea></label>
<div class="row">
<label class="p-field">Space<select name="projectId">${option('', 'No space', note.projectId === undefined)}${projects.map((p) => option(p.id, p.name, p.id === note.projectId)).join('')}</select></label>
<label class="p-field">Tags<input name="tags" value="${escapeHtml(note.tags.join(', '))}" placeholder="comma separated"></label>
<button class="p-btn" type="submit">Save note</button>
</div>
</form>
</section>
<section class="p-card" style="margin-top:18px">
<h3>Linked tasks</h3>
${taskLine}
</section>
<form class="notes-danger" method="post" action="${shell.href(`/notes/${encodeURIComponent(note.id)}/delete`)}" onsubmit="return confirm('Delete this note? Its linked tasks stay.')"><button class="p-btn danger" type="submit">Delete note</button></form>
</div>`
  return shell.page({ active: 'notes', title: note.title, main: body, scripts: DIRTY_SCRIPT })
}

function notFoundPage(ctx: Context): string {
  return ctx.hubShell.page({
    active: 'notes',
    title: 'Note not found',
    main: `${ctx.hubShell.header({ eyebrow: 'Notes', title: 'That note is not here.' })}<p><a class="p-link" href="${ctx.hubShell.href('/notes')}">← All notes</a></p>`,
  })
}

export function apply(ctx: Context): void {
  const shell = ctx.hubShell
  const prefix = shell.prefix === '' ? '/' : shell.prefix
  const app = new Acryl()
    .get('/notes', (c) => c.html(listPage(ctx, c.req.url)))
    .post('/notes', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      try {
        const note = await ctx.hub.addNote({
          title: fieldOf(body, 'title'),
          body: fieldOf(body, 'body') ?? '',
          projectId: fieldOf(body, 'projectId') ?? '',
          tags: fieldOf(body, 'tags') ?? '',
        })
        return c.redirect(`${shell.href(`/notes/${encodeURIComponent(note.id)}`)}${noticeQuery('ok', 'Note added.')}`, 303)
      } catch (error) {
        const refusal = hubErrorOf(error)
        if (refusal === undefined) throw error
        return c.redirect(`${shell.href('/notes?new=1')}${noticeQuery('error', refusal.message).replace('?', '&')}`, 303)
      }
    })
    .get('/notes/:id', (c) => {
      try {
        return c.html(editorPage(ctx, c.req.param('id'), c.req.url))
      } catch (error) {
        if (hubErrorOf(error)?.code === 'not-found') return c.html(notFoundPage(ctx), 404)
        throw error
      }
    })
    .post('/notes/:id', async (c) => {
      const id = c.req.param('id')
      const body = (await c.req.parseBody()) as Record<string, unknown>
      try {
        await ctx.hub.saveNote(id, {
          title: fieldOf(body, 'title'),
          body: fieldOf(body, 'body'),
          projectId: fieldOf(body, 'projectId') ?? '',
          tags: fieldOf(body, 'tags'),
        })
        return c.redirect(`${shell.href(`/notes/${encodeURIComponent(id)}`)}${noticeQuery('ok', 'Note saved.')}`, 303)
      } catch (error) {
        const refusal = hubErrorOf(error)
        if (refusal === undefined) throw error
        return c.redirect(`${shell.href(`/notes/${encodeURIComponent(id)}`)}${noticeQuery('error', refusal.message)}`, 303)
      }
    })
    .post('/notes/:id/links', async (c) => {
      const id = c.req.param('id')
      const body = (await c.req.parseBody()) as Record<string, unknown>
      try {
        ctx.hub.note(id)
        const posted = new Set(fieldsOf(body, 'taskIds'))
        for (const task of ctx.hub.linkedTasks(id)) if (!posted.has(task.id)) await ctx.hub.updateTask(task.id, { noteId: '' })
        for (const taskId of posted) {
          const task = ctx.hub.task(taskId)
          if (task.noteId !== id) await ctx.hub.updateTask(task.id, { noteId: id })
        }
        return c.redirect(`${shell.href(`/notes/${encodeURIComponent(id)}`)}${noticeQuery('ok', 'Linked tasks saved.')}`, 303)
      } catch (error) {
        const refusal = hubErrorOf(error)
        if (refusal === undefined) throw error
        return c.redirect(`${shell.href(`/notes/${encodeURIComponent(id)}`)}${noticeQuery('error', refusal.message)}`, 303)
      }
    })
    .post('/notes/:id/delete', async (c) => {
      const id = c.req.param('id')
      try {
        await ctx.hub.deleteNote(id)
        return c.redirect(`${shell.href('/notes')}${noticeQuery('ok', 'Note deleted.')}`, 303)
      } catch (error) {
        const refusal = hubErrorOf(error)
        if (refusal === undefined) throw error
        return c.redirect(`${shell.href('/notes')}${noticeQuery('error', refusal.message)}`, 303)
      }
    })
  ctx.router.route(prefix, app)
  ctx.effect(() => shell.nav({ id: 'notes', label: 'Notes', icon: '▤', path: '/notes', order: 40 }))
}
