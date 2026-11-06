import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  albumCounts,
  cleanDescription,
  cleanFilename,
  cleanTags,
  cleanTitle,
  dateText,
  dimensionText,
  filterPhotos,
  Gallery,
  GalleryError,
  groupDigits,
  neighbours,
  sizeText,
  stampOf,
  storageText,
  whenText,
} from '../plugins/gallery/index.ts'
import { seed } from '../plugins/gallery/seed.ts'
import { memoryStore } from '../plugins/gallery/store.ts'
import { NOW } from './support.ts'

const ids = (): ((kind: string) => string) => {
  const counts = new Map<string, number>()
  return (kind) => {
    const next = (counts.get(kind) ?? 0) + 1
    counts.set(kind, next)
    return `${kind}-${String(next)}`
  }
}

test('the seed is the mockup archive: 4,281 photographs, 842/516/317/1,104 per album, 32.1 GB', () => {
  const state = seed(NOW, ids())
  const counts = albumCounts(state.photos)
  assert.equal(state.photos.length, 4_281)
  assert.equal(state.albums.length, 4)
  const byName = new Map(state.albums.map((album) => [album.name, counts.get(album.id)]))
  assert.equal(byName.get('Landscapes'), 842)
  assert.equal(byName.get('Architecture'), 516)
  assert.equal(byName.get('Portraits'), 317)
  assert.equal(byName.get('Travel'), 1_104)
  assert.equal(state.photos.filter((photo) => photo.albumId === '').length, 1_502)
  assert.equal(state.photos.reduce((sum, photo) => sum + photo.sizeBytes, 0), 32_100_000_000)
  assert.ok(state.photos.some((photo) => photo.favourite))
  assert.ok(state.photos.some((photo) => photo.shared))
  assert.ok(state.photos.some((photo) => photo.origin === 'upload'))
  const titles = state.photos.slice(0, 12).map((photo) => photo.title)
  assert.deepEqual(titles, [
    'Alpine quiet',
    'Morning coast',
    'Lines of home',
    'The long road',
    'Soft portrait',
    'Desert forms',
    'City geometry',
    'Blue hour',
    'Still life',
    'Mountain pass',
    'Quiet facade',
    'Golden field',
  ])
})

test('filterPhotos narrows by album, favourite, shared, upload and search text', () => {
  const state = seed(NOW, ids())
  const landscape = state.albums.find((album) => album.name === 'Landscapes') as (typeof state.albums)[number]
  assert.ok(filterPhotos(state.photos, { albumId: landscape.id }).every((photo) => photo.albumId === landscape.id))
  assert.ok(filterPhotos(state.photos, { favourites: true }).every((photo) => photo.favourite))
  assert.ok(filterPhotos(state.photos, { shared: true }).every((photo) => photo.shared))
  assert.ok(filterPhotos(state.photos, { origin: 'upload' }).every((photo) => photo.origin === 'upload'))
  assert.equal(filterPhotos(state.photos, { q: 'alpine-quiet' })[0]?.title, 'Alpine quiet')
  assert.equal(filterPhotos(state.photos, { q: 'blue hour' })[0]?.title, 'Blue hour')
  assert.ok(filterPhotos(state.photos, { tag: 'coast' }).every((photo) => photo.tags.includes('coast')))
  assert.equal(filterPhotos(state.photos, { q: 'nothing-matches-anything' }).length, 0)
})

test('the lightbox order wraps at both ends and a lone photograph has no neighbours', () => {
  const state = seed(NOW, ids())
  const photos = filterPhotos(state.photos).slice(0, 3)
  const first = photos[0] as (typeof photos)[number]
  const last = photos[2] as (typeof photos)[number]
  assert.equal(neighbours(photos, first).prev?.id, last.id)
  assert.equal(neighbours(photos, last).next?.id, first.id)
  assert.deepEqual(neighbours([first], first), {})
})

test('formatting is fixed and time-zone independent', () => {
  assert.equal(groupDigits(4_281), '4,281')
  assert.equal(sizeText(7_400_000), '7.4 MB')
  assert.equal(storageText(32_100_000_000), '32.1 GB')
  assert.equal(dimensionText({ width: 6_000, height: 4_467 }), '6,000 × 4,467')
  const stamp = stampOf(new Date(Date.UTC(2026, 10, 2, 9, 14)))
  assert.equal(stamp, '2026-11-02T09:14:00.000Z')
  assert.equal(dateText(stamp), '2 Nov 2026')
  assert.equal(whenText(stamp, NOW), '2 Nov 2026')
  assert.equal(whenText(stampOf(new Date(NOW.getTime() - 3 * 3_600_000)), NOW), '3h ago')
})

