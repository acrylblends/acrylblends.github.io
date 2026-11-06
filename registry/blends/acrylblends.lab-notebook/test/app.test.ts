import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { readManifest } from '../src/app.ts'
import { seed, SEED_FACTS } from '../plugins/lab/seed.ts'
import { projectRoot, NOW } from './support.ts'

const FEATURES = ['attachments', 'data-table', 'experiments', 'lab', 'lab-shell', 'notebooks', 'record'] as const

test('every feature is a row of the manifest, in order', () => {
  assert.deepEqual(
    readManifest().plugins.map((row) => row.id),
    ['router', 'home', 'lab', 'lab-shell', 'experiments', 'record', 'notebooks', 'data-table', 'attachments', 'extensions', 'server', 'acryl-door'],
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
    if (feature !== 'lab' && feature !== 'lab-shell') {
      assert.ok(manifest.inject.includes('lab'))
      assert.ok(manifest.inject.includes('shell'))
      assert.ok(manifest.inject.includes('router'))
    }
  }
  const lab = JSON.parse(readFileSync(join(projectRoot, 'plugins/lab/plugin.json'), 'utf8')) as { provides: string[] }
  assert.deepEqual(lab.provides, ['lab'])
  const shell = JSON.parse(readFileSync(join(projectRoot, 'plugins/lab-shell/plugin.json'), 'utf8')) as { provides: string[] }
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
  assert.equal(first.notebooks.length, SEED_FACTS.notebooks)
  assert.equal(first.experiments.length, SEED_FACTS.experiments)
  assert.equal(first.measurements.length, SEED_FACTS.measurements)
  assert.equal(first.observations.length, SEED_FACTS.observations)
  assert.equal(first.attachments.length, SEED_FACTS.attachments)
  assert.ok(first.experiments.every((experiment) => experiment.startedAt.endsWith('Z')))
})
