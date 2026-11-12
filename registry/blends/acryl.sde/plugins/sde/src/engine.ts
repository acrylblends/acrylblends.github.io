/**
 * The Synthetic Data Engine's first pipeline, local only: scan a codebase, find what is private, anonymize it, extract its architecture, check the
 * result again, measure how much text stayed, and package a Training Unit that waits for a person's review. Nothing here opens a network
 * connection; an approved unit is written to a folder on this machine, and sending it anywhere is a separate act of the person.
 *
 * A run's folder (`<home>/sde/runs/<id>/`):
 *   run.json      status, counts, the review: what the page lists
 *   private/      the source path, the project words, the original-side findings and the replacement mapping: never packaged, never exported
 *   unit/         the Training Unit: only anonymized material and reports
 */
import { createHash, randomBytes } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { anonymizePath, anonymizeText, newMapping, suggestTerms } from './anonymize.ts'
import { extractArchitecture } from './architecture.ts'
import { detect, type Finding, type FindingSummary, summarize } from './detectors.ts'
import { type Inventory, takeInventory } from './inventory.ts'
import { policyFrom, type ScanPolicy } from './policy.ts'
import { type SimilarityReport, similarityReport } from './similarity.ts'

export const ENGINE_VERSION = '0.1.0'

export type RunStatus = 'review' | 'approved' | 'rejected' | 'exported'

export interface Review {
  readonly decision: 'approved' | 'rejected'
  readonly reviewer: string
  readonly rightsAttested: boolean
  readonly notes: string
  readonly at: string
}

export interface RunRecord {
  readonly id: string
  /** A label the person gave, or the anonymized folder name: never the source path. */
  readonly label: string
  readonly createdAt: string
  readonly status: RunStatus
  readonly totals: Inventory['totals']
  readonly languages: Inventory['languages']
  /** What was found in the original, by kind and rule (no values). */
  readonly found: FindingSummary
  /** What the anonymized output still holds: must be empty of secrets and project words before it can be approved. */
  readonly residual: FindingSummary
  readonly similarity: SimilarityReport
  /** Why the run cannot be approved yet; empty when it can. */
  readonly blockers: readonly string[]
  readonly review?: Review
  readonly exportedTo?: string
}

export class SdeError extends Error {}

export interface SdeOptions {
  /** The folder runs and exports live in (the app's data home plus `sde/`). */
  readonly home: string
  readonly clock?: () => Date
}

export interface ScanInput {
  readonly path: string
  readonly label?: string
  readonly terms?: readonly string[]
  readonly policy?: Partial<ScanPolicy>
}

const writeJson = (file: string, value: unknown): void => {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}
const readJson = <T>(file: string): T => JSON.parse(readFileSync(file, 'utf8')) as T

export class Sde {
  readonly home: string
  private readonly clock: () => Date

  constructor(options: SdeOptions) {
    this.home = options.home
    this.clock = options.clock ?? (() => new Date())
  }

  private runDir(id: string): string {
    if (!/^[\w-]+$/u.test(id)) throw new SdeError('No such run.')
    return join(this.home, 'runs', id)
  }

  /** The words that likely name the project, for the person to confirm before scanning. */
  suggestTerms(path: string): string[] {
    return suggestTerms(this.sourceRoot(path))
  }

  private sourceRoot(path: string): string {
    if (!isAbsolute(path)) throw new SdeError('Give the project folder as an absolute path.')
    const root = resolve(path)
    if (!existsSync(root) || !statSync(root).isDirectory()) throw new SdeError('That folder does not exist.')
    const homeRoot = resolve(this.home)
    if (homeRoot === root || homeRoot.startsWith(root + sep)) throw new SdeError('That folder holds the engine\'s own data; pick the project folder itself.')
    return root
  }

