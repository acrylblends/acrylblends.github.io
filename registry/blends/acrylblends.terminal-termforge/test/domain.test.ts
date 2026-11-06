import assert from 'node:assert/strict'
import { test } from 'node:test'
import { COMMANDS, Forge, ForgeError, MAX_TABS, dateLine, memoryStore, parseCommand, recentCommands, seed } from '../plugins/termforge/index.ts'
import { NOW } from './support.ts'

const open = async () => {
  let ids = 0
  const store = memoryStore()
  const forge = await Forge.open({ store, clock: () => NOW, newId: (kind) => `${kind}-n${++ids}` })
  return { forge, store }
}

test('the seed reads as the mockup: three workspaces, the first with pwd and git status run', () => {
  const s = seed()
  assert.deepEqual(s.workspaces.map((w) => w.name), ['acryl / local-dev', 'infra / staging', 'scripts / scratch'])
  assert.deepEqual(s.workspaces[0]?.tabs[0]?.entries.map((e) => e.command), ['pwd', 'git status'])
  assert.equal(s.snippets.length, 4)
})

test('only allowlisted commands parse; operators and unknown commands are refused by name', () => {
  for (const command of COMMANDS) assert.deepEqual(parseCommand(`  ${command.replace(' ', '   ')} `), { ok: true, command })
  assert.deepEqual(parseCommand('rm -rf /'), { ok: false, status: 127, message: 'command not available in safe demo mode. Type "help" to see the allowlist.' })
  for (const evil of ['ls; rm x', 'ls | cat', 'ls && pwd', 'echo $(whoami)', 'ls `pwd`', 'cat < /etc/passwd', 'ls > out', 'ls\\']) {
    const r = parseCommand(evil)
    assert.equal(r.ok, false, evil)
    assert.equal((r as { status: number }).status, 126, evil)
  }
  assert.throws(() => parseCommand('   '), /Type a command first/)
  assert.throws(() => parseCommand('x'.repeat(81)), /at most 80/)
  assert.equal(parseCommand('LS').ok, false)
})

test('output is deterministic and differs by workspace', async () => {
  const { forge } = await open()
  assert.equal((await forge.run('acryl', 'tab-1', 'ls'))?.output, 'README.md  package.json  src/  tests/  blends/  tsconfig.json')
  assert.equal((await forge.run('infra-staging', 'tab-2', 'ls'))?.output, 'main.tf  modules/  staging.tfvars  README.md')
  assert.equal((await forge.run('acryl', 'tab-1', 'date'))?.output, dateLine(NOW))
  assert.equal(dateLine(NOW), 'Thu Nov 05 2026 11:00:00')
  assert.equal((await forge.run('acryl', 'tab-1', 'pwd'))?.output, '/Users/alex/projects/acryl')
  assert.equal((await forge.run('scratch', 'tab-3', 'npm test'))?.status, 1)
})

test('a refused command is recorded with its exit status and never recalled; empty input is an error', async () => {
  const { forge, store } = await open()
  const e = await forge.run('acryl', 'tab-1', 'curl evil.example')
  assert.deepEqual([e?.status, e?.command], [127, 'curl evil.example'])
  assert.equal((await forge.run('acryl', 'tab-1', 'ls | wc'))?.status, 126)
  assert.ok(!(recentCommands(forge.workspace('acryl')) as string[]).includes('curl evil.example'))
  const saves = store.saved
  await assert.rejects(forge.run('acryl', 'tab-1', ''), ForgeError)
  await assert.rejects(forge.run('nope', 'tab-1', 'ls'), /no such workspace/)
  await assert.rejects(forge.run('acryl', 'nope', 'ls'), /no such tab/)
  assert.equal(store.saved, saves)
})

test('history lists what was run in the tab; clear empties it', async () => {
  const { forge } = await open()
  await forge.run('acryl', 'tab-1', 'history')
  assert.equal(forge.tab('acryl', 'tab-1').entries.at(-1)?.output, '  1  pwd\n  2  git status\n  3  history')
  await forge.clear('acryl', 'tab-1')
  const tab = forge.tab('acryl', 'tab-1')
  assert.deepEqual([tab.entries.length, tab.cleared], [0, true])
  await forge.run('acryl', 'tab-1', 'pwd')
  assert.equal(forge.tab('acryl', 'tab-1').cleared, false)
})

test('a task runs its steps in order, saves once, and stops at the first failure', async () => {
  const { forge, store } = await open()
  const saves = store.saved
  const ran = await forge.runTask('acryl', 'tab-1', 'deploy')
  assert.deepEqual(ran.map((e) => e.command), ['git status', 'npm test', 'npm run build', 'deploy --dry-run'])
  assert.equal(store.saved, saves + 1)
  const failed = await forge.runTask('scratch', 'tab-3', 'deploy')
  assert.deepEqual(failed.map((e) => e.command), ['git status'])
  assert.equal(failed[0]?.status, 1)
  await assert.rejects(forge.runTask('acryl', 'tab-1', 'nope'), /no such task/)
})

test('tabs: open up to five, keep at least one', async () => {
  const { forge } = await open()
  const tab = await forge.addTab('acryl')
  assert.equal(forge.workspace('acryl').tabs.length, 2)
  for (let i = 0; i < MAX_TABS - 2; i += 1) await forge.addTab('acryl')
  await assert.rejects(forge.addTab('acryl'), /at most 5 tabs/)
  await forge.closeTab('acryl', tab.id)
  await assert.rejects(forge.closeTab('scratch', 'tab-3'), /at least one tab/)
})

test('snippets: only allowlisted commands, unique names, a limit', async () => {
  const { forge } = await open()
  const s = await forge.addSnippet(' Who am I ', 'whoami')
  assert.deepEqual([s.label, s.command], ['Who am I', 'whoami'])
  await assert.rejects(forge.addSnippet('who am i', 'pwd'), /already a snippet/)
  await assert.rejects(forge.addSnippet('Bad', 'rm -rf /'), /allowlist/)
  await assert.rejects(forge.addSnippet('', 'pwd'), /name/)
  await forge.deleteSnippet(s.id)
  await assert.rejects(forge.deleteSnippet(s.id), /no such snippet/)
  for (let i = 0; i < 8; i += 1) await forge.addSnippet(`S${String(i)}`, 'pwd')
  await assert.rejects(forge.addSnippet('Over', 'pwd'), /At most 12/)
})
