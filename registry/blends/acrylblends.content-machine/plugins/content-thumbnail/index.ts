/**
 * Step 5b, the thumbnail: a telling frame of the video (ffmpeg's `thumbnail` filter picks the most representative one of every 300 frames), darkened at
 * the bottom, with a headline of a few words in the brand's color and the brand's name. Drawn by HyperFrames as one frame, saved as `thumbnail.png`
 * (1280x720, what YouTube asks for).
 */
import { readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '../content/index.ts'
import { compositionDir, dropComposition, ffmpeg, html, Refusal, renderComposition, serviceConfig, writeJson } from '../content/index.ts'

export const name = 'content-thumbnail'
export const inject = ['content']

/** The headline split so its last word or two carry the accent color. */
export function thumbnailHtml(frame: string, headline: string, brand: { name: string; color: string }): string {
  const words = headline.trim().split(/\s+/)
  const accentFrom = Math.max(1, words.length - (words.length > 4 ? 2 : 1))
  const text = words.map((w, i) => (i >= accentFrom ? `<em>${html(w)}</em>` : html(w))).join(' ')
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;background:#000}
#root{position:relative;width:100%;height:100%;overflow:hidden;font-family:Inter,sans-serif}
#root img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0) 30%,rgba(0,0,0,.85) 100%)}
h1{position:absolute;left:56px;right:56px;bottom:${brand.name ? 92 : 56}px;margin:0;font-weight:900;font-size:${words.length > 5 ? 84 : 104}px;line-height:1.0;color:#fff;text-transform:uppercase;letter-spacing:-.01em;text-shadow:0 6px 30px rgba(0,0,0,.6)}
h1 em{font-style:normal;color:${brand.color}}
.brand{position:absolute;left:58px;bottom:40px;font-weight:700;font-size:30px;color:#fff;opacity:.9}
</style></head><body>
<div id="root" data-composition-id="thumb" data-width="1280" data-height="720" data-duration="0.1">
<div id="frame" class="clip" data-start="0" data-duration="0.1" data-track-index="0"><img src="${html(frame)}" alt=""><div class="shade"></div><h1>${text}</h1>${brand.name ? `<div class="brand">${html(brand.name)}</div>` : ''}</div>
</div>
<script src="gsap.min.js"></script><script>window.__timelines["thumb"]=gsap.timeline({paused:true});</script>
</body></html>`
}

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.content.features.register({
    id: 'thumbnail',
    title: 'Thumbnail',
    order: 8,
    summary: 'A telling frame with a short headline in your brand color, 1280x720.',
    actions: {
      make: {
        title: 'Make the thumbnail',
        description: 'Picks a representative frame and draws a headline of a few words over it (the given text, else the posts\' thumbnail text, else one the writer suggests, else the title).',
        input: { type: 'object', properties: { text: { type: 'string', description: 'The headline, at most 6 words' } }, additionalProperties: false },
        async run(context, input) {
          const project = context.project()
          const video = project.outputs.cut?.file ?? project.source?.file
          if (!video) throw new Refusal('invalid', 'bring a video first')
          let headline = typeof input.text === 'string' ? input.text.trim() : ''
          if (headline === '') headline = project.posts?.thumbnailText ?? ''
          if (headline === '' && project.transcript && serviceConfig(context.machine.root, 'writer')) {
            const answer = (await writeJson(context.machine.root, [
              { role: 'system', content: 'You write YouTube thumbnail headlines. Answer JSON only.' },
              { role: 'user', content: `Write one thumbnail headline of 2 to 5 words, in the video's language, that makes people click. The video says:\n${project.transcript.text.slice(0, 6000)}\nAnswer {"headline":"..."}` },
            ], context.signal)) as { headline?: string }
            headline = String(answer.headline ?? '').trim()
          }
          if (headline === '') headline = project.visuals.title || project.name
          context.progress(0.2, 'choosing a frame')
          const dir = compositionDir(context.path('render/thumbnail'))
          await ffmpeg(context.tools, ['-i', context.path(video), '-vf', 'thumbnail=300,scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720', '-frames:v', '1', join(dir, 'frame.png')], { signal: context.signal })
          writeFileSync(join(dir, 'index.html'), thumbnailHtml('frame.png', headline.split(/\s+/).slice(0, 8).join(' '), context.machine.brand()))
          context.progress(0.5, 'drawing the headline')
          const frames = join(dir, 'frames')
          await renderComposition(dir, frames, { signal: context.signal, format: 'png-sequence' })
          const first = readdirSync(frames).filter((f) => f.endsWith('.png')).sort()[0]
          if (!first) throw new Error('the renderer made no frame')
          renameSync(join(frames, first), context.path('thumbnail.png'))
          dropComposition(dir)
          context.update((p) => ({ outputs: { ...p.outputs, thumbnail: context.output('thumbnail.png') } }))
          return { file: 'thumbnail.png', headline }
        },
      },
    },
  }), 'content-thumbnail: the step')
}
