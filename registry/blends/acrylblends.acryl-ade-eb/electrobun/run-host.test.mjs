// run-host.mjs: an edit never restarts a running host; after the host ended, the next edit starts it again.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

const wait = (ms) => new Promise((done) => setTimeout(done, ms))

test('edits reach a running host without a restart; a host that ended starts again on the next edit', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'run-host-'))
  const watched = join(dir, 'src')
  writeFileSync(join(dir, 'host.mjs'), "console.log('host up'); if (process.env.RUN_HOST_EXIT === '1') process.exit(3); setInterval(() => {}, 1000)\n")
  mkdirSync(watched)
  writeFileSync(join(watched, 'a.ts'), '1')
  const run = (env, flags = []) => {
    const child = spawn(process.execPath, [new URL('./run-host.mjs', import.meta.url).pathname, ...flags, `--watch-path=${watched}`, '--', join(dir, 'host.mjs')], { env: { ...process.env, ...env } })
    let out = ''
    child.stdout.on('data', (d) => (out += d))
    return { child, out: () => out }
  }
  const up = run({})
  await wait(600)
  appendFileSync(join(watched, 'a.ts'), '2')
  await wait(800)
  assert.equal(up.out().match(/host up/gu)?.length, 1)
  assert.doesNotMatch(up.out(), /Restarting/u)
  up.child.kill('SIGTERM')

  const ended = run({ RUN_HOST_EXIT: '1' })
  await wait(600)
  assert.match(ended.out(), /Failed running/u)
  appendFileSync(join(watched, 'a.ts'), '3')
  await wait(800)
  assert.match(ended.out(), /Restarting/u)
  assert.equal(ended.out().match(/host up/gu)?.length, 2)
  ended.child.kill('SIGTERM')

  // --restart-on-change (an app without in-place reload, e.g. the ADE workbench): an edit restarts the running host, with no crash line.
  const restarting = run({}, ['--restart-on-change'])
  await wait(600)
  appendFileSync(join(watched, 'a.ts'), '4')
  await wait(1200)
  assert.match(restarting.out(), /Restarting/u)
  assert.equal(restarting.out().match(/host up/gu)?.length, 2)
  assert.doesNotMatch(restarting.out(), /Failed running/u)
  restarting.child.kill('SIGTERM')
})
