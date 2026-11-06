/**
 * The catalogue a person sees on the first start: 35 illustrative libraries and frameworks across the Type, Framework and Language filters (React,
 * Hono, Drizzle ORM, Zod, TanStack Query, Vitest, Three.js and LangChain first, as in the mockup) and an empty stack.
 */
import type { AtlasState, Ecosystem, Pkg, Requirement } from './domain.ts'

const v = (...list: [string, string][]) => list.map(([version, channel]) => ({ version, channel }))

interface Row {
  id: string
  name: string
  group: string
  kind: string
  framework?: string
  lang: string
  tags: string[]
  summary: string
  install: string
  versions: [string, string][]
  runtimes?: string[]
  dev?: boolean
  requires?: Requirement[]
}

const pkg = (r: Row): Pkg => {
  const ecosystem: Ecosystem = r.lang === 'Rust' ? 'cargo' : r.lang === 'Python' ? 'pip' : 'npm'
  return {
    id: r.id,
    name: r.name,
    group: r.group,
    kind: r.kind,
    ...(r.framework === undefined ? {} : { framework: r.framework }),
    languages: [r.lang],
    tags: r.tags,
    summary: r.summary,
    ecosystem,
    install: r.install,
    dev: r.dev ?? false,
    versions: v(...r.versions),
    runtimes: r.runtimes ?? (ecosystem === 'npm' ? ['Node', 'Browser'] : ecosystem === 'cargo' ? ['Native'] : ['CPython']),
    requires: r.requires ?? [],
  }
}

const LATEST = (a: string, b: string, c: string): [string, string][] => [[a, 'Latest'], [b, 'Stable'], [c, 'LTS compatible']]

