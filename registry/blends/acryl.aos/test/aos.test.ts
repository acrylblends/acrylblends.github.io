import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { freshDesktop, readDesktop, reconcile, writeDesktop } from '../plugins/aos/desktop.ts'
import { foldEvent, viewOf } from '../plugins/aos/runs.ts'
import { type AppInfo, type ComputerPorts, runTool, TOOL_NAMES } from '../plugins/aos/tools.ts'
import { workflows } from '../plugins/aos/workflows.ts'

/** The replay token a computer would keep in its home; any text in a test. */
const REPLAY_TOKEN = 'test-replay-value'

const scratch = join(fileURLToPath(new URL('..', import.meta.url)), '.acrylblends', 'test')
mkdirSync(scratch, { recursive: true })

/** The computer over a throwaway home and two listed apps; nothing runs, the door answers what it is asked. */
function fakeComputer(home: string) {
  const apps: AppInfo[] = [
    { id: 'notes', name: 'Notes', path: '/apps/notes', state: 'stopped', surface: 'desktop' },
    { id: 'crm', name: 'Small CRM', path: '/apps/crm', state: 'running', surface: 'desktop' },
  ]
  const opened: string[] = []
  const doorCalls: unknown[] = []
  const ports: ComputerPorts = {
    apps: () => apps,
    desktop: () => readDesktop(home, apps.map((a) => a.id)),
    arrange(change) {
      const d = readDesktop(home, apps.map((a) => a.id))
      const answer = change(d, Object.fromEntries(apps.map((a) => [a.id, a.name])))
      writeDesktop(home, d)
      return answer
    },
    open: (id) => { opened.push(id) },
    stop: () => undefined,
    door: {
      call: async (folder, verb, args) => {
        doorCalls.push({ folder, verb, args })
        if (folder === '/apps/notes') throw new Error('no app is running in this folder')
        return { ok: true, value: { tools: ['crm_search'] } }
      },
      confirmPublish: async () => ({ ok: false }),
    },
  }
  return { ports, opened, doorCalls }
}

test('the desktop: a fresh one lists every app and the views, an app made later lands on it, a removed one leaves every list', () => {
  const fresh = freshDesktop(['notes', 'crm'])
  assert.deepEqual(fresh.desk, ['notes', 'crm', 'files', 'activity', 'settings'])
  assert.deepEqual(fresh.dock, ['files', 'notes', 'crm', 'activity', 'settings'])
  const next = reconcile({ ...fresh, folders: { 'f-1': { name: 'Work', items: ['crm'] } }, desk: ['notes', 'f-1', 'files', 'activity', 'settings'] }, ['crm', 'flow'])
  assert.deepEqual(next.desk, ['f-1', 'files', 'activity', 'settings', 'flow'])
  assert.deepEqual(next.folders['f-1']?.items, ['crm'])
  assert.ok(!next.dock.includes('notes'))
})

test('the tools arrange desktop.json by names a model uses, refuse in words, and a replay by name does the same again', async () => {
  const home = mkdtempSync(join(scratch, 'aos-'))
  try {
    const { ports, opened, doorCalls } = fakeComputer(home)
    const made = await runTool(ports, 'desktop_folder_create', { name: 'Sales' }) as { folder: string, created: boolean }
    assert.equal(made.created, true)
    await runTool(ports, 'desktop_move', { items: ['Small CRM', 'notes'], to: 'sales' })
    const file = JSON.parse(readFileSync(join(home, 'desktop.json'), 'utf8'))
    assert.deepEqual(file.folders[made.folder], { name: 'Sales', items: ['crm', 'notes'] })
    assert.ok(!file.desk.includes('crm'))
    // The same folder again is reused, never a second "Sales".
    assert.deepEqual(await runTool(ports, 'desktop_folder_create', { name: 'sales' }), { folder: made.folder, created: false })
    await assert.rejects(runTool(ports, 'desktop_move', { items: ['Nope'], to: 'desk' }), /nothing on the desktop is called "Nope"/)
    await assert.rejects(runTool(ports, 'desktop_arrange', { wallpaper: 'neon' }), /the wallpapers are/)
    // Removing the folder puts its items back; replaying the two steps by name builds the same folder again.
    await runTool(ports, 'desktop_folder_remove', { folder: 'Sales' })
    for (const step of [{ tool: 'desktop_folder_create', args: { name: 'Sales' } }, { tool: 'desktop_move', args: { items: ['crm', 'notes'], to: 'Sales' } }]) await runTool(ports, step.tool, step.args)
    const again = JSON.parse(readFileSync(join(home, 'desktop.json'), 'utf8'))
    assert.deepEqual(Object.values(again.folders), [{ name: 'Sales', items: ['crm', 'notes'] }])
    // Apps: opened by name; driven through their door, which says when an app is not running.
    assert.deepEqual(await runTool(ports, 'system_open', { app: 'small crm' }), { opening: 'crm' })
    assert.deepEqual(opened, ['crm'])
    assert.deepEqual(await runTool(ports, 'app_tools', { app: 'crm' }), { tools: ['crm_search'] })
    await assert.rejects(runTool(ports, 'app_look', { app: 'Notes' }), /Notes is not running/)
    assert.deepEqual(doorCalls.map((c) => (c as { verb: string }).verb), ['tool-list', 'look'])
  } finally { rmSync(home, { recursive: true, force: true }) }
})

