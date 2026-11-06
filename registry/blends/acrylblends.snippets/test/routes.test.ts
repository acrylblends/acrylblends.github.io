import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createApp, readManifest } from '../src/app.ts'
import { pinnedInstance } from '../plugins/instance/index.ts'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { noticeOf, projectRoot, withApp } from './support.ts'
import { mkdirSync } from 'node:fs'

const scratch = join(projectRoot, '.acrylblends', 'test')
mkdirSync(scratch, { recursive: true })

test('the first page redirects to the library, which shows the seed at once', () =>
  withApp(async (app) => {
    const root = await app.root.router.request('/')
    assert.equal(root.status, 302)
    assert.equal(root.headers.get('location'), '/snippets')
    const page = await app.page('/snippets')
    assert.equal(page.status, 200)
    assert.match(page.html, /Code snippets/)
    assert.match(page.html, /128 reusable pieces/)
    assert.match(page.html, /retry-with-backoff/)
    assert.match(page.html, /Exponential retry wrapper/)
    assert.match(page.html, /TypeScript/)
  }))

test('search, language, tag and starred filters narrow the list', () =>
  withApp(async (app) => {
    const search = await app.page('/snippets?q=postgres')
    assert.match(search.html, /postgres-json-merge/)
    assert.doesNotMatch(search.html, /retry-with-backoff/)
    const python = await app.page('/snippets?language=Python')
    assert.match(python.html, /csv-to-dict/)
    assert.doesNotMatch(python.html, /retry-with-backoff/)
    const starred = await app.page('/snippets?starred=1')
    assert.match(starred.html, /Starred snippets/)
    assert.match(starred.html, /retry-with-backoff/)
    assert.doesNotMatch(starred.html, /slugify/)
    const tag = await app.page('/snippets?tag=resilience')
    assert.match(tag.html, /retry-with-backoff/)
  }))

test('a snippet page shows its code, file name, tags and variables', () =>
  withApp(async (app) => {
    const snippet = app.root.snippets.all().find((item) => item.title === 'retry-with-backoff')
    assert.ok(snippet !== undefined)
    const page = await app.page(`/snippets/${snippet.id}`)
    assert.equal(page.status, 200)
    assert.match(page.html, /retry-with-backoff\.ts/)
    assert.match(page.html, /withRetry/)
    assert.match(page.html, /async/)
    assert.match(page.html, /resilience/)
    assert.match(page.html, /No variables in this snippet/)
  }))

test('starring a snippet from its page persists it', () =>
  withApp(async (app) => {
    const snippet = app.root.snippets.all().find((item) => item.title === 'slugify')
    assert.ok(snippet !== undefined)
    assert.equal(snippet.starred, false)
    const response = await app.post(`/snippets/${snippet.id}/star`, { back: `/snippets/${snippet.id}` })
    assert.equal(response.status, 303)
    assert.equal(noticeOf(response).kind, 'ok')
    assert.equal(app.root.snippets.get(snippet.id)?.starred, true)
    assert.equal(app.store.saved, 1)
  }))

test('the editor makes a snippet, and an invalid form keeps what was typed', () =>
  withApp(async (app) => {
    const form = await app.page('/new')
    assert.equal(form.status, 200)
    assert.match(form.html, /New snippet/)
    const invalid = await app.post('/snippets', { title: '', description: 'x', language: 'TypeScript', code: 'let x = 1', tags: '' })
    assert.equal(invalid.status, 200)
    assert.match(await invalid.text(), /Title is required/)
    const created = await app.post('/snippets', {
      title: 'my-helper',
      description: 'A small helper',
      language: 'JavaScript',
      tags: 'math, helper',
      code: 'export const answer = () => 42;',
    })
    assert.equal(created.status, 303)
    const notice = noticeOf(created)
    assert.equal(notice.kind, 'ok')
    assert.equal(app.root.snippets.all().length, 129)
    const snippet = app.root.snippets.all().find((item) => item.title === 'my-helper')
    assert.ok(snippet !== undefined)
    const page = await app.page(`/snippets/${snippet.id}`)
    assert.match(page.html, /my-helper\.js/)
    assert.match(page.html, /A small helper/)
  }))

