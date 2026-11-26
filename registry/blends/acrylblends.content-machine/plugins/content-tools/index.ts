/**
 * The content machine for the ACRYL agent: typed tools in the app's `tools` registry (the built-in chat reads it; the door offers the same tools to
 * Claude Code, Codex, Pi and every terminal agent). The agent is the editor's operator: it reads the project, changes its settings, keeps or drops
 * suggested cuts, and runs any step the screen can run (the steps are listed live from the plugins that are switched on), so what it does shows on
 * the screen at once. Nothing is posted anywhere: every output stays in the project folder.
 *
 * Owned while active: the registrations (removed when the plugin or the registry goes).
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '../content/index.ts'
import { keptRanges, lengthOf, type Machine, type Project, Refusal, settingsChange } from '../content/index.ts'

export const name = 'content-tools'
export const inject = ['content']

type Schema = Readonly<Record<string, unknown>>

export interface ContentTool {
  readonly name: string
  readonly description: string
  readonly parameters: Schema
  run(input: Record<string, unknown>): Promise<unknown> | unknown
}

const object = (properties: Record<string, unknown>, required: readonly string[] = []): Schema => ({ type: 'object', properties, required, additionalProperties: false })
const s = (description: string): Schema => ({ type: 'string', description })
const projectId = s('The project id (from content_list_projects)')

/** A project as a model needs it: settings, the transcript's lines with times, the suggested cuts, the outputs; not every word. */
export function projectForAgent(project: Project): unknown {
  const kept = project.source ? keptRanges(project.source.duration, project.removals) : []
  return {
    id: project.id, name: project.name, revision: project.revision,
    source: project.source ? { duration: project.source.duration, size: `${project.source.width}x${project.source.height}`, from: project.source.from, originalName: project.source.originalName } : null,
    cutLength: project.source ? Number(lengthOf(kept).toFixed(2)) : null,
    transcript: project.transcript ? { provider: project.transcript.provider, language: project.transcript.language, lines: project.transcript.segments.map((l) => `[${l.start.toFixed(1)}-${l.end.toFixed(1)}] ${l.text}`) } : null,
    removals: project.removals.map((r) => ({ id: r.id, reason: r.reason, start: Number(r.start.toFixed(2)), end: Number(r.end.toFixed(2)), text: r.text, kept: r.kept })),
    edit: project.edit, sound: project.sound, captions: project.captions, music: project.music, visuals: project.visuals,
    shorts: project.shorts.map((x) => ({ id: x.id, title: x.title, start: x.start, end: x.end, rendered: x.output?.file ?? null })),
    posts: project.posts ?? null,
    outputs: project.outputs,
  }
}

