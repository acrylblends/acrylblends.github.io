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

async function withHome(run: (home: string) => Promise<void>) {
  const home = await mkdtemp(join(scratch, 'gtd-'))
  try {
    await run(home)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
}
async function withApp(home: string, run: (app: App) => Promise<void>) {
  const app = await createApp(withPort(pinnedInstance(home, { root: projectRoot }), 0), { listen: false })
  try {
    await run(app)
  } finally {
    await app.stop()
  }
}
const send = (app: App, path: string, payload?: unknown) =>
  app.root.router.request(`/gtd/${path}`, payload === undefined ? undefined : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
const json = async <T>(response: Response) => (await response.json()) as T
type Item = { id: number; title: string; status: string; project?: string; due?: string }

test('the board is on the first screen', () =>
  withHome((home) =>
    withApp(home, async (app) => {
      const html = await (await app.root.router.request('/', { headers: { accept: 'text/html' } })).text()
      assert.ok(html.includes('data-test="gtd"'))
      assert.ok(html.includes('Capture anything'))
    })))

test('capture goes to the inbox; triage decides one bucket, with a project and a day; a wrong bucket or an empty title is refused', () =>
  withHome((home) =>
    withApp(home, async (app) => {
      assert.equal((await send(app, 'capture', { title: 'Call the bank', due: '2026-12-02' })).status, 200)
      const empty = await send(app, 'capture', { title: '  ' })
      assert.equal(empty.status, 422)
      assert.match((await json<{ error: string }>(empty)).error, /title is required/u)
      assert.deepEqual((await json<Item[]>(await send(app, 'items'))).map((i) => [i.title, i.status]), [['Call the bank', 'inbox']])
      const triaged = await send(app, 'triage', { id: 1, status: 'next', project: 'Admin', due: '2026-12-02' })
      assert.equal(triaged.status, 200)
      assert.deepEqual((await json<Item[]>(await send(app, 'items?status=next'))).map((i) => [i.title, i.project]), [['Call the bank', 'Admin']])
      assert.deepEqual(await json<unknown[]>(await send(app, 'items?status=inbox')), [])
      assert.equal((await send(app, 'triage', { id: 1, status: 'maybe' })).status, 422)
      assert.equal((await send(app, 'triage', { id: 99, status: 'next' })).status, 422)
      assert.equal((await send(app, 'items?status=bogus')).status, 422)
    })))

test('complete, projects, agenda and upcoming follow the items', () =>
  withHome((home) =>
    withApp(home, async (app) => {
      await send(app, 'capture', { title: 'Write report', due: '2026-12-03' })
      await send(app, 'capture', { title: 'Book venue', due: '2026-12-03' })
      await send(app, 'triage', { id: 1, status: 'next', project: 'Launch' })
      await send(app, 'triage', { id: 2, status: 'waiting', project: 'Launch' })
      assert.deepEqual(await json<unknown[]>(await send(app, 'projects')), [{ project: 'Launch', open: 2, done: 0 }])
      assert.deepEqual((await json<Item[]>(await send(app, 'agenda?day=2026-12-03'))).map((i) => i.title), ['Write report', 'Book venue'])
      const upcoming = await json<{ day: string; items: Item[] }[]>(await send(app, 'upcoming?from=2026-12-01&days=5'))
      assert.deepEqual(upcoming.map((d) => d.day), ['2026-12-03'])
      assert.equal((await send(app, 'complete', { id: 1 })).status, 200)
      assert.deepEqual(await json<unknown[]>(await send(app, 'projects')), [{ project: 'Launch', open: 1, done: 1 }])
      assert.deepEqual((await json<Item[]>(await send(app, 'project?name=Launch'))).map((i) => i.status), ['done', 'waiting'])
      assert.equal((await send(app, 'agenda')).status, 422)
      assert.equal((await send(app, 'complete', { id: 42 })).status, 422)
    })))

test('the items survive a restart', () =>
  withHome(async (home) => {
    await withApp(home, async (app) => { await send(app, 'capture', { title: 'Remember me' }) })
    await withApp(home, async (app) => {
      assert.deepEqual((await json<Item[]>(await send(app, 'items'))).map((i) => i.title), ['Remember me'])
      assert.deepEqual(app.root.home.widgets().map((widget) => widget.id), ['gtd'])
    })
  }))