test('a broken desktop.json is kept aside and a fresh desktop starts', () => {
  const home = mkdtempSync(join(scratch, 'aos-'))
  try {
    writeFileSync(join(home, 'desktop.json'), '{"oops"')
    assert.deepEqual(readDesktop(home, ['a']).desk, ['a', 'files', 'activity', 'settings'])
  } finally { rmSync(home, { recursive: true, force: true }) }
})

test('a chat turn: model steps carry the provider\'s tokens, tool steps none, and this computer\'s tools are marked replayable (a real turn\'s events)', () => {
  const events = JSON.parse(readFileSync(new URL('./fixtures/wallpaper-turn.json', import.meta.url), 'utf8')) as Array<{ type: string, time: number, data: Record<string, unknown> }>
  const turns = new Map()
  for (const event of events) foldEvent(turns, 's1', event, new Set(TOOL_NAMES))
  const run = viewOf(turns.get('s1'))
  assert.equal(run?.title, 'Set the AOS wallpaper to dusk.')
  assert.deepEqual(run?.steps.map((s) => [s.kind, s.tool ?? '', s.tokens]), [['model', '', 15029], ['tool', 'desktop_arrange', 0], ['model', '', 15096]])
  assert.deepEqual(run?.steps[1]?.args, { wallpaper: 'dusk' })
  assert.equal(run?.steps[1]?.ours, true)
  assert.equal(run?.tokens, 30125)
})

test('save as workflow: a manual trigger, one HTTP step per tool posting it back with the replay token, then published; run again starts it', async () => {
  const home = mkdtempSync(join(scratch, 'aos-wf-'))
  try {
    const folder = join(home, 'flow')
    mkdirSync(join(folder, '.acryl'), { recursive: true })
    writeFileSync(join(folder, '.acryl', 'door.json'), JSON.stringify({ url: 'http://127.0.0.1:9' }))
    const sent: Array<{ url: string, body?: unknown }> = []
    const fakeFetch = (async (url: string, init?: { body?: string }) => {
      sent.push({ url: String(url), ...(init?.body === undefined ? {} : { body: JSON.parse(init.body) }) })
      const json = String(url).endsWith('/workflows') && init?.body !== undefined ? { id: 'wf_1' } : String(url).endsWith('/run') ? { id: 'run_1', status: 'succeeded' } : { workflows: [] }
      return new Response(JSON.stringify(json), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch
    const launcher = { state: () => ({ apps: [{ id: 'flow', blend: 'acrylblends.workflow-automation', path: folder, state: 'stopped' }] }), start: () => assert.fail('a running app is not started again') }
    const flows = workflows({ launcher: launcher as never, door: {} as never }, fakeFetch)
    const saved = await flows.save('Group sales', [{ tool: 'desktop_folder_create', args: { name: 'Sales' } }, { tool: 'desktop_move', args: { items: ['crm'], to: 'Sales' } }], 'http://127.0.0.1:4517/app/api/aos/replay', REPLAY_TOKEN)
    assert.deepEqual(saved, { id: 'wf_1', name: 'Group sales', steps: 2 })
    const paths = sent.map((s) => s.url.replace('http://127.0.0.1:9/app/automation/api', ''))
    assert.deepEqual(paths, ['/workflows', '/workflows', '/workflows/wf_1/trigger', '/workflows/wf_1/steps', '/workflows/wf_1/steps', '/workflows/wf_1/publish'])
    const step = (sent[3]?.body as { step: { integration: string, input: Record<string, unknown> } }).step
    assert.equal(step.integration, '@aiqadam/qadam-http')
    assert.deepEqual([step.input.url, step.input.authType, step.input.authFields, step.input.body], ['http://127.0.0.1:4517/app/api/aos/replay', 'BEARER_TOKEN', { token: REPLAY_TOKEN }, { data: { tool: 'desktop_folder_create', args: { name: 'Sales' } } }])
    assert.deepEqual(await flows.run('wf_1'), { run: 'run_1', status: 'succeeded' })
  } finally { rmSync(home, { recursive: true, force: true }) }
})
