/**
 * ACRYL AOS (spec 052 D11-D14): the desktop of this computer's ACRYL apps. Cordis Host plugin.
 *
 * Capability boundary: the arrangement (`desktop.json`) and the computer's operations as tools. What apps exist, starting and stopping them, and Add to
 * Applications are the Control Center's launcher service (`@acryldev/launcher-desktop/node`), not repeated here; driving an app is its door (`fileDoor`).
 * Provides: routes under `/api/aos` (the page's), and the `desktop_*`, `system_*` and `app_*` tools in the app's `tools` registry, which the frame's chat
 * reads. Consumes: `router` (hard), `tools` (optional: on the app's own server there is none, and the tools wait for it).
 * Effects: the registrations (removed with the plugin or the registry); on unload, every app this plugin started without a window of its own is stopped.
 */
import { type ChildProcess, spawn } from 'node:child_process'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { readdir, stat } from 'node:fs/promises'
import { join, sep } from 'node:path'
import { acrylRoot, personHome } from '@acryldev/instance/storage'
import { blendNameOf } from '@acryldev/launcher'
import { createNodeLauncher, fileDoor, type LauncherService } from '@acryldev/launcher-desktop/node'
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../router/src/index.ts'
import { addFile, type Desktop, DesktopRefusal, readDesktop, writeDesktop } from './desktop.ts'
import { IdleClock, processTable, type Usage, usageOf } from './processes.ts'
import { watchRuns } from './runs.ts'
import { AOS_TOOLS, type AppInfo, type ComputerPorts, runTool, TOOL_NAMES } from './tools.ts'
import { type WorkflowStep, workflows } from './workflows.ts'

export const name = 'aos'
export const inject = ['router']

/** ACRYL's home, where the app list and the desktop live: `ACRYL_LAUNCHER_HOME` (tests) or `~/.acryl`, the one the Control Center reads. */
export function aosHome(env: NodeJS.ProcessEnv = process.env): string {
  return env.ACRYL_LAUNCHER_HOME ?? acrylRoot(process.platform, env, personHome(env))
}

/** A change from the page: JSON, and from this app's own origin when the browser names one (the Workflow Automation API's rule). */
function refusedFrom(request: Request): string | undefined {
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) return 'a change is sent as JSON'
  const origin = request.headers.get('origin')
  if (origin !== null && origin !== 'null') {
    try { if (new URL(origin).host !== request.headers.get('host')) return 'a change must come from this app' } catch { return 'a change must come from this app' }
  }
  return undefined
}

/**
 * What a person calls an app: a name they gave it, else the name of the Blend it was made from in the store ("Workflow Automation"), else its folder's.
 * An app made from the store carries its folder name as its Blend name until the person renames it, so that name alone says nothing new.
 */
const shownName = (app: { path: string, name: string, blend: string }, titles: ReadonlyMap<string, string>): string => {
  const own = blendNameOf(app.path)
  return own !== '' && own !== app.name ? own : titles.get(app.blend) ?? (own || app.name)
}

/** The computer as the tools and the page see it, over one launcher service and one desktop file. */
export function computer(home: string, launcher: LauncherService, titles: ReadonlyMap<string, string> = new Map()): ComputerPorts {
  const apps = (): AppInfo[] => launcher.state().apps.map((a) => ({ id: a.id, name: shownName(a, titles), path: a.path, state: a.state, surface: a.surface }))
  const names = (): Record<string, string> => ({ files: 'Files', activity: 'Activity', settings: 'Settings', ...Object.fromEntries(apps().map((a) => [a.id, a.name])) })
  const desktop = (): Desktop => readDesktop(home, apps().map((a) => a.id))
  return {
    apps,
    desktop,
    arrange(change) {
      const current = desktop()
      const answer = change(current, names())
      writeDesktop(home, current)
      return answer
    },
    // Every app opens in its own OS window with its own host (D11, D12): the launcher's Desktop start, `npm run desktop` in its folder.
    open: (id) => launcher.start(id, 'desktop'),
    stop: (id) => launcher.stop(id),
    door: fileDoor(),
  }
}

