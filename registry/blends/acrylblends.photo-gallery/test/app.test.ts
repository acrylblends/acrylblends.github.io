import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { readManifest } from '../src/app.ts'
import { dateText } from '../plugins/gallery/domain.ts'
import { seed, SEED_FACTS } from '../plugins/gallery/seed.ts'
import { projectRoot, NOW } from './support.ts'

const FEATURES = ['albums', 'collections', 'gallery', 'gallery-shell', 'library', 'lightbox', 'shared', 'upload'] as const

test('every feature is a row of the manifest, in order', () => {
  assert.deepEqual(
    readManifest().plugins.map((row) => row.id),
    ['router', 'home', 'gallery', 'gallery-shell', 'library', 'albums', 'collections', 'shared', 'lightbox', 'upload', 'extensions', 'server', 'acryl-door'],
  )
})

test('every feature plugin declares its name, injects and mount point in plugin.json', () => {
  for (const feature of FEATURES) {
    const file = join(projectRoot, 'plugins', feature, 'plugin.json')
    const manifest = JSON.parse(readFileSync(file, 'utf8')) as {
      name: string
      description: string
      inject: string[]
      provides: string[]
      dependencies: Record<string, string>
      mount: string
    }
    assert.equal(manifest.name, feature)
    assert.ok(manifest.description.length > 20)
    assert.ok(manifest.mount.includes('blend.yaml'))
    assert.equal(manifest.dependencies['@deepseek-ai/cordis'], '4.0.4')
    if (feature !== 'gallery' && feature !== 'gallery-shell') {
      assert.ok(manifest.inject.includes('gallery'))
      assert.ok(manifest.inject.includes('shell'))
      assert.ok(manifest.inject.includes('router'))
    }
  }
  const gallery = JSON.parse(readFileSync(join(projectRoot, 'plugins/gallery/plugin.json'), 'utf8')) as { provides: string[] }
  assert.deepEqual(gallery.provides, ['gallery'])
  const shell = JSON.parse(readFileSync(join(projectRoot, 'plugins/gallery-shell/plugin.json'), 'utf8')) as { provides: string[] }
  assert.deepEqual(shell.provides, ['shell'])
})

test('the seed is deterministic, UTC-stamped and time-zone independent', () => {
  const ids = (): ((kind: string) => string) => {
    let next = 0
    return (kind) => `${kind}-${String(++next)}`
  }
  const first = seed(NOW, ids())
  const second = seed(NOW, ids())
  assert.deepEqual(first, second)
  assert.equal(first.photos.length, SEED_FACTS.total)
  assert.equal(first.photos.filter((photo) => photo.albumId === '').length, SEED_FACTS.unfiled)
  assert.ok(first.photos.every((photo) => photo.capturedAt.endsWith('Z') && photo.addedAt.endsWith('Z') && photo.editedAt.endsWith('Z')))
  assert.equal(first.photos.reduce((sum, photo) => sum + photo.sizeBytes, 0), SEED_FACTS.storageBytes)
  assert.equal(dateText('2026-11-06T09:41:00.000Z'), '6 Nov 2026')
})
