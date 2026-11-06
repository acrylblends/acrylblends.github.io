import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import { createApp, readManifest } from '../src/app.ts'
import type { GalleryState } from '../plugins/gallery/domain.ts'
import { memoryStore } from '../plugins/gallery/store.ts'
import { pinnedInstance } from '../plugins/instance/index.ts'
import { noticeOf, NOW, projectRoot, withApp } from './support.ts'

const photoCount = (html: string): number => (html.match(/class="photo"/g) ?? []).length
const scratch = join(projectRoot, '.acrylblends', 'test')
mkdirSync(scratch, { recursive: true })

test('the first page is the mockup archive: its chrome, counts, storage, named frames and no remote asset', () =>
  withApp(async (app) => {
    const page = await app.page('/')
    assert.equal(page.status, 200)
    assert.match(page.html, /STILL<span>FRAME<\/span>/)
    for (const label of ['Library', 'Albums', 'Shared', 'Recently added', 'All photographs', 'Landscapes', 'Architecture', 'Portraits', 'Travel', 'Favourites', 'Recently edited', 'Uploads', 'STORAGE']) {
      assert.match(page.html, new RegExp(label))
    }
    assert.match(page.html, /4,281 ITEMS/)
    assert.match(page.html, /<span class="album-label">All photographs<\/span><span class="count">4,281<\/span>/)
    assert.match(page.html, /<span class="album-label">Landscapes<\/span><span class="count">842<\/span>/)
    assert.match(page.html, /<span class="album-label">Architecture<\/span><span class="count">516<\/span>/)
    assert.match(page.html, /<span class="album-label">Portraits<\/span><span class="count">317<\/span>/)
    assert.match(page.html, /<span class="album-label">Travel<\/span><span class="count">1,104<\/span>/)
    assert.match(page.html, /32\.1 GB of 50 GB used/)
    assert.match(page.html, /Alpine quiet/)
    assert.match(page.html, /Golden field/)
    assert.equal(photoCount(page.html), 24)
    assert.match(page.html, /1-24 of 4,281/)
    assert.doesNotMatch(page.html, /https?:\/\//)
  }))

test('page two is the next slice and search narrows the grid to an empty state', () =>
  withApp(async (app) => {
    const second = await app.page('/?page=2')
    assert.equal(second.status, 200)
    assert.match(second.html, /25-48 of 4,281/)
    assert.doesNotMatch(second.html, /Alpine quiet/)
    const search = await app.page('/?q=alpine-quiet')
    assert.match(search.html, /Alpine quiet/)
    assert.doesNotMatch(search.html, /Morning coast/)
    assert.match(search.html, /SEARCH \/ ALPINE-QUIET/)
    const empty = await app.page('/?q=nothing-matches-anything')
    assert.match(empty.html, /No photographs match\./)
    assert.match(empty.html, /Show all photographs/)
  }))

test('the album index and one album page carry their metadata and frames', () =>
  withApp(async (app) => {
    const index = await app.page('/albums')
    assert.equal(index.status, 200)
    assert.match(index.html, /ALBUM · 842 PHOTOGRAPHS/)
    assert.match(index.html, /ALBUM · 516 PHOTOGRAPHS/)
    assert.match(index.html, /ALBUM · 317 PHOTOGRAPHS/)
    assert.match(index.html, /ALBUM · 1,104 PHOTOGRAPHS/)
    const album = app.root.gallery.albums().find((item) => item.name === 'Landscapes')
    assert.ok(album !== undefined)
    const page = await app.page(`/albums/${album.id}`)
    assert.equal(page.status, 200)
    assert.match(page.html, /COLLECTION \/ LANDSCAPES/)
    assert.match(page.html, /<small>PHOTOGRAPHS<\/small><b>842<\/b>/)
    assert.match(page.html, /<small>ALBUM SIZE<\/small>/)
    assert.match(page.html, /class="active">LANDSCAPES<\/a>/)
    assert.equal(photoCount(page.html), 24)
    const missing = await app.page('/albums/missing')
    assert.equal(missing.status, 303)
    assert.equal(noticeOf(missing.response).kind, 'error')
    assert.equal(noticeOf(missing.response).path, '/albums')
  }))

test('the lightbox shows one frame with its metadata, neighbours and actions', () =>
  withApp(async (app) => {
    const photo = app.root.gallery.photos().find((item) => item.title === 'Alpine quiet')
    assert.ok(photo !== undefined)
    const page = await app.page(`/photos/${photo.id}`)
    assert.equal(page.status, 200)
    assert.match(page.html, /alpine-quiet\.jpg/)
    assert.match(page.html, /6,000 × 4,467/)
    assert.match(page.html, /<small>CAPTURED<\/small>/)
    assert.match(page.html, /data-lightbox-prev/)
    assert.match(page.html, /data-lightbox-next/)
    assert.match(page.html, /data-lightbox-close/)
    assert.match(page.html, /lightbox-open/)
    assert.match(page.html, /Add to favourites|Remove from favourites/)
    assert.match(page.html, /⇧ Share|✓ Shared/)
    const missing = await app.page('/photos/missing')
    assert.equal(missing.status, 303)
    assert.equal(noticeOf(missing.response).path, '/')
  }))

test('favouriting and sharing from the lightbox persist and give feedback', () =>
  withApp(async (app) => {
    const photo = app.root.gallery.photos().find((item) => item.title === 'Morning coast')
    assert.ok(photo !== undefined)
    const wasFavourite = photo.favourite
    const favourite = await app.post(`/photos/${photo.id}/favourite`, { back: `/photos/${photo.id}` })
    assert.equal(favourite.status, 303)
    assert.equal(noticeOf(favourite).kind, 'ok')
    assert.equal(app.root.gallery.photo(photo.id)?.favourite, !wasFavourite)
    assert.equal(app.store.saved, 1)
    const wasShared = photo.shared
    const share = await app.post(`/photos/${photo.id}/share`, { back: `/photos/${photo.id}` })
    assert.equal(noticeOf(share).kind, 'ok')
    assert.equal(app.root.gallery.photo(photo.id)?.shared, !wasShared)
    const shared = await app.page('/shared')
    assert.equal(shared.status, 200)
    assert.match(shared.html, new RegExp(photo.title))
  }))

test('the upload form adds a photograph and invalid input keeps what was typed', () =>
  withApp(async (app) => {
    const form = await app.page('/upload')
    assert.equal(form.status, 200)
    assert.match(form.html, /Add photographs/)
    assert.match(form.html, /PREVIEW/)
    const album = app.root.gallery.albums()[0]
    assert.ok(album !== undefined)
    const invalid = await app.post('/upload', { filename: '', title: 'My frame', albumId: album.id, description: 'A frame.' })
    assert.equal(invalid.status, 200)
    const invalidHtml = await invalid.text()
    assert.match(invalidHtml, /The file name is required\./)
    assert.match(invalidHtml, /value="My frame"/)
    const created = await app.post('/upload', {
      filename: 'harbour-09.jpg',
      title: 'Harbour nine',
      albumId: album.id,
      description: 'A new frame at the harbour.',
      tags: 'coast, morning',
      art: 'travel',
      tone: '3',
    })
    assert.equal(created.status, 303)
    const location = noticeOf(created)
    assert.equal(location.kind, 'ok')
    assert.match(location.path, /^\/photos\//)
    assert.equal(app.root.gallery.total(), 4_282)
    const added = app.root.gallery.photos().find((item) => item.filename === 'harbour-09.jpg')
    assert.ok(added !== undefined)
    assert.deepEqual(added.tags, ['coast', 'morning'])
    assert.equal(added.origin, 'upload')
    const duplicate = await app.post('/upload', {
      filename: 'harbour-09.jpg',
      title: 'Again',
      albumId: album.id,
      description: 'A duplicate.',
    })
    assert.equal(duplicate.status, 200)
    assert.match(await duplicate.text(), /already in the archive/)
  }))

test('the smart collections are filtered views over the same archive', () =>
  withApp(async (app) => {
    const favourite = app.root.gallery.photos({ favourites: true })[0]
    assert.ok(favourite !== undefined)
    const unfavourite = app.root.gallery.photos().find((photo) => photo.title === 'Morning coast')
    assert.ok(unfavourite !== undefined)
    const favourites = await app.page('/favourites')
    assert.equal(favourites.status, 200)
    assert.match(favourites.html, new RegExp(favourite.title))
    assert.doesNotMatch(favourites.html, new RegExp(unfavourite.title))
    const uploaded = app.root.gallery.photos({ origin: 'upload', sort: 'added' })[0]
    assert.ok(uploaded !== undefined)
    const uploads = await app.page('/uploads')
    assert.ok(uploads.html.includes(uploaded.title))
    const edited = await app.page('/edited')
    assert.equal(edited.status, 200)
    assert.match(edited.html, /Recently edited/)
    const recent = await app.page('/recent')
    assert.equal(recent.status, 200)
    assert.match(recent.html, /Alpine quiet/)
  }))

test('health answers, an unknown path is a 404 and a prefixed mount writes prefixed links', () =>
  withApp(async (app) => {
    assert.equal((await app.page('/health')).status, 200)
    assert.equal((await app.page('/nope')).status, 404)
  }))

test('the same app mounted at /app keeps every link under the prefix', async () => {
  const home = await mkdtemp(join(scratch, 'app-test-prefix-'))
  let ids = 0
  const app = await createApp(pinnedInstance(home, { root: projectRoot }), {
    listen: false,
    prefix: '/app',
    overrides: { gallery: { clock: () => NOW, newId: (kind: string) => `${kind}-${++ids}` } },
  })
  try {
    const response = await app.root.router.request('/app', { headers: { accept: 'text/html' } })
    assert.equal(response.status, 200)
    const html = await response.text()
    assert.match(html, /href="\/app\/upload"/)
    assert.match(html, /href="\/app\/albums"/)
    assert.doesNotMatch(html, /href="\/upload"/)
  } finally {
    await app.stop()
    await rm(home, { recursive: true, force: true })
  }
})

test('switching the library off removes its page and entries, and leaves the rest of the archive', async () => {
  const manifest = readManifest()
  const without = {
    ...manifest,
    plugins: manifest.plugins.map((row) => (row.id === 'library' ? { ...row, disabled: true } : row)),
  }
  const home = await mkdtemp(join(scratch, 'app-test-off-'))
  let ids = 0
  const app = await createApp(pinnedInstance(home, { root: projectRoot }), {
    listen: false,
    manifest: without,
    overrides: { gallery: { clock: () => NOW, newId: (kind: string) => `${kind}-${++ids}` } },
  })
  try {
    assert.equal((await app.root.router.request('/')).status, 404)
    const albums = await app.root.router.request('/albums', { headers: { accept: 'text/html' } })
    assert.equal(albums.status, 200)
    const html = await albums.text()
    assert.doesNotMatch(html, />Library</)
    assert.doesNotMatch(html, /All photographs/)
  } finally {
    await app.stop()
    await rm(home, { recursive: true, force: true })
  }
})

test('switching the collections off removes only the smart views', async () => {
  const manifest = readManifest()
  const without = {
    ...manifest,
    plugins: manifest.plugins.map((row) => (row.id === 'collections' ? { ...row, disabled: true } : row)),
  }
  const home = await mkdtemp(join(scratch, 'app-test-off-collections-'))
  let ids = 0
  const app = await createApp(pinnedInstance(home, { root: projectRoot }), {
    listen: false,
    manifest: without,
    overrides: { gallery: { clock: () => NOW, newId: (kind: string) => `${kind}-${++ids}` } },
  })
  try {
    assert.equal((await app.root.router.request('/favourites')).status, 404)
    assert.equal((await app.root.router.request('/recent')).status, 404)
    const library = await app.root.router.request('/', { headers: { accept: 'text/html' } })
    assert.equal(library.status, 200)
    assert.doesNotMatch(await library.text(), /♡ Favourites/)
  } finally {
    await app.stop()
    await rm(home, { recursive: true, force: true })
  }
})

test('a failed save keeps the upload form with an error message', async () => {
  const broken = {
    load: async (): Promise<GalleryState | undefined> => undefined,
    save: async (): Promise<void> => {
      throw new Error('disk full')
    },
    saved: 0,
    state: undefined,
  }
  await withApp(
    async (app) => {
      const album = app.root.gallery.albums()[0]
      assert.ok(album !== undefined)
      const response = await app.post('/upload', {
        filename: 'lost-frame.jpg',
        title: 'Lost frame',
        albumId: album.id,
        description: 'A frame that cannot be saved.',
      })
      assert.equal(response.status, 200)
      assert.match(await response.text(), /could not be saved/)
    },
    { overrides: { gallery: { store: broken } } },
  )
})