/** The token a saved workflow's steps carry to replay a tool here; kept in the app's data, made once. */
function replayToken(folder: string): string {
  const file = join(folder, 'replay-token')
  if (existsSync(file)) return readFileSync(file, 'utf8').trim()
  mkdirSync(folder, { recursive: true, mode: 0o700 })
  const token = randomBytes(24).toString('base64url')
  writeFileSync(file, token, { mode: 0o600 })
  return token
}

const same = (a: string, b: string): boolean => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))

interface ToolsPort { register(name: string, tool: { description: string, parameters?: unknown, run(input: unknown): unknown }): () => void }
interface DshToolsPort {
  register(definition: { name: string, description: string, parameters: unknown, output: { schema: unknown, render(args: unknown, value: unknown): Array<{ type: 'text', text: string }> }, execute(args: unknown): Promise<unknown> }): () => void
  schemas(): unknown
}
const isDsh = (tools: unknown): tools is DshToolsPort => typeof (tools as { schemas?: unknown } | undefined)?.schemas === 'function'

export function apply(ctx: Context, config: { readonly prefix?: string } = {}): void {
  const home = aosHome()
  const launcher = createNodeLauncher(home)
  void launcher.prepareTools()
  // The store's names of the Blends (the registry, read by the launcher at most once a minute); without the network an app keeps its folder's name.
  const titles = new Map<string, string>()
  const readTitles = (): void => { launcher.blends().then((all) => { for (const b of all) titles.set(b.id, b.name) }, () => undefined) }
  readTitles()
  const meter = { toolCalls: 0, replays: 0, slept: 0 }
  // Idle sleep (D11): each check reads the real processes; an app that spent almost no CPU for the person's sleepAfter minutes stops its host, and
  // the next open wakes it, timed from the open to its door answering.
  const usage = new Map<string, Usage>()
  const asleep = new Map<string, number>()
  const waking = new Map<string, number>()
  const wakes: Array<{ id: string, seconds: number, at: string }> = []
  const clock = new IdleClock()
  const exports = installers(home)
  ctx.effect(() => () => { exports.stop() }, 'aos: stop an export still packing')
  const base = computer(home, launcher, titles)
  const ports: ComputerPorts = {
    ...base,
    open(id) {
      clock.forget(id)
      if (asleep.delete(id)) waking.set(id, Date.now())
      base.open(id)
    },
  }
  const dataFolder = join((ctx.get('appInstance') as { home?: string } | undefined)?.home ?? home, 'aos')
  const token = replayToken(dataFolder)
  const port = (): string => (ctx.get('nodeServer') as { url?: string } | undefined)?.url ?? ''
  const flows = workflows({ launcher, door: ports.door })
  const runs = watchRuns(ctx, new Set(TOOL_NAMES))

  /** What a model reads back from a tool: the value as JSON, or the refusal in words (the call itself does not fail the turn). */
  const answer = async (toolName: string, input: unknown): Promise<string> => {
    meter.toolCalls += 1
    try { return JSON.stringify(await runTool(ports, toolName, input) ?? { ok: true }) } catch (cause) {
      if (cause instanceof DesktopRefusal) return JSON.stringify({ refused: cause.message })
      throw cause
    }
  }

  ctx.inject(['tools'], (inner) => {
    inner.effect(() => {
      const tools = inner.get('tools')
      const removers = AOS_TOOLS.map((tool) => isDsh(tools)
        ? tools.register({ name: tool.name, description: tool.description, parameters: tool.parameters, output: { schema: { type: 'string' }, render: (_a, value) => [{ type: 'text', text: String(value) }] }, execute: (args) => answer(tool.name, args) })
        : (tools as ToolsPort).register(tool.name, { description: tool.description, parameters: tool.parameters, run: (input) => answer(tool.name, input) }))
      return () => { for (const remove of removers.reverse()) remove() }
    }, 'aos: the computer\'s tools in the registry')
  })

  const fail = (c: { json: (v: unknown, s?: number) => Response }, cause: unknown): Response => {
    if (cause instanceof DesktopRefusal || (cause instanceof Error && cause.name === 'LauncherRefusal')) return c.json({ error: cause.message }, 409)
    throw cause
  }
  const change = (handler: (body: Record<string, unknown>) => unknown) => async (c: { req: { raw: Request }, json: (v: unknown, s?: number) => Response }) => {
    const refused = refusedFrom(c.req.raw)
    if (refused !== undefined) return c.json({ error: refused }, 403)
    let body: unknown
    try { body = await c.req.raw.json() } catch { return c.json({ error: 'the body is not JSON' }, 400) }
    if (typeof body !== 'object' || body === null) return c.json({ error: 'the body is a JSON object' }, 400)
    try { return c.json((await handler(body as Record<string, unknown>)) ?? { ok: true }) } catch (cause) { return fail(c, cause) }
  }

  const sizes = folderSizes()
  const api = new Acryl()
    .get('/page.js', (c) => c.body(readFileSync(new URL('./page/aos.js', import.meta.url)), 200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache' }))
    .get('/activity', async (c) => c.json({
      at: new Date().toLocaleTimeString('en'),
      hostMemory: `${Math.round(process.memoryUsage().rss / 1048576)} MB`,
      apps: Object.fromEntries(ports.apps().map((a) => [a.id, { ...usage.get(a.id), state: asleep.has(a.id) ? 'asleep' : a.state }])),
      wakes: wakes.slice(-10),
      sleepAfter: ports.desktop().prefs.sleepAfter,
      sizes: Object.fromEntries(await Promise.all(ports.apps().map(async (a) => [a.id, await sizes(a.path)] as const))),
    }))
    .get('/state', (c) => {
      const apps = launcher.state().apps
      return c.json({
        apps: apps.map((a) => ({ id: a.id, name: shownName(a, titles), state: asleep.has(a.id) && a.state !== 'running' ? 'asleep' : a.state, surface: a.surface, blend: a.blend, version: a.version, icon: existsSync(join(a.path, 'assets', 'icon.png')), failure: a.failure })),
        desktop: ports.desktop(),
        exports: exports.view(),
        meter: { running: apps.filter((a) => a.state === 'running').length, ...meter, modelTokens: runs.tokens() },
        home,
      })
    })
    .get('/icon/:id', (c) => {
      const app = ports.apps().find((a) => a.id === c.req.param('id'))
      const file = app === undefined ? undefined : join(app.path, 'assets', 'icon.png')
      if (file === undefined || !existsSync(file)) return c.json({ error: 'no icon' }, 404)
      return c.body(readFileSync(file), 200, { 'content-type': 'image/png', 'cache-control': 'max-age=60' })
    })
    // A person's click: the same tools the agent calls (counted the same way).
    .post('/tool', change(async (body) => JSON.parse(await answer(String(body.tool), body.args))))
    .post('/note', change((body) => {
      const folder = join(home, 'desktop-files')
      mkdirSync(folder, { recursive: true })
      const fileName = `${String(body.name ?? 'Untitled').replace(/[\\/:*?"<>|]/g, '-').trim() || 'Untitled'}.md`
      const path = join(folder, fileName)
      if (!existsSync(path)) writeFileSync(path, '')
      return { id: ports.arrange((d) => addFile(d, { name: fileName, path })) }
    }))
    .get('/file/:id', (c) => {
      const file = ports.desktop().files[c.req.param('id')]
      if (file === undefined || !existsSync(file.path)) return c.json({ error: 'no such file' }, 404)
      return c.json({ name: file.name, text: readFileSync(file.path, 'utf8').slice(0, 200_000) })
    })
    .post('/applications', change((body) => ({ problems: launcher.appShortcut(String(body.id), body.on !== false) })))
    .post('/export', change((body) => exports.start(ports.apps().find((a) => a.id === body.id))))
    // The chat's last turn (from the frame's session log), its tool steps and model steps apart, tokens from the provider's usage.
    .get('/run', (c) => c.json(runs.last() ?? { steps: [], tokens: 0 }))
    .get('/workflows', async (c) => { try { return c.json(await flows.list()) } catch (cause) { return fail(c, cause) } })
    .post('/workflows', change(async (body) => flows.save(String(body.name ?? 'AOS run'), (body.steps ?? []) as WorkflowStep[], `${port()}${config.prefix ?? '/app'}/api/aos/replay`, token)))
    .post('/workflows/run', change((body) => flows.run(String(body.id))))
    // A saved workflow's step: one tool, replayed exactly, with no model. Only with this app's replay token.
    .post('/replay', async (c) => {
      const given = (c.req.header('authorization') ?? '').replace(/^Bearer /, '')
      if (!same(given, token)) return c.json({ error: 'not this computer\'s workflow' }, 403)
      const body = await c.req.json() as { tool?: string, args?: unknown }
      meter.replays += 1
      try { return c.json({ tool: body.tool, value: JSON.parse(await answer(String(body.tool), body.args)) }) } catch (cause) { return fail(c, cause) }
    })
  ctx.router.route('/api/aos', api)
  ctx.effect(() => () => { launcher.stopAll() }, 'aos: stop the apps it started')

  /** What names an app's processes: its folder (its launcher, its Electron on Linux and Windows) and its window bundle (macOS copies Electron into ~/.acryl/electron/<id>-<hash>.app). */
  const marksOf = (app: AppInfo): string[] => [join(app.path, sep), join(home, 'electron', `${app.id}-`)]
  let checking = false
  const check = async (): Promise<void> => {
    if (checking) return
    checking = true
    try {
      const table = await processTable()
      const now = Date.now()
      const after = ports.desktop().prefs.sleepAfter * 60_000
      for (const app of ports.apps()) {
        const used = app.state === 'running' || waking.has(app.id) ? usageOf(table, marksOf(app)) : undefined
        if (used === undefined) { usage.delete(app.id); continue }
        usage.set(app.id, used)
        const wokeAt = waking.get(app.id)
        if (wokeAt !== undefined && app.state === 'running' && await ports.door.call(app.path, 'tool-list', {}).then((a) => a.ok, () => false)) {
          waking.delete(app.id)
          wakes.push({ id: app.id, seconds: Math.round((now - wokeAt) / 100) / 10, at: new Date(now).toISOString() })
        }
        if (app.state === 'running' && clock.idle(app.id, used.cpu, now, after)) {
          launcher.stop(app.id)
          clock.forget(app.id)
          usage.delete(app.id)
          asleep.set(app.id, now)
          meter.slept += 1
        }
      }
    } catch { /* the next check tries again */ } finally { checking = false }
  }
  ctx.effect(() => {
    const slow = setInterval(() => void check(), 15_000)
    // While an app wakes, check every half second so its wake time is measured, not rounded to the slow check.
    const fast = setInterval(() => { if (waking.size > 0) void check() }, 500)
    return () => { clearInterval(slow); clearInterval(fast) }
  }, 'aos: idle sleep and the apps\' memory')
}

/** The sizes of an app's folder (its own files, and node_modules), measured once a minute at most: a walk of node_modules takes a moment. */
function folderSizes(): (folder: string) => Promise<{ own: string, modules: string }> {
  const cache = new Map<string, { at: number, value: { own: string, modules: string } }>()
  const walk = async (path: string): Promise<number> => {
    let total = 0
    for (const entry of await readdir(path, { withFileTypes: true }).catch(() => [])) {
      const child = join(path, entry.name)
      if (entry.isDirectory()) total += await walk(child)
      else if (entry.isFile()) total += (await stat(child).catch(() => ({ size: 0 }))).size
    }
    return total
  }
  const mb = (bytes: number): string => `${(bytes / 1048576).toFixed(bytes < 10 * 1048576 ? 1 : 0)} MB`
  return async (folder) => {
    const hit = cache.get(folder)
    if (hit !== undefined && Date.now() - hit.at < 60_000) return hit.value
    let own = 0
    for (const entry of await readdir(folder, { withFileTypes: true }).catch(() => [])) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue
      const child = join(folder, entry.name)
      own += entry.isDirectory() ? await walk(child) : (await stat(child).catch(() => ({ size: 0 }))).size
    }
    const value = { own: mb(own), modules: mb(await walk(join(folder, 'node_modules'))) }
    cache.set(folder, { at: Date.now(), value })
    return value
  }
}

/** Export as installer (D6): `acrylblends pack` in the app's folder, detached, its progress in the home's logs. */
/** The acrylblends release that packs an app: the one this app runs on, so an installer is made with the same frame. */
const PACK_WITH = `@acryldev/blends@${(createRequire(import.meta.url)('@acryldev/blends/package.json') as { version: string }).version}`

/** One argument for a cmd.exe line, kept whole whatever spaces or `&,;` it holds. shortcut: a `%NAME%` in it is still expanded by cmd, harmless in an app's name and folder. */
export const cmdQuoted = (arg: string): string => `"${arg.replaceAll('"', '')}"`

interface Export { state: 'packing' | 'done' | 'failed'; readonly out: string; readonly log: string; readonly started: string; seconds?: number; files?: string[] }

/** Export as installer: `acrylblends pack` of the app's folder into ~/.acryl/installers/<app>, one at a time per app, stopped if AOS stops. */
function installers(home: string) {
  const all = new Map<string, Export>()
  const children = new Set<ChildProcess>()
  return {
    view: (): Record<string, Export> => Object.fromEntries(all),
    start(app: AppInfo | undefined): Export {
      if (app === undefined) throw new DesktopRefusal('there is no such app')
      if (all.get(app.id)?.state === 'packing') throw new DesktopRefusal(`${app.name} is already being exported`)
      const out = join(home, 'installers', app.id)
      const log = join(home, 'logs', `export-${app.id}.log`)
      mkdirSync(join(home, 'logs'), { recursive: true })
      rmSync(out, { recursive: true, force: true })
      const fd = openSync(log, 'w')
      const win = process.platform === 'win32'
      const args = ['-y', PACK_WITH, 'pack', '--from', '.', '--product', app.name, '--out', out]
      // npx is a .cmd on Windows, so cmd.exe reads the line: an unquoted "Notes, in a window" became --product "Notes," (the installer Notes--win-x64.exe).
      const child = spawn(win ? 'npx.cmd' : 'npx', win ? args.map(cmdQuoted) : args,
        { cwd: app.path, stdio: ['ignore', fd, fd], shell: win, windowsHide: true, detached: !win })
      const job: Export = { state: 'packing', out, log, started: new Date().toISOString() }
      all.set(app.id, job)
      children.add(child)
      const begun = Date.now()
      const end = (ok: boolean): void => {
        children.delete(child)
        closeSync(fd)
        job.seconds = Math.round((Date.now() - begun) / 1000)
        job.files = existsSync(out) ? readdirSync(out).filter((f) => /\.(dmg|exe|deb|tar\.gz|AppImage)$/u.test(f)) : []
        job.state = ok && job.files.length > 0 ? 'done' : 'failed'
      }
      child.once('error', () => end(false))
      child.once('exit', (code) => end(code === 0))
      return job
    },
    stop(): void {
      for (const child of children) {
        try { if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true }); else process.kill(-(child.pid ?? 0), 'SIGTERM') } catch { /* gone */ }
      }
    },
  }
}
