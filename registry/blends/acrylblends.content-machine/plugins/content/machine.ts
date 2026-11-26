/**
 * The content machine: projects (one folder each, `project.json` plus the media made for it), the brand, the media library, and the jobs that turn a
 * recording into a finished video. Every step of the work is a feature another plugin registers (`machine.features.register`); the screen, the HTTP
 * API and the agent's tools all list the features that are there and run their actions through `machine.run`, so a step switched off in Settings >
 * Plugins disappears from all three at once.
 */
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join, resolve, sep } from 'node:path'
import { type Tools } from './media.ts'
import { type AudioStage, Stages } from './stages.ts'
import { type Brand, DEFAULT_BRAND, DEFAULT_EDIT, type Job, type Output, type Project, Refusal } from './model.ts'

/** A JSON-schema object for an action's input: the agent's tool parameters and the API's validation read the same one. */
export type Schema = Readonly<Record<string, unknown>>

export interface ActionContext {
  readonly machine: Machine
  readonly projectId: string
  /** The project as it is now (read again after every `update`). */
  project(): Project
  update(change: (project: Project) => Partial<Project>): Project
  /** The project's folder, and a path inside it. */
  readonly dir: string
  path(file: string): string
  /** Records a file the step made as an output (its size and time). */
  output(file: string, duration?: number): Output
  readonly tools: Tools
  readonly signal: AbortSignal
  progress(fraction: number | undefined, message?: string): void
}

export interface Action {
  readonly title: string
  /** What it does, for the agent: one or two sentences. */
  readonly description: string
  readonly input?: Schema
  run(context: ActionContext, input: Record<string, unknown>): Promise<unknown> | unknown
}

export interface Feature {
  readonly id: string
  readonly title: string
  /** Where it sits in the steps (1 bring the video ... 6 publish). */
  readonly order: number
  readonly summary: string
  readonly actions: Readonly<Record<string, Action>>
}

export type MachineEvent =
  | { readonly type: 'project'; readonly project: Project }
  | { readonly type: 'deleted'; readonly id: string }
  | { readonly type: 'job'; readonly job: Job }
  | { readonly type: 'brand'; readonly brand: Brand }
  | { readonly type: 'features' }

export interface MachineOptions {
  /** Where projects, the brand and the library live. */
  readonly root: string
  readonly tools: Tools
  readonly clock?: () => Date
}

const ID = /^[a-z0-9][a-z0-9-]{2,63}$/
const FILE = /^[A-Za-z0-9][A-Za-z0-9 ._()-]{0,150}$/

