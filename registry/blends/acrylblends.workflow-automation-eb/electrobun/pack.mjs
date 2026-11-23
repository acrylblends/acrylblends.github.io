#!/usr/bin/env node
/**
 * Pack ACRYL Workflow Automation twice on this machine, from the same Program, and measure both:
 *   1. with Electron: the official `acrylblends pack` of @acryldev/blends (what ACRYL ships today);
 *   2. with Electrobun: the same Program (the files the Electron pack put in resources/app), Node and (macOS) Git, in an Electrobun bundle
 *      whose main process is electrobun/main.ts.
 *
 *   node electrobun/pack.mjs [--blends 1.7.25] [--arch arm64|x64] [--out dist/release]
 *
 * Writes the installers to --out (ACRYL-Workflow-Automation-Electrobun-<os>-<arch>.* and the Electron one for comparison) and the measured sizes to
 * --out/sizes-<os>-<arch>.json. Sizes are apparent bytes (the sum of file sizes), MB = 1,000,000 bytes, the same rule on every OS.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, cpSync, createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, readlinkSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createZstdDecompress } from 'node:zlib'
import { slim } from './slim.mjs'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback)
const blends = option('--blends', '1.7.25')
const arch = option('--arch', process.arch)
const host = option('--host', 'bun')
if (host !== 'bun' && host !== 'node') throw new Error(`--host ${host}: bun or node`)
const appVersion = process.env.ELECTROBUN_APP_VERSION ?? JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8')).version
const out = resolve(option('--out', join(repo, 'dist', 'release')))
const OS = { darwin: 'mac', win32: 'win', linux: 'linux' }[process.platform]
const win = process.platform === 'win32'
const log = (line) => console.log(`electrobun-pack: ${line}`)
const dist = join(repo, 'dist')
const stage = join(dist, 'electrobun-stage')
mkdirSync(out, { recursive: true })

/** Apparent size of a file or folder, in bytes (symlinks counted as links). */
function bytes(path) {
  const stat = statSync(path, { throwIfNoEntry: false })
  if (stat === undefined) return 0
  if (!stat.isDirectory()) return stat.size
  let total = 0
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = join(path, entry.name)
    total += entry.isSymbolicLink() ? 0 : bytes(child)
  }
  return total
}
const mb = (n) => Math.round(n / 1e4) / 100
const run = (file, list, options = {}) => {
  log(`$ ${basename(file)} ${list.join(' ')}`)
  const result = spawnSync(file, list, { stdio: 'inherit', shell: win, ...options })
  if (result.status !== 0) throw new Error(`${basename(file)} ${list[0]} failed (${String(result.status)})`)
}
const npx = win ? 'npx.cmd' : 'npx'
const GIT_UNUSED = ['git-lfs', 'scalar', 'git-shell', 'git-daemon', 'git-http-backend', 'git-http-push', 'git-imap-send']

// 1. The Electron product, exactly as ACRYL packs it. Its work folder holds the Program the Electrobun bundle reuses.
const tmp = join(dist, 'tmp')
// The packer names the app's work folder after the source folder (a leading category number dropped).
const SLUG = 'workflow-automation-eb'
const PRODUCT = 'ACRYL Workflow Automation'
const source = join(dist, 'src', SLUG)
const electronOut = join(dist, 'electron')
// --reuse: keep the Electron pack of an earlier run (a local rebuild of the Electrobun half only).
if (!args.includes('--reuse')) {
  rmSync(tmp, { recursive: true, force: true })
  mkdirSync(tmp, { recursive: true })
  rmSync(electronOut, { recursive: true, force: true })
  // Pack this repository's own app (its tracked files, copied into dist/src so dist/ never packs itself), under the product's name.
  rmSync(source, { recursive: true, force: true })
  mkdirSync(source, { recursive: true })
  for (const file of execFileSync('git', ['ls-files', '-z'], { cwd: repo, encoding: 'utf8' }).split('\0').filter(Boolean)) {
    if (!existsSync(join(repo, file))) continue
    mkdirSync(dirname(join(source, file)), { recursive: true })
    cpSync(join(repo, file), join(source, file), { verbatimSymlinks: true })
  }
  run(npx, ['--yes', `@acryldev/blends@${blends}`, 'pack', '--from', source, '--product', PRODUCT, '--arch', arch, '--out', electronOut], { env: { ...process.env, TMPDIR: tmp, TEMP: tmp, TMP: tmp } })
}
const electronInstaller = readdirSync(electronOut).map((f) => join(electronOut, f)).find((f) => /\.(dmg|exe|deb)$/u.test(f))
if (electronInstaller === undefined) throw new Error(`no Electron installer in ${electronOut}`)
const work = join(tmp, 'acryl-pack', `${SLUG}-${OS}-work`, SLUG, 'dist')
/** The unpacked Electron app: the folder whose resources/app holds product.json. */
function findUnpacked(dir, depth = 0) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const path = join(dir, entry.name)
    for (const resources of ['Contents/Resources', 'resources']) if (existsSync(join(path, resources, 'app', 'product.json'))) return { root: path, resources: join(path, resources) }
    if (depth < 2) {
      const found = findUnpacked(path, depth + 1)
      if (found !== undefined) return found
    }
  }
  return undefined
}
const unpacked = findUnpacked(work)
if (unpacked === undefined) throw new Error(`no unpacked Electron app under ${work}`)
const electronFrameworks = process.platform === 'darwin' ? join(unpacked.root, 'Contents', 'Frameworks') : undefined
const electron = {
  installer: basename(electronInstaller),
  installerBytes: statSync(electronInstaller).size,
  installedBytes: bytes(unpacked.root),
  payloadBytes: bytes(join(unpacked.resources, 'app')),
  gitBytes: bytes(join(unpacked.resources, 'git')),
}
electron.shellBytes = electron.installedBytes - electron.payloadBytes - electron.gitBytes
if (electronFrameworks !== undefined) electron.frameworksBytes = bytes(electronFrameworks)
log(`Electron: installer ${mb(electron.installerBytes)} MB, installed ${mb(electron.installedBytes)} MB (payload ${mb(electron.payloadBytes)}, shell ${mb(electron.shellBytes)})`)

