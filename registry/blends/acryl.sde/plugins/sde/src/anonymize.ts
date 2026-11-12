/**
 * The anonymizer: rewrites one file's text so the engineering stays and the project's identity goes. Secrets become named placeholders, personal
 * data and private infrastructure become reserved example values (example.com, 192.0.2.0/24, +1-555-01xx), copyright and author lines lose their
 * names, and the project's own words (company, product, customer names) become neutral synthetic names in the same case style, inside
 * identifiers too (`AcmeBillingService` becomes `OrbitBillingService`).
 *
 * The mapping from each original value to its replacement is what makes the rewrite consistent across files; it never leaves the run's private
 * folder and is never part of a package.
 */
import { readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { RULES } from './detectors.ts'

const SYNTHETIC_NAMES = [
  'Orbit', 'Harbor', 'Juniper', 'Meadow', 'Cobalt', 'Lantern', 'Summit', 'Willow', 'Quarry', 'Beacon', 'Falcon', 'Garnet', 'Horizon', 'Ivory',
  'Kestrel', 'Lagoon', 'Marble', 'Nimbus', 'Opal', 'Pioneer', 'Ripple', 'Saffron', 'Timber', 'Umber', 'Vertex', 'Zephyr',
]

/** Technical words never treated as project words even when they appear in a package name. */
const TECHNICAL_WORDS = new Set([
  'app', 'apps', 'api', 'web', 'server', 'client', 'core', 'lib', 'libs', 'service', 'services', 'backend', 'frontend', 'admin', 'dashboard',
  'common', 'shared', 'utils', 'util', 'tools', 'cli', 'sdk', 'test', 'tests', 'demo', 'example', 'main', 'master', 'monorepo', 'platform', 'site',
  'website', 'mobile', 'desktop', 'node', 'react', 'next', 'vue', 'python', 'java', 'docs', 'src', 'data', 'auth', 'user', 'users', 'the', 'and',
])

export interface Mapping {
  /** original → replacement, per category; private to the run. */
  readonly values: Map<string, string>
  readonly counters: Map<string, number>
  readonly terms: Map<string, string>
}

export function newMapping(terms: readonly string[]): Mapping {
  const mapping: Mapping = { values: new Map(), counters: new Map(), terms: new Map() }
  const sorted = [...new Set(terms.map((term) => term.toLowerCase()))].sort((a, b) => b.length - a.length)
  sorted.forEach((term, index) => {
    const base = SYNTHETIC_NAMES[index % SYNTHETIC_NAMES.length] ?? 'Orbit'
    const suffix = index >= SYNTHETIC_NAMES.length ? String(Math.floor(index / SYNTHETIC_NAMES.length) + 1) : ''
    mapping.terms.set(term, `${base}${suffix}`)
  })
  return mapping
}

/** The same replacement for the same value, numbered per category. */
function stable(mapping: Mapping, category: string, value: string, make: (n: number) => string): string {
  const key = `${category}\0${value}`
  const known = mapping.values.get(key)
  if (known !== undefined) return known
  const n = (mapping.counters.get(category) ?? 0) + 1
  mapping.counters.set(category, n)
  const replacement = make(n)
  mapping.values.set(key, replacement)
  return replacement
}

/** `replacement` written in the case style of `original`. */
function inCaseOf(original: string, replacement: string): string {
  if (original === original.toUpperCase() && /[A-Z]/u.test(original)) return replacement.toUpperCase()
  if (original === original.toLowerCase()) return replacement.toLowerCase()
  if (original[0] === original[0]?.toUpperCase()) return replacement[0]?.toUpperCase() + replacement.slice(1)
  return replacement[0]?.toLowerCase() + replacement.slice(1)
}

const escape = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')

/** Replace the project's words, in any case, inside identifiers and paths too. */
export function replaceTerms(text: string, mapping: Mapping): string {
  let out = text
  for (const [term, synthetic] of mapping.terms) {
    out = out.replace(new RegExp(escape(term), 'giu'), (match) => inCaseOf(match, synthetic))
  }
  return out
}

/** One file's text, anonymized. Security findings (risky code) are reported, not rewritten: they are engineering, not identity. */
export function anonymizeText(text: string, mapping: Mapping): string {
  let out = text.replace(
    /-----BEGIN ([A-Z ]*)PRIVATE KEY-----[\s\S]*?-----END \1PRIVATE KEY-----/gu,
    () => 'REDACTED_PRIVATE_KEY',
  )
  for (const rule of RULES) {
    if (rule.kind === 'security' || rule.rule === 'private-key') continue
    out = out.replace(rule.pattern, (...args: unknown[]) => {
      const match = String(args[0])
      const groups = args.slice(1, -2) as (string | undefined)[]
      const value = rule.group ? (groups[rule.group - 1] ?? match) : match
      if (rule.accept && !rule.accept(value)) return match
      const replacement = replacementFor(rule.rule, value, mapping)
      return rule.group ? match.replace(value, replacement) : replacement
    })
  }
  return replaceTerms(out, mapping)
}

function replacementFor(rule: string, value: string, mapping: Mapping): string {
  switch (rule) {
    case 'email': return stable(mapping, 'email', value.toLowerCase(), (n) => `person${String(n)}@example.com`)
    case 'phone': return stable(mapping, 'phone', value, (n) => `+1-555-01${String(n % 100).padStart(2, '0')}`)
    case 'iban': return stable(mapping, 'iban', value, (n) => `XX00EXAMPLE${String(n).padStart(4, '0')}`)
    case 'private-ip': return stable(mapping, 'ip', value, (n) => `192.0.2.${String(n % 254 + 1)}`)
    case 'internal-host': return stable(mapping, 'host', value.toLowerCase(), (n) => `service${String(n)}.example.com`)
    case 'cloud-resource-id': return stable(mapping, 'arn', value, (n) => `arn:aws:service:region:000000000000:resource${String(n)}`)
    case 'copyright': return 'Copyright (c) the authors'
    case 'author-tag': return '@author the authors'
    default: return stable(mapping, 'secret', value, (n) => `REDACTED_${rule.toUpperCase().replace(/-/gu, '_')}_${String(n)}`)
  }
}

/** A path with the project's words replaced, so a file named after the company does not name it. */
export function anonymizePath(path: string, mapping: Mapping): string {
  return replaceTerms(path, mapping)
}

/** The words that name a project, read from its manifests, its folder name and its git remote: suggestions the person reviews before the run. */
export function suggestTerms(root: string): string[] {
  const words = new Set<string>()
  const add = (value: string | undefined): void => {
    if (!value) return
    for (const part of value.replace(/^@/u, '').split(/[\s/@._-]+/u)) {
      const word = part.trim()
      if (word.length >= 3 && !TECHNICAL_WORDS.has(word.toLowerCase()) && !/^\d+$/u.test(word)) words.add(word)
    }
  }
  add(basename(root))
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { name?: string; author?: string | { name?: string }; repository?: string | { url?: string } }
    add(pkg.name)
    add(typeof pkg.author === 'string' ? pkg.author.replace(/<[^>]*>|\([^)]*\)/gu, '') : pkg.author?.name)
  } catch {}
  try {
    const config = readFileSync(join(root, '.git', 'config'), 'utf8')
    const url = /url\s*=\s*(\S+)/u.exec(config)?.[1]
    const match = url ? /[:/]([^/:]+)\/([^/]+?)(?:\.git)?$/u.exec(url) : null
    if (match) {
      add(match[1])
      add(match[2])
    }
  } catch {}
  return [...words]
}