/** Writes JSON so a crash never leaves half a file: a temporary file renamed over the old one. */
function writeJson(path: string, value: unknown): void {
  const temporary = `${path}.${process.pid}.tmp`
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`)
  renameSync(temporary, path)
}

/** A file name a person gave, made safe for the project folder: no path, no leading dot. */
export function safeName(name: string): string {
  const base = basename(name).replace(/[^A-Za-z0-9 ._()-]+/g, '-').replace(/^[.\-]+/, '').slice(0, 120)
  return base === '' ? 'file' : base
}

class Registry {
  private readonly features = new Map<string, Feature>()
  private readonly changed: () => void
  constructor(changed: () => void) {
    this.changed = changed
  }
  /** Adds a step; the returned function removes it (a plugin returns it from its effect). */
  register(feature: Feature): () => void {
    if (this.features.has(feature.id)) throw new Error(`a feature named ${feature.id} is already registered`)
    this.features.set(feature.id, feature)
    this.changed()
    return () => {
      if (this.features.get(feature.id) === feature) {
        this.features.delete(feature.id)
        this.changed()
      }
    }
  }
  get(id: string): Feature | undefined {
    return this.features.get(id)
  }
  list(): Feature[] {
    return [...this.features.values()].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
  }
}

export class Machine {
  readonly features: Registry
  /** The cut's sound chain: voice filters and mixes other plugins add (see stages.ts). */
  readonly audio = new Stages<AudioStage>()
  readonly tools: Tools
  /** Where projects, the brand, the library and the settings live. */
  readonly root: string
  private readonly clock: () => Date
  private readonly listeners = new Set<(event: MachineEvent) => void>()
  private readonly jobs = new Map<string, { job: Job; abort: AbortController; done: Promise<unknown> }>()

  constructor(options: MachineOptions) {
    this.root = options.root
    this.tools = options.tools
    this.clock = options.clock ?? (() => new Date())
    this.features = new Registry(() => this.emit({ type: 'features' }))
    mkdirSync(join(this.root, 'projects'), { recursive: true })
    mkdirSync(this.libraryDir, { recursive: true })
  }

  on(listener: (event: MachineEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(event: MachineEvent): void {
    for (const listener of this.listeners) {
      try { listener(event) } catch { /* a listener's error is its own */ }
    }
  }

  private now(): string {
    return this.clock().toISOString()
  }

  // Projects

  projectDir(id: string): string {
    if (!ID.test(id)) throw new Refusal('not_found', `no project ${id}`)
    return join(this.root, 'projects', id)
  }

  list(): Project[] {
    const dir = join(this.root, 'projects')
    const found: Project[] = []
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || !ID.test(entry.name)) continue
      try { found.push(this.get(entry.name)) } catch { /* a broken folder is skipped, not fatal */ }
    }
    return found.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  get(id: string): Project {
    const file = join(this.projectDir(id), 'project.json')
    if (!existsSync(file)) throw new Refusal('not_found', `no project ${id}`)
    return JSON.parse(readFileSync(file, 'utf8')) as Project
  }

  create(name: string): Project {
    const clean = name.trim().slice(0, 120)
    if (clean === '') throw new Refusal('invalid', 'a project needs a name')
    const slug = clean.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40) || 'video'
    const id = `${slug.length < 3 ? `${slug}-video` : slug}-${randomUUID().slice(0, 6)}`
    const at = this.now()
    const project: Project = {
      id, name: clean, createdAt: at, updatedAt: at, revision: 1,
      edit: DEFAULT_EDIT, removals: [],
      sound: { preset: 'clean' },
      captions: { enabled: true, style: 'bold' },
      music: { volume: 0.18, duck: true, whooshOnCuts: false },
      visuals: { title: '', subtitle: '', punchIns: true, progressBar: false, overlays: [] },
      shorts: [], outputs: {},
    }
    mkdirSync(this.projectDir(id), { recursive: true })
    writeJson(join(this.projectDir(id), 'project.json'), project)
    this.emit({ type: 'project', project })
    return project
  }

  /** Changes a project; `revision`, when given, must be the one the caller last read. */
  update(id: string, change: (project: Project) => Partial<Project>, revision?: number): Project {
    const current = this.get(id)
    if (revision !== undefined && revision !== current.revision)
      throw new Refusal('conflict', `the project changed since you read it (revision ${current.revision}, not ${revision}): read it again`)
    const next: Project = { ...current, ...change(current), id: current.id, createdAt: current.createdAt, revision: current.revision + 1, updatedAt: this.now() }
    writeJson(join(this.projectDir(id), 'project.json'), next)
    this.emit({ type: 'project', project: next })
    return next
  }

  remove(id: string): void {
    if (this.runningJob(id)) throw new Refusal('conflict', 'a step is running on this project: stop it first')
    const dir = this.projectDir(id)
    if (!existsSync(dir)) throw new Refusal('not_found', `no project ${id}`)
    rmSync(dir, { recursive: true, force: true })
    this.emit({ type: 'deleted', id })
  }

  /** A file inside a project folder, refused when the name would leave it. */
  file(id: string, name: string): string {
    const dir = resolve(this.projectDir(id))
    const path = resolve(dir, name)
    if (!path.startsWith(dir + sep)) throw new Refusal('invalid', 'that file is outside the project')
    return path
  }

  output(id: string, name: string, duration?: number): Output {
    const stat = statSync(this.file(id, name))
    return { file: name, at: this.now(), bytes: stat.size, ...(duration === undefined ? {} : { duration }) }
  }

  // Brand

  brand(): Brand {
    const file = join(this.root, 'brand.json')
    if (!existsSync(file)) return DEFAULT_BRAND
    return { ...DEFAULT_BRAND, ...(JSON.parse(readFileSync(file, 'utf8')) as Partial<Brand>) }
  }

  setBrand(change: Partial<Brand>): Brand {
    const next: Brand = { ...this.brand() }
    for (const key of Object.keys(DEFAULT_BRAND) as (keyof Brand)[]) {
      const value = change[key]
      if (value === undefined) continue
      if (typeof value !== 'string') throw new Refusal('invalid', `${key} is text`)
      ;(next as Record<keyof Brand, string>)[key] = value.slice(0, 4000)
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(next.color)) throw new Refusal('invalid', 'color is a hex color like #3652D9')
    writeJson(join(this.root, 'brand.json'), next)
    this.emit({ type: 'brand', brand: next })
    return next
  }

  // Library: music, sound effects, pictures and clips to lay over the video

  get libraryDir(): string {
    return join(this.root, 'library')
  }

  library(): { file: string; kind: 'audio' | 'image' | 'video' | 'other'; bytes: number }[] {
    return readdirSync(this.libraryDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && FILE.test(entry.name))
      .map((entry) => ({ file: entry.name, kind: kindOf(entry.name), bytes: statSync(join(this.libraryDir, entry.name)).size }))
      .sort((a, b) => a.file.localeCompare(b.file))
  }

  libraryFile(name: string): string {
    if (!FILE.test(name)) throw new Refusal('invalid', `${name} is not a library file name`)
    const path = join(this.libraryDir, name)
    if (!existsSync(path)) throw new Refusal('not_found', `the library has no ${name}`)
    return path
  }

  addToLibrary(name: string, data: Uint8Array): string {
    const file = safeName(name)
    if (kindOf(file) === 'other') throw new Refusal('invalid', 'the library takes audio (mp3, wav, m4a), pictures (png, jpg, webp) and clips (mp4, mov, webm)')
    writeFileSync(join(this.libraryDir, file), data)
    return file
  }

  // Jobs

  runningJob(projectId: string): Job | undefined {
    for (const entry of this.jobs.values()) if (entry.job.projectId === projectId && entry.job.status === 'running') return entry.job
    return undefined
  }

  jobsOf(projectId: string): Job[] {
    return [...this.jobs.values()].map((e) => e.job).filter((j) => j.projectId === projectId).sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  }

  /**
   * Starts a feature's action on a project as a job: one at a time per project. Returns the job at once and the promise of its result; the job's
   * progress and end arrive as `job` events.
   */
  start(projectId: string, featureId: string, actionName: string, input: Record<string, unknown> = {}): { job: Job; done: Promise<unknown> } {
    const feature = this.features.get(featureId)
    if (!feature) throw new Refusal('not_found', `no step ${featureId} (is its plugin switched off?)`)
    const action = feature.actions[actionName]
    if (!action) throw new Refusal('not_found', `${featureId} has no action ${actionName}`)
    this.get(projectId)
    const busy = this.runningJob(projectId)
    if (busy) throw new Refusal('conflict', `${busy.title} is still running on this project`)
    const abort = new AbortController()
    let job: Job = { id: randomUUID(), projectId, feature: featureId, action: actionName, title: action.title, status: 'running', message: 'starting', startedAt: this.now() }
    const set = (change: Partial<Job>) => {
      job = { ...job, ...change }
      const entry = this.jobs.get(job.id)
      if (entry) entry.job = job
      this.emit({ type: 'job', job })
    }
    const dir = this.projectDir(projectId)
    const context: ActionContext = {
      machine: this,
      projectId,
      project: () => this.get(projectId),
      update: (change) => this.update(projectId, change),
      dir,
      path: (file) => this.file(projectId, file),
      output: (file, duration) => this.output(projectId, file, duration),
      tools: this.tools,
      signal: abort.signal,
      progress: (fraction, message) => set({ ...(fraction === undefined ? {} : { progress: Math.max(0, Math.min(1, fraction)) }), ...(message === undefined ? {} : { message }) }),
    }
    const done = (async () => {
      try {
        const result = await action.run(context, input)
        set({ status: 'done', progress: 1, message: 'done', endedAt: this.now() })
        return result
      } catch (error) {
        const stopped = abort.signal.aborted
        set({ status: stopped ? 'stopped' : 'failed', message: stopped ? 'stopped' : error instanceof Error ? error.message : String(error), endedAt: this.now() })
        throw error
      }
    })()
    done.catch(() => {})
    this.jobs.set(job.id, { job, abort, done })
    this.emit({ type: 'job', job })
    // Finished jobs stay listed for a while (the screen shows the last ones); the map keeps the newest 200.
    if (this.jobs.size > 200) for (const [id, entry] of this.jobs) { if (entry.job.status !== 'running') { this.jobs.delete(id); break } }
    return { job, done }
  }

  stop(jobId: string): void {
    const entry = this.jobs.get(jobId)
    if (!entry) throw new Refusal('not_found', 'no such job')
    entry.abort.abort()
  }

  stopAll(): void {
    for (const entry of this.jobs.values()) entry.abort.abort()
  }
}

export function kindOf(name: string): 'audio' | 'image' | 'video' | 'other' {
  const ext = extname(name).toLowerCase()
  if (['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac', '.aiff', '.aif'].includes(ext)) return 'audio'
  if (['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) return 'image'
  if (['.mp4', '.mov', '.webm', '.mkv', '.m4v'].includes(ext)) return 'video'
  return 'other'
}
