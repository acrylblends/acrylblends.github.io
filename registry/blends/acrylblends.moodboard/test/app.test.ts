import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { readManifest } from '../src/app.ts'
import { seed, SEED_FACTS } from '../plugins/boards/seed.ts'
import { projectRoot, NOW } from './support.ts'

const FEATURES = ['assets', 'board-shell', 'boards', 'canvas', 'objects', 'settings'] as const

test('every feature is a row of the manifest, in order', () => {
  assert.deepEqual(
    readManifest().plugins.map((row) => row.id),
    ['router', 'home', 'boards', 'board-shell', 'canvas', 'objects', 'assets', 'settings', 'extensions', 'server', 'acryl-door'],
  )
})

test('every feature plugin declares its name, injects and mount point in plugin.json', () => {
  for (const feature of FEATURES) {
    const manifest = JSON.parse(readFileSync(join(projectRoot, 'plugins', feature, 'plugin.json'), 'utf8')) as {
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
    if (feature !== 'boards' && feature !== 'board-shell') {
      assert.ok(manifest.inject.includes('boards'))
      assert.ok(manifest.inject.includes('shell'))
      assert.ok(manifest.inject.includes('router'))
    }
  }
  const boards = JSON.parse(readFileSync(join(projectRoot, 'plugins/boards/plugin.json'), 'utf8')) as { provides: string[] }
  assert.deepEqual(boards.provides, ['boards'])
  const shell = JSON.parse(readFileSync(join(projectRoot, 'plugins/board-shell/plugin.json'), 'utf8')) as { provides: string[] }
  assert.deepEqual(shell.provides, ['shell'])
})

test('the seed is deterministic, UTC-stamped and complete', () => {
  const ids = (): ((kind: string) => string) => {
    let next = 0
    return (kind) => `${kind}-${String(++next)}`
  }
  const first = seed(NOW, ids())
  const second = seed(NOW, ids())
  assert.deepEqual(first, second)
  assert.equal(first.objects.length, SEED_FACTS.objects)
  assert.equal(first.assets.length, SEED_FACTS.images + SEED_FACTS.colors)
  assert.equal(first.board.updatedAt, '2026-11-06T09:41:00.000Z')
})
