/**
 * Architecture and pattern extraction: the engineering shape of a codebase, read from the (already anonymized) text. First version: imports are
 * read with patterns per language (JavaScript/TypeScript, Python, Go, Java/Kotlin), modules are top-level source folders, layers come from folder
 * names, and engineering patterns from code signals. A syntax-tree reader (Tree-sitter) replaces the import patterns later without changing this
 * module's output shape.
 */
import { dirname, posix } from 'node:path'

export interface ModuleEdge {
  readonly from: string
  readonly to: string
  readonly imports: number
}

export interface PatternSignal {
  /** A generic engineering pattern name, never a project word. */
  readonly pattern: string
  /** How many files show it. */
  readonly files: number
}

export interface Architecture {
  readonly modules: readonly { readonly name: string; readonly files: number }[]
  readonly edges: readonly ModuleEdge[]
  readonly layers: readonly string[]
  readonly patterns: readonly PatternSignal[]
  readonly externalDependencies: readonly string[]
}

const IMPORT_PATTERNS: readonly RegExp[] = [
  /\bimport\s+(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/gu,
  /\brequire\(\s*['"]([^'"]+)['"]\s*\)/gu,
  /\bexport\s+[^'"]*?\sfrom\s+['"]([^'"]+)['"]/gu,
  /^\s*from\s+([.\w]+)\s+import\b/gmu,
  /^\s*import\s+([\w.]+)(?:\s+as\s+\w+)?\s*$/gmu,
  /^\s*import\s+(?:[\w.]+\s+)?"([^"]+)"/gmu,
]

const LAYER_NAMES: Record<string, string> = {
  controller: 'controller', controllers: 'controller', route: 'routes', routes: 'routes', router: 'routes', handlers: 'handler', handler: 'handler',
  api: 'api', service: 'service', services: 'service', usecases: 'use-case', domain: 'domain', model: 'model', models: 'model', entities: 'model',
  repository: 'repository', repositories: 'repository', repo: 'repository', db: 'persistence', database: 'persistence', store: 'persistence',
  migrations: 'migration', components: 'ui-component', pages: 'ui-page', views: 'ui-page', hooks: 'ui-hook', middleware: 'middleware',
  jobs: 'background-job', workers: 'background-job', queue: 'queue', events: 'events', adapters: 'adapter', infra: 'infrastructure',
  infrastructure: 'infrastructure', lib: 'library', utils: 'utility', config: 'configuration', tests: 'test', test: 'test', plugins: 'plugin',
}

const PATTERN_SIGNALS: readonly { pattern: string; signal: RegExp }[] = [
  { pattern: 'dependency-injection', signal: /\b(inject|@Injectable|Container|provide\(|useContext|DependencyInjection)\b/u },
  { pattern: 'retry-with-backoff', signal: /\b(retry|retries|backoff|exponential)\b/iu },
  { pattern: 'idempotency', signal: /\bidempoten/iu },
  { pattern: 'event-driven', signal: /\b(EventEmitter|emit\(|on\(['"]|subscribe\(|publish\(|dispatchEvent)\b/u },
  { pattern: 'message-queue', signal: /\b(queue|kafka|rabbitmq|amqp|sqs|bullmq|nats)\b/iu },
  { pattern: 'caching', signal: /\b(cache|redis|memoize|lru)\b/iu },
  { pattern: 'database-transaction', signal: /\b(transaction|BEGIN|COMMIT|ROLLBACK|\$transaction)\b/u },
  { pattern: 'authentication', signal: /\b(authenticate|jwt|oauth|session|password|bcrypt|argon2)\b/iu },
  { pattern: 'authorization', signal: /\b(authorize|permission|rbac|role[sd]?\b|policy)\b/iu },
  { pattern: 'input-validation', signal: /\b(zod|yup|joi|pydantic|validate|schema\.parse)\b/iu },
  { pattern: 'error-handling', signal: /\b(try\s*\{|catch\s*\(|except\s+\w|Result<|Either<|raise\s+\w)/u },
  { pattern: 'concurrency', signal: /\b(Promise\.all|async\s+def|goroutine|go\s+func|Mutex|Semaphore|Worker\(|thread)/u },
  { pattern: 'streaming', signal: /\b(stream|ReadableStream|SSE|EventSource|WebSocket)\b/u },
  { pattern: 'observability', signal: /\b(logger|log\.|tracing|span|metrics|prometheus|opentelemetry)\b/iu },
  { pattern: 'http-api', signal: /\b(app\.(get|post|put|delete)|router\.|@(Get|Post)Mapping|FastAPI|express\(|fetch\()/u },
  { pattern: 'unit-testing', signal: /\b(describe\(|it\(|test\(|assert|expect\(|pytest|unittest)\b/u },
]

/** The import specifiers a file names. */
export function importsOf(text: string): string[] {
  const found: string[] = []
  for (const pattern of IMPORT_PATTERNS) for (const match of text.matchAll(pattern)) if (match[1]) found.push(match[1])
  return found
}

/** The module a path belongs to: its first folder under a usual source root (src/, lib/, app/, packages/<name>/), else its first folder. */
export function moduleOf(path: string): string {
  const parts = path.split('/')
  if (parts.length === 1) return '(root)'
  const roots = ['src', 'lib', 'app', 'source', 'internal', 'pkg', 'cmd']
  if (parts[0] === 'packages' || parts[0] === 'apps' || parts[0] === 'services') return parts.slice(0, Math.min(2, parts.length - 1)).join('/')
  if (roots.includes(parts[0] ?? '') && parts.length > 2) return `${parts[0]}/${parts[1]}`
  return parts[0] ?? '(root)'
}

/** Extract the architecture from the files' texts (path → text), all source files of one repository. */
export function extractArchitecture(texts: ReadonlyMap<string, string>, isSource: (path: string) => boolean): Architecture {
  const moduleFiles = new Map<string, number>()
  const edges = new Map<string, number>()
  const external = new Set<string>()
  const layers = new Set<string>()
  const patternFiles = new Map<string, number>()
  for (const [path, text] of texts) {
    if (!isSource(path)) continue
    const from = moduleOf(path)
    moduleFiles.set(from, (moduleFiles.get(from) ?? 0) + 1)
    for (const folder of path.split('/').slice(0, -1)) {
      const layer = LAYER_NAMES[folder.toLowerCase()]
      if (layer) layers.add(layer)
    }
    for (const spec of importsOf(text)) {
      if (spec.startsWith('.') || spec.startsWith('/')) {
        const target = posix.normalize(posix.join(dirname(path), spec))
        const to = moduleOf(target)
        if (to !== from && !to.startsWith('..')) edges.set(`${from}\0${to}`, (edges.get(`${from}\0${to}`) ?? 0) + 1)
      } else if (!spec.startsWith('node:')) {
        const name = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : (spec.split(/[/.]/u)[0] ?? spec)
        if (name) external.add(name)
      }
    }
    for (const { pattern, signal } of PATTERN_SIGNALS) if (signal.test(text)) patternFiles.set(pattern, (patternFiles.get(pattern) ?? 0) + 1)
  }
  return {
    modules: [...moduleFiles].map(([name, files]) => ({ name, files })).sort((a, b) => b.files - a.files),
    edges: [...edges].map(([key, imports]) => {
      const [from = '', to = ''] = key.split('\0')
      return { from, to, imports }
    }).sort((a, b) => b.imports - a.imports),
    layers: [...layers].sort(),
    patterns: [...patternFiles].map(([pattern, files]) => ({ pattern, files })).sort((a, b) => b.files - a.files),
    externalDependencies: [...external].sort(),
  }
}
