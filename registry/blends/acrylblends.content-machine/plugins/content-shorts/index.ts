/**
 * Step 5a, shorts: 2 to 10 vertical clips (1080x1920) from the best moments of the cut, each with big captions, its own title over the first seconds
 * and a progress bar. The writer (the AI model in Settings) picks the moments that stand alone; without one, the clips are the densest stretches of
 * speech. Each short is rendered by HyperFrames from a piece of the cut.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '../content/index.ts'
import { type ActionContext, compositionDir, dropComposition, cues, ffmpeg, keptRanges, probe, type Project, Refusal, renderComposition, type Segment, segmentsOnCut, type Short, serviceConfig, wordsOnCut, writeJson } from '../content/index.ts'
import { ensureCut, finalHtml, place } from '../content-visuals/index.ts'

export const name = 'content-shorts'
export const inject = ['content']

const MIN = 12
const MAX = 60

/** Without a writer: windows of whole lines, 20 to 45 s, ranked by words per second, the best `count` that do not overlap. */
export function pickByDensity(segments: readonly Segment[], count: number): { title: string; start: number; end: number }[] {
  const windows: { start: number; end: number; words: number; first: string }[] = []
  for (let i = 0; i < segments.length; i++) {
    let words = 0
    for (let j = i; j < segments.length; j++) {
      words += segments[j]!.text.split(/\s+/).length
      const length = segments[j]!.end - segments[i]!.start
      if (length > 45) break
      if (length >= 20) windows.push({ start: segments[i]!.start, end: segments[j]!.end, words, first: segments[i]!.text })
    }
  }
  if (windows.length === 0 && segments.length > 0) windows.push({ start: segments[0]!.start, end: segments.at(-1)!.end, words: 1, first: segments[0]!.text })
  windows.sort((a, b) => b.words / (b.end - b.start) - a.words / (a.end - a.start))
  const chosen: typeof windows = []
  for (const w of windows) {
    if (chosen.length >= count) break
    if (chosen.every((c) => w.end <= c.start || w.start >= c.end)) chosen.push(w)
  }
  return chosen.sort((a, b) => a.start - b.start).map((w) => ({ title: w.first.split(/\s+/).slice(0, 7).join(' '), start: w.start, end: w.end }))
}

async function pickWithWriter(context: ActionContext, project: Project, segments: readonly Segment[], count: number): Promise<{ title: string; start: number; end: number }[]> {
  const brand = context.machine.brand()
  const lines = segments.map((s, i) => `${i}: [${s.start.toFixed(1)}-${s.end.toFixed(1)}] ${s.text}`).join('\n')
  const answer = (await writeJson(context.machine.root, [
    { role: 'system', content: 'You pick the best moments of a talk for vertical social video shorts. Answer JSON only.' },
    { role: 'user', content: `Brand: ${brand.name || 'unknown'}. ${brand.about}\nAudience: ${brand.audience}\nTone: ${brand.tone}\n\nThe video's lines, numbered, with times in seconds:\n${lines}\n\nPick ${count} moments that each stand alone and hook a viewer in the first second, ${MIN} to ${MAX} seconds long, not overlapping. Each moment is a run of whole lines from "from" to "to" (line numbers, inclusive). Give each a title of at most 7 words in the video's language. Answer {"shorts":[{"from":0,"to":3,"title":"..."}]}` },
  ], context.signal)) as { shorts?: { from?: number; to?: number; title?: string }[] }
  const out: { title: string; start: number; end: number }[] = []
  for (const s of answer.shorts ?? []) {
    const from = segments[Number(s.from)]
    const to = segments[Number(s.to)]
    if (!from || !to || to.end <= from.start) continue
    const end = Math.min(to.end, from.start + MAX)
    if (end - from.start < Math.min(MIN, segments.at(-1)!.end)) continue
    if (out.some((o) => from.start < o.end && end > o.start)) continue
    out.push({ title: String(s.title ?? '').slice(0, 80) || from.text.slice(0, 40), start: from.start, end })
  }
  return out.slice(0, count)
}

