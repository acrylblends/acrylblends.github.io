import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { pinnedInstance, withPort } from '@acryldev/instance'
import { type App, createApp } from '../src/app.ts'

/** Throwaway homes live inside the project (`.acrylblends/` is ignored by git): a sandboxed agent may not write to the system temp folder. */
const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const scratch = join(projectRoot, '.acrylblends', 'test')
mkdirSync(scratch, { recursive: true })

async function withApp(home: string, run: (app: App) => Promise<void>) {
  const app = await createApp(withPort(pinnedInstance(home, { root: projectRoot }), 0), { listen: false })
  try {
    await run(app)
  } finally {
    await app.stop()
  }
}

const send = (app: App, path: string, payload?: unknown) =>
  app.root.router.request(`/organizer/${path}`, payload === undefined ? undefined : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })

test('the widget is on the first screen', async () => {
  const home = await mkdtemp(join(scratch, 'organizer-'))
  try {
    await withApp(home, async (app) => {
      const page = await app.root.router.request('/', { headers: { accept: 'text/html' } })
      const html = await page.text()
      assert.ok(html.includes('data-test="organizer"'), 'the organizer widget is rendered')
      assert.ok(html.includes('Nothing to do.'))
    })
  } finally { await rm(home, { recursive: true, force: true }) }
})

test('to-dos: add, list and finish one; a bad title is refused with the rule\'s words', async () => {
  const home = await mkdtemp(join(scratch, 'organizer-'))
  try {
    await withApp(home, async (app) => {
      const added = await send(app, 'todo', { title: 'Buy milk', due: '2026-12-01' })
      assert.equal(added.status, 200)
      assert.deepEqual((await added.json() as { todos: unknown[] }).todos, [{ id: 1, title: 'Buy milk', due: '2026-12-01', done: false }])
      const refused = await send(app, 'todo', { title: '   ' })
      assert.equal(refused.status, 422)
      assert.match((await refused.json() as { error: string }).error, /title is required/u)
      assert.equal((await send(app, 'todo-done', { id: 1 })).status, 200)
      assert.equal((await send(app, 'todo-done', { id: 1 })).status, 422)
      const page = await (await app.root.router.request('/', { headers: { accept: 'text/html' } })).text()
      assert.ok(!page.includes('Buy milk'), 'a done to-do leaves the list')
    })
  } finally { await rm(home, { recursive: true, force: true }) }
})

test('meetings: a booking that overlaps another is refused, back to back is allowed, the agenda and free slots follow', async () => {
  const home = await mkdtemp(join(scratch, 'organizer-'))
  try {
    await withApp(home, async (app) => {
      assert.equal((await send(app, 'meeting', { title: 'Standup', start: '2026-12-01T09:00:00Z', minutes: 30 })).status, 200)
      const clash = await send(app, 'meeting', { title: 'Clash', start: '2026-12-01T09:15:00Z', minutes: 30 })
      assert.equal(clash.status, 422)
      assert.match((await clash.json() as { error: string }).error, /overlaps meeting 1 "Standup"/u)
      assert.equal((await send(app, 'meeting', { title: 'Review', start: '2026-12-01T09:30:00Z', minutes: 60, with: 'Ana' })).status, 200)
      await send(app, 'todo', { title: 'Prepare', due: '2026-12-01' })
      const agenda = await (await send(app, 'agenda?day=2026-12-01')).json() as { meetings: { title: string }[]; todos: { title: string }[] }
      assert.deepEqual(agenda.meetings.map((m) => m.title), ['Standup', 'Review'])
      assert.deepEqual(agenda.todos.map((t) => t.title), ['Prepare'])
      const free = await (await send(app, 'free-slots?day=2026-12-01&minutes=60')).json() as { start: string }[]
      assert.deepEqual(free.map((slot) => slot.start), ['2026-12-01T10:30:00.000Z'])
      assert.equal((await send(app, 'meeting-cancel', { id: 1 })).status, 200)
      assert.equal((await send(app, 'meeting-cancel', { id: 1 })).status, 422)
      assert.equal((await send(app, 'agenda')).status, 422)
    })
  } finally { await rm(home, { recursive: true, force: true }) }
})

test('the data survives a restart, and the widget belongs to its plugin', async () => {
  const home = await mkdtemp(join(scratch, 'organizer-'))
  try {
    await withApp(home, async (app) => { await send(app, 'todo', { title: 'Remember me' }) })
    await withApp(home, async (app) => {
      const state = await (await send(app, 'state')).json() as { todos: { title: string }[] }
      assert.deepEqual(state.todos.map((t) => t.title), ['Remember me'])
      assert.ok((await (await app.root.router.request('/', { headers: { accept: 'text/html' } })).text()).includes('Remember me'))
      assert.deepEqual(app.root.home.widgets().map((widget) => widget.id), ['organizer'])
    })
  } finally { await rm(home, { recursive: true, force: true }) }
})
