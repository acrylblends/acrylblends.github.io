/**
 * Spike: the ACRYL frame host on Bun, with node:module registerHooks emulated, as a preload (`bun --no-install --preload bun-node-hooks.mjs ...`).
 * Bun has no registerHooks, and a named import of a missing export fails at link time, so the four ACRYL files that import it are rewritten on
 * load to take it from here. Resolve hooks run as one chain (last registered first, as Node does) from a Bun runtime onResolve plugin for static
 * imports, and from the Cordis loader's own import() calls (rewritten on load), because Bun does not run onResolve for a dynamic import() of a
 * computed specifier. Load hooks are dropped: they compile JSX, which Bun does itself.
 * The frame's app generation (`?gen=N`, how the dev host loads the app's code again after an edit) is not a module key on Bun: a file whose
 * generation changed is taken out of Bun's module cache (require.cache, which Bun's ESM loader also reads) and so loads again, fresh.
 */
import { existsSync, readFileSync } from 'node:fs'
import { builtinModules, createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const resolvers = []
const debug = process.env.ACRYL_HOOKS_DEBUG === '1' ? (...a) => console.error('[hooks]', ...a) : () => {}
const builtins = new Set(builtinModules)
globalThis.__acrylRegisterHooks = (hooks) => {
  if (typeof hooks?.resolve === 'function') resolvers.push(hooks.resolve)
  debug('registerHooks', Object.keys(hooks ?? {}), resolvers.length)
  return {
    deregister() {
      const at = resolvers.indexOf(hooks.resolve)
      if (at !== -1) resolvers.splice(at, 1)
    },
  }
}

const splitQuery = (url) => {
  const at = url.search(/[?#]/u)
  return at === -1 ? [url, ''] : [url.slice(0, at), url.slice(at)]
}

/** The file of a resolved URL, taken out of Bun's module cache when its generation query changed since its last load. */
const generations = new Map()
function fileOf(url) {
  const [plain, query] = splitQuery(url)
  const path = fileURLToPath(plain)
  if (query !== '' && generations.get(path) !== query) {
    delete require.cache[path]
    generations.set(path, query)
  }
  return path
}

/** The registered resolve hooks as Node runs them, over Bun's own resolution; undefined when they do not apply. */
let resolving = false
function resolveThroughHooks(spec, parentURL) {
  // Bun.resolveSync inside a hook runs the onResolve plugin again: the inner call is Bun's own resolution.
  if (resolving || resolvers.length === 0) return undefined
  resolving = true
  try {
    return chain(spec, parentURL)
  } finally {
    resolving = false
  }
}
function chain(spec, parentURL) {
  if (spec.startsWith('node:') || spec.startsWith('bun:') || builtins.has(spec)) return undefined
  const base = (specifier, context) => {
    const parent = context?.parentURL ?? parentURL
    const from = parent?.startsWith('file:') ? dirname(fileURLToPath(parent)) : process.cwd()
    const [plain, query] = splitQuery(specifier)
    const target = plain.startsWith('file:') ? fileURLToPath(plain) : plain
    let found
    try {
      found = Bun.resolveSync(target, from)
    } catch (cause) {
      // Node's hooks test error.code (the bundle overlay falls back to the bundle on ERR_MODULE_NOT_FOUND); Bun's resolve error has none.
      const error = new Error(String(cause?.message ?? cause))
      error.code = 'ERR_MODULE_NOT_FOUND'
      throw error
    }
    return { url: `${pathToFileURL(found).href}${query}`, shortCircuit: true }
  }
  let next = base
  for (const hook of resolvers) {
    const inner = next
    next = (specifier, context) => hook(specifier, context ?? { parentURL, conditions: ['node', 'import'] }, inner)
  }
  try {
    const result = next(spec, { parentURL, conditions: ['node', 'import'], importAttributes: {} })
    return result?.url?.startsWith('file:') === true ? result.url : undefined
  } catch (error) {
    debug('resolve failed', spec, error?.message)
    return undefined
  }
}

/**
 * The framework's names (`acrylblends`, `acrylblends/<sub>`, `@acryldev/router`, ...) for a file of the app. In an app the framework is source under
 * `plugins/router/src`, not a package, so a plugin the agent writes (`import { Acryl } from 'acrylblends'`, as the app's AGENTS.md says) has nothing to
 * resolve to. Node's dev scripts map them in plugins/node-server/src/register.ts; the packed host preloads the Program's built register.js, which
 * maps them only beside its own plugins folder, so here they are mapped for the app the file belongs to, from that app's own routerAliases().
 * Only a bare name Bun could not resolve, only in a file that is not in node_modules.
 */
const appAliases = new Map()
const requireHere = createRequire(import.meta.url)
function aliasFor(spec, parentURL) {
  if (!parentURL?.startsWith('file:') || /^[./]|^[a-z]+:/iu.test(spec)) return undefined
  const parent = fileURLToPath(splitQuery(parentURL)[0])
  if (/[\\/]node_modules[\\/]/u.test(parent)) return undefined
  for (let dir = dirname(parent); dir !== dirname(dir); dir = dirname(dir)) {
    const resolver = join(dir, 'plugins', 'extensions', 'resolve.ts')
    if (!appAliases.has(dir)) {
      if (!existsSync(resolver) || !existsSync(join(dir, 'plugins', 'router', 'src', 'index.ts'))) continue
      let aliases = {}
      try {
        aliases = requireHere(resolver).routerAliases()
      } catch (error) {
        console.error(`bun-node-hooks: ${resolver}: ${error?.message ?? error}`)
      }
      appAliases.set(dir, aliases)
    }
    const alias = appAliases.get(dir)[spec]
    return alias === undefined ? undefined : pathToFileURL(alias).href
  }
  return undefined
}
/** `text` of the app file at `path` with each framework name Bun cannot resolve from there replaced by the file it names. */
const SPECIFIERS = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)(["'])([^"'\n]+)\2/gu
function withFrameworkFiles(path, text) {
  const parentURL = pathToFileURL(path).href
  return text.replace(SPECIFIERS, (all, lead, quote, spec) => {
    const alias = aliasFor(spec, parentURL)
    if (alias === undefined) return all
    try {
      Bun.resolveSync(spec, dirname(path))
      return all
    } catch {
      return `${lead}${quote}${alias}${quote}`
    }
  })
}

/** The Cordis loader's import(): resolve through the hooks first (as Node's loader would), then import the file. */
globalThis.__acrylImport = (parentURL, spec) => {
  const url = resolveThroughHooks(spec, parentURL)
  debug('import', spec, '->', url)
  return import(url === undefined ? spec : fileOf(url))
}

/**
 * The frame's TypeScript compile (`compileModule` of @acryldev/node-server: client modules for the browser) with Bun's own transpiler, so the
 * `typescript` package (20 MB) does not ship. Same contract: JSX on the automatic runtime from `importSource` (a file's own @jsxImportSource pragma
 * wins), ES module out, and each import specifier `rewrite` maps replaced. Bun's output has no comments, so only real import specifiers match.
 * shortcut: no inline source map (TypeScript's had one); browser devtools show the compiled module. Add one if debugging client modules on Bun needs it.
 */
const LOADERS = { '.tsx': 'tsx', '.jsx': 'jsx', '.ts': 'ts', '.mts': 'ts', '.cts': 'ts' }
const transpilers = new Map()
globalThis.__acrylBunCompile = (file, text, options) => {
  const importSource = options.importSource ?? options.defaultImportSource
  const loader = LOADERS[/\.[^.\\/]+$/u.exec(file)?.[0] ?? ''] ?? 'js'
  const key = `${loader}\0${importSource}`
  let transpiler = transpilers.get(key)
  if (transpiler === undefined) {
    const compilerOptions = { jsx: 'react-jsx', ...(importSource === undefined ? {} : { jsxImportSource: importSource }) }
    transpiler = new Bun.Transpiler({ loader, target: 'browser', autoImportJSX: true, tsconfig: { compilerOptions } })
    transpilers.set(key, transpiler)
  }
  const code = transpiler.transformSync(text)
  if (options.rewrite === undefined) return code
  return code.replace(/(\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)(["'])([^"'\n]+)\2/gu, (all, lead, quote, specifier) => {
    const replacement = options.rewrite(specifier)
    return replacement === undefined ? all : `${lead}${quote}${replacement}${quote}`
  })
}
// The function's first line, in the built chunk (lib/transpile-<hash>.js) and in the plugin source library copies carry (src/transpile.ts).
const COMPILE = /function compileModule\(file[^)]*\)[^{]*\{/u

const IMPORTS_HOOKS = /import\s*\{([^}]*)\bregisterHooks\b([^}]*)\}\s*from\s*["']node:module["'];?/u

Bun.plugin({
  name: 'acryl-node-hooks',
  setup(build) {
    // Only the four files that import it, and synchronously: an async onLoad makes the module async, and require() of it then fails (ajv's resolve.js).
    build.onLoad({ filter: /(blends-frame[\\/]lib[\\/]app-generation|node-server[\\/](lib|src)[\\/]register|instance[\\/]lib[\\/]bundle-overlay|plugins[\\/]extensions[\\/]resolve)\.(js|ts)$/u }, ({ path }) => {
      const text = readFileSync(path, 'utf8')
      const loader = path.endsWith('.ts') ? 'ts' : 'js'
      // Bun's runtime onLoad must answer with an object: a file that does not import registerHooks goes back as it is.
      if (!IMPORTS_HOOKS.test(text)) return { contents: text, loader }
      debug('rewrite registerHooks import', path)
      const contents = text.replace(IMPORTS_HOOKS, (_all, before, after) => {
        const rest = `${before}${after}`.split(',').map((s) => s.trim()).filter((s) => s !== '' && !s.startsWith('type '))
        return `${rest.length > 0 ? `import { ${rest.join(', ')} } from 'node:module';` : ''}const registerHooks = globalThis.__acrylRegisterHooks;`
      })
      return { contents, loader }
    })
    build.onLoad({ filter: /((node-server|blends)[\\/]lib[\\/]transpile-[^\\/]+\.js|node-server[\\/]src[\\/]transpile\.ts)$/u }, ({ path }) => {
      const text = readFileSync(path, 'utf8')
      if (!COMPILE.test(text)) console.error(`bun-node-hooks: ${path} has no compileModule to take over; client modules need the typescript package`)
      return { contents: text.replace(COMPILE, (head) => `${head} return globalThis.__acrylBunCompile(file, text, options);`), loader: path.endsWith('.ts') ? 'ts' : 'js' }
    })
    build.onLoad({ filter: /cordis-plugin-loader[\\/]lib[\\/]index\.js$/u }, ({ path }) => {
      const parent = JSON.stringify(pathToFileURL(path).href)
      const contents = readFileSync(path, 'utf8')
        .replaceAll('await import(__rewriteRelativeImportExtension(', `await globalThis.__acrylImport(${parent}, __rewriteRelativeImportExtension(`)
        .replaceAll('this.ctx.logger.error(error);', "if (process.env.ACRYL_HOOKS_DEBUG === '1') console.error('[row]', this.options?.name, error?.stack ?? error); this.ctx.logger.error(error);")
      return { contents, loader: 'js' }
    })
    // Registered after the others: a file one of them matches keeps that answer. Bun runs no runtime onResolve for a bare name a plain
    // source file imports, so the app's framework names are replaced in its files as they load (only files outside node_modules).
    build.onLoad({ filter: /^(?!.*[\\/]node_modules[\\/]).*\.(ts|tsx|mts|js|mjs|jsx)$/u }, ({ path }) => {
      const text = readFileSync(path, 'utf8')
      const ext = /\.([a-z]+)$/u.exec(path)[1]
      return { contents: withFrameworkFiles(path, text), loader: ext === 'mts' ? 'ts' : ext === 'mjs' ? 'js' : ext }
    })
    build.onResolve({ filter: /.*/u }, (args) => {
      const parentURL = args.importer ? pathToFileURL(args.importer).href : undefined
      const url = resolveThroughHooks(args.path, parentURL)
      return url === undefined ? undefined : { path: fileOf(url) }
    })
  },
})
