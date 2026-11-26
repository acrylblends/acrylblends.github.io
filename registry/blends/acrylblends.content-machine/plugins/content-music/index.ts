/**
 * Step 4a, music and sound effects under the voice: a track from the library as a bed (looped to the cut's length, held low, ducked while someone
 * speaks), and a whoosh where two pieces of the cut meet. Both are mix stages of the cut's sound chain. With no music of your own, `make-bed` writes a
 * soft synthesized pad into the library (made by ffmpeg, no model, no download).
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '../content/index.ts'
import { ffmpeg, type Mix, type Project } from '../content/index.ts'

export const name = 'content-music'
export const inject = ['content']

/** Whooshes at joins at least 3 s apart, at most 40, so they mark scene changes instead of every trimmed pause. */
export function whooshTimes(joins: readonly number[], gap = 3, max = 40): number[] {
  const out: number[] = []
  for (const at of joins) if (at >= 0.5 && (out.length === 0 || at - out.at(-1)! >= gap) && out.length < max) out.push(at)
  return out
}

export function musicMix(project: Project, cut: { duration: number; joins: readonly number[]; root: string }, libraryFile: (name: string) => string): Mix | undefined {
  const track = project.music.track
  const whooshes = project.music.whooshOnCuts ? whooshTimes(cut.joins) : []
  if (!track && whooshes.length === 0) return undefined
  const inputs = [
    ...(track ? [{ args: ['-stream_loop', '-1', '-i', libraryFile(track)] }] : []),
    ...(whooshes.length > 0 ? [{ args: ['-f', 'lavfi', '-i', 'anoisesrc=d=0.6:c=pink:a=0.6:r=48000'] }] : []),
  ]
  return {
    inputs,
    graph(voice, first, out) {
      const parts: string[] = []
      const layers: string[] = []
      let next = first
      let speech = voice
      if (track) {
        const volume = Math.max(0, Math.min(1, project.music.volume))
        parts.push(`[${next}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:${cut.duration.toFixed(3)},asetpts=PTS-STARTPTS,volume=${volume.toFixed(3)},afade=t=out:st=${Math.max(0, cut.duration - 2).toFixed(3)}:d=2[bed]`)
        if (project.music.duck) {
          parts.push(`[${voice}]asplit=2[speech][key]`, '[bed][key]sidechaincompress=threshold=0.04:ratio=8:attack=20:release=400[ducked]')
          speech = 'speech'
          layers.push('ducked')
        } else layers.push('bed')
        next++
      }
      if (whooshes.length > 0) {
        parts.push(`[${next}:a]highpass=f=300,lowpass=f=5000,afade=t=in:d=0.3,afade=t=out:st=0.3:d=0.3,volume=0.5,aformat=channel_layouts=stereo,asplit=${whooshes.length}${whooshes.map((_, i) => `[w${i}]`).join('')}`)
        whooshes.forEach((at, i) => {
          const ms = Math.max(0, Math.round((at - 0.3) * 1000))
          parts.push(`[w${i}]adelay=${ms}|${ms}[wd${i}]`)
          layers.push(`wd${i}`)
        })
      }
      parts.push(`[${speech}]${layers.map((l) => `[${l}]`).join('')}amix=inputs=${layers.length + 1}:duration=first:normalize=0[${out}]`)
      return parts.join(';')
    },
  }
}

export function apply(ctx: Context): void {
  const machine = ctx.content
  ctx.effect(() => machine.audio.register({ id: 'music', order: 20, mix: (project, cut) => musicMix(project, cut, (file) => machine.libraryFile(file)) }), 'content-music: the mix stage')
  ctx.effect(() => machine.features.register({
    id: 'music',
    title: 'Music and effects',
    order: 5,
    summary: 'A music bed under the voice, ducked while you speak, and a whoosh where the cut changes scene.',
    actions: {
      'make-bed': {
        title: 'Make a soft music bed',
        description: 'Synthesizes a calm 60-second pad (a slow major chord) into the library as ambient-pad.m4a, for videos without music of their own.',
        async run(context) {
          const notes = [130.81, 164.81, 196.0, 261.63]
          const voice = notes.map((f, i) => `0.12*sin(2*PI*${f}*t)*(0.6+0.4*sin(2*PI*${(0.05 + i * 0.03).toFixed(2)}*t))`).join('+')
          await ffmpeg(context.tools, [
            '-f', 'lavfi', '-i', `aevalsrc='${voice}':s=48000:d=60`,
            '-af', 'lowpass=f=1800,aecho=0.8:0.7:90|180:0.25|0.15,afade=t=in:d=3,afade=t=out:st=57:d=3,aformat=channel_layouts=stereo',
            '-c:a', 'aac', '-b:a', '160k', `${machine.libraryDir}/ambient-pad.m4a`,
          ], { signal: context.signal })
          context.update((p) => ({ music: { ...p.music, track: 'ambient-pad.m4a' } }))
          return { track: 'ambient-pad.m4a' }
        },
      },
    },
  }), 'content-music: the step')
}