// 2. The Electrobun stage: the same Program, the Node that runs this script (the official build setup-node or nvm installed), Git on macOS, icons.
rmSync(stage, { recursive: true, force: true })
mkdirSync(stage, { recursive: true })
cpSync(join(unpacked.resources, 'app'), join(stage, 'payload'), { recursive: true, verbatimSymlinks: true })
// On Bun the Program loses what only Electron, Node or other OSes use (electrobun/slim.mjs); --host node ships it whole.
const slimmed = host === 'bun' ? slim(join(stage, 'payload', 'node_modules'), { arch, bunPty: join(repo, 'electrobun', 'bun-pty.cjs') }) : undefined
if (slimmed !== undefined) for (const [rule, n] of Object.entries(slimmed.removed)) log(`slim: ${rule}: ${mb(n)} MB, ${slimmed.files[rule]} files`)
// --host bun (default): the frame host runs on Electrobun's own Bun and no Node ships. --host node: the Node that runs this script ships too.
if (host === 'node') {
  mkdirSync(join(stage, 'node'), { recursive: true })
  copyFileSync(process.execPath, join(stage, 'node', win ? 'node.exe' : 'node'))
}
// The Blend's version is the release's, so the frame's top bar names the build (blend.yaml metadata.version).
const blendYaml = join(stage, 'payload', 'blend.yaml')
writeFileSync(blendYaml, readFileSync(blendYaml, 'utf8').replace(/^(metadata:\n(?:[ \t].*\n)*?[ \t]+version:[ \t]*).*$/mu, `$1${appVersion}`))
// The person's app starts from the scaffold's repository (template-git becomes its .git): commit the version there, or the new app opens with
// blend.yaml already "unsaved".
const templateRepo = ['--git-dir', join(stage, 'payload', 'template-git'), '--work-tree', join(stage, 'payload')]
const ident = ['-c', 'user.name=ACRYL Blends', '-c', 'user.email=build@acryldev.dev']
execFileSync('git', [...templateRepo, 'add', 'blend.yaml'])
// Nothing to commit when blend.yaml already names this version.
if (spawnSync('git', [...templateRepo, 'diff', '--cached', '--quiet']).status !== 0) execFileSync('git', [...ident, ...templateRepo, 'commit', '-q', '-m', `Blend version ${appVersion}`])
if (existsSync(join(unpacked.resources, 'git'))) {
  cpSync(join(unpacked.resources, 'git'), join(stage, 'vcs'), { recursive: true, verbatimSymlinks: true })
  // Git's 148 builtin names (libexec/git-core/git-add -> git ...) are symlinks; Electrobun's copy follows them, so each became a 3.5 MB copy of git
  // (558 MB instead of 36). They travel as a list and main.ts makes the links again in the unpacked app on its first start.
  const core = join(stage, 'vcs', 'libexec', 'git-core')
  const links = readdirSync(core, { withFileTypes: true }).filter((entry) => entry.isSymbolicLink()).map((entry) => ({ name: entry.name, to: readlinkSync(join(core, entry.name)) }))
  for (const { name } of links) rmSync(join(core, name))
  writeFileSync(join(stage, 'vcs', 'links.json'), `${JSON.stringify(links)}\n`)
  // Git's own servers, mail and LFS tools: an ACRYL app only commits, fetches and pushes over HTTPS (git-remote-https links to git-remote-http).
  if (host === 'bun') for (const name of GIT_UNUSED) rmSync(join(core, name), { force: true })
}
const logo = join(stage, 'payload', 'node_modules', '@acryldev', 'desktop-shell', 'lib', 'assets', 'acrylblends-logo.png')
copyFileSync(logo, join(stage, 'icon.png'))
if (process.platform === 'darwin') {
  const set = join(stage, 'icon.iconset')
  mkdirSync(set)
  for (const size of [16, 32, 128, 256, 512]) {
    execFileSync('sips', ['-z', String(size), String(size), logo, '--out', join(set, `icon_${size}x${size}.png`)], { stdio: 'ignore' })
    execFileSync('sips', ['-z', String(size * 2), String(size * 2), logo, '--out', join(set, `icon_${size}x${size}@2x.png`)], { stdio: 'ignore' })
  }
}
const stageBytes = { payload: bytes(join(stage, 'payload')), node: bytes(join(stage, 'node')), git: bytes(join(stage, 'vcs')) }
// The Electron work folder is no longer needed (the Intel macOS runner ran out of disk in the DMG step with it in place): keep its installer only.
const electronCopy = join(out, `ACRYL-Workflow-Automation-Electron-${OS}-${arch}${electronInstaller.slice(electronInstaller.lastIndexOf('.'))}`)
copyFileSync(electronInstaller, electronCopy)
if (!args.includes('--reuse')) {
  rmSync(tmp, { recursive: true, force: true })
  rmSync(electronOut, { recursive: true, force: true })
}

