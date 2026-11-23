/**
 * Spike: the shell-independent half of @acryldev/desktop-shell 0.1.8 lib/main.js (product storage, first-start seeding, the frame host process),
 * copied so a non-Electron shell (Electrobun's Bun main, or a headless test runner) can start a packed ACRYL product the same way.
 * Copied regions: product.ts (seedSource, openProductApp, refreshFinishedApp), frame.ts (startFrameHost, packagedHostArgs), git.ts (withGitFirst).
 * Not copied: updater, door-shell (window-level door calls), menus, host restart supervisor.
 */
import { spawn, spawnSync } from 'node:child_process'
import { appendFileSync, copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

const HOST_LINE = /acrylblends host: (http:\/\/\S+)/u
const SKIPPED = new Set(['dist', '.acrylblends', 'product.json', 'template-git', 'gitignore-product', 'gitattributes-product', 'package-product.json'])
const CARRIED = [
  { carrier: 'gitignore-product', file: '.gitignore' },
  { carrier: 'gitattributes-product', file: '.gitattributes' },
  { carrier: 'package-product.json', file: 'package.json' },
]
const PRODUCT_NAMES = ['product.json', 'gitignore-product', 'gitattributes-product', 'package-product.json', 'template-git/']

/** The packed product's own packages, loaded from the bundle (the Program), not from wherever this file sits. */
async function programModules(program) {
  const mod = (p) => import(pathToFileURL(join(program, 'node_modules', p)).href)
  const [instance, bundle, storage] = await Promise.all([
    mod('@acryldev/instance/lib/index.js'),
    mod('@acryldev/instance/lib/bundle.js'),
    mod('@acryldev/instance/lib/storage.js'),
  ])
  return { instance, bundle, storage }
}

function ignoreProductFiles(source) {
  const info = join(source, '.git', 'info')
  if (!existsSync(join(source, '.git'))) return
  const file = join(info, 'exclude')
  const before = existsSync(file) ? readFileSync(file, 'utf8') : ''
  const known = new Set(before.split('\n').map((line) => line.trim()))
  const missing = PRODUCT_NAMES.filter((name) => !known.has(name))
  if (missing.length === 0) return
  mkdirSync(info, { recursive: true })
  appendFileSync(file, `${before === '' || before.endsWith('\n') ? '' : '\n'}${missing.join('\n')}\n`)
}

function seedSource(inProgram, bundle, source, program, refresh = false) {
  cpSync(bundle, source, {
    recursive: true,
    dereference: true,
    errorOnExist: false,
    force: true,
    filter: (path) => {
      const parts = relative(bundle, path).split(sep)
      if (parts[0] === '') return true
      if (SKIPPED.has(parts[0] ?? '')) return false
      const tree = parts.join('/')
      return !inProgram(program, tree) && !inProgram(program, `${tree}/`)
    },
  })
  const templateRepo = join(bundle, 'template-git')
  if (!refresh && existsSync(templateRepo)) cpSync(templateRepo, join(source, '.git'), { recursive: true, force: true })
  for (const { carrier, file } of CARRIED) {
    const from = join(bundle, carrier)
    if (existsSync(from)) cpSync(from, join(source, file), { force: true })
  }
  ignoreProductFiles(source)
}

/** Open (first start: make) the product's app, as desktop-shell's main does before it starts the host. */
export async function openProduct({ program, vcsBin, version = '0.0.0-spike', log = console.log }) {
  const { instance, bundle, storage: storageModule } = await programModules(program)
  const product = bundle.readProduct(program)
  if (product === undefined) throw new Error(`${program} has no product.json`)
  const storage = storageModule.openProductStorage({
    writtenBy: version,
    product: { name: product.appName, named: product.named === true },
    ...(vcsBin === undefined ? {} : { git: join(vcsBin, 'git') }),
  })
  let app = storage.last()
  const created = app === undefined
  if (app === undefined) {
    log(`product: making the app "${product.appName}" from the bundled app (first start, one time)`)
    app = storage.create(product.appName, (source) => seedSource(bundle.inProgram, program, source, product.program), { named: product.named === true })
  } else if (product.named === true && app.named !== true) app = storage.rename(app.id, app.name)
  const opened = storage.open(app.id)
  if (product.named === true && product.build !== undefined) {
    const record = join(opened.home, 'product-build')
    const made = existsSync(record) ? readFileSync(record, 'utf8').trim() : undefined
    if (made !== product.build) {
      if (!created) seedSource(bundle.inProgram, program, opened.root, product.program, true)
      mkdirSync(opened.home, { recursive: true })
      writeFileSync(record, `${product.build}\n`)
    }
  }
  const chosen = instance.withRunEnv(opened, process.env)
  return { product, storage, chosen, instance }
}

/**
 * The frame host on Bun has no node:module registerHooks for the bundle overlay, so the Program is linked into the app's source instead: each
 * Program entry the source lacks (node_modules, app/, frame/, scripts/, the library plugins, cordis.yml) becomes a link to the bundle's (a junction
 * on Windows, where a file is copied), and the names go into git's local exclude so the person's `git status` does not show them. Plain
 * resolution then finds everything, as in a one-folder app. Run on every start: an update of the app replaces the bundle the links point to.
 */
export function linkProgram(program, root, entries) {
  const win = process.platform === 'win32'
  const linked = []
  for (const entry of entries) {
    const name = entry.replace(/\/$/u, '')
    const target = join(program, name)
    const at = join(root, name)
    if (existsSync(at) || !existsSync(target)) continue
    mkdirSync(join(at, '..'), { recursive: true })
    if (win && !statSync(target).isDirectory()) copyFileSync(target, at)
    else symlinkSync(target, at, win ? 'junction' : undefined)
    linked.push(name)
  }
  if (linked.length > 0 && existsSync(join(root, '.git'))) {
    const info = join(root, '.git', 'info')
    mkdirSync(info, { recursive: true })
    const file = join(info, 'exclude')
    const before = existsSync(file) ? readFileSync(file, 'utf8') : ''
    const missing = linked.map((n) => `/${n}`).filter((n) => !before.split('\n').includes(n))
    if (missing.length > 0) appendFileSync(file, `${before === '' || before.endsWith('\n') ? '' : '\n'}${missing.join('\n')}\n`)
  }
  return linked
}

/**
 * Start the frame host as the packed Electron shell does (watch-host -> runtime --import loader --import overlay ide-host.mjs), with any runtime.
 * `preloadFlag` is `--import` for Node and `--preload` for Bun; `preloads` replaces the default loader list (the precompile and Bun spikes change it).
 */
export function startFrameHost({ program, chosen, instance, runtime, vcsBin, preloadFlag = '--import', preloads, runtimeArgs = [], hostScript, runner, runnerArgs = [], extraEnv = {}, write = (t) => process.stdout.write(t) }) {
  const root = chosen.root
  const shellLib = join(program, 'node_modules', '@acryldev', 'desktop-shell', 'lib')
  const loaders = preloads ?? [
    join(program, 'node_modules', '@acryldev', 'node-server', 'lib', 'register.js'),
    join(program, 'node_modules', '@acryldev', 'instance', 'lib', 'bundle-overlay.js'),
  ]
  const watched = ['src', 'plugins', 'blend.yaml'].map((n) => join(root, n)).filter((p) => existsSync(p))
  const args = [
    // `runner` replaces the Electron shell's watcher (the Electrobun build: electrobun/run-host.mjs, no restart on an edit).
    runner ?? join(shellLib, 'watch-host.mjs'),
    ...runnerArgs,
    ...watched.map((p) => `--watch-path=${p}`),
    '--',
    ...runtimeArgs,
    // Node's --import takes a URL (a Windows path like C:\... reads as the scheme c:); Bun's --preload takes a path.
    ...loaders.flatMap((l) => [preloadFlag, preloadFlag === '--import' ? pathToFileURL(l).href : l]),
    hostScript ?? join(program, 'scripts', 'ide-host.mjs'),
  ]
  let env = { ...process.env, ...instance.instanceEnv(chosen), ELECTRON_RUN_AS_NODE: '1', [instance.PROGRAM_ENV]: program, ...extraEnv }
  const win = process.platform === 'win32'
  if (vcsBin !== undefined) {
    const key = win ? (Object.keys(env).find((k) => k.toUpperCase() === 'PATH') ?? 'Path') : 'PATH'
    const sepChar = win ? ';' : ':'
    env = { ...env, [key]: [vcsBin, ...(env[key] ?? '').split(sepChar).filter((d) => d && d !== vcsBin)].join(sepChar) }
  }
  const child = spawn(runtime, args, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'], detached: !win, windowsHide: true })
  let output = ''
  let exited = false
  const exit = new Promise((done) => {
    child.once('exit', () => {
      exited = true
      done()
    })
    child.once('error', (e) => {
      exited = true
      output += `\n${e.message}`
      done()
    })
  })
  const ready = new Promise((done, fail) => {
    const take = (chunk) => {
      const text = chunk.toString()
      write(text)
      if (output.length < 2e5) output += text
      const address = HOST_LINE.exec(output)?.[1]
      if (address !== undefined) done(address)
    }
    child.stdout.on('data', take)
    child.stderr.on('data', take)
    exit.then(() => fail(new Error(`the frame host ended before it served the frame:\n${output.slice(-3000)}`)))
  })
  const signal = (name) => {
    if (child.pid === undefined) return
    if (win) {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
      return
    }
    try {
      process.kill(-child.pid, name)
    } catch {}
  }
  return {
    pid: child.pid,
    ready,
    output: () => output,
    async stop() {
      if (exited) return
      signal('SIGTERM')
      const ended = await Promise.race([exit.then(() => true), new Promise((d) => setTimeout(() => d(false), 5000))])
      if (!ended) {
        signal('SIGKILL')
        await exit
      }
    },
  }
}
