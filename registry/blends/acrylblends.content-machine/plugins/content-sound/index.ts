/**
 * Step 3, the sound: a phone recording made to sound like a podcast, with ffmpeg's own filters and no model. `clean` takes away rumble and room noise,
 * evens the level and sets the loudness platforms expect (-16 LUFS); `podcast` also warms the voice and brings it forward. The chosen preset is a
 * voice stage of the cut's sound chain, so the cut is rendered with it. `preview` makes 20 seconds before and after, to hear the difference.
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '../content/index.ts'
import { ffmpeg, type Project, Refusal, type SoundPreset } from '../content/index.ts'

export const name = 'content-sound'
export const inject = ['content']

export const PRESETS: Record<Exclude<SoundPreset, 'off'>, string> = {
  clean: 'highpass=f=80,afftdn=nr=12:nf=-35,acompressor=threshold=-20dB:ratio=3:attack=10:release=120:makeup=2,loudnorm=I=-16:TP=-1.5:LRA=11',
  podcast:
    'highpass=f=80,lowpass=f=14000,afftdn=nr=14:nf=-35,equalizer=f=200:t=q:w=1:g=-2,equalizer=f=3500:t=q:w=1.2:g=3,acompressor=threshold=-22dB:ratio=4:attack=5:release=100:makeup=3,loudnorm=I=-16:TP=-1.5:LRA=9',
}

export const voiceFilter = (project: Project): string | undefined => (project.sound.preset === 'off' ? undefined : PRESETS[project.sound.preset])

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.content.audio.register({ id: 'sound', order: 10, voice: voiceFilter }), 'content-sound: the voice stage')
  ctx.effect(() => ctx.content.features.register({
    id: 'sound',
    title: 'Sound',
    order: 4,
    summary: 'Room noise and rumble taken away, the level evened, loudness set for every platform.',
    actions: {
      preview: {
        title: 'Hear before and after',
        description: 'Makes two 20-second clips from the middle of the recording, before and after the chosen sound preset (preview-before.m4a, preview-after.m4a).',
        async run(context) {
          const project = context.project()
          if (!project.source?.hasAudio) throw new Refusal('invalid', 'bring a video with sound first')
          const start = Math.max(0, project.source.duration / 2 - 10)
          const common = ['-ss', String(start), '-t', '20', '-i', context.path(project.source.file), '-vn']
          await ffmpeg(context.tools, [...common, '-c:a', 'aac', '-b:a', '160k', context.path('preview-before.m4a')], { signal: context.signal })
          context.progress(0.5, 'cleaning')
          const filter = voiceFilter(project)
          await ffmpeg(context.tools, [...common, ...(filter ? ['-af', filter] : []), '-c:a', 'aac', '-b:a', '160k', context.path('preview-after.m4a')], { signal: context.signal })
          return { before: 'preview-before.m4a', after: 'preview-after.m4a', preset: project.sound.preset }
        },
      },
    },
  }), 'content-sound: the step')
}