  /** Scan, anonymize, check and package one codebase. The run waits for review; nothing is exported. */
  scan(input: ScanInput): RunRecord {
    const root = this.sourceRoot(input.path)
    const policy = policyFrom({ ...input.policy, projectTerms: [...(input.terms ?? []), ...(input.policy?.projectTerms ?? [])] })
    const mapping = newMapping(policy.projectTerms)
    const id = `${this.clock().toISOString().replace(/[-:]/gu, '').replace(/\..*$/u, '')}-${randomBytes(3).toString('hex')}`
    const dir = this.runDir(id)
    const repoOut = join(dir, 'unit', 'synthetic', 'repository')
    mkdirSync(repoOut, { recursive: true })

    const originalFindings: Finding[] = []
    const residualFindings: Finding[] = []
    const pairs: { original: string; output: string }[] = []
    const outputs = new Map<string, string>()
    const inventory = takeInventory(root, policy, (path, text) => {
      originalFindings.push(...detect(path, text, policy.projectTerms))
      const outPath = anonymizePath(path, mapping)
      const output = anonymizeText(text, mapping)
      const target = join(repoOut, outPath)
      if (!target.startsWith(repoOut + sep)) return
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, output)
      outputs.set(outPath, output)
      pairs.push({ original: text, output })
      residualFindings.push(...detect(outPath, output, policy.projectTerms).filter((finding) => finding.kind !== 'security'))
    })

    const sourceFiles = new Set(inventory.files.filter((file) => file.role === 'source' || file.role === 'test').map((file) => anonymizePath(file.path, mapping)))
    const architecture = extractArchitecture(outputs, (path) => sourceFiles.has(path))
    const found = summarize(originalFindings)
    const residual = summarize(residualFindings)
    const similarity = similarityReport(pairs)
    const label = (input.label?.trim() || anonymizePath(root.split(sep).at(-1) ?? 'project', mapping)).slice(0, 80)
    const now = this.clock().toISOString()
    const anonymizedFiles = inventory.files.map((file) => ({ ...file, path: anonymizePath(file.path, mapping) }))
    const security = originalFindings.filter((finding) => finding.kind === 'security').map((finding) => ({ ...finding, path: anonymizePath(finding.path, mapping) }))

    // private/: never packaged.
    writeJson(join(dir, 'private', 'source.json'), { path: root, terms: policy.projectTerms, sourceHash: inventory.sourceHash })
    writeJson(join(dir, 'private', 'findings.json'), originalFindings)
    writeJson(join(dir, 'private', 'mapping.json'), {
      terms: Object.fromEntries(mapping.terms),
      values: Object.fromEntries([...mapping.values].map(([key, value]) => [key.split('\0')[0] + ':' + mask(key.split('\0')[1] ?? ''), value])),
    })

    // unit/: the Training Unit.
    const unit = join(dir, 'unit')
    writeJson(join(unit, 'metadata.json'), {
      format: 'acryl-training-unit',
      formatVersion: 1,
      kind: 'codebase-derived',
      engine: { name: 'acryl.sde', version: ENGINE_VERSION },
      createdAt: now,
      label,
      languages: inventory.languages,
      totals: inventory.totals,
      contents: ['metadata.json', 'task.md', 'context.md', 'architecture.json', 'inventory.json', 'synthetic/repository/', 'privacy-report.json', 'security-report.json', 'similarity-report.json', 'quality-score.json', 'provenance.json', 'license.json', 'review.json', 'consent.json'],
    })
    writeJson(join(unit, 'inventory.json'), { files: anonymizedFiles, manifests: inventory.manifests.map((path) => anonymizePath(path, mapping)), excludedDirs: inventory.excludedDirs, truncated: inventory.truncated })
    writeJson(join(unit, 'architecture.json'), architecture)
    writeFileSync(join(unit, 'context.md'), contextMarkdown(label, inventory, architecture))
    writeFileSync(join(unit, 'task.md'), `# Task\n\nThis unit is codebase-derived: it carries an anonymized codebase and its architecture, not a recorded coding session.\nTasks (bug fixes, features, refactors with tests) are derived from it in the generation step.\n`)
    writeJson(join(unit, 'privacy-report.json'), { removed: found, residual, rules: 'secrets, personal data, private infrastructure, fingerprints, project words; values are never stored' })
    writeJson(join(unit, 'security-report.json'), { findings: security, summary: summarize(security), note: 'Risky code is reported, not rewritten.' })
    writeJson(join(unit, 'similarity-report.json'), similarity)
    writeJson(join(unit, 'quality-score.json'), qualityScore(inventory, architecture, residual))
    writeJson(join(unit, 'provenance.json'), {
      sourceHash: inventory.sourceHash,
      engine: { name: 'acryl.sde', version: ENGINE_VERSION },
      steps: ['inventory', 'detect', 'anonymize', 'architecture', 'residual-scan', 'similarity', 'package'],
      sourceExecuted: false,
      network: false,
    })
    writeJson(join(unit, 'license.json'), { detected: inventory.licenses.map((license) => ({ ...license, path: anonymizePath(license.path, mapping) })), declared: null, commercialUseCleared: false })

