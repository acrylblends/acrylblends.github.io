/**
 * Step 4b, what is drawn: captions (bold, karaoke or minimal), a title card, b-roll from the library, punch-in zooms and a progress bar, rendered over
 * the cut by HyperFrames into `final.mp4`. The captions are also saved as `captions.srt` for platforms that take a subtitle file.
 */
import { copyFileSync, linkSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '../content/index.ts'
import { type ActionContext, compositionDir, dropComposition, cues, keptRanges, probe, type Project, Refusal, renderComposition, segmentsOnCut, srt, wordsOnCut } from '../content/index.ts'
import { finalHtml, punchInTimes } from './composition.ts'

export * from './composition.ts'

export const name = 'content-visuals'
export const inject = ['content']

/** Places a file in a composition folder without copying a large video when a hard link is possible. */
export function place(from: string, dir: string, name = basename(from)): string {
  const to = join(dir, name)
  try { linkSync(from, to) } catch { copyFileSync(from, to) }
  return name
}

/** The cut must exist and be newer than the last edit; when the cut step is there, it is rendered first. */
export async function ensureCut(context: ActionContext): Promise<Project> {
  const project = context.project()
  if (project.outputs.cut) return project
  const cut = context.machine.features.get('cut')?.actions.render
  if (!cut) throw new Refusal('invalid', 'render the cut first')
  context.progress(0, 'rendering the cut first')
  await cut.run({ ...context, progress: (f, m) => context.progress(f === undefined ? undefined : f * 0.3, m) }, {})
  return context.project()
}

export function captionsOf(project: Project) {
  if (!project.source || !project.transcript) return []
  const kept = keptRanges(project.source.duration, project.removals)
  return cues(wordsOnCut(project.transcript.words, kept), project.captions.style === 'karaoke' ? 24 : 34)
}

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.content.features.register({
    id: 'visuals',
    title: 'Captions and visuals',
    order: 6,
    summary: 'Captions, a title card, pictures over the video, punch-in zooms and a progress bar, rendered into the finished video.',
    actions: {
      render: {
        title: 'Render the finished video',
        description: 'Renders final.mp4 with HyperFrames: the cut with captions, title card, b-roll, punch-ins and progress bar as set; renders the cut first if needed.',
        async run(context) {
          const project = await ensureCut(context)
          const cut = project.outputs.cut!
          const info = await probe(context.tools, context.path(cut.file), context.signal)
          const dir = compositionDir(context.path('render/final'))
          const video = place(context.path(cut.file), dir, 'cut.mp4')
          const kept = keptRanges(project.source!.duration, project.removals)
          const list = captionsOf(project)
          const overlays = project.visuals.overlays.map((o) => ({ ...o, src: place(context.machine.libraryFile(o.file), dir) }))
          writeFileSync(join(dir, 'index.html'), finalHtml({
            width: info.width - (info.width % 2), height: info.height - (info.height % 2), duration: info.duration, video,
            cues: list, captions: project.captions, title: project.visuals.title, subtitle: project.visuals.subtitle,
            brand: context.machine.brand(), overlays,
            punchIns: project.visuals.punchIns && project.transcript ? punchInTimes(segmentsOnCut(project.transcript.segments, kept)) : [],
            progressBar: project.visuals.progressBar,
          }))
          context.progress(0.32, 'drawing the video')
          await renderComposition(dir, context.path('final.mp4'), { signal: context.signal, onProgress: (f) => context.progress(0.32 + f * 0.66, 'drawing the video') })
          dropComposition(dir)
          if (list.length > 0) writeFileSync(context.path('captions.srt'), srt(list))
          const made = await probe(context.tools, context.path('final.mp4'), context.signal)
          context.update((p) => ({ outputs: { ...p.outputs, final: context.output('final.mp4', made.duration), ...(list.length > 0 ? { captions: context.output('captions.srt') } : {}) } }))
          return context.project().outputs.final
        },
      },
      captions: {
        title: 'Save the captions file',
        description: 'Writes captions.srt from the transcript, timed on the cut, without rendering video.',
        run(context) {
          const list = captionsOf(context.project())
          if (list.length === 0) throw new Refusal('invalid', 'there is no transcript to make captions from')
          writeFileSync(context.path('captions.srt'), srt(list))
          context.update((p) => ({ outputs: { ...p.outputs, captions: context.output('captions.srt') } }))
          return { cues: list.length, file: 'captions.srt' }
        },
      },
    },
  }), 'content-visuals: the step')
}
