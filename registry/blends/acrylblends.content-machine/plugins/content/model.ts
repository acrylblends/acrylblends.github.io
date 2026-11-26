/**
 * The content machine's domain words, one type each: a project is one recording on its way to a finished video and everything made from it. Times are
 * seconds on the source recording unless a name says otherwise (`cutStart` is on the cut video's timeline).
 */

/** A stretch of the source, in seconds. */
export interface Range {
  readonly start: number
  readonly end: number
}

/** Why a stretch is suggested for removal: a pause, a filler word ("um"), an earlier take of a sentence said again, or the person's own choice. */
export type CutReason = 'silence' | 'filler' | 'retake' | 'manual'

export interface Removal extends Range {
  readonly id: string
  readonly reason: CutReason
  /** The words removed, for the transcript view (empty for a pause). */
  readonly text: string
  /** The person kept it after all: the suggestion stays listed, struck out of the cut no more. */
  readonly kept: boolean
}

export interface Word extends Range {
  readonly text: string
}

export interface Segment extends Range {
  readonly text: string
}

export interface Transcript {
  /** Which transcriber made it: `api` (a speech-to-text API), `import` (a subtitle or transcript file the person brought). */
  readonly provider: string
  readonly language?: string
  readonly text: string
  readonly segments: readonly Segment[]
  readonly words: readonly Word[]
  /** True when the word times were spread over each line by length (an imported subtitle file has line times only). */
  readonly estimatedWords: boolean
}

export interface Source {
  /** The file in the project folder. */
  readonly file: string
  readonly originalName: string
  readonly from: 'upload' | 'url' | 'file'
  readonly url?: string
  readonly duration: number
  readonly width: number
  readonly height: number
  readonly hasVideo: boolean
  readonly hasAudio: boolean
}

export type SoundPreset = 'off' | 'clean' | 'podcast'
export type CaptionStyle = 'bold' | 'karaoke' | 'minimal'

export interface EditSettings {
  /** Pauses longer than this are shortened (seconds). */
  readonly silenceMin: number
  /** How quiet counts as a pause (dB). */
  readonly silenceDb: number
  readonly cutFillers: boolean
  readonly cutRetakes: boolean
}

export interface SoundSettings {
  readonly preset: SoundPreset
}

export interface CaptionSettings {
  readonly enabled: boolean
  readonly style: CaptionStyle
}

export interface MusicSettings {
  /** A file in the app's library (`library/<file>`), or none. */
  readonly track?: string
  /** 0..1, the music's level under the voice. */
  readonly volume: number
  readonly duck: boolean
  readonly whooshOnCuts: boolean
}

/** A picture or clip laid over the video for a while (b-roll), from the library. */
export interface Overlay {
  readonly id: string
  readonly file: string
  readonly kind: 'image' | 'video'
  /** On the cut video's timeline. */
  readonly at: number
  readonly duration: number
}

export interface VisualSettings {
  /** A title card over the first seconds; empty text: none. */
  readonly title: string
  readonly subtitle: string
  readonly punchIns: boolean
  readonly progressBar: boolean
  readonly overlays: readonly Overlay[]
}

/** A file the machine made, in the project folder. */
export interface Output {
  readonly file: string
  readonly at: string
  readonly bytes: number
  readonly duration?: number
}

/** One short: a stretch of the cut video, vertical, with its own title. */
export interface Short {
  readonly id: string
  readonly title: string
  /** On the cut video's timeline. */
  readonly start: number
  readonly end: number
  readonly output?: Output
}

export interface Posts {
  readonly youtube: { readonly title: string; readonly description: string; readonly tags: readonly string[] }
  readonly linkedin: string
  readonly instagram: string
  readonly x: string
  readonly thumbnailText: string
  readonly at: string
}

export interface Project {
  readonly id: string
  readonly name: string
  readonly createdAt: string
  readonly updatedAt: string
  /** Every change adds one: a change sent with an older revision is refused instead of overwriting someone else's. */
  readonly revision: number
  readonly source?: Source
  readonly transcript?: Transcript
  readonly edit: EditSettings
  readonly removals: readonly Removal[]
  readonly sound: SoundSettings
  readonly captions: CaptionSettings
  readonly music: MusicSettings
  readonly visuals: VisualSettings
  readonly shorts: readonly Short[]
  readonly posts?: Posts
  readonly outputs: {
    readonly cut?: Output
    readonly final?: Output
    readonly captions?: Output
    readonly thumbnail?: Output
  }
}

/** What the business is: the posts, titles and the title card speak for it. */
export interface Brand {
  readonly name: string
  readonly about: string
  readonly audience: string
  readonly tone: string
  /** Prices and offers to mention when they fit ("Workshop 25 Oct, 9:00-20:00, 290 EUR"). */
  readonly offers: string
  readonly callToAction: string
  readonly links: string
  /** The accent color of titles and captions. */
  readonly color: string
}

export const DEFAULT_BRAND: Brand = {
  name: '',
  about: '',
  audience: '',
  tone: 'clear, warm, no hype',
  offers: '',
  callToAction: '',
  links: '',
  color: '#3652D9',
}

export const DEFAULT_EDIT: EditSettings = { silenceMin: 0.7, silenceDb: -35, cutFillers: true, cutRetakes: true }

export type JobStatus = 'running' | 'done' | 'failed' | 'stopped'

export interface Job {
  readonly id: string
  readonly projectId: string
  readonly feature: string
  readonly action: string
  readonly title: string
  readonly status: JobStatus
  /** 0..1 when the step knows how far it is. */
  readonly progress?: number
  readonly message: string
  readonly startedAt: string
  readonly endedAt?: string
}

/** A refusal the caller can act on: `not_found`, `invalid` (fix the input), `conflict` (read again, or wait for the running job), `unavailable` (a tool or key is missing). */
export class Refusal extends Error {
  readonly code: 'not_found' | 'invalid' | 'conflict' | 'unavailable'
  constructor(code: 'not_found' | 'invalid' | 'conflict' | 'unavailable', message: string) {
    super(message)
    this.name = 'Refusal'
    this.code = code
  }
}
