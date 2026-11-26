/**
 * What to cut, decided from the transcript and the pauses, with no files: filler words ("um", "uh"), earlier takes of a sentence said again (the last
 * take stays), and long pauses (shortened, not removed, so the speech keeps its breath). Each suggestion carries its reason and its words; the person
 * keeps any of them with one click.
 */
import type { EditSettings, Removal, Segment, Word } from '../content/index.ts'

const FILLER = /^(u+m+|u+h+|e+r+m*|a+h+|h+m+|m+h*m+|uh-huh)[,.!?…]*$/i

export function fillers(words: readonly Word[]): Omit<Removal, 'id'>[] {
  return words
    .filter((w) => FILLER.test(w.text.trim()))
    .map((w) => ({ start: Math.max(0, w.start - 0.03), end: w.end + 0.03, reason: 'filler' as const, text: w.text, kept: false }))
}

const norm = (text: string): string[] => text.toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, ' ').split(/\s+/).filter((t) => t !== '' && !FILLER.test(t))

/** How alike two lines are: the share of the shorter line's words found, in order, in the longer one. */
export function likeness(a: string, b: string): number {
  const x = norm(a)
  const y = norm(b)
  if (x.length === 0 || y.length === 0) return 0
  const [short, long] = x.length <= y.length ? [x, y] : [y, x]
  let found = 0
  let at = 0
  for (const word of short) {
    const next = long.indexOf(word, at)
    if (next >= 0) { found++; at = next + 1 }
  }
  return found / short.length
}

/** Earlier takes: a line followed (within the next two lines) by one that says the same again; the earlier one goes. */
export function retakes(segments: readonly Segment[]): Omit<Removal, 'id'>[] {
  const out: Omit<Removal, 'id'>[] = []
  for (let i = 0; i < segments.length; i++) {
    const line = segments[i]!
    if (norm(line.text).length < 3) continue
    for (let j = i + 1; j <= Math.min(i + 2, segments.length - 1); j++) {
      if (likeness(line.text, segments[j]!.text) >= 0.75) {
        // The earlier take goes with the pause after it, up to just before the take that stays.
        out.push({ start: line.start, end: Math.max(line.end, segments[j]!.start - 0.05), reason: 'retake', text: line.text, kept: false })
        break
      }
    }
  }
  return out
}

/** Pauses shortened to a breath: `pad` seconds stay on each side. */
export function pauses(silences: readonly { start: number; end: number }[], pad = 0.12): Omit<Removal, 'id'>[] {
  return silences
    .map((s) => ({ start: s.start + pad, end: s.end - pad }))
    .filter((s) => s.end - s.start > 0.15)
    .map((s) => ({ ...s, reason: 'silence' as const, text: '', kept: false }))
}

/** All suggestions, by time, each with a stable id; a pause inside an earlier take is dropped (the take covers it). */
export function suggest(
  words: readonly Word[],
  segments: readonly Segment[],
  silences: readonly { start: number; end: number }[],
  settings: EditSettings,
): Removal[] {
  const takes = settings.cutRetakes ? retakes(segments) : []
  const inside = (r: { start: number; end: number }) => takes.some((t) => r.start >= t.start - 0.01 && r.end <= t.end + 0.01)
  const all = [
    ...takes,
    ...(settings.cutFillers ? fillers(words).filter((r) => !inside(r)) : []),
    ...pauses(silences).filter((r) => !inside(r)),
  ].sort((a, b) => a.start - b.start)
  return all.map((r, i) => ({ ...r, id: `r${i + 1}` }))
}
