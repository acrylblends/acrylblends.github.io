/**
 * Spike: the ACRYL frame host on Bun, with node:module registerHooks emulated, as a preload (`bun --no-install --preload bun-node-hooks.mjs ...`).
 * Bun has no registerHooks, and a named import of a missing export fails at link time, so the four ACRYL files that import it are rewritten on
 * load to take it from here. Resolve hooks run as one chain (last registered first, as Node does) from a Bun runtime onResolve plugin for static
 * imports, and from the Cordis loader's own import() calls (rewritten on load), because Bun does not run onResolve for a dynamic import() of a
 * computed specifier. Load hooks are dropped: they compile JSX, which Bun does itself.
 * shortcut: a resolved URL's query (the frame's app generation, used to reload app code in development) is dropped; a real port needs Bun to key
 * modules by query or a different reload.
 */
import { readFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { dirname } from 'node:path'
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

/** The Cordis loader's import(): resolve through the hooks first (as Node's loader would), then import the file. */
globalThis.__acrylImport = (parentURL, spec) => {
  const url = resolveThroughHooks(spec, parentURL)
  debug('import', spec, '->', url)
  return import(url === undefined ? spec : fileURLToPath(splitQuery(url)[0]))
}

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
    build.onLoad({ filter: /cordis-plugin-loader[\\/]lib[\\/]index\.js$/u }, ({ path }) => {
      const parent = JSON.stringify(pathToFileURL(path).href)
      const contents = readFileSync(path, 'utf8')
        .replaceAll('await import(__rewriteRelativeImportExtension(', `await globalThis.__acrylImport(${parent}, __rewriteRelativeImportExtension(`)
        .replaceAll('this.ctx.logger.error(error);', "if (process.env.ACRYL_HOOKS_DEBUG === '1') console.error('[row]', this.options?.name, error?.stack ?? error); this.ctx.logger.error(error);")
      return { contents, loader: 'js' }
    })
    build.onResolve({ filter: /.*/u }, (args) => {
      const parentURL = args.importer ? pathToFileURL(args.importer).href : undefined
      const url = resolveThroughHooks(args.path, parentURL)
      return url === undefined ? undefined : { path: fileURLToPath(splitQuery(url)[0]) }
    })
  },
})