// 3. The Electrobun build. Hutch (Electrobun's tool) may append a PATH line to the shell profile: run this in CI or with a scratch HOME.
rmSync(join(dist, 'electrobun-build'), { recursive: true, force: true })
rmSync(join(dist, 'electrobun-artifacts'), { recursive: true, force: true })
run(npx, ['--yes', 'electrobun@2.0.7', 'build', '--env=stable'], { cwd: repo })
const artifacts = join(dist, 'electrobun-artifacts')
const built = join(dist, 'electrobun-build')
const listing = readdirSync(artifacts)
log(`artifacts: ${listing.join(', ')}`)

/**
 * What the app is once unpacked (Electrobun ships it as a .tar.zst and extracts it on the first start): the sum of its file sizes and the number of
 * files, read from the tar headers, so it is measured by the same rule as the Electron side (bytes() above), without tar's own headers and padding.
 */
async function unpackedBytes(file) {
  let total = 0
  let files = 0
  let skip = 0
  let held = Buffer.alloc(0)
  for await (const chunk of createReadStream(file).pipe(createZstdDecompress())) {
    held = held.length === 0 ? chunk : Buffer.concat([held, chunk])
    let at = 0
    while (true) {
      if (skip > 0) {
        const step = Math.min(skip, held.length - at)
        skip -= step
        at += step
        if (skip > 0) break
      }
      if (held.length - at < 512) break
      const header = held.subarray(at, at + 512)
      at += 512
      if (header.every((b) => b === 0)) continue
      const size = Number.parseInt(header.subarray(124, 136).toString('latin1').replace(/\0.*$/su, '').trim() || '0', 8)
      const type = String.fromCharCode(header[156])
      if (type === '0' || type === '\0' || type === '7') {
        total += size
        files += 1
      }
      skip = Math.ceil(size / 512) * 512
    }
    held = held.subarray(at)
  }
  return { bytes: total, files }
}
const zst = []
const findZst = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) findZst(path)
    else if (entry.name.endsWith('.tar.zst')) zst.push(path)
  }
}
findZst(built)
const wrapperBytes = bytes(built)
const extracted = zst.length === 0 ? { bytes: 0, files: 0 } : await unpackedBytes(zst[0])
const extractedBytes = extracted.bytes

const name = `ACRYL-Workflow-Automation-Electrobun-${OS}-${arch}`
const shipped = []
for (const file of listing) {
  const from = join(artifacts, file)
  // Only what a person downloads: the DMG on macOS, the Setup archive on Windows and Linux. The .tar.zst is Electrobun's update bundle.
  if (statSync(from).isDirectory() || /update\.json$|checksum\.json$|\.tar\.zst$/u.test(file)) continue
  const ext = /(\.tar\.gz|\.[a-z0-9]+)$/u.exec(file)?.[1] ?? ''
  const to = join(out, `${name}${/-Setup/u.test(file) ? '-Setup' : ''}${ext}`)
  copyFileSync(from, to)
  shipped.push({ file: basename(to), bytes: statSync(to).size })
}

const electrobun = {
  artifacts: shipped,
  // What the installer puts down (a self-extractor holding the app compressed); on the first start it unpacks the app in its place.
  installerAppBytes: wrapperBytes,
  installedBytes: extractedBytes,
  installedFiles: extracted.files,
  payloadBytes: stageBytes.payload,
  nodeBytes: stageBytes.node,
  gitBytes: stageBytes.git,
  slimmed: slimmed?.removed,
}
electrobun.shellBytes = extractedBytes - stageBytes.payload - stageBytes.node - stageBytes.git
const sizes = { os: OS, arch, blends, host, version: appVersion, node: host === 'node' ? process.version : undefined, electron, electrobun, measured: new Date().toISOString() }
writeFileSync(join(out, `sizes-${OS}-${arch}.json`), `${JSON.stringify(sizes, null, 2)}\n`)
log(`Electrobun: ${shipped.map((s) => `${s.file} ${mb(s.bytes)} MB`).join(', ')}; installed ${mb(electrobun.installedBytes)} MB after the first start (${mb(wrapperBytes)} MB before it)`)
log(`sizes: ${join(out, `sizes-${OS}-${arch}.json`)}`)
