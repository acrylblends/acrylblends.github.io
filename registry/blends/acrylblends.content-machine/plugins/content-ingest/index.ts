/**
 * Step 1, bring the video: a file the person uploaded, a link to a media file, or a page yt-dlp knows (YouTube, Vimeo and many more). Whatever comes
 * in becomes the project's `source.mp4` (H.264, at most 1080p, a keyframe every second so the editor seeks quickly); an MP3 or a voice memo gets a
 * picture made from its sound wave. Alongside it: `audio.wav` (16 kHz mono, for transcription) and `peaks.json` (the waveform the screen draws).
 */
import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '../content/index.ts'
import { type ActionContext, available, ffmpeg, probe, Refusal, run, safeName, type Source } from '../content/index.ts'

export const name = 'content-ingest'
export const inject = ['content']

const MAX_BYTES = 8 * 1024 ** 3

/** The project's source made from any audio or video file: `source.mp4`, `audio.wav`, `peaks.json`. */
export async function normalize(context: ActionContext, input: string, origin: Pick<Source, 'originalName' | 'from' | 'url'>): Promise<Source> {
  const { tools, signal } = context
  context.progress(0.02, 'reading the file')
  const info = await probe(tools, input, signal)
  if (!info.hasAudio && !info.hasVideo) throw new Refusal('invalid', 'this file has neither sound nor picture')
  const out = context.path('source.mp4')
  const onTime = (t: number) => context.progress(0.05 + 0.75 * Math.min(1, t / info.duration), 'preparing the video')
  if (info.hasVideo) {
    await ffmpeg(tools, [
      '-i', input,
      // A video without sound gets a silent track, so every later step has sound to work on.
      ...(info.hasAudio ? [] : ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-shortest', '-map', '0:v', '-map', '1:a']),
      '-vf', "scale='min(1920,iw)':-2:flags=lanczos,fps=30,format=yuv420p",
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-g', '30', '-keyint_min', '30',
      '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
      '-movflags', '+faststart', out,
    ], { signal, onTime })
  } else {
    // A recording without a picture: its sound wave on a dark ground, so every later step has a video to work on.
    await ffmpeg(tools, [
      '-i', input, '-f', 'lavfi', '-i', 'color=c=0x15161a:s=1920x1080:r=30',
      '-filter_complex', '[0:a]aformat=channel_layouts=mono,showwaves=s=1600x360:mode=cline:rate=30:colors=0x8fa2ff[w];[1:v][w]overlay=(W-w)/2:(H-h)/2:shortest=1,format=yuv420p[v]',
      '-map', '[v]', '-map', '0:a', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-g', '30',
      '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-shortest', '-movflags', '+faststart', out,
    ], { signal, onTime })
  }
  const made = await probe(tools, out, signal)
  if (made.hasAudio) {
    context.progress(0.85, 'extracting the sound')
    await ffmpeg(tools, ['-i', out, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', context.path('audio.wav')], { signal })
    writeFileSync(context.path('peaks.json'), JSON.stringify(peaks(readFileSync(context.path('audio.wav')), 2000)))
  }
  return { file: 'source.mp4', ...origin, duration: made.duration, width: made.width, height: made.height, hasVideo: info.hasVideo, hasAudio: made.hasAudio }
}

/** The waveform: `count` peak levels (0..1) of a 16-bit mono WAV. */
export function peaks(wav: Uint8Array, count: number): number[] {
  const data = wav.subarray(44)
  const samples = Math.floor(data.length / 2)
  const view = new DataView(data.buffer, data.byteOffset, samples * 2)
  const per = Math.max(1, Math.floor(samples / count))
  const out: number[] = []
  for (let i = 0; i < samples && out.length < count; i += per) {
    let max = 0
    for (let j = i; j < Math.min(samples, i + per); j += 4) max = Math.max(max, Math.abs(view.getInt16(j * 2, true)))
    out.push(Math.round((max / 32768) * 1000) / 1000)
  }
  return out
}

/** A page yt-dlp should fetch rather than a plain file link. */
export const isPage = (url: URL): boolean => !/\.(mp4|mov|webm|mkv|m4v|mp3|wav|m4a|aac|ogg|flac)$/i.test(url.pathname)

async function download(context: ActionContext, raw: string): Promise<{ path: string; name: string }> {
  let url: URL
  try { url = new URL(raw) } catch { throw new Refusal('invalid', 'that is not a link') }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Refusal('invalid', 'only http and https links')
  const dir = context.path('download')
  rmSync(dir, { recursive: true, force: true })
  if (isPage(url)) {
    if (!(await available('yt-dlp'))) throw new Refusal('unavailable', 'this link is a page, not a media file: install yt-dlp (brew install yt-dlp, or pip install yt-dlp) to fetch videos from YouTube and similar sites')
    context.progress(0.01, 'downloading with yt-dlp')
    await run('yt-dlp', ['--no-playlist', '--newline', '-f', 'bv*[height<=1080]+ba/b[height<=1080]/b', '--merge-output-format', 'mp4', '-o', `${dir}/media.%(ext)s`, url.href], {
      signal: context.signal,
      onLine: (line) => {
        const match = /\[download\]\s+([\d.]+)%/.exec(line)
        if (match) context.progress(Number(match[1]) / 100 * 0.4, 'downloading')
      },
    })
    const file = readdirSync(dir).find((f) => f.startsWith('media.') && !f.endsWith('.part'))
    if (!file) throw new Error('yt-dlp finished without a file')
    return { path: `${dir}/${file}`, name: url.href }
  }
  context.progress(0.01, 'downloading')
  const response = await fetch(url, { signal: context.signal, redirect: 'follow' })
  if (!response.ok || !response.body) throw new Refusal('unavailable', `the link answered ${response.status}`)
  const length = Number(response.headers.get('content-length') ?? 0)
  if (length > MAX_BYTES) throw new Refusal('invalid', 'the file is larger than 8 GB')
  mkdirSync(dir, { recursive: true })
  const path = `${dir}/${safeName(url.pathname.split('/').pop() ?? 'media')}`
  await pipeline(Readable.fromWeb(response.body as never), createWriteStream(path), { signal: context.signal })
  return { path, name: url.pathname.split('/').pop() ?? url.href }
}

const reset = () => ({ transcript: undefined, removals: [], shorts: [], posts: undefined, outputs: {} })

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.content.features.register({
    id: 'ingest',
    title: 'Bring the video',
    order: 1,
    summary: 'A video or audio file, a link to one, or a YouTube (or similar) page.',
    actions: {
      upload: {
        title: 'Use the uploaded file',
        description: 'Makes the project\'s source from a file already uploaded into the project folder (the screen uploads it to uploads/<name>).',
        input: { type: 'object', properties: { file: { type: 'string', description: 'The uploaded file, uploads/<name>' } }, required: ['file'], additionalProperties: false },
        async run(context, input) {
          const file = typeof input.file === 'string' ? input.file : ''
          if (!file.startsWith('uploads/')) throw new Refusal('invalid', 'file is uploads/<name>')
          const path = context.path(file)
          if (!existsSync(path)) throw new Refusal('not_found', `${file} was not uploaded`)
          const source = await normalize(context, path, { originalName: file.slice('uploads/'.length), from: 'upload' })
          rmSync(context.path('uploads'), { recursive: true, force: true })
          return context.update(() => ({ source, ...reset() })).source
        },
      },
      link: {
        title: 'Fetch from a link',
        description: 'Downloads a video or audio from a link (a file, or a YouTube or similar page through yt-dlp) and makes it the project\'s source.',
        input: { type: 'object', properties: { url: { type: 'string', description: 'http(s) link' } }, required: ['url'], additionalProperties: false },
        async run(context, input) {
          const url = typeof input.url === 'string' ? input.url.trim() : ''
          const got = await download(context, url)
          const source = await normalize(
            { ...context, progress: (f, m) => context.progress(f === undefined ? undefined : 0.4 + f * 0.6, m) },
            got.path,
            { originalName: got.name, from: 'url', url },
          )
          rmSync(context.path('download'), { recursive: true, force: true })
          return context.update(() => ({ source, ...reset() })).source
        },
      },
    },
  }), 'content-ingest: the step')
}