test('upload input validation names the file, title, description and tags', () => {
  assert.equal(cleanFilename(' x.jpg '), 'x.jpg')
  assert.throws(() => cleanFilename(''), /file name is required/)
  assert.throws(() => cleanFilename('notes.txt'), /JPEG/)
  assert.throws(() => cleanFilename('folder/x.jpg'), /folder/)
  assert.throws(() => cleanFilename(`${'x'.repeat(130)}.jpg`), /120/)
  assert.equal(cleanTitle('  A frame '), 'A frame')
  assert.throws(() => cleanTitle(''), /title is required/)
  assert.equal(cleanDescription(' A quiet frame '), 'A quiet frame')
  assert.throws(() => cleanDescription(''), /description is required/)
  assert.deepEqual(cleanTags(' coast, Dusk, coast ; blue hour '), ['coast', 'dusk', 'blue hour'])
  assert.deepEqual(cleanTags(''), [])
})

test('uploading files a photograph, and a duplicate file name is a conflict', async () => {
  const store = memoryStore<ReturnType<typeof seed>>()
  const gallery = await Gallery.open({ store, clock: () => NOW, newId: ids() })
  const album = gallery.albums()[0]
  assert.ok(album !== undefined)
  const photo = await gallery.upload({ filename: 'new-frame.jpg', title: 'New frame', albumId: album.id, description: 'A frame from the upload form.', tags: 'new, upload' })
  assert.equal(photo.filename, 'new-frame.jpg')
  assert.equal(photo.origin, 'upload')
  assert.equal(photo.albumId, album.id)
  assert.equal(gallery.total(), 4_282)
  assert.equal(store.saved, 1)
  await assert.rejects(
    gallery.upload({ filename: 'NEW-FRAME.jpg', title: 'Again', albumId: album.id, description: 'A duplicate.' }),
    (error: unknown) => error instanceof GalleryError && error.code === 'conflict',
  )
  await assert.rejects(
    gallery.upload({ filename: '', title: 'No name', albumId: album.id, description: 'x' }),
    (error: unknown) => error instanceof GalleryError && error.code === 'invalid',
  )
  await assert.rejects(
    gallery.upload({ filename: 'x.jpg', title: 'x', albumId: 'missing', description: 'x' }),
    /album/,
  )
})

test('uploading with an empty album files an unfiled import', async () => {
  const gallery = await Gallery.open({ store: memoryStore<ReturnType<typeof seed>>(), clock: () => NOW, newId: ids() })
  const photo = await gallery.upload({ filename: 'import.jpg', title: 'Import', albumId: '', description: 'An unfiled import.' })
  assert.equal(photo.albumId, '')
  assert.equal(gallery.photos({ albumId: '' }).some((item) => item.id === photo.id), true)
})

test('favourite and share persist, and a store failure is a storage error', async () => {
  const store = memoryStore<ReturnType<typeof seed>>()
  const gallery = await Gallery.open({ store, clock: () => NOW, newId: ids() })
  const photo = gallery.photos()[0] as ReturnType<Gallery['photos']>[number]
  const favourite = await gallery.toggleFavourite(photo.id)
  assert.equal(favourite.favourite, !photo.favourite)
  const shared = await gallery.toggleShared(photo.id)
  assert.equal(shared.shared, !photo.shared)
  assert.equal(store.saved, 2)
  await assert.rejects(gallery.toggleFavourite('missing'), (error: unknown) => error instanceof GalleryError && error.code === 'not-found')

  const broken = await Gallery.open({
    store: {
      load: async () => undefined,
      save: async () => {
        throw new Error('disk full')
      },
    },
    clock: () => NOW,
    newId: ids(),
  })
  const first = broken.photos()[0] as ReturnType<Gallery['photos']>[number]
  await assert.rejects(broken.toggleFavourite(first.id), (error: unknown) => error instanceof GalleryError && error.code === 'storage')
})
