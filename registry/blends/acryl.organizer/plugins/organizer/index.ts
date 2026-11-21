/**
 * The organizer: to-dos, a calendar and meeting booking that refuses overlaps, as one feature plugin. `lib/domain.js` (the rules, pure) and `lib/store.js` (one JSON file,
 * written atomically) are the starter's own code from before it was an acrylblends app; this file is the adapter: JSON routes under `/organizer` that the page and the agent
 * call, and a widget on the first screen with the to-do list, the day's agenda and a booking form.
 *
 * Routes: GET /state, POST /todo {title, due?}, POST /todo-done {id}, POST /meeting {title, start, minutes?, with?}, POST /meeting-cancel {id},
 * GET /agenda?day=YYYY-MM-DD, GET /free-slots?day=YYYY-MM-DD&minutes=30. A refused request answers {error} with 422 (a rule said no) or 400 (a bad body).
 */
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '@acryldev/blends'
import type {} from '../home/index.ts'
import type {} from '@acryldev/instance'
import * as domain from './lib/domain.js'
import { fileStore, type OrganizerStore } from './lib/store.js'

export const name = 'organizer'
export const inject = ['router', 'home', 'appInstance']

export interface OrganizerConfig {
  /** A store for tests; absent, `organizer.json` in the app's home. */
  readonly store?: OrganizerStore
}

const escapeHtml = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

const body = async (request: { json(): Promise<unknown> }): Promise<Record<string, unknown>> => {
  const parsed = await request.json().catch(() => undefined)
  return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
}

export function apply(ctx: Context, config: OrganizerConfig = {}): void {
  const store = config.store ?? fileStore(join(ctx.appInstance.home, 'organizer.json'))
  const app = new Acryl()
  // One use case per route: load, apply a domain rule, save, answer with the state. A rule that says no is a 422 with its own words.
  const change = (run: (state: domain.OrganizerState, input: Record<string, unknown>) => domain.OrganizerState) =>
    async (c: { req: { json(): Promise<unknown> }; json(value: unknown, status?: 200 | 400 | 422): Response }) => {
      try {
        const next = run(store.load(), await body(c.req))
        store.save(next)
        return c.json(next)
      } catch (cause) {
        return c.json({ error: (cause as Error).message }, cause instanceof domain.OrganizerError ? 422 : 400)
      }
    }
  const read = (run: (state: domain.OrganizerState, query: (key: string) => string | undefined) => unknown) =>
    (c: { req: { query(key: string): string | undefined }; json(value: unknown, status?: 200 | 400 | 422): Response }) => {
      try {
        return c.json(run(store.load(), (key) => c.req.query(key)))
      } catch (cause) {
        return c.json({ error: (cause as Error).message }, cause instanceof domain.OrganizerError ? 422 : 400)
      }
    }
  app
    .get('/state', read((state) => state))
    .get('/agenda', read((state, query) => domain.agenda(state, query('day'))))
    .get('/free-slots', read((state, query) => domain.freeSlots(state, query('day'), query('minutes') === undefined ? 30 : Number(query('minutes')))))
    .post('/todo', change((state, input) => domain.addTodo(state, input)))
    .post('/todo-done', change((state, input) => domain.completeTodo(state, Number(input.id))))
    .post('/meeting', change((state, input) => domain.bookMeeting(state, input)))
    .post('/meeting-cancel', change((state, input) => domain.cancelMeeting(state, Number(input.id))))
  ctx.router.route('/organizer', app)

  ctx.effect(() =>
    ctx.home.widget({
      id: 'organizer',
      title: 'Organizer',
      render: () => {
        const state = store.load()
        const todos = domain.openTodos(state)
        return `<div id="organizer" data-test="organizer">
<section><h3>To-dos</h3>
<ul id="organizer-todos">${todos.map((todo) => `<li data-id="${String(todo.id)}"><button type="button" data-done="${String(todo.id)}" aria-label="Done">Done</button> ${escapeHtml(todo.title)}${todo.due === undefined ? '' : ` <small>due ${escapeHtml(todo.due)}</small>`}</li>`).join('')}${todos.length === 0 ? '<li><em>Nothing to do.</em></li>' : ''}</ul>
<form id="organizer-todo-form"><input name="title" placeholder="What to do" required maxlength="200"> <input name="due" type="date"> <button type="submit">Add</button></form></section>
<section><h3>Calendar</h3>
<p><label>Day <input id="organizer-day" type="date"></label></p>
<div id="organizer-agenda" aria-live="polite"></div>
<form id="organizer-meeting-form"><input name="title" placeholder="Meeting" required maxlength="200"> <input name="start" type="datetime-local" required> <input name="minutes" type="number" min="1" max="1440" value="30" aria-label="Minutes"> <input name="with" placeholder="With (optional)"> <button type="submit">Book</button></form>
<p id="organizer-error" role="alert" hidden></p></section>
</div>
<script type="module">
  const root = document.getElementById('organizer')
  const url = (path) => 'organizer/' + path
  const day = document.getElementById('organizer-day')
  day.value = new Date().toISOString().slice(0, 10)
  const error = document.getElementById('organizer-error')
  const text = (value) => { const node = document.createElement('span'); node.textContent = value; return node.innerHTML }
  async function call(path, options) {
    const response = await fetch(url(path), options)
    const data = await response.json()
    if (!response.ok) { error.textContent = data.error; error.hidden = false; return undefined }
    error.hidden = true
    return data
  }
  const post = (path, payload) => call(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
  async function agenda() {
    const data = await call('agenda?day=' + day.value)
    if (!data) return
    const meetings = data.meetings.map((m) => '<li data-meeting="' + m.id + '">' + text(m.start.slice(11, 16)) + ' to ' + text(m.end.slice(11, 16)) + ' ' + text(m.title) + (m.with ? ' with ' + text(m.with) : '') + ' <button type="button" data-cancel="' + m.id + '">Cancel</button></li>').join('')
    const due = data.todos.map((t) => '<li>due: ' + text(t.title) + '</li>').join('')
    document.getElementById('organizer-agenda').innerHTML = '<ul>' + (meetings + due || '<li><em>Nothing on this day.</em></li>') + '</ul>'
  }
  root.addEventListener('click', async (event) => {
    const done = event.target.closest('[data-done]')
    const cancel = event.target.closest('[data-cancel]')
    if (done && await post('todo-done', { id: Number(done.dataset.done) })) location.reload()
    if (cancel && await post('meeting-cancel', { id: Number(cancel.dataset.cancel) })) agenda()
  })
  document.getElementById('organizer-todo-form').addEventListener('submit', async (event) => {
    event.preventDefault()
    const form = new FormData(event.target)
    if (await post('todo', { title: form.get('title'), due: form.get('due') || undefined })) location.reload()
  })
  document.getElementById('organizer-meeting-form').addEventListener('submit', async (event) => {
    event.preventDefault()
    const form = new FormData(event.target)
    const start = new Date(String(form.get('start'))).toISOString()
    if (await post('meeting', { title: form.get('title'), start, minutes: Number(form.get('minutes')), with: form.get('with') || undefined })) { event.target.reset(); agenda() }
  })
  day.addEventListener('change', agenda)
  agenda()
</script>`
      },
    }),
  )
}