async function renderShort(context: ActionContext, project: Project, short: Short, index: number, total: number): Promise<Short> {
  const cut = project.outputs.cut!
  const part = (f: number) => context.progress((index + f) / total, `short ${index + 1} of ${total}`)
  const work = context.path(`render/short-${short.id}`)
  const dir = compositionDir(work)
  const piece = join(dir, 'piece.mp4')
  await ffmpeg(context.tools, ['-ss', short.start.toFixed(3), '-t', (short.end - short.start).toFixed(3), '-i', context.path(cut.file), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-g', '30', '-c:a', 'aac', '-b:a', '192k', piece], { signal: context.signal })
  part(0.15)
  const kept = keptRanges(project.source!.duration, project.removals)
  const words = wordsOnCut(project.transcript?.words ?? [], kept)
    .filter((w) => w.start >= short.start && w.end <= short.end)
    .map((w) => ({ ...w, start: w.start - short.start, end: w.end - short.start }))
  const length = short.end - short.start
  writeFileSync(join(dir, 'index.html'), finalHtml({
    width: 1080, height: 1920, duration: length, video: 'piece.mp4', vertical: true,
    cues: cues(words, 20), captions: { enabled: true, style: project.captions.style === 'minimal' ? 'bold' : project.captions.style },
    title: short.title, subtitle: '', brand: context.machine.brand(), overlays: [], punchIns: [], progressBar: true,
  }))
  mkdirSync(context.path('shorts'), { recursive: true })
  const file = `shorts/short-${index + 1}.mp4`
  await renderComposition(dir, context.path(file), { signal: context.signal, onProgress: (f) => part(0.15 + f * 0.85) })
  dropComposition(work)
  const made = await probe(context.tools, context.path(file), context.signal)
  return { ...short, output: context.output(file, made.duration) }
}

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.content.features.register({
    id: 'shorts',
    title: 'Shorts',
    order: 7,
    summary: 'The best moments as vertical clips with big captions, ready for Reels, Shorts and TikTok.',
    actions: {
      suggest: {
        title: 'Pick the moments',
        description: 'Chooses 2 to 10 moments of the cut for shorts (with the AI writer when one is set, else the densest stretches of speech) and lists them with titles.',
        input: { type: 'object', properties: { count: { type: 'integer', minimum: 1, maximum: 10, description: 'How many shorts (default 4)' } }, additionalProperties: false },
        async run(context, input) {
          const project = await ensureCut(context)
          if (!project.transcript) throw new Refusal('invalid', 'shorts are picked from the transcript: make one first')
          const count = Math.max(1, Math.min(10, Number(input.count ?? 4) || 4))
          const segments = segmentsOnCut(project.transcript.segments, keptRanges(project.source!.duration, project.removals))
          context.progress(0.4, 'choosing moments')
          const picked = serviceConfig(context.machine.root, 'writer') ? await pickWithWriter(context, project, segments, count) : pickByDensity(segments, count)
          if (picked.length === 0) throw new Refusal('invalid', 'no moment long enough for a short')
          const shorts: Short[] = picked.map((p, i) => ({ id: `s${i + 1}`, title: p.title, start: p.start, end: p.end }))
          context.update(() => ({ shorts }))
          return shorts
        },
      },
      render: {
        title: 'Render the shorts',
        description: 'Renders every listed short (or the ones named) as a vertical 1080x1920 video with captions, title and progress bar, into shorts/.',
        input: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' }, description: 'Only these shorts (s1, s2...)' } }, additionalProperties: false },
        async run(context, input) {
          const project = await ensureCut(context)
          const ids = Array.isArray(input.ids) ? input.ids.map(String) : undefined
          const todo = project.shorts.filter((s) => !ids || ids.includes(s.id))
          if (todo.length === 0) throw new Refusal('invalid', 'pick the moments first')
          const done: Short[] = []
          for (const [i, short] of todo.entries()) {
            const made = await renderShort(context, project, short, i, todo.length)
            done.push(made)
            context.update((p) => ({ shorts: p.shorts.map((s) => (s.id === made.id ? made : s)) }))
          }
          return done
        },
      },
    },
  }), 'content-shorts: the step')
}
