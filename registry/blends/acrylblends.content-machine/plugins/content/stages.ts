/**
 * The cut's sound as a chain other plugins add to: the sound plugin cleans the voice (a filter on it), the music plugin lays a bed and whooshes under it
 * (more inputs, mixed in). The cut plugin asks every stage that is registered when it renders, in order; a stage switched off is simply not there.
 */
import type { Project } from './model.ts'

export interface MixInput {
  /** ffmpeg input arguments for one input (`['-stream_loop', '-1', '-i', file]`). */
  readonly args: readonly string[]
}

export interface Mix {
  readonly inputs: readonly MixInput[]
  /**
   * The filter graph that takes the voice (`[voice]`) and this mix's inputs (`[<first>:a]`, `[<first+1>:a]` ...) to one labelled output `[out]`. The
   * labels are rewritten by the caller, so a stage names only `voice`, `out` and its own inputs by index.
   */
  graph(voice: string, firstInput: number, out: string): string
}

export interface AudioStage {
  readonly id: string
  readonly order: number
  /** A filter chain for the voice alone (`highpass=f=80,loudnorm`), or nothing. */
  voice?(project: Project): string | undefined
  /** Inputs to mix under the voice, given the cut's length and where its pieces join, or nothing. */
  mix?(project: Project, cut: { readonly duration: number; readonly joins: readonly number[]; readonly root: string }): Mix | undefined
}

export class Stages<T extends { readonly id: string; readonly order: number }> {
  private readonly items = new Map<string, T>()
  register(stage: T): () => void {
    this.items.set(stage.id, stage)
    return () => {
      if (this.items.get(stage.id) === stage) this.items.delete(stage.id)
    }
  }
  list(): T[] {
    return [...this.items.values()].sort((a, b) => a.order - b.order)
  }
}
