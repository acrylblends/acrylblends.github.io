import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { readManifest } from '../src/app.ts'
import { seed } from '../plugins/fleet/seed.ts'
import { projectRoot, NOW } from './support.ts'

const FEATURES = ['fleet', 'fleet-shell', 'history', 'missions', 'robots'] as const

test('every feature is a row of the manifest, in order', () => {
  assert.deepEqual(readManifest().plugins.map((row) => row.id), ['router', 'home', 'fleet', 'fleet-shell', 'history', 'missions', 'robots', 'extensions', 'server', 'acryl-door'])
})

test('every feature plugin declares its name, injects and mount point', () => {
  for (const feature of FEATURES) {
    const manifest = JSON.parse(readFileSync(join(projectRoot, 'plugins', feature, 'plugin.json'), 'utf8')) as { name: string; description: string; inject: string[]; provides: string[]; dependencies: Record<string, string>; mount: string }
    assert.equal(manifest.name, feature)
    assert.ok(manifest.description.length > 20)
    assert.ok(manifest.mount.includes('blend.yaml'))
    assert.equal(manifest.dependencies['@deepseek-ai/cordis'], '4.0.4')
    if (feature !== 'fleet' && feature !== 'fleet-shell') {
      assert.ok(manifest.inject.includes('fleet'))
      assert.ok(manifest.inject.includes('shell'))
      assert.ok(manifest.inject.includes('router'))
    }
  }
})

test('the seed is deterministic', () => {
  const ids = (): ((kind: string) => string) => {
    let next = 0
    return (kind) => `${kind}-${String(++next)}`
  }
  assert.deepEqual(seed(NOW, ids()), seed(NOW, ids()))
})
