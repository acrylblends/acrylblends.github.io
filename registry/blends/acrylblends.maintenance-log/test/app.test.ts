import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { readManifest } from '../src/app.ts'
import { seed, SEED_FACTS } from '../plugins/plant/seed.ts'
import { projectRoot, NOW } from './support.ts'

const FEATURES = ['control', 'machines', 'plant', 'plant-shell', 'work-orders'] as const

test('every feature is a row of the manifest, in order', () => {
  assert.deepEqual(readManifest().plugins.map((row) => row.id), ['router', 'home', 'plant', 'plant-shell', 'control', 'machines', 'work-orders', 'extensions', 'server', 'acryl-door'])
})

test('every feature plugin declares its name, injects and mount point', () => {
  for (const feature of FEATURES) {
    const manifest = JSON.parse(readFileSync(join(projectRoot, 'plugins', feature, 'plugin.json'), 'utf8')) as { name: string; description: string; inject: string[]; provides: string[]; dependencies: Record<string, string>; mount: string }
    assert.equal(manifest.name, feature)
    assert.ok(manifest.description.length > 20)
    assert.ok(manifest.mount.includes('blend.yaml'))
    assert.equal(manifest.dependencies['@deepseek-ai/cordis'], '4.0.4')
    if (feature !== 'plant' && feature !== 'plant-shell') {
      assert.ok(manifest.inject.includes('plant'))
      assert.ok(manifest.inject.includes('shell'))
      assert.ok(manifest.inject.includes('router'))
    }
  }
  const plant = JSON.parse(readFileSync(join(projectRoot, 'plugins/plant/plugin.json'), 'utf8')) as { provides: string[] }
  assert.deepEqual(plant.provides, ['plant'])
  const shell = JSON.parse(readFileSync(join(projectRoot, 'plugins/plant-shell/plugin.json'), 'utf8')) as { provides: string[] }
  assert.deepEqual(shell.provides, ['shell'])
})

test('the seed is deterministic and complete', () => {
  const ids = (): ((kind: string) => string) => {
    let next = 0
    return (kind) => `${kind}-${String(++next)}`
  }
  const first = seed(NOW, ids())
  const second = seed(NOW, ids())
  assert.deepEqual(first, second)
  assert.equal(first.machines.length, SEED_FACTS.machines)
  assert.equal(first.workOrders.filter((order) => order.status !== 'done').length, SEED_FACTS.open)
  assert.ok(first.workOrders.every((order) => order.status !== 'done' || order.closedAt !== undefined))
})
