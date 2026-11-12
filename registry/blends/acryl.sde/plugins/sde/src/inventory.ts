/**
 * Repository inventory: what is in a codebase, read from disk only. Nothing in the repository is executed, imported or installed; files are read
 * as text, and a file that is not text (a NUL byte in its first 8 KB) is listed but not read.
 */
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, extname, join, relative, sep } from 'node:path'
import { matchesGlob, type ScanPolicy } from './policy.ts'

export type FileRole = 'source' | 'test' | 'config' | 'manifest' | 'docs' | 'infra' | 'schema' | 'license' | 'other'

export interface InventoryFile {
  /** Path relative to the repository root, with `/` separators. */
  readonly path: string
  readonly bytes: number
  readonly language: string
  readonly role: FileRole
  /** Lines of text; 0 for a file that was not read. */
  readonly lines: number
  /** Why the file was not read, when it was not. */
  readonly skipped?: 'too-large' | 'binary' | 'limit'
}

export interface LanguageStat {
  readonly language: string
  readonly files: number
  readonly lines: number
}

export interface Inventory {
  readonly files: readonly InventoryFile[]
  readonly languages: readonly LanguageStat[]
  readonly totals: { readonly files: number; readonly readFiles: number; readonly lines: number; readonly bytes: number }
  readonly manifests: readonly string[]
  readonly licenses: readonly { readonly path: string; readonly spdx: string }[]
  readonly excludedDirs: readonly string[]
  /** A hash of every read file's path and content: identifies the source state without naming it. */
  readonly sourceHash: string
  readonly truncated: boolean
}

const LANGUAGES: Record<string, string> = {
  '.ts': 'TypeScript', '.tsx': 'TypeScript', '.mts': 'TypeScript', '.cts': 'TypeScript', '.js': 'JavaScript', '.jsx': 'JavaScript',
  '.mjs': 'JavaScript', '.cjs': 'JavaScript', '.py': 'Python', '.go': 'Go', '.rs': 'Rust', '.java': 'Java', '.kt': 'Kotlin', '.kts': 'Kotlin',
  '.swift': 'Swift', '.rb': 'Ruby', '.php': 'PHP', '.cs': 'C#', '.c': 'C', '.h': 'C', '.cc': 'C++', '.cpp': 'C++', '.hpp': 'C++',
  '.scala': 'Scala', '.dart': 'Dart', '.ex': 'Elixir', '.exs': 'Elixir', '.erl': 'Erlang', '.hs': 'Haskell', '.lua': 'Lua', '.r': 'R',
  '.sql': 'SQL', '.sh': 'Shell', '.bash': 'Shell', '.zsh': 'Shell', '.ps1': 'PowerShell', '.vue': 'Vue', '.svelte': 'Svelte',
  '.html': 'HTML', '.css': 'CSS', '.scss': 'CSS', '.less': 'CSS', '.json': 'JSON', '.yaml': 'YAML', '.yml': 'YAML', '.toml': 'TOML',
  '.xml': 'XML', '.md': 'Markdown', '.mdx': 'Markdown', '.proto': 'Protobuf', '.graphql': 'GraphQL', '.gql': 'GraphQL', '.tf': 'Terraform',
  '.prisma': 'Prisma',
}

const MANIFESTS = new Set([
  'package.json', 'pyproject.toml', 'requirements.txt', 'setup.py', 'go.mod', 'Cargo.toml', 'pom.xml', 'build.gradle', 'build.gradle.kts',
  'Gemfile', 'composer.json', 'Package.swift', 'pubspec.yaml', 'mix.exs', 'deno.json', 'bun.json',
])

/** The language of a file, from its name. */
export function languageOf(path: string): string {
  const name = basename(path)
  if (name === 'Dockerfile' || name.startsWith('Dockerfile.')) return 'Dockerfile'
  if (name === 'Makefile') return 'Makefile'
  return LANGUAGES[extname(name).toLowerCase()] ?? 'Other'
}

