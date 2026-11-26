/**
 * Transcripts from what the speech-to-text APIs answer and from the subtitle files people bring, as one shape: lines (segments) and words with times.
 * A subtitle file has line times only; its words are spread over each line by their length and marked as estimated.
 */
import type { Segment, Transcript, Word } from '../content/index.ts'

interface ApiAnswer {
  readonly text?: string
  readonly language?: string
  readonly segments?: readonly { start: number; end: number; text: string }[]
  readonly words?: readonly { word?: string; text?: string; start: number; end: number }[]
}

/** An OpenAI-style `verbose_json` answer (whisper-1 with word and segment timestamps), shifted by `offset` seconds (for a chunk of a long recording). */
export function fromApi(answer: ApiAnswer, offset = 0): { segments: Segment[]; words: Word[]; text: string; language?: string } {
  const words: Word[] = (answer.words ?? [])
    .map((w) => ({ text: String(w.word ?? w.text ?? '').trim(), start: w.start + offset, end: w.end + offset }))
    .filter((w) => w.text !== '')
  const segments: Segment[] = (answer.segments ?? []).map((s) => ({ text: s.text.trim(), start: s.start + offset, end: s.end + offset })).filter((s) => s.text !== '')
  const filled = words.length > 0 ? words : segments.flatMap(spread)
  return { segments: segments.length > 0 ? segments : linesFromWords(filled), words: filled, text: (answer.text ?? segments.map((s) => s.text).join(' ')).trim(), ...(answer.language ? { language: answer.language } : {}) }
}

/** Words spread over a line in proportion to their length. */
export function spread(segment: Segment): Word[] {
  const parts = segment.text.split(/\s+/).filter(Boolean)
  const total = parts.reduce((sum, p) => sum + p.length + 1, 0)
  const span = segment.end - segment.start
  let at = segment.start
  return parts.map((text) => {
    const length = ((text.length + 1) / total) * span
    const word = { text, start: at, end: at + length }
    at += length
    return word
  })
}

/** Lines from words: a new line after a sentence end or a pause of 0.8 s. */
export function linesFromWords(words: readonly Word[]): Segment[] {
  const out: Segment[] = []
  let line: Word[] = []
  for (const word of words) {
    const last = line.at(-1)
    if (last && (/[.!?]$/.test(last.text) || word.start - last.end > 0.8)) {
      out.push({ text: line.map((w) => w.text).join(' '), start: line[0]!.start, end: last.end })
      line = []
    }
    line.push(word)
  }
  if (line.length > 0) out.push({ text: line.map((w) => w.text).join(' '), start: line[0]!.start, end: line.at(-1)!.end })
  return out
}

const time = (text: string): number => {
  const match = /(?:(\d+):)?(\d+):(\d+)[.,](\d+)/.exec(text.trim())
  if (!match) throw new Error(`not a time: ${text}`)
  return Number(match[1] ?? 0) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(`0.${match[4]}`)
}

/** SRT or WebVTT lines. */
export function fromSubtitles(text: string): Segment[] {
  const out: Segment[] = []
  for (const block of text.replace(/\r/g, '').split(/\n\s*\n/)) {
    const lines = block.split('\n').filter((l) => l.trim() !== '' && l.trim() !== 'WEBVTT')
    const at = lines.findIndex((l) => l.includes('-->'))
    if (at < 0) continue
    const [from, to] = lines[at]!.split('-->')
    const body = lines.slice(at + 1).join(' ').replace(/<[^>]+>/g, '').trim()
    if (body === '') continue
    out.push({ start: time(from!), end: time(to!.trim().split(/\s/)[0]!), text: body })
  }
  return out
}

/** Any transcript file: SRT, VTT, or JSON (a speech API's verbose_json, or `{ "words": [{ "text", "start", "end" }] }`). */
export function fromFile(name: string, content: string): Omit<Transcript, 'provider'> {
  if (/\.json$/i.test(name)) {
    const data = JSON.parse(content) as ApiAnswer
    const made = fromApi(data)
    if (made.words.length === 0) throw new Error('the JSON has no words or segments with start and end times')
    return { ...made, estimatedWords: (data.words ?? []).length === 0 }
  }
  const segments = fromSubtitles(content)
  if (segments.length === 0) throw new Error('no subtitle lines found (SRT or WebVTT)')
  return { text: segments.map((s) => s.text).join(' '), segments, words: segments.flatMap(spread), estimatedWords: true }
}
