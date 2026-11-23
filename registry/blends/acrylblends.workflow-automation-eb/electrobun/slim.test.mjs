// node --test electrobun/slim.test.mjs
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { slim } from './slim.mjs'

const put = (root, files) => {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
}

test('slim keeps what runs and drops the rest', () => {
  const nm = mkdtempSync(join(tmpdir(), 'slim-'))
  put(nm, {
    'typescript/package.json': '{}',
    '@electron/get/package.json': '{}',
    'node-pty/package.json': '{"version":"1.2.0"}',
    'node-pty/prebuilds/darwin-arm64/pty.node': 'x',
    'zod/package.json': '{"main":"./index.js","types":"./index.d.ts"}',
    'zod/index.js': 'js',
    'zod/index.d.ts': 'types',
    'zod/src/a.ts': 'ts',
    'zod/README.md': 'docs',
    'zod/LICENSE.md': 'licence',
    'zod/index.js.map': 'map',
    'raw/package.json': '{"exports":{".":"./src/index.ts"}}',
    'raw/src/index.ts': 'ts that runs',
    'ws/prebuilds/darwin-arm64/a.node': 'keep',
    'ws/prebuilds/linux-x64/a.node': 'drop',
    'ws/src/binding.cc': 'c',
    '@acryldev/door/package.json': '{}',
    '@acryldev/door/src/main.ts': 'own ts',
    '@acryldev/door/README.md': 'own docs',
  })
  const bunPty = join(dirname(fileURLToPath(import.meta.url)), 'bun-pty.cjs')
  const { removed } = slim(nm, { platform: 'darwin', arch: 'arm64', bunPty })
  for (const gone of ['typescript', '@electron/get', 'zod/index.d.ts', 'zod/src/a.ts', 'zod/README.md', 'zod/index.js.map', 'ws/prebuilds/linux-x64', 'ws/src/binding.cc', 'node-pty/prebuilds'])
    assert.equal(existsSync(join(nm, gone)), false, gone)
  for (const kept of ['zod/index.js', 'zod/LICENSE.md', 'raw/src/index.ts', 'ws/prebuilds/darwin-arm64/a.node', '@acryldev/door/src/main.ts', '@acryldev/door/README.md'])
    assert.equal(existsSync(join(nm, kept)), true, kept)
  assert.equal(JSON.parse(readFileSync(join(nm, 'node-pty/package.json'), 'utf8')).main, './index.cjs')
  assert.ok(existsSync(join(nm, 'node-pty/index.cjs')))
  assert.ok(Object.values(removed).every((n) => n >= 0))
})

test('Windows keeps node-pty', () => {
  const nm = mkdtempSync(join(tmpdir(), 'slim-'))
  put(nm, { 'node-pty/package.json': '{}', 'node-pty/prebuilds/win32-x64/conpty.node': 'x', 'node-pty/prebuilds/darwin-arm64/pty.node': 'x' })
  slim(nm, { platform: 'win32', arch: 'x64', bunPty: 'unused' })
  assert.ok(existsSync(join(nm, 'node-pty/prebuilds/win32-x64/conpty.node')))
  assert.equal(existsSync(join(nm, 'node-pty/prebuilds/darwin-arm64')), false)
})
