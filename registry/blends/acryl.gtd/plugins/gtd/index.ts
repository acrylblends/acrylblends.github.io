/**
 * GTD (Getting Things Done): capture everything into an inbox, triage each item into exactly one bucket, read it back by bucket, project or day. `lib/domain.js` (the rules, pure) and
 * `lib/store.js` (one JSON file, written atomically) are the starter's own code from before it was an acrylblends app; this file is the adapter: JSON routes under `/gtd` that the
 * page and the agent call, and the board as a widget on the first screen (a capture box, a column per bucket, a calendar of due days, projects).
 *
 * Routes: GET /state, GET /items?status=inbox|next|waiting|someday|reference|done|trash, GET /projects, GET /project?name=, GET /agenda?day=YYYY-MM-DD, GET /upcoming?from=&days=,
 * POST /capture {title, note?, due?, tags?}, POST /triage {id, status, project?, due?, tags?}, POST /complete {id}. A refused request answers {error} with 422 (a rule said no) or 400.
 */
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '@acryldev/blends'
import type {} from '../home/index.ts'
import type {} from '@acryldev/instance'
import * as domain from './lib/domain.js'
import { type GtdStore, fileStore } from './lib/store.js'

export const name = 'gtd'
export const inject = ['router', 'home', 'appInstance']

export interface GtdConfig {
  /** A store for tests; absent, `gtd.json` in the app's home. */
  readonly store?: GtdStore
}

const body = async (request: { json(): Promise<unknown> }): Promise<Record<string, unknown>> => {
  const parsed = await request.json().catch(() => undefined)
  return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
}

type Reply = { json(value: unknown, status?: 200 | 400 | 422): Response }