test('editing a snippet changes it, and the edit page shows the current values', () =>
  withApp(async (app) => {
    const snippet = app.root.snippets.all()[0]
    assert.ok(snippet !== undefined)
    const edit = await app.page(`/snippets/${snippet.id}/edit`)
    assert.match(edit.html, /Edit /)
    assert.match(edit.html, new RegExp(snippet.title))
    const response = await app.post(`/snippets/${snippet.id}`, {
      title: 'renamed-snippet',
      description: 'A new description',
      language: 'Shell',
      tags: 'new',
      code: 'echo hello',
    })
    assert.equal(response.status, 303)
    const changed = app.root.snippets.get(snippet.id)
    assert.equal(changed?.title, 'renamed-snippet')
    assert.equal(changed?.language, 'Shell')
    assert.match((await app.page(`/snippets/${snippet.id}`)).html, /echo hello/)
  }))

test('deleting asks first, then removes the snippet from the library and its collections', () =>
  withApp(async (app) => {
    const snippet = app.root.snippets.all().find((item) => item.title === 'retry-with-backoff')
    assert.ok(snippet !== undefined)
    const confirm = await app.page(`/snippets/${snippet.id}/delete`)
    assert.equal(confirm.status, 200)
    assert.match(confirm.html, /Delete “retry-with-backoff”\?/)
    const response = await app.post(`/snippets/${snippet.id}/delete`, { back: `/snippets/${snippet.id}` })
    assert.equal(response.status, 303)
    assert.equal(app.root.snippets.get(snippet.id), undefined)
    assert.equal(app.root.snippets.all().length, 127)
    assert.ok(app.root.snippets.collections().every((collection) => !collection.snippetIds.includes(snippet.id)))
  }))

test('collections list, create and take a snippet', () =>
  withApp(async (app) => {
    const list = await app.page('/collections')
    assert.equal(list.status, 200)
    assert.match(list.html, /API patterns/)
    const created = await app.post('/collections', { name: 'Favourites' })
    assert.equal(created.status, 303)
    const collection = app.root.snippets.collections().find((item) => item.name === 'Favourites')
    assert.ok(collection !== undefined)
    const page = await app.page(`/collections/${collection.id}`)
    assert.match(page.html, /Favourites/)
    const snippet = app.root.snippets.all()[0]
    assert.ok(snippet !== undefined)
    const added = await app.post(`/collections/${collection.id}/add`, { snippetId: snippet.id })
    assert.equal(added.status, 303)
    assert.deepEqual(app.root.snippets.collection(collection.id)?.snippetIds, [snippet.id])
    const duplicate = await app.post('/collections', { name: 'favourites' })
    assert.equal(noticeOf(duplicate).kind, 'error')
  }))

test('the languages settings page lists the five languages and their extensions', () =>
  withApp(async (app) => {
    const page = await app.page('/settings/languages')
    assert.equal(page.status, 200)
    assert.match(page.html, /TypeScript/)
    assert.match(page.html, /\.ts/)
    assert.match(page.html, /\.sh/)
    assert.match(page.html, /Supported languages/)
  }))

test('health answers and an unknown path is a 404', () =>
  withApp(async (app) => {
    const health = await app.page('/health')
    assert.equal(health.status, 200)
    const missing = await app.page('/nope')
    assert.equal(missing.status, 404)
  }))

test('every feature is a row of the manifest, in order', () =>
  withApp(async (app) => {
    assert.deepEqual(readManifest().plugins.map((row) => row.id), [
      'router',
      'home',
      'snippets',
      'snips-shell',
      'library',
      'editor',
      'collections',
      'language-settings',
      'extensions',
      'server',
      'acryl-door',
    ])
  }))

test('switching the collections plugin off leaves the app running without it', async () => {
  const manifest = readManifest()
  const without = {
    ...manifest,
    plugins: manifest.plugins.map((row) => (row.id === 'collections' ? { ...row, disabled: true } : row)),
  }
  const home = await mkdtemp(join(scratch, 'app-test-off-'))
  let ids = 0
  const app = await createApp(pinnedInstance(home, { root: projectRoot }), {
    listen: false,
    manifest: without,
    overrides: { snippets: { clock: () => new Date(2026, 10, 6, 9, 41), newId: (kind: string) => `${kind}-${++ids}` } },
  })
  try {
    const library = await app.root.router.request('/snippets', { headers: { accept: 'text/html' } })
    assert.equal(library.status, 200)
    const html = await library.text()
    assert.match(html, /Code snippets/)
    assert.doesNotMatch(html, /All collections/)
    assert.doesNotMatch(html, /API patterns/)
    const missing = await app.root.router.request('/collections')
    assert.equal(missing.status, 404)
  } finally {
    await app.stop()
    await rm(home, { recursive: true, force: true })
  }
})
