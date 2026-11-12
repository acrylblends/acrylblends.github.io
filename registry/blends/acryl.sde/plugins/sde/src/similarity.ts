/**
 * How much of the original text is still in the output: token shingles (5 tokens) compared per file (Jaccard), and the share of output files
 * that are byte-identical to their original. A measurement for the reviewer, not a legal statement: anonymization keeps the structure, so its
 * similarity is high by design; synthetic generation (a later step) is what lowers it.
 */
import { createHash } from 'node:crypto'

const SHINGLE = 5

function tokens(text: string): string[] {
  return text.match(/[A-Za-z_$][\w$]*|\d+|\S/gu) ?? []
}

function shingles(text: string): Set<string> {
  const list = tokens(text)
  const out = new Set<string>()
  for (let i = 0; i + SHINGLE <= list.length; i += 1) out.add(list.slice(i, i + SHINGLE).join(' '))
  return out
}

export function jaccard(a: string, b: string): number {
  const left = shingles(a)
  const right = shingles(b)
  if (left.size === 0 && right.size === 0) return a === b ? 1 : 0
  let shared = 0
  for (const item of left) if (right.has(item)) shared += 1
  return shared / (left.size + right.size - shared)
}

export interface SimilarityReport {
  readonly method: string
  readonly files: number
  readonly identicalFiles: number
  readonly meanJaccard: number
  readonly maxJaccard: number
  /** The files whose text did not change at all (nothing project-specific was found in them). */
  readonly unchangedShare: number
  readonly note: string
}

export function similarityReport(pairs: readonly { original: string; output: string }[]): SimilarityReport {
  let identical = 0
  let sum = 0
  let max = 0
  for (const { original, output } of pairs) {
    if (createHash('sha256').update(original).digest('hex') === createHash('sha256').update(output).digest('hex')) identical += 1
    const score = jaccard(original, output)
    sum += score
    max = Math.max(max, score)
  }
  const files = pairs.length
  return {
    method: `token shingles (${String(SHINGLE)} tokens), Jaccard per file; exact hash per file`,
    files,
    identicalFiles: identical,
    meanJaccard: files === 0 ? 0 : Number((sum / files).toFixed(4)),
    maxJaccard: Number(max.toFixed(4)),
    unchangedShare: files === 0 ? 0 : Number((identical / files).toFixed(4)),
    note: 'Anonymization keeps the code structure, so similarity to the original is expected to be high. It shows how much text stayed; it is not a measure of legal independence. Synthetic re-implementation (next step) is what lowers it.',
  }
}