    const record: RunRecord = { id, label, createdAt: now, status: 'review', totals: inventory.totals, languages: inventory.languages, found, residual, similarity, blockers: blockersOf(residual) }
    writeJson(join(dir, 'run.json'), record)
    return record
  }

  list(): RunRecord[] {
    const runs = join(this.home, 'runs')
    if (!existsSync(runs)) return []
    return readdirSync(runs)
      .filter((id) => existsSync(join(runs, id, 'run.json')))
      .map((id) => readJson<RunRecord>(join(runs, id, 'run.json')))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  get(id: string): RunRecord {
    const file = join(this.runDir(id), 'run.json')
    if (!existsSync(file)) throw new SdeError('No such run.')
    return readJson<RunRecord>(file)
  }

  /** The unit's anonymized files, for the review page. */
  outputFiles(id: string): string[] {
    const root = join(this.runDir(id), 'unit', 'synthetic', 'repository')
    const out: string[] = []
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) walk(full)
        else out.push(relative(root, full).split(sep).join('/'))
      }
    }
    if (existsSync(root)) walk(root)
    return out.sort()
  }

  outputFile(id: string, path: string): string {
    const root = join(this.runDir(id), 'unit', 'synthetic', 'repository')
    const file = resolve(root, path)
    if (!file.startsWith(root + sep) || !existsSync(file)) throw new SdeError('No such file in this unit.')
    return readFileSync(file, 'utf8')
  }

  /** A report of the unit, by its file name. */
  report(id: string, name: string): unknown {
    if (!/^[a-z-]+\.json$/u.test(name)) throw new SdeError('No such report.')
    const file = join(this.runDir(id), 'unit', name)
    if (!existsSync(file)) throw new SdeError('No such report.')
    return readJson(file)
  }

  /** A person's decision. Approval needs their name, their statement that they may license this code, and an output with nothing private left. */
  review(id: string, input: { decision: 'approved' | 'rejected'; reviewer: string; rightsAttested: boolean; notes?: string }): RunRecord {
    const record = this.get(id)
    if (record.status === 'exported') throw new SdeError('This unit was already exported; start a new run to change it.')
    const reviewer = input.reviewer.trim()
    if (reviewer === '') throw new SdeError('Write your name to sign the review.')
    if (input.decision === 'approved') {
      if (!input.rightsAttested) throw new SdeError('Approval needs your statement that you own this code or may license it.')
      if (record.blockers.length > 0) throw new SdeError(`This unit cannot be approved yet: ${record.blockers.join('; ')}.`)
    }
    const review: Review = { decision: input.decision, reviewer, rightsAttested: input.rightsAttested, notes: (input.notes ?? '').trim().slice(0, 2000), at: this.clock().toISOString() }
    const unit = join(this.runDir(id), 'unit')
    writeJson(join(unit, 'review.json'), review)
    writeJson(join(unit, 'consent.json'), { rightsAttested: review.rightsAttested, by: reviewer, at: review.at, statement: 'I own this code or am authorized to license derived training data from it.' })
    if (input.decision === 'approved') {
      const license = readJson<Record<string, unknown>>(join(unit, 'license.json'))
      writeJson(join(unit, 'license.json'), { ...license, commercialUseCleared: true, clearedBy: reviewer })
    }
    const next: RunRecord = { ...record, status: input.decision, review }
    writeJson(join(this.runDir(id), 'run.json'), next)
    return next
  }

  /**
   * Write an approved unit to `<home>/sde/exports/<id>/`: the unit's files, a `dataset.jsonl` (one line per anonymized file), and `MANIFEST.sha256`.
   * This is the only way material leaves a run, and it stays on this machine.
   */
  exportUnit(id: string): RunRecord {
    const record = this.get(id)
    if (record.status !== 'approved' || record.review?.rightsAttested !== true) throw new SdeError('Only a unit a person approved can be exported.')
    const target = join(this.home, 'exports', id)
    rmSync(target, { recursive: true, force: true })
    cpSync(join(this.runDir(id), 'unit'), target, { recursive: true })
    const lines = this.outputFiles(id).map((path) => JSON.stringify({ path, content: this.outputFile(id, path) }))
    writeFileSync(join(target, 'dataset.jsonl'), lines.length === 0 ? '' : `${lines.join('\n')}\n`)
    const manifest: string[] = []
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) walk(full)
        else manifest.push(`${createHash('sha256').update(readFileSync(full)).digest('hex')}  ${relative(target, full).split(sep).join('/')}`)
      }
    }
    walk(target)
    writeFileSync(join(target, 'MANIFEST.sha256'), `${manifest.join('\n')}\n`)
    const next: RunRecord = { ...record, status: 'exported', exportedTo: target }
    writeJson(join(this.runDir(id), 'run.json'), next)
    return next
  }

  /** Remove a run and its export. */
  remove(id: string): void {
    this.get(id)
    rmSync(this.runDir(id), { recursive: true, force: true })
    rmSync(join(this.home, 'exports', id), { recursive: true, force: true })
  }
}

