/**
 * Step 2a, the transcript: what is said, with the time of every word, which the cut, the captions, the shorts and the posts all read. Two ways:
 * a speech-to-text API (any OpenAI-compatible `/audio/transcriptions`, set in Settings; OpenAI's whisper-1 gives word times), or a transcript or
 * subtitle file the person already has (SRT, VTT, or JSON). Nothing is downloaded and no model runs on this machine.
 *
 * A long recording is sent in pieces of 10 minutes (the APIs take about 25 MB per request), and the pieces' times are put back together.
 */
import { readFileSync, rmSync } from 'node:fs'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '../content/index.ts'
import { type ActionContext, ffmpeg, Refusal, serviceConfig, type Transcript } from '../content/index.ts'
import { fromApi, fromFile } from './transcript.ts'

export * from './transcript.ts'

export const name = 'content-transcribe'
export const inject = ['content']

const PIECE = 600

async function viaApi(context: ActionContext, language: string | undefined, fetcher: typeof fetch = fetch): Promise<Transcript> {
  const config = serviceConfig(context.machine.root, 'transcriber')
  if (!config) throw new Refusal('unavailable', 'no speech-to-text service is set: add one in Settings (an OpenAI key works), or import a transcript or subtitle file')
  const project = context.project()
  if (!project.source?.hasAudio) throw new Refusal('invalid', 'bring a video with sound first')
  const duration = project.source.duration
  const pieces = Math.max(1, Math.ceil(duration / PIECE))
  const words: Transcript['words'][number][] = []
  const segments: Transcript['segments'][number][] = []
  let text = ''
  let detected: string | undefined
  for (let i = 0; i < pieces; i++) {
    context.progress(i / pieces, pieces > 1 ? `transcribing part ${i + 1} of ${pieces}` : 'transcribing')
    const file = context.path(`piece-${i}.m4a`)
    await ffmpeg(context.tools, ['-ss', String(i * PIECE), '-t', String(PIECE), '-i', context.path('audio.wav'), '-c:a', 'aac', '-b:a', '48k', file], { signal: context.signal })
    const form = new FormData()
    form.append('file', new Blob([readFileSync(file)], { type: 'audio/mp4' }), `piece-${i}.m4a`)
    form.append('model', config.model)
    form.append('response_format', 'verbose_json')
    form.append('timestamp_granularities[]', 'word')
    form.append('timestamp_granularities[]', 'segment')
    // Asked to keep the fillers, so the cut can find them.
    form.append('prompt', 'Um, uh, so, like... Keep every filler word and every repeated sentence exactly as spoken.')
    if (language) form.append('language', language)
    const response = await fetcher(`${config.baseUrl.replace(/\/$/, '')}/audio/transcriptions`, {
      method: 'POST',
      headers: config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {},
      body: form,
      signal: context.signal,
    })
    rmSync(file, { force: true })
    const body = await response.text()
    if (!response.ok) throw new Refusal('unavailable', `the speech-to-text service answered ${response.status}: ${body.slice(0, 300)}`)
    const part = fromApi(JSON.parse(body) as Parameters<typeof fromApi>[0], i * PIECE)
    words.push(...part.words)
    segments.push(...part.segments)
    text = `${text} ${part.text}`.trim()
    detected ??= part.language
  }
  return { provider: 'api', text, segments, words, estimatedWords: false, ...(detected ? { language: detected } : {}) }
}

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.content.features.register({
    id: 'transcribe',
    title: 'Transcript',
    order: 2,
    summary: 'What is said, word by word: from a speech-to-text service, or a transcript or subtitle file you bring.',
    actions: {
      transcribe: {
        title: 'Transcribe',
        description: 'Sends the recording\'s sound to the speech-to-text service set in Settings and saves the transcript with word times.',
        input: { type: 'object', properties: { language: { type: 'string', description: 'Optional two-letter language code (en, de); detected when absent' } }, additionalProperties: false },
        async run(context, input) {
          const transcript = await viaApi(context, typeof input.language === 'string' && input.language !== '' ? input.language : undefined)
          context.update(() => ({ transcript, removals: [] }))
          return { words: transcript.words.length, segments: transcript.segments.length, language: transcript.language }
        },
      },
      import: {
        title: 'Use a transcript file',
        description: 'Reads an uploaded transcript or subtitle file (uploads/<name>: SRT, VTT, or JSON with words and times) as the transcript.',
        input: { type: 'object', properties: { file: { type: 'string', description: 'uploads/<name>' } }, required: ['file'], additionalProperties: false },
        run(context, input) {
          const file = typeof input.file === 'string' ? input.file : ''
          if (!file.startsWith('uploads/')) throw new Refusal('invalid', 'file is uploads/<name>')
          let made: Omit<Transcript, 'provider'>
          try {
            made = fromFile(file, readFileSync(context.path(file), 'utf8'))
          } catch (error) {
            throw new Refusal('invalid', error instanceof Error ? error.message : String(error))
          }
          rmSync(context.path('uploads'), { recursive: true, force: true })
          const transcript: Transcript = { provider: 'import', ...made }
          context.update(() => ({ transcript, removals: [] }))
          return { words: transcript.words.length, segments: transcript.segments.length, estimatedWords: transcript.estimatedWords }
        },
      },
    },
  }), 'content-transcribe: the step')
}