const ROWS: Row[] = [
  { id: 'react', name: 'React', group: 'UI libraries', kind: 'UI library', framework: 'Web', lang: 'TypeScript', tags: ['UI', 'TypeScript'], summary: 'Declarative UI library for component-driven interfaces.', install: 'react react-dom', versions: LATEST('19.1.0', '19.0.0', '18.3.1') },
  { id: 'hono', name: 'Hono', group: 'Networking', kind: 'Web framework', framework: 'Web', lang: 'TypeScript', tags: ['Web', 'TypeScript'], summary: 'Small, fast web framework for edge and server runtimes.', install: 'hono', versions: LATEST('4.8.3', '4.7.11', '3.12.12'), runtimes: ['Node', 'Edge', 'Bun', 'Deno'] },
  { id: 'drizzle-orm', name: 'Drizzle ORM', group: 'Database', kind: 'Database library', lang: 'TypeScript', tags: ['Database', 'TypeScript'], summary: 'TypeScript ORM with SQL-like, schema-first queries.', install: 'drizzle-orm', versions: LATEST('0.44.2', '0.43.1', '0.38.4'), runtimes: ['Node', 'Edge', 'Bun'] },
  { id: 'zod', name: 'Zod', group: 'Utilities', kind: 'Validation library', lang: 'TypeScript', tags: ['Validation', 'TypeScript'], summary: 'TypeScript-first schema validation and inference.', install: 'zod', versions: LATEST('4.0.5', '3.25.76', '3.23.8') },
  { id: 'tanstack-query', name: 'TanStack Query', group: 'Utilities', kind: 'Data / state library', framework: 'Web', lang: 'TypeScript', tags: ['Data', 'React'], summary: 'Server-state fetching, caching and synchronization.', install: '@tanstack/react-query', versions: LATEST('5.83.0', '5.60.2', '4.36.1'), requires: [{ packageId: 'react', minMajor: 18 }] },
  { id: 'vitest', name: 'Vitest', group: 'Utilities', kind: 'Testing framework', framework: 'Testing', lang: 'TypeScript', tags: ['Testing', 'TypeScript'], summary: 'Vite-native unit testing framework with fast feedback.', install: 'vitest', versions: LATEST('3.2.4', '3.0.9', '2.1.9'), dev: true },
  { id: 'threejs', name: 'Three.js', group: 'Multimedia', kind: 'Multimedia library', lang: 'TypeScript', tags: ['3D', 'Multimedia'], summary: 'JavaScript 3D library for WebGL and WebGPU scenes.', install: 'three', versions: LATEST('0.178.0', '0.170.0', '0.160.1'), runtimes: ['Browser'] },
  { id: 'langchain', name: 'LangChain', group: 'Utilities', kind: 'AI framework', framework: 'AI', lang: 'TypeScript', tags: ['AI', 'TypeScript'], summary: 'Composable building blocks for LLM-powered applications.', install: 'langchain', versions: LATEST('0.3.28', '0.3.2', '0.2.20') },
  { id: 'undici', name: 'Undici', group: 'Networking', kind: 'HTTP client', lang: 'TypeScript', tags: ['HTTP', 'Networking'], summary: 'Fast HTTP/1.1 client written from scratch for Node.js.', install: 'undici', versions: LATEST('7.2.0', '6.21.1', '5.28.5'), runtimes: ['Node'] },
  { id: 'ws', name: 'ws', group: 'Networking', kind: 'WebSocket library', lang: 'TypeScript', tags: ['WebSocket', 'Networking'], summary: 'Simple, fast WebSocket client and server for Node.js.', install: 'ws', versions: LATEST('8.18.0', '8.17.1', '7.5.10'), runtimes: ['Node'] },
  { id: 'kysely', name: 'Kysely', group: 'Database', kind: 'Query builder', lang: 'TypeScript', tags: ['Database', 'SQL'], summary: 'Type-safe SQL query builder with no runtime magic.', install: 'kysely', versions: LATEST('0.28.2', '0.27.6', '0.26.3') },
  { id: 'better-sqlite3', name: 'better-sqlite3', group: 'Database', kind: 'Database driver', lang: 'TypeScript', tags: ['SQLite', 'Database'], summary: 'Synchronous, fast SQLite3 bindings for Node.js.', install: 'better-sqlite3', versions: LATEST('11.8.1', '11.1.2', '9.6.0'), runtimes: ['Node'] },
  { id: 'jose', name: 'jose', group: 'Crypto', kind: 'JWT library', lang: 'TypeScript', tags: ['JWT', 'Crypto'], summary: 'JWT, JWS, JWE and JWK with no dependencies, on every runtime.', install: 'jose', versions: LATEST('6.0.8', '5.9.6', '4.15.9'), runtimes: ['Node', 'Browser', 'Edge'] },
  { id: 'noble-curves', name: 'noble-curves', group: 'Crypto', kind: 'Cryptography library', lang: 'TypeScript', tags: ['Elliptic curves', 'Crypto'], summary: 'Audited, minimal elliptic-curve cryptography in TypeScript.', install: '@noble/curves', versions: LATEST('1.9.2', '1.8.2', '1.4.2') },
  { id: 'mathjs', name: 'Math.js', group: 'Numerical', kind: 'Math library', lang: 'TypeScript', tags: ['Math', 'Numerical'], summary: 'Extensive math library with units, matrices and an expression parser.', install: 'mathjs', versions: LATEST('14.5.2', '13.2.3', '12.4.3') },
  { id: 'simple-statistics', name: 'simple-statistics', group: 'Numerical', kind: 'Statistics library', lang: 'TypeScript', tags: ['Statistics', 'Numerical'], summary: 'Statistical methods that read like the textbook.', install: 'simple-statistics', versions: LATEST('7.8.8', '7.8.5', '7.7.0') },
  { id: 'sharp', name: 'sharp', group: 'Multimedia', kind: 'Image library', lang: 'TypeScript', tags: ['Images', 'Multimedia'], summary: 'High-speed image resizing and conversion for Node.js.', install: 'sharp', versions: LATEST('0.34.2', '0.33.5', '0.32.6'), runtimes: ['Node'] },
  { id: 'react-native', name: 'React Native', group: 'UI libraries', kind: 'Mobile framework', framework: 'Mobile', lang: 'TypeScript', tags: ['Mobile', 'UI'], summary: 'Build native mobile apps with React.', install: 'react-native', versions: LATEST('0.80.1', '0.79.5', '0.76.9'), runtimes: ['iOS', 'Android'], requires: [{ packageId: 'react', minMajor: 19 }] },
  { id: 'electron', name: 'Electron', group: 'UI libraries', kind: 'Desktop framework', framework: 'Desktop', lang: 'TypeScript', tags: ['Desktop', 'UI'], summary: 'Cross-platform desktop apps with web technologies.', install: 'electron', versions: LATEST('37.2.0', '36.5.0', '33.4.11'), runtimes: ['Windows', 'macOS', 'Linux'] },
  { id: 'playwright', name: 'Playwright', group: 'Utilities', kind: 'Testing framework', framework: 'Testing', lang: 'TypeScript', tags: ['Testing', 'Browser'], summary: 'Reliable end-to-end testing across browsers.', install: '@playwright/test', versions: LATEST('1.54.1', '1.50.1', '1.44.1'), dev: true },
  { id: 'tokio', name: 'Tokio', group: 'Networking', kind: 'Async runtime', framework: 'Web', lang: 'Rust', tags: ['Async', 'Networking'], summary: 'An event-driven, non-blocking I/O platform for Rust.', install: 'tokio', versions: LATEST('1.46.1', '1.43.1', '1.38.2') },
  { id: 'sqlx', name: 'SQLx', group: 'Database', kind: 'Database toolkit', lang: 'Rust', tags: ['Database', 'SQL'], summary: 'Async, pure-Rust SQL toolkit with compile-time checked queries.', install: 'sqlx', versions: LATEST('0.8.6', '0.8.2', '0.7.4') },
  { id: 'ring', name: 'ring', group: 'Crypto', kind: 'Cryptography library', lang: 'Rust', tags: ['Crypto'], summary: 'Safe, fast, small crypto primitives using Rust and assembly.', install: 'ring', versions: LATEST('0.17.14', '0.17.8', '0.16.20') },
  { id: 'ndarray', name: 'ndarray', group: 'Numerical', kind: 'Array library', lang: 'Rust', tags: ['Arrays', 'Numerical'], summary: 'N-dimensional arrays with slicing and broadcasting for Rust.', install: 'ndarray', versions: LATEST('0.16.1', '0.15.6', '0.14.0') },
  { id: 'tauri', name: 'Tauri', group: 'UI libraries', kind: 'Desktop framework', framework: 'Desktop', lang: 'Rust', tags: ['Desktop', 'UI'], summary: 'Small, fast desktop apps with a Rust core and a web front end.', install: 'tauri', versions: LATEST('2.6.2', '2.2.5', '1.8.3'), runtimes: ['Windows', 'macOS', 'Linux'] },
  { id: 'serde', name: 'serde', group: 'Utilities', kind: 'Serialization library', lang: 'Rust', tags: ['Serialization'], summary: 'A framework for serializing and deserializing Rust data structures.', install: 'serde', versions: LATEST('1.0.219', '1.0.210', '1.0.190') },
  { id: 'numpy', name: 'NumPy', group: 'Numerical', kind: 'Array library', lang: 'Python', tags: ['Arrays', 'Numerical'], summary: 'Fundamental package for array computing in Python.', install: 'numpy', versions: LATEST('2.3.1', '2.2.6', '1.26.4') },
  { id: 'pandas', name: 'pandas', group: 'Numerical', kind: 'Data analysis library', lang: 'Python', tags: ['Data', 'Numerical'], summary: 'Flexible, fast data structures for tabular analysis.', install: 'pandas', versions: LATEST('2.3.1', '2.2.3', '1.5.3'), requires: [{ packageId: 'numpy', minMajor: 2 }] },
  { id: 'fastapi', name: 'FastAPI', group: 'Networking', kind: 'Web framework', framework: 'Web', lang: 'Python', tags: ['Web', 'API'], summary: 'Modern, fast web framework for building APIs with type hints.', install: 'fastapi', versions: LATEST('0.116.1', '0.115.6', '0.100.1') },
  { id: 'requests', name: 'Requests', group: 'Networking', kind: 'HTTP client', lang: 'Python', tags: ['HTTP'], summary: 'Elegant and simple HTTP for humans.', install: 'requests', versions: LATEST('2.32.4', '2.31.0', '2.28.2') },
  { id: 'sqlalchemy', name: 'SQLAlchemy', group: 'Database', kind: 'ORM', lang: 'Python', tags: ['Database', 'ORM'], summary: 'The Python SQL toolkit and object-relational mapper.', install: 'sqlalchemy', versions: LATEST('2.0.41', '2.0.30', '1.4.54') },
  { id: 'cryptography', name: 'cryptography', group: 'Crypto', kind: 'Cryptography library', lang: 'Python', tags: ['Crypto'], summary: 'Cryptographic recipes and primitives for Python.', install: 'cryptography', versions: LATEST('45.0.5', '44.0.2', '41.0.7') },
  { id: 'pillow', name: 'Pillow', group: 'Multimedia', kind: 'Image library', lang: 'Python', tags: ['Images', 'Multimedia'], summary: 'The friendly fork of the Python Imaging Library.', install: 'pillow', versions: LATEST('11.3.0', '10.4.0', '9.5.0') },
  { id: 'pytorch', name: 'PyTorch', group: 'Numerical', kind: 'AI framework', framework: 'AI', lang: 'Python', tags: ['AI', 'Tensors'], summary: 'Tensors and dynamic neural networks with strong GPU acceleration.', install: 'torch', versions: LATEST('2.7.1', '2.5.1', '2.1.2') },
  { id: 'pytest', name: 'pytest', group: 'Utilities', kind: 'Testing framework', framework: 'Testing', lang: 'Python', tags: ['Testing'], summary: 'Makes it easy to write small tests, and scales to complex ones.', install: 'pytest', versions: LATEST('8.4.1', '8.2.2', '7.4.4') },
]

export function seed(): AtlasState {
  return { version: 1, packages: ROWS.map(pkg), stack: [] }
}