function mask(value: string): string {
  return value.length <= 3 ? '***' : `${value.slice(0, 2)}***`
}

function blockersOf(residual: FindingSummary): string[] {
  const blockers: string[] = []
  const secrets = residual.byKind['secret'] ?? 0
  const terms = residual.byKind['project-term'] ?? 0
  const personal = residual.byKind['personal-data'] ?? 0
  if (secrets > 0) blockers.push(`${String(secrets)} secrets are still in the output`)
  if (terms > 0) blockers.push(`${String(terms)} project words are still in the output`)
  if (personal > 0) blockers.push(`${String(personal)} personal data items are still in the output`)
  return blockers
}

function contextMarkdown(label: string, inventory: Inventory, architecture: ReturnType<typeof extractArchitecture>): string {
  const languages = inventory.languages.slice(0, 8).map((language) => `- ${language.language}: ${String(language.files)} files, ${String(language.lines)} lines`).join('\n')
  const modules = architecture.modules.slice(0, 15).map((module) => `- ${module.name} (${String(module.files)} files)`).join('\n')
  const patterns = architecture.patterns.slice(0, 15).map((pattern) => `- ${pattern.pattern} (${String(pattern.files)} files)`).join('\n')
  return `# ${label}\n\nAn anonymized codebase: ${String(inventory.totals.readFiles)} files read, ${String(inventory.totals.lines)} lines.\n\n## Languages\n\n${languages || '- none'}\n\n## Modules\n\n${modules || '- none'}\n\n## Layers\n\n${architecture.layers.map((layer) => `- ${layer}`).join('\n') || '- none'}\n\n## Engineering patterns\n\n${patterns || '- none'}\n`
}

function qualityScore(inventory: Inventory, architecture: ReturnType<typeof extractArchitecture>, residual: FindingSummary): Record<string, unknown> {
  const tests = inventory.files.filter((file) => file.role === 'test').length
  const source = inventory.files.filter((file) => file.role === 'source').length
  const dimensions = {
    hasTests: tests > 0 ? 1 : 0,
    testRatio: source === 0 ? 0 : Math.min(1, tests / source),
    patternDiversity: Math.min(1, architecture.patterns.length / 10),
    modularity: Math.min(1, architecture.modules.length / 8),
    privacyClean: residual.total === 0 ? 1 : 0,
  }
  const score = Object.values(dimensions).reduce((sum, value) => sum + value, 0) / Object.keys(dimensions).length
  return { score: Number(score.toFixed(3)), dimensions, sourceFiles: source, testFiles: tests, note: 'Automatic signals only; the reviewer\'s judgement is in review.json.' }
}
