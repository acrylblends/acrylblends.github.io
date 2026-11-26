/**
 * Step 2b, the clean cut: suggest what to remove (fillers, earlier takes, long pauses), then render `cut.mp4` from the stretches that stay. The sound
 * chain other plugins registered (the sound plugin's voice cleaning, the music plugin's bed and whooshes) is applied in the same render, so the cut
 * is the finished sound. Every join gets a 10 ms fade, so no cut clicks.
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '../content/index.ts'
import { type ActionContext, ffmpeg, joins, keptRanges, lengthOf, probe, type Project, Refusal, type Range, silences } from '../content/index.ts'
import { suggest } from './analyze.ts'

export * from './analyze.ts'

export const name = 'content-cut'
export const inject = ['content']

const f3 = (n: number) => n.toFixed(3)

/** The filter graph that keeps `kept` stretches of input 0 (video when `video`), joined, with the voice chain and the mixes after it. */
export function cutGraph(kept: readonly Range[], video: boolean, voiceChain: readonly string[], mixes: readonly { graph: (voice: string, first: number, out: string) => string; inputs: number }[]): { graph: string; video?: string; audio: string } {
  const n = kept.length
  const parts: string[] = []
  if (video) parts.push(`[0:v]split=${n}${kept.map((_, i) => `[sv${i}]`).join('')}`)
  parts.push(`[0:a]asplit=${n}${kept.map((_, i) => `[sa${i}]`).join('')}`)
  kept.forEach((r, i) => {
    const length = r.end - r.start
    if (video) parts.push(`[sv${i}]trim=start=${f3(r.start)}:end=${f3(r.end)},setpts=PTS-STARTPTS[v${i}]`)
    parts.push(`[sa${i}]atrim=start=${f3(r.start)}:end=${f3(r.end)},asetpts=PTS-STARTPTS,afade=t=in:d=0.01,afade=t=out:st=${f3(Math.max(0, length - 0.01))}:d=0.01[a${i}]`)
  })
  parts.push(`${kept.map((_, i) => `${video ? `[v${i}]` : ''}[a${i}]`).join('')}concat=n=${n}:v=${video ? 1 : 0}:a=1${video ? '[vout]' : ''}[joined]`)
  let audio = 'joined'
  if (voiceChain.length > 0) {
    parts.push(`[joined]${voiceChain.join(',')}[voice]`)
    audio = 'voice'
  }
  let next = 1
  mixes.forEach((mix, i) => {
    const out = `mix${i}`
    parts.push(mix.graph(audio, next, out))
    next += mix.inputs
    audio = out
  })
  return { graph: parts.join(';'), ...(video ? { video: 'vout' } : {}), audio }
}

export async function renderCut(context: ActionContext): Promise<Project> {
  const project = context.project()
  const source = project.source
  if (!source) throw new Refusal('invalid', 'bring a video first')
  const kept = keptRanges(source.duration, project.removals)
  if (kept.length === 0) throw new Refusal('invalid', 'everything is cut: keep something')
  const duration = lengthOf(kept)
  const stages = context.machine.audio.list()
  const voiceChain = stages.map((s) => s.voice?.(project)).filter((f): f is string => typeof f === 'string' && f !== '')
  const mixes = stages.map((s) => s.mix?.(project, { duration, joins: joins(kept), root: context.machine.root })).filter((m) => m !== undefined)
  const graph = cutGraph(kept, source.hasVideo || source.width > 0, source.hasAudio ? voiceChain : [], mixes.map((m) => ({ graph: m.graph.bind(m), inputs: m.inputs.length })))
  const out = 'cut.mp4'
  await ffmpeg(context.tools, [
    '-i', context.path(source.file),
    ...mixes.flatMap((m) => m.inputs.flatMap((i) => i.args)),
    '-filter_complex', graph.graph,
    ...(graph.video ? ['-map', `[${graph.video}]`] : []),
    '-map', `[${graph.audio}]`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-g', '30', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', '-t', f3(duration),
    context.path(out),
  ], { signal: context.signal, onTime: (t) => context.progress(t / duration, 'rendering the cut') })
  const made = await probe(context.tools, context.path(out), context.signal)
  return context.update((p) => ({ outputs: { ...p.outputs, cut: context.output(out, made.duration), final: undefined } }))
}

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.content.features.register({
    id: 'cut',
    title: 'Clean cut',
    order: 3,
    summary: 'Fillers, earlier takes and long pauses suggested for removal; the cut keeps the rest, with the sound cleaned and the music under it.',
    actions: {
      suggest: {
        title: 'Find what to cut',
        description: 'Finds filler words, earlier takes of repeated sentences and long pauses, and lists them as suggested removals (replacing earlier suggestions).',
        async run(context) {
          const project = context.project()
          if (!project.source) throw new Refusal('invalid', 'bring a video first')
          context.progress(0.1, 'finding pauses')
          const quiet = project.source.hasAudio ? await silences(context.tools, context.path('audio.wav'), project.edit.silenceDb, project.edit.silenceMin, context.signal) : []
          const transcript = project.transcript
          const removals = suggest(transcript?.words ?? [], transcript?.segments ?? [], quiet, project.edit)
          const updated = context.update(() => ({ removals }))
          const kept = keptRanges(project.source.duration, updated.removals)
          return { removals: removals.length, byReason: count(removals.map((r) => r.reason)), before: project.source.duration, after: lengthOf(kept) }
        },
      },
      render: {
        title: 'Render the cut',
        description: 'Renders cut.mp4: the stretches that stay, joined, with the sound chain (voice cleaning, music, whooshes) applied.',
        async run(context) {
          const project = await renderCut(context)
          return project.outputs.cut
        },
      },
    },
  }), 'content-cut: the step')
}

const count = (items: readonly string[]): Record<string, number> => items.reduce<Record<string, number>>((all, item) => ({ ...all, [item]: (all[item] ?? 0) + 1 }), {})
