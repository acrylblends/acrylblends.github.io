import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Atlas, AtlasError, commandsOf, compareVersions, counts, filterPackages, latestOf, manifestOf, memoryStore, seed, standing, warningsOf } from '../plugins/foundry/index.ts'
import { NOW } from './support.ts'

const open = async () => {
  const store = memoryStore()
  const atlas = await Atlas.open({ store, clock: () => NOW })
  return { atlas, store }
}
const s = seed()
const entry = (packageId: string, version: string) => ({ packageId, version, addedAt: NOW.toISOString() })

test('search matches every word across name, kind, summary, tags, languages and runtimes; filters narrow it', () => {
  const names = (f: Parameters<typeof filterPackages>[1]) => filterPackages(s.packages, f).map((p) => p.name)
  assert.deepEqual(names({ q: 'react' }).slice(0, 3), ['React', 'TanStack Query', 'React Native'])
  assert.ok(names({ q: 'webgpu' }).includes('Three.js'))
  assert.deepEqual(names({ q: 'orm', language: 'Python' }), ['SQLAlchemy'])
  assert.deepEqual(names({ group: 'Crypto', language: 'Rust' }), ['ring'])
  assert.deepEqual(names({ framework: 'Desktop' }), ['Electron', 'Tauri'])
  assert.deepEqual(names({ q: 'edge bun' }), ['Hono', 'Drizzle ORM'])
  assert.deepEqual(names({ q: 'zzz' }), [])
  assert.equal(filterPackages(s.packages, {}).length, 35)
})

test('counts per filter value cover the whole catalogue', () => {
  const c = counts(s.packages)
  assert.equal(Object.values(c.group).reduce((a, b) => a + b, 0), 35)
  assert.equal(c.language.TypeScript, 20)
  assert.equal(c.language.Rust, 6)
  assert.equal(c.language.Python, 9)
  assert.equal(c.framework.Desktop, 2)
})

test('versions compare numerically; a pinned version stands against the newest', () => {
  assert.ok(compareVersions('19.1.0', '19.0.0') > 0)
  assert.ok(compareVersions('0.178.0', '0.17.9') > 0)
  const react = s.packages[0]!
  assert.equal(latestOf(react), '19.1.0')
  assert.deepEqual([standing(react, '19.1.0'), standing(react, '19.0.0'), standing(react, '18.3.1')], ['Latest', '1 behind', '2 behind'])
})

test('the manifest and install commands follow the stack, per ecosystem, dev apart', () => {
  const stack = [entry('react', '19.1.0'), entry('vitest', '3.2.4'), entry('tokio', '1.46.1'), entry('numpy', '2.3.1')]
  assert.deepEqual(manifestOf(s.packages, stack), {
    npm: { dependencies: { react: '^19.1.0', 'react-dom': '^19.1.0' }, devDependencies: { vitest: '^3.2.4' } },
    cargo: ['tokio = "1.46.1"'],
    pip: ['numpy==2.3.1'],
  })
  assert.deepEqual(commandsOf(s.packages, stack), ['npm install react react-dom', 'npm install -D vitest', 'cargo add tokio', 'pip install numpy'])
  assert.deepEqual(manifestOf(s.packages, []), {})
})

test('peer requirements: a missing package and a pin below the needed major are flagged', () => {
  assert.deepEqual(warningsOf(s.packages, [entry('tanstack-query', '5.83.0')]).map((w) => w.text), ['TanStack Query needs React 18 or newer; add React to the stack.'])
  assert.deepEqual(warningsOf(s.packages, [entry('tanstack-query', '5.83.0'), entry('react', '17.0.2')]).map((w) => w.text), ['TanStack Query needs React 18 or newer; the stack pins 17.0.2.'])
  assert.deepEqual(warningsOf(s.packages, [entry('tanstack-query', '5.83.0'), entry('react', '18.3.1')]), [])
  assert.equal(warningsOf(s.packages, [entry('pandas', '2.3.1'), entry('numpy', '1.26.4')]).length, 1)
})

test('the stack: add at the latest or a chosen version, once, up to twelve; pin, remove and clear are guarded', async () => {
  const { atlas, store } = await open()
  assert.equal((await atlas.addToStack('react')).version, '19.1.0')
  assert.equal((await atlas.addToStack('zod', '3.25.76')).version, '3.25.76')
  const saves = store.saved
  await assert.rejects(atlas.addToStack('react'), /React is already in the stack/)
  await assert.rejects(atlas.addToStack('hono', '9.9.9'), /Hono has no version 9\.9\.9/)
  await assert.rejects(atlas.addToStack('nope'), /no such package/)
  assert.equal(store.saved, saves)
  assert.equal((await atlas.pin('react', '18.3.1')).version, '18.3.1')
  await assert.rejects(atlas.pin('hono', undefined), /Hono is not in the stack/)
  await assert.rejects(atlas.pin('react', '1.0.0'), /no version 1\.0\.0/)
  await atlas.removeFromStack('zod')
  await assert.rejects(atlas.removeFromStack('zod'), /Zod is not in the stack/)
  for (const id of ['hono', 'drizzle-orm', 'vitest', 'threejs', 'langchain', 'undici', 'ws', 'kysely', 'jose', 'mathjs', 'sharp']) await atlas.addToStack(id)
  assert.equal(atlas.state.stack.length, 12)
  await assert.rejects(atlas.addToStack('tokio'), /at most 12 packages/)
  await atlas.clearStack()
  await assert.rejects(atlas.clearStack(), /already empty/)
  assert.ok(new AtlasError('invalid', 'x') instanceof Error)
})
