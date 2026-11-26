/**
 * The cut as arithmetic, with no files: which stretches of the source stay, and where a source moment lands on the cut video's timeline. Every plugin
 * that places something in time (captions, shorts, whooshes) goes through here, so they all agree with the rendered cut.
 */
import type { Range, Removal, Segment, Word } from './model.ts'

/** The stretches that stay, in order, from the removals that are not kept, over a source of `duration` seconds. Overlaps merge; slivers under `minKeep` go. */
export function keptRanges(duration: number, removals: readonly Removal[], minKeep = 0.08): Range[] {
  const cuts = removals
    .filter((r) => !r.kept)
    .map((r) => ({ start: Math.max(0, r.start), end: Math.min(duration, r.end) }))
    .filter((r) => r.end > r.start)
    .sort((a, b) => a.start - b.start)
  const merged: Range[] = []
  for (const cut of cuts) {
    const last = merged.at(-1)
    if (last && cut.start <= last.end) merged[merged.length - 1] = { start: last.start, end: Math.max(last.end, cut.end) }
    else merged.push(cut)
  }
  const kept: Range[] = []
  let at = 0
  for (const cut of merged) {
    if (cut.start - at >= minKeep) kept.push({ start: at, end: cut.start })
    at = cut.end
  }
  if (duration - at >= minKeep) kept.push({ start: at, end: duration })
  return kept
}

export const lengthOf = (ranges: readonly Range[]): number => ranges.reduce((sum, r) => sum + (r.end - r.start), 0)

/** Where a source moment lands on the cut timeline, or undefined when it was cut out. */
export function toCut(kept: readonly Range[], t: number): number | undefined {
  let offset = 0
  for (const range of kept) {
    if (t >= range.start && t <= range.end) return offset + (t - range.start)
    offset += range.end - range.start
  }
  return undefined
}

/** The cut timeline's moments where two kept stretches meet: where a whoosh can go. */
export function joins(kept: readonly Range[]): number[] {
  const at: number[] = []
  let offset = 0
  for (const [index, range] of kept.entries()) {
    offset += range.end - range.start
    if (index < kept.length - 1) at.push(offset)
  }
  return at
}

/** The words that survive the cut, moved onto the cut timeline (a word cut in half keeps the part that stays). */
export function wordsOnCut(words: readonly Word[], kept: readonly Range[]): Word[] {
  const out: Word[] = []
  for (const word of words) {
    const mid = (word.start + word.end) / 2
    const start = toCut(kept, word.start) ?? toCut(kept, mid)
    const end = toCut(kept, word.end) ?? toCut(kept, mid)
    if (start === undefined || end === undefined) continue
    out.push({ text: word.text, start, end: Math.max(end, start + 0.05) })
  }
  return out
}

export interface Cue extends Range {
  readonly text: string
  readonly words: readonly Word[]
}

/** Caption cues: words grouped into short lines (at most `maxChars`), a new cue after a sentence end or a gap longer than `maxGap`. */
export function cues(words: readonly Word[], maxChars = 32, maxGap = 0.6): Cue[] {
  const out: Cue[] = []
  let line: Word[] = []
  const flush = () => {
    if (line.length === 0) return
    out.push({ start: line[0]!.start, end: line.at(-1)!.end, text: line.map((w) => w.text).join(' '), words: line })
    line = []
  }
  for (const word of words) {
    const last = line.at(-1)
    const text = [...line, word].map((w) => w.text).join(' ')
    if (last && (text.length > maxChars || word.start - last.end > maxGap || /[.!?]$/.test(last.text))) flush()
    line.push(word)
  }
  flush()
  return out
}

const two = (n: number) => String(n).padStart(2, '0')
export function srtTime(t: number): string {
  const ms = Math.round(t * 1000)
  return `${two(Math.floor(ms / 3_600_000))}:${two(Math.floor(ms / 60_000) % 60)}:${two(Math.floor(ms / 1000) % 60)},${String(ms % 1000).padStart(3, '0')}`
}

export function srt(list: readonly Cue[]): string {
  return list.map((cue, i) => `${i + 1}\n${srtTime(cue.start)} --> ${srtTime(cue.end)}\n${cue.text}\n`).join('\n')
}

/** Segments that survive, on the cut timeline: what a short or a post is chosen from. */
export function segmentsOnCut(segments: readonly Segment[], kept: readonly Range[]): Segment[] {
  const out: Segment[] = []
  for (const segment of segments) {
    const start = toCut(kept, segment.start) ?? firstKeptAfter(kept, segment.start)
    const end = toCut(kept, segment.end) ?? lastKeptBefore(kept, segment.end)
    if (start === undefined || end === undefined || end - start < 0.3) continue
    out.push({ text: segment.text, start, end })
  }
  return out
}

function firstKeptAfter(kept: readonly Range[], t: number): number | undefined {
  let offset = 0
  for (const range of kept) {
    if (range.start >= t) return offset
    offset += range.end - range.start
  }
  return undefined
}

function lastKeptBefore(kept: readonly Range[], t: number): number | undefined {
  let offset = 0
  let found: number | undefined
  for (const range of kept) {
    if (range.end <= t) found = offset + (range.end - range.start)
    offset += range.end - range.start
  }
  return found
}