export function contentTools(machine: Machine): ContentTool[] {
  return [
    {
      name: 'content_list_projects',
      description: 'The video projects, newest first: id, name, whether a source, transcript, cut and finished video exist.',
      parameters: object({}),
      run: () => machine.list().map((p) => ({ id: p.id, name: p.name, source: p.source !== undefined, transcript: p.transcript !== undefined, cut: p.outputs.cut !== undefined, final: p.outputs.final !== undefined, shorts: p.shorts.length })),
    },
    {
      name: 'content_create_project',
      description: 'Start a new video project with a name. Then bring a video with content_run_step (step ingest, action link) or ask the person to upload one.',
      parameters: object({ name: s('A short name') }, ['name']),
      run: (input) => projectForAgent(machine.create(String(input.name ?? ''))),
    },
    {
      name: 'content_get_project',
      description: 'One project: its settings, the transcript lines with times, the suggested cuts (with ids), shorts, posts and output files.',
      parameters: object({ projectId }, ['projectId']),
      run: (input) => projectForAgent(machine.get(String(input.projectId))),
    },
    {
      name: 'content_list_steps',
      description: 'The steps this app can run now (bring the video, transcript, cut, sound, music, visuals, shorts, thumbnail, posts...) with their actions and inputs.',
      parameters: object({}),
      run: () => machine.features.list().map((f) => ({ step: f.id, title: f.title, summary: f.summary, actions: Object.entries(f.actions).map(([name, a]) => ({ action: name, description: a.description, input: a.input ?? null })) })),
    },
    {
      name: 'content_run_step',
      description: 'Run a step\'s action on a project (see content_list_steps) and wait for it (renders take minutes). Answers the action\'s result, or why it failed.',
      parameters: object({ projectId, step: s('The step id, e.g. cut'), action: s('The action, e.g. render'), input: { type: 'object', description: 'The action\'s input, when it has one' } }, ['projectId', 'step', 'action']),
      run: async (input) => {
        const { job, done } = machine.start(String(input.projectId), String(input.step), String(input.action), (input.input ?? {}) as Record<string, unknown>)
        try {
          return { job: job.id, status: 'done', result: await done }
        } catch (cause) {
          if (cause instanceof Refusal) throw cause
          return { job: job.id, status: 'failed', error: cause instanceof Error ? cause.message : String(cause) }
        }
      },
    },
    {
      name: 'content_update_settings',
      description: 'Change a project\'s settings: name, edit {silenceMin, silenceDb, cutFillers, cutRetakes}, sound {preset: off|clean|podcast}, captions {enabled, style: bold|karaoke|minimal}, music {track, volume 0..1, duck, whooshOnCuts}, visuals {title, subtitle, punchIns, progressBar, overlays}, shorts [{id,title,start,end}]. Only the fields given change.',
      parameters: object({ projectId, revision: { type: 'integer', description: 'The revision you last read; a change made since is refused' }, settings: { type: 'object', description: 'The fields to change' } }, ['projectId', 'settings']),
      run: (input) => {
        const settings = (input.settings ?? {}) as Record<string, unknown>
        return projectForAgent(machine.update(String(input.projectId), (p) => settingsChange(machine, p, settings), typeof input.revision === 'number' ? input.revision : undefined))
      },
    },
    {
      name: 'content_keep_or_cut',
      description: 'Keep a suggested removal in the video after all (kept: true), or cut it again (kept: false), by its id from content_get_project.',
      parameters: object({ projectId, removalId: s('r1, r2...'), kept: { type: 'boolean' } }, ['projectId', 'removalId', 'kept']),
      run: (input) => {
        const id = String(input.removalId)
        return projectForAgent(machine.update(String(input.projectId), (p) => {
          if (!p.removals.some((r) => r.id === id)) throw new Refusal('not_found', `no suggestion ${id}`)
          return { removals: p.removals.map((r) => (r.id === id ? { ...r, kept: input.kept === true } : r)), outputs: { ...p.outputs, cut: undefined, final: undefined } }
        }))
      },
    },
    {
      name: 'content_get_brand',
      description: 'The brand the posts and titles speak for: name, what it does, audience, tone, offers and prices, call to action, links, color.',
      parameters: object({}),
      run: () => machine.brand(),
    },
    {
      name: 'content_set_brand',
      description: 'Change the brand (only the fields given): name, about, audience, tone, offers, callToAction, links, color (#rrggbb).',
      parameters: object({ name: s(''), about: s(''), audience: s(''), tone: s(''), offers: s(''), callToAction: s(''), links: s(''), color: s('#rrggbb') }),
      run: (input) => machine.setBrand(input as never),
    },
    {
      name: 'content_list_library',
      description: 'The media library: music, sound effects, pictures and clips that can go under or over a video.',
      parameters: object({}),
      run: () => machine.library(),
    },
  ]
}

interface ToolsPort { register(name: string, tool: { description: string; parameters?: Schema; run(input: unknown): unknown }): () => void }
interface DshToolsPort {
  register(definition: { name: string; description: string; parameters: Schema; output: { schema: Schema; render(args: unknown, value: unknown): Array<{ type: 'text'; text: string }> }; execute(args: unknown, exec: { signal?: AbortSignal }): Promise<unknown> }): () => void
  schemas(): unknown
}
const isDsh = (tools: unknown): tools is DshToolsPort => typeof (tools as { schemas?: unknown } | undefined)?.schemas === 'function'

/** Runs a tool and answers what a model reads: the result as JSON, or the refusal in words. */
async function answer(tool: ContentTool, input: unknown): Promise<string> {
  try {
    return JSON.stringify(await tool.run((input ?? {}) as Record<string, unknown>), null, 1)
  } catch (cause) {
    if (cause instanceof Refusal) return JSON.stringify({ refused: cause.code, message: cause.message })
    throw cause
  }
}

export function registerTools(tools: unknown, list: readonly ContentTool[]): () => void {
  const removers: Array<() => void> = []
  const removeAll = (): void => { for (const remove of removers.splice(0).reverse()) remove() }
  try {
    for (const tool of list) {
      if (isDsh(tools)) {
        removers.push(tools.register({
          name: tool.name, description: tool.description, parameters: tool.parameters,
          output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
          execute: (args) => answer(tool, args),
        }))
      } else {
        removers.push((tools as ToolsPort).register(tool.name, { description: tool.description, parameters: tool.parameters, run: (input) => answer(tool, input) }))
      }
    }
  } catch (cause) {
    removeAll()
    throw cause
  }
  return removeAll
}

export function apply(ctx: Context): void {
  const list = contentTools(ctx.content)
  // The registry is optional: on the app's own server there is none, and the tools wait for it.
  ctx.inject(['tools'], (inner) => {
    inner.effect(() => registerTools(inner.get('tools'), list), 'content-tools: the tools in the registry')
  })
}
