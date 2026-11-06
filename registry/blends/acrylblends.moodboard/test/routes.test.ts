import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import { createApp, readManifest } from '../src/app.ts'
import type { BoardState } from '../plugins/boards/domain.ts'
import { pinnedInstance } from '../plugins/instance/index.ts'
import { noticeOf, NOW, projectRoot, withApp } from './support.ts'

const objectCount = (html: string): number => (html.match(/class="item /g) ?? []).length
const scratch = join(projectRoot, '.acrylblends', 'test')
mkdirSync(scratch, { recursive: true })

test('the first page is the mockup board: its chrome, tools, palette, layers, six objects and no remote asset', () =>
  withApp(async (app) => {
    const page = await app.page('/')
    assert.equal(page.status, 200)
    assert.match(page.html, /FIELD<span>NOTES<\/span>/)
    assert.match(page.html, /Projects \/ Brand refresh \/ <b>Quiet Modern<\/b>/)
    for (const label of ['ADD TO CANVAS', 'Image', 'Text note', 'Colour palette', 'Reference card', 'Link', 'PALETTE', 'LAYERS', 'Materials', 'Direction', 'Palette v2', 'References', 'Quote', 'Caption']) {
      assert.match(page.html, new RegExp(label))
    }
    assert.match(page.html, /BRAND SYSTEM \/ DIRECTION BOARD/)
    assert.match(page.html, /<h1>Quiet Modern<\/h1>/)
    assert.match(page.html, /6 OBJECTS &nbsp;·&nbsp; AUTOSAVE ON &nbsp;·&nbsp; OWNER: DESIGN STUDIO/)
    assert.equal(objectCount(page.html), 6)
    assert.match(page.html, /data-move="\/objects\/__id__\/move"/)
    assert.match(page.html, /aria-label="Select colour #263f35"/)
    assert.doesNotMatch(page.html, /https?:\/\//)
  }))

test('the move endpoint validates and persists, answering JSON for a drag', () =>
  withApp(async (app) => {
    const object = app.root.boards.objects()[0]
    assert.ok(object !== undefined)
    const response = await app.root.router.request(`/objects/${object.id}/move`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({ x: '33.5', y: '44.25' }).toString(),
    })
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { ok: true, x: 33.5, y: 44.25 })
    assert.equal(app.root.boards.object(object.id)?.x, 33.5)
    assert.equal(app.store.saved, 1)
    const form = await app.post(`/objects/${object.id}/move`, { x: '-5', y: '120' })
    assert.equal(form.status, 303)
    assert.equal(noticeOf(form).kind, 'ok')
    assert.equal(app.root.boards.object(object.id)?.x, 0)
    assert.equal(app.root.boards.object(object.id)?.y, 100)
  }))

test('the add form makes a note, and invalid input keeps the form', () =>
  withApp(async (app) => {
    const form = await app.page('/objects/new?type=note')
    assert.equal(form.status, 200)
    assert.match(form.html, /Add to canvas/)
    assert.match(form.html, /NAME IN LAYERS/)
    const invalid = await app.post('/objects/new', { type: 'note', content: '', name: 'Direction' })
    assert.equal(invalid.status, 200)
    assert.match(await invalid.text(), /needs some content/)
    const created = await app.post('/objects/new', { type: 'note', content: 'Less, but warmer.', name: 'Tone note', label: 'PRINCIPLE 02', width: '180' })
    assert.equal(created.status, 303)
    assert.equal(noticeOf(created).kind, 'ok')
    assert.equal(noticeOf(created).path, '/')
    assert.equal(app.root.boards.objects().length, 7)
    const note = app.root.boards.objects().find((object) => object.name === 'Tone note')
    assert.ok(note !== undefined)
    assert.equal(note.content, 'Less, but warmer.')
    assert.equal(note.label, 'PRINCIPLE 02')
  }))

test('editing, duplicating, layering and deleting an object all persist', () =>
  withApp(async (app) => {
    const source = app.root.boards.objects().find((object) => object.type === 'note')
    assert.ok(source !== undefined)
    const edit = await app.page(`/objects/${source.id}/edit`)
    assert.equal(edit.status, 200)
    assert.match(edit.html, /DESIGN PRINCIPLE 01/)
    const saved = await app.post(`/objects/${source.id}`, { content: 'Warmth without noise, but softer.', name: 'Direction', label: 'DESIGN PRINCIPLE 01', width: '180', rotation: '-1' })
    assert.equal(saved.status, 303)
    assert.equal(noticeOf(saved).kind, 'ok')
    assert.equal(app.root.boards.object(source.id)?.content, 'Warmth without noise, but softer.')
    assert.equal(app.root.boards.object(source.id)?.rotation, -1)
    const duplicated = await app.post(`/objects/${source.id}/duplicate`, {})
    assert.equal(duplicated.status, 303)
    assert.equal(app.root.boards.objects().length, 7)
    const layered = await app.post(`/objects/${source.id}/layer`, { direction: 'up' })
    assert.equal(layered.status, 303)
    assert.equal(app.root.boards.object(source.id)?.zIndex, 3)
    const removed = await app.post(`/objects/${source.id}/delete`, {})
    assert.equal(removed.status, 303)
    assert.equal(app.root.boards.object(source.id), undefined)
    assert.equal(app.root.boards.objects().length, 6)
  }))

test('the assets page lists the library, places an asset on the board and validates new ones', () =>
  withApp(async (app) => {
    const page = await app.page('/assets')
    assert.equal(page.status, 200)
    assert.match(page.html, /Natural materials/)
    assert.match(page.html, /Architecture reference/)
    assert.match(page.html, /Window light/)
    assert.equal((page.html.match(/Use on board/g) ?? []).length, 8)
    const image = app.root.boards.assets().find((asset) => asset.kind === 'image')
    assert.ok(image !== undefined)
    const placed = await app.post(`/assets/${image.id}/use`, {})
    assert.equal(placed.status, 303)
    assert.equal(app.root.boards.objects().length, 7)
    const invalid = await app.post('/assets', { kind: 'color', name: 'Broken', colorValue: 'red' })
    assert.equal(invalid.status, 200)
    assert.match(await invalid.text(), /six-digit hex/)
    const added = await app.post('/assets', { kind: 'color', name: 'Clay', colorValue: '#B96E4C', tags: 'warm, clay' })
    assert.equal(added.status, 303)
    assert.equal(noticeOf(added).path, '/assets')
    assert.equal(app.root.boards.assets().length, 9)
  }))

test('board settings validate and save, and the export is a JSON download', () =>
  withApp(async (app) => {
    const page = await app.page('/settings')
    assert.equal(page.status, 200)
    assert.match(page.html, /Board settings/)
    const invalid = await app.post('/settings', { title: 'Quiet Modern', project: 'Brand refresh', width: '200', height: '760', collaborators: 'Design Studio' })
    assert.equal(invalid.status, 200)
    assert.match(await invalid.text(), /width must be between/)
    const saved = await app.post('/settings', { title: 'Quiet Modern v2', project: 'Brand refresh 2027', width: '1400', height: '900', collaborators: 'Design Studio, Maya Chen' })
    assert.equal(saved.status, 303)
    assert.equal(noticeOf(saved).kind, 'ok')
    assert.equal(app.root.boards.board().title, 'Quiet Modern v2')
    assert.equal(app.root.boards.board().width, 1400)
    const exported = await app.root.router.request('/export.json')
    assert.equal(exported.status, 200)
    assert.match(exported.headers.get('content-type') ?? '', /application\/json/)
    assert.match(exported.headers.get('content-disposition') ?? '', /quiet-modern-v2\.json/)
    const body = (await exported.json()) as { board: { title: string }; objects: unknown[] }
    assert.equal(body.board.title, 'Quiet Modern v2')
    assert.equal(body.objects.length, 6)
  }))

test('the palette and the save action give feedback and persist', () =>
  withApp(async (app) => {
    const palette = await app.post('/palette', { color: '#b96e4c' })
    assert.equal(palette.status, 303)
    assert.equal(noticeOf(palette).kind, 'ok')
    assert.equal(app.root.boards.board().selectedColor, '#b96e4c')
    const save = await app.post('/save', {})
    assert.equal(save.status, 303)
    assert.equal(noticeOf(save).text, 'Board saved locally.')
  }))

test('health answers, an unknown path is a 404 and a prefixed mount keeps links under the prefix', async () => {
  await withApp(async (app) => {
    assert.equal((await app.page('/health')).status, 200)
    assert.equal((await app.page('/nope')).status, 404)
  })
  const home = await mkdtemp(join(scratch, 'app-test-prefix-'))
  let ids = 0
  const app = await createApp(pinnedInstance(home, { root: projectRoot }), {
    listen: false,
    prefix: '/app',
    overrides: { boards: { clock: () => NOW, newId: (kind: string) => `${kind}-${++ids}` } },
  })
  try {
    const response = await app.root.router.request('/app', { headers: { accept: 'text/html' } })
    assert.equal(response.status, 200)
    const html = await response.text()
    assert.match(html, /action="\/app\/save"/)
    assert.match(html, /href="\/app\/objects\/new\?type=note"/)
    assert.doesNotMatch(html, /href="\/objects\//)
  } finally {
    await app.stop()
    await rm(home, { recursive: true, force: true })
  }
})

test('switching the canvas off leaves the rest of the board', async () => {
  const manifest = readManifest()
  const without = {
    ...manifest,
    plugins: manifest.plugins.map((row) => (row.id === 'canvas' ? { ...row, disabled: true } : row)),
  }
  const home = await mkdtemp(join(scratch, 'app-test-off-canvas-'))
  let ids = 0
  const app = await createApp(pinnedInstance(home, { root: projectRoot }), {
    listen: false,
    manifest: without,
    overrides: { boards: { clock: () => NOW, newId: (kind: string) => `${kind}-${++ids}` } },
  })
  try {
    assert.equal((await app.root.router.request('/')).status, 404)
    assert.equal((await app.root.router.request('/assets', { headers: { accept: 'text/html' } })).status, 200)
    assert.equal((await app.root.router.request('/settings', { headers: { accept: 'text/html' } })).status, 200)
  } finally {
    await app.stop()
    await rm(home, { recursive: true, force: true })
  }
})

test('switching the settings off removes the settings page and the export', async () => {
  const manifest = readManifest()
  const without = {
    ...manifest,
    plugins: manifest.plugins.map((row) => (row.id === 'settings' ? { ...row, disabled: true } : row)),
  }
  const home = await mkdtemp(join(scratch, 'app-test-off-settings-'))
  let ids = 0
  const app = await createApp(pinnedInstance(home, { root: projectRoot }), {
    listen: false,
    manifest: without,
    overrides: { boards: { clock: () => NOW, newId: (kind: string) => `${kind}-${++ids}` } },
  })
  try {
    assert.equal((await app.root.router.request('/settings')).status, 404)
    assert.equal((await app.root.router.request('/export.json')).status, 404)
    assert.equal((await app.root.router.request('/', { headers: { accept: 'text/html' } })).status, 200)
  } finally {
    await app.stop()
    await rm(home, { recursive: true, force: true })
  }
})

test('a failed save answers the drag with an error and keeps the form path with a notice', async () => {
  const broken = {
    load: async (): Promise<BoardState | undefined> => undefined,
    save: async (): Promise<void> => {
      throw new Error('disk full')
    },
  }
  await withApp(
    async (app) => {
      const object = app.root.boards.objects()[0]
      assert.ok(object !== undefined)
      const response = await app.root.router.request(`/objects/${object.id}/move`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
        body: new URLSearchParams({ x: '20', y: '20' }).toString(),
      })
      assert.equal(response.status, 400)
      const body = (await response.json()) as { ok: boolean; error: string }
      assert.equal(body.ok, false)
      assert.match(body.error, /could not be saved/)
    },
    { overrides: { boards: { store: broken } } },
  )
})