/** What a file is for, from its path. */
export function roleOf(path: string): FileRole {
  const name = basename(path)
  const lower = path.toLowerCase()
  if (/^(licen[cs]e|copying|notice)(\.|$)/iu.test(name)) return 'license'
  if (MANIFESTS.has(name)) return 'manifest'
  if (/(^|\/)(tests?|__tests__|spec|e2e)\//u.test(lower) || /\.(test|spec)\.[a-z]+$/u.test(lower) || /(^|\/)test_[^/]+\.py$/u.test(lower)) return 'test'
  if (/(^|\/)(migrations?|schema)\//u.test(lower) || /\.(sql|prisma|graphql|gql|proto)$/u.test(lower)) return 'schema'
  if (name === 'Dockerfile' || /(^|\/)(\.github|\.gitlab|deploy|infra|terraform|k8s|helm|charts)\//u.test(lower) || /\.tf$/u.test(lower) || /docker-compose/u.test(lower)) return 'infra'
  if (/\.(md|mdx|rst|txt|adoc)$/u.test(lower) || /(^|\/)docs?\//u.test(lower)) return 'docs'
  if (/\.(json|ya?ml|toml|ini|cfg|conf|env)$/u.test(lower) || name.startsWith('.') || /config/u.test(name.toLowerCase())) return 'config'
  return languageOf(path) === 'Other' ? 'other' : 'source'
}

/** The SPDX id a licence text most likely is, from its first lines. */
export function spdxOf(text: string): string {
  const head = text.slice(0, 2000)
  if (/MIT License|Permission is hereby granted, free of charge/u.test(head)) return 'MIT'
  if (/Apache License,? Version 2\.0/u.test(head)) return 'Apache-2.0'
  if (/GNU AFFERO GENERAL PUBLIC LICENSE/u.test(head)) return 'AGPL-3.0'
  if (/GNU LESSER GENERAL PUBLIC LICENSE/u.test(head)) return 'LGPL'
  if (/GNU GENERAL PUBLIC LICENSE/u.test(head)) return /Version 2/u.test(head) ? 'GPL-2.0' : 'GPL-3.0'
  if (/Mozilla Public License,? v(ersion)? ?2\.0/u.test(head)) return 'MPL-2.0'
  if (/BSD 3-Clause|Redistributions of source code must retain/u.test(head)) return 'BSD'
  if (/ISC License/u.test(head)) return 'ISC'
  if (/This is free and unencumbered software released into the public domain/u.test(head)) return 'Unlicense'
  return 'unknown'
}

/** Walk `root` under `policy`: every file listed, text files read through `onText` (the scan's detectors and the anonymizer read them there). */
export function takeInventory(root: string, policy: ScanPolicy, onText: (path: string, text: string) => void = () => {}): Inventory {
  const files: InventoryFile[] = []
  const excludedDirs = new Set<string>()
  const hash = createHash('sha256')
  let readCount = 0
  let truncated = false

  const walk = (dir: string): void => {
    const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      const full = join(dir, entry.name)
      const path = relative(root, full).split(sep).join('/')
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) {
        if (policy.excludeDirs.includes(entry.name)) {
          excludedDirs.add(path)
          continue
        }
        walk(full)
        continue
      }
      if (!entry.isFile()) continue
      if (policy.excludeFiles.some((glob) => matchesGlob(entry.name, glob))) continue
      const bytes = statSync(full).size
      const base = { path, bytes, language: languageOf(path), role: roleOf(path) }
      if (readCount >= policy.maxFiles) {
        truncated = true
        files.push({ ...base, lines: 0, skipped: 'limit' })
        continue
      }
      if (bytes > policy.maxFileBytes) {
        files.push({ ...base, lines: 0, skipped: 'too-large' })
        continue
      }
      const buffer = readFileSync(full)
      if (buffer.subarray(0, 8192).includes(0)) {
        files.push({ ...base, lines: 0, skipped: 'binary' })
        continue
      }
      const text = buffer.toString('utf8')
      readCount += 1
      hash.update(path).update('\0').update(buffer)
      files.push({ ...base, lines: text === '' ? 0 : text.split('\n').length })
      onText(path, text)
    }
  }
  walk(root)

  const byLanguage = new Map<string, { files: number; lines: number }>()
  for (const file of files) {
    if (file.skipped !== undefined || file.language === 'Other') continue
    const stat = byLanguage.get(file.language) ?? { files: 0, lines: 0 }
    stat.files += 1
    stat.lines += file.lines
    byLanguage.set(file.language, stat)
  }
  const languages = [...byLanguage].map(([language, stat]) => ({ language, ...stat })).sort((a, b) => b.lines - a.lines)
  const licenses = files
    .filter((file) => file.role === 'license' && file.skipped === undefined)
    .map((file) => ({ path: file.path, spdx: spdxOf(readFileSync(join(root, file.path), 'utf8')) }))
  return {
    files,
    languages,
    totals: {
      files: files.length,
      readFiles: readCount,
      lines: files.reduce((sum, file) => sum + file.lines, 0),
      bytes: files.reduce((sum, file) => sum + file.bytes, 0),
    },
    manifests: files.filter((file) => file.role === 'manifest').map((file) => file.path),
    licenses,
    excludedDirs: [...excludedDirs].sort(),
    sourceHash: hash.digest('hex'),
    truncated,
  }
}