export function apply(ctx: Context, config: GtdConfig = {}): void {
  const store = config.store ?? fileStore(join(ctx.appInstance.home, 'gtd.json'))
  const refused = (c: Reply, cause: unknown) => c.json({ error: (cause as Error).message }, cause instanceof domain.GtdError ? 422 : 400)
  const change = (run: (state: domain.GtdState, input: Record<string, unknown>) => domain.GtdState) =>
    async (c: Reply & { req: { json(): Promise<unknown> } }) => {
      try {
        const next = run(store.load(), await body(c.req))
        store.save(next)
        return c.json(next)
      } catch (cause) {
        return refused(c, cause)
      }
    }
  const read = (run: (state: domain.GtdState, query: (key: string) => string | undefined) => unknown) =>
    (c: Reply & { req: { query(key: string): string | undefined } }) => {
      try {
        return c.json(run(store.load(), (key) => c.req.query(key)))
      } catch (cause) {
        return refused(c, cause)
      }
    }
  const app = new Acryl()
    .get('/state', read((state) => state))
    .get('/items', read((state, query) => domain.byStatus(state, query('status') ?? 'inbox')))
    .get('/projects', read((state) => domain.projects(state)))
    .get('/project', read((state, query) => domain.itemsForProject(state, query('name'))))
    .get('/agenda', read((state, query) => domain.agenda(state, query('day'))))
    .get('/upcoming', read((state, query) => domain.upcoming(state, query('from'), query('days') === undefined ? 7 : Number(query('days')))))
    .post('/capture', change((state, input) => domain.capture(state, input)))
    .post('/triage', change((state, input) => domain.triage(state, { ...input, id: Number(input.id) })))
    .post('/complete', change((state, input) => domain.complete(state, Number(input.id))))
  ctx.router.route('/gtd', app)

  ctx.effect(() =>
    ctx.home.widget({
      id: 'gtd',
      title: 'GTD',
      render: () => `<div id="gtd" data-test="gtd">
<style>#gtd nav{display:flex;gap:.5rem;margin:.5rem 0}#gtd nav button[aria-selected=true]{font-weight:700}#gtd .cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(10rem,1fr));gap:.6rem}#gtd .col{border:1px solid #8884;border-radius:.5rem;padding:.5rem;min-width:0}#gtd .col h4{margin:0 0 .4rem}#gtd .item{border-top:1px solid #8884;padding:.35rem 0;font-size:.9rem}#gtd .item small{display:block;opacity:.7}#gtd .item select{max-width:100%}#gtd form{display:flex;gap:.4rem;margin:.5rem 0}#gtd form input[name=title]{flex:1}</style>
<form id="gtd-capture"><input name="title" placeholder="Capture anything: what is on your mind?" required maxlength="200"><button type="submit">Capture</button></form>
<nav role="tablist"><button type="button" role="tab" data-tab="board" aria-selected="true">Board</button><button type="button" role="tab" data-tab="calendar" aria-selected="false">Calendar</button><button type="button" role="tab" data-tab="projects" aria-selected="false">Projects</button></nav>
<p id="gtd-error" role="alert" hidden></p>
<section id="gtd-board"></section><section id="gtd-calendar" hidden></section><section id="gtd-projects" hidden></section>
</div>
<script type="module">
  const url = (path) => 'gtd/' + path
  const esc = (value) => { const node = document.createElement('span'); node.textContent = String(value ?? ''); return node.innerHTML }
  const BUCKETS = [['inbox', 'Inbox'], ['next', 'Next actions'], ['waiting', 'Waiting for'], ['someday', 'Someday/maybe'], ['reference', 'Reference']]
  const error = document.getElementById('gtd-error')
  async function call(path, payload) {
    const response = await fetch(url(path), payload === undefined ? undefined : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
    const data = await response.json()
    if (!response.ok) { error.textContent = data.error; error.hidden = false; return undefined }
    error.hidden = true
    return data
  }
  let state
  const today = new Date().toISOString().slice(0, 10)
  function board() {
    document.getElementById('gtd-board').innerHTML = '<div class="cols">' + BUCKETS.map(([key, label]) => {
      const items = state.items.filter((item) => item.status === key)
      return '<div class="col" data-bucket="' + key + '"><h4>' + label + ' (' + items.length + ')</h4>' + (items.map((item) => '<div class="item" data-item="' + item.id + '">' + esc(item.title) + (item.project ? '<small>' + esc(item.project) + '</small>' : '') + (item.due ? '<small>due ' + esc(item.due) + '</small>' : '') + '<select data-triage="' + item.id + '" aria-label="Move to"><option value="">Move to...</option>' + [...BUCKETS.filter(([k]) => k !== 'inbox'), ['done', 'Done'], ['trash', 'Trash']].filter(([k]) => k !== key).map(([k, l]) => '<option value="' + k + '">' + l + '</option>').join('') + '</select></div>').join('') || '<small>Empty</small>') + '</div>'
    }).join('') + '</div>'
  }
  async function calendar() {
    const upcoming = await call('upcoming?from=' + today + '&days=14')
    document.getElementById('gtd-calendar').innerHTML = upcoming ? (upcoming.map((day) => '<h4>' + esc(day.day) + '</h4>' + day.items.map((item) => '<div class="item">' + esc(item.title) + ' <small>' + esc(item.status) + '</small></div>').join('')).join('') || '<p><em>Nothing due in the next 14 days.</em></p>') : ''
  }
  async function projects() {
    const list = await call('projects')
    document.getElementById('gtd-projects').innerHTML = list ? ('<ul>' + list.map((p) => '<li>' + esc(p.project) + ': ' + p.open + ' open, ' + p.done + ' done</li>').join('') + '</ul>' || '') + (list.length === 0 ? '<p><em>No projects yet: triage an item with a project.</em></p>' : '') : ''
  }
  async function load() { const next = await call('state'); if (next) { state = next; board() } }
  const root = document.getElementById('gtd')
  root.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-tab]')
    if (!tab) return
    for (const button of root.querySelectorAll('[data-tab]')) button.setAttribute('aria-selected', String(button === tab))
    for (const name of ['board', 'calendar', 'projects']) document.getElementById('gtd-' + name).hidden = name !== tab.dataset.tab
    if (tab.dataset.tab === 'calendar') calendar()
    if (tab.dataset.tab === 'projects') projects()
  })
  root.addEventListener('change', async (event) => {
    const select = event.target.closest('[data-triage]')
    if (!select || !select.value) return
    const next = await call('triage', { id: Number(select.dataset.triage), status: select.value })
    if (next) { state = next; board() }
  })
  document.getElementById('gtd-capture').addEventListener('submit', async (event) => {
    event.preventDefault()
    const next = await call('capture', { title: new FormData(event.target).get('title') })
    if (next) { state = next; board(); event.target.reset() }
  })
  load()
</script>`,
    }),
  )
}
