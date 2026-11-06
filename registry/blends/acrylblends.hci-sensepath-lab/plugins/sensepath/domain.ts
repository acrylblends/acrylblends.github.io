/**
 * Sensepath Lab's domain: six input modalities (speech, gesture, eye tracking, alternative input, haptics, a BCI concept), each with a scenario, three
 * variants, a calibration (variant, sensitivity, feedback style), a deterministic task simulation that yields synthetic completion and timing values with
 * their events, and saved observations that can be compared. Pure functions and plain data; the {@link Lab} in lab.ts applies them to the saved state.
 *
 * Everything is simulated. No microphone, camera, eye tracker, haptic device or biometric input is read, and the numbers are illustrative, not evidence.
 */

export class LabError extends Error {
  override readonly name = 'LabError'
  readonly code: 'invalid' | 'not-found' | 'conflict'
  constructor(code: 'invalid' | 'not-found' | 'conflict', message: string) {
    super(message)
    this.code = code
  }
}

export type ModalityId = 'speech' | 'gesture' | 'eye' | 'keyboard' | 'haptics' | 'bci'
export type FeedbackId = 'visual-text' | 'text' | 'haptic'

export interface Variant {
  readonly name: string
  readonly icon: string
}

export interface Modality {
  readonly id: ModalityId
  readonly name: string
  readonly icon: string
  readonly blurb: string
  readonly variants: readonly [Variant, Variant, Variant]
  readonly scenario: { readonly title: string; readonly description: string }
  /** The illustrative figures at the default calibration. */
  readonly completion: number
  readonly latency: number
  readonly observed: string
  readonly consideration: string
  readonly profile: string
  /** The glyph on the task stage's target. */
  readonly target: string
}

export const MODALITIES: readonly Modality[] = [
  {
    id: 'speech', name: 'Speech control', icon: '◖', blurb: 'Translate a spoken intention into a clear, reversible action.',
    variants: [{ name: 'Voice command', icon: '◖' }, { name: 'Dictation', icon: '≋' }, { name: 'Confirmation', icon: '✓' }],
    scenario: { title: 'Move to next section', description: 'The user asks the interface to move to the next section. A visible confirmation keeps the action predictable.' },
    completion: 92, latency: 1.4, observed: 'Command was understood on first attempt; confirmation was visible and reversible.',
    consideration: 'Provide a non-speech alternative for noisy environments and users who cannot speak.', profile: 'Speech · hands-free · confirmation required', target: '↗',
  },
  {
    id: 'gesture', name: 'Gesture recognition', icon: '✥', blurb: 'Map a deliberate gesture to a single, well-bounded command.',
    variants: [{ name: 'Point and select', icon: '☝' }, { name: 'Swipe', icon: '⇄' }, { name: 'Hold to confirm', icon: '◔' }],
    scenario: { title: 'Select the highlighted card', description: 'A hand gesture selects a card. The target must remain large and the action must not trigger from incidental movement.' },
    completion: 88, latency: 1.1, observed: 'Incidental movement did not trigger the selection; the target stayed large enough to hit.',
    consideration: 'Avoid relying on precise or sustained gestures; always offer a switch or keyboard alternative.', profile: 'Gesture · camera-free simulation · explicit action', target: '✥',
  },
  {
    id: 'eye', name: 'Eye tracking', icon: '◉', blurb: 'Use gaze as a pointer, with a separate confirmation action.',
    variants: [{ name: 'Gaze pointer', icon: '◉' }, { name: 'Dwell select', icon: '◎' }, { name: 'Switch confirm', icon: '✓' }],
    scenario: { title: 'Focus the navigation item', description: 'Gaze highlights a navigation item. Dwell time and a confirm step reduce accidental activation.' },
    completion: 84, latency: 0.9, observed: 'Dwell plus a confirm step avoided accidental activation while reading.',
    consideration: 'Do not equate looking with consent; provide adjustable dwell and explicit confirmation.', profile: 'Gaze · dwell + switch confirmation', target: '◉',
  },
  {
    id: 'keyboard', name: 'Alternative input', icon: '⌨', blurb: 'Navigate complex controls without requiring a pointer.',
    variants: [{ name: 'Tab navigation', icon: '⇥' }, { name: 'Switch scanning', icon: '⟳' }, { name: 'Shortcut keys', icon: '⌘' }],
    scenario: { title: 'Move focus through controls', description: 'A user advances through controls using a switch or keyboard. Focus order and visible focus state are essential.' },
    completion: 96, latency: 0.7, observed: 'Focus order followed the visual order and the focus ring stayed visible throughout.',
    consideration: 'Maintain logical focus order and never hide the active focus indicator.', profile: 'Keyboard / switch · sequential navigation', target: '⌨',
  },
  {
    id: 'haptics', name: 'Haptic interface', icon: '◌', blurb: 'Use a tactile cue to reinforce a system state.',
    variants: [{ name: 'Tap cue', icon: '◌' }, { name: 'Pulse pattern', icon: '≋' }, { name: 'Intensity ramp', icon: '▃' }],
    scenario: { title: 'Confirm the selected action', description: 'A short vibration confirms a selection. The same state must also be communicated visually or audibly.' },
    completion: 90, latency: 0.5, observed: 'The cue was noticed; the visual confirmation made the state unambiguous.',
    consideration: 'Haptics must be supplementary and adjustable, not the only feedback channel.', profile: 'Haptics · simulated tactile signal', target: '◌',
  },
  {
    id: 'bci', name: 'Brain-computer interface', icon: '∿', blurb: 'Explore abstract intent signals without interpreting real neural data.',
    variants: [{ name: 'Intent: select', icon: '∿' }, { name: 'Intent: back', icon: '↩' }, { name: 'Intent: pause', icon: '❚❚' }],
    scenario: { title: 'Choose an intent signal', description: 'A synthetic signal maps to one of three intents. This scenario is a UI concept, not a validated BCI.' },
    completion: 71, latency: 2.8, observed: 'The synthetic signal mapped to the wrong intent twice before settling; a confirm step recovered it.',
    consideration: 'Never infer medical, emotional or cognitive states from sample signal values.', profile: 'BCI concept · synthetic input only', target: '∿',
  },
]

export const FEEDBACK: Readonly<Record<FeedbackId, { label: string; completion: number; latency: number }>> = {
  'visual-text': { label: 'Visual + text confirmation', completion: 0, latency: 0 },
  text: { label: 'Text only', completion: -2, latency: -0.1 },
  haptic: { label: 'Haptic cue (simulated)', completion: -3, latency: 0.1 },
}

export const DEFAULT_SENSITIVITY = 72
export const MIN_SENSITIVITY = 10
export const MAX_SENSITIVITY = 100
/** At or above this completion a run counts as completed; below it the task was missed. */
export const PASS_COMPLETION = 75
export const MAX_RUNS = 40
export const MAX_OBSERVATIONS = 20

export interface Settings {
  /** Index into the modality's three variants. */
  readonly variant: number
  readonly sensitivity: number
  readonly feedback: FeedbackId
}

export const defaultSettings = (): Settings => ({ variant: 0, sensitivity: DEFAULT_SENSITIVITY, feedback: 'visual-text' })

export interface RunEvent {
  /** Milliseconds from the start of the run. */
  readonly t: number
  readonly label: string
}

export interface Run {
  readonly id: string
  readonly modality: ModalityId
  readonly settings: Settings
  readonly completion: number
  /** Seconds. */
  readonly latency: number
  readonly outcome: 'completed' | 'missed'
  readonly summary: string
  readonly events: readonly RunEvent[]
  readonly at: string
}

export interface Observation {
  readonly id: string
  readonly modality: ModalityId
  readonly runId: string
  readonly note: string
  readonly settings: Settings
  readonly completion: number
  readonly latency: number
  readonly at: string
}

export interface LabState {
  readonly version: 1
  readonly settings: Readonly<Record<ModalityId, Settings>>
  readonly runs: readonly Run[]
  readonly observations: readonly Observation[]
}

export const modalityOf = (id: string | undefined): Modality => {
  const m = MODALITIES.find((x) => x.id === id)
  if (m === undefined) throw new LabError('not-found', 'There is no such modality.')
  return m
}

const round1 = (n: number): number => Math.round(n * 10) / 10

/** Check what a form sent against the current settings: absent fields keep their value, bad ones are refused naming the field. */
export function parseSettings(raw: { variant?: string | undefined; sensitivity?: string | undefined; feedback?: string | undefined }, current: Settings): Settings {
  let { variant, sensitivity, feedback } = current
  if (raw.variant !== undefined) {
    const n = Number(raw.variant)
    if (!Number.isInteger(n) || n < 0 || n > 2) throw new LabError('invalid', 'Pick one of the three variants.')
    variant = n
  }
  if (raw.sensitivity !== undefined) {
    const n = Number(raw.sensitivity)
    if (!Number.isInteger(n) || n < MIN_SENSITIVITY || n > MAX_SENSITIVITY) throw new LabError('invalid', `Sensitivity must be a whole number from ${String(MIN_SENSITIVITY)} to ${String(MAX_SENSITIVITY)}%.`)
    sensitivity = n
  }
  if (raw.feedback !== undefined) {
    const found = (Object.keys(FEEDBACK) as FeedbackId[]).find((f) => f === raw.feedback)
    if (found === undefined) throw new LabError('invalid', 'Pick a feedback style from the list.')
    feedback = found
  }
  return { variant, sensitivity, feedback }
}

/**
 * The synthetic result of a task at a calibration. At the default calibration it is the modality's illustrative figure; a lower sensitivity misses
 * more (completion falls fast, the response is slower), a higher one triggers by accident (completion falls slowly, the response is faster); the
 * feedback style and the variant add small fixed offsets.
 */
export function simulate(m: Modality, s: Settings): { completion: number; latency: number; outcome: Run['outcome'] } {
  const fb = FEEDBACK[s.feedback]
  const cueMatches = m.id === 'haptics' && s.feedback === 'haptic'
  const penalty = s.sensitivity < DEFAULT_SENSITIVITY ? (DEFAULT_SENSITIVITY - s.sensitivity) * 0.5 : (s.sensitivity - DEFAULT_SENSITIVITY) * 0.25
  const variantC = [0, -2, 1][s.variant] ?? 0
  const variantL = [0, 0.2, 0.1][s.variant] ?? 0
  const completion = Math.round(Math.min(100, Math.max(0, m.completion + (cueMatches ? 0 : fb.completion) + variantC - penalty)))
  const latency = round1(Math.max(0.2, m.latency * (1 + (DEFAULT_SENSITIVITY - s.sensitivity) / 250) + (cueMatches ? 0 : fb.latency) + variantL))
  return { completion, latency, outcome: completion >= PASS_COMPLETION ? 'completed' : 'missed' }
}

/** The run's synthetic timing events. */
export function runEvents(latency: number, outcome: Run['outcome']): RunEvent[] {
  const ms = Math.round(latency * 1000)
  return [
    { t: 0, label: 'Scenario started' },
    { t: Math.round(ms * 0.6), label: 'Input recognised' },
    { t: ms, label: 'Feedback shown' },
    { t: ms + 200, label: outcome === 'completed' ? 'Task completed' : 'Task missed' },
  ]
}

export function runSummary(m: Modality, s: Settings, outcome: Run['outcome']): string {
  const how = `${m.variants[s.variant]?.name ?? ''} at ${String(s.sensitivity)}% sensitivity, ${FEEDBACK[s.feedback].label.toLowerCase()}`
  return outcome === 'completed'
    ? `Task completed using the ${m.name} profile (${how}). Synthetic response timing and completion values updated for this demo.`
    : `Task missed with the ${m.name} profile (${how}): the synthetic input was not recognised reliably. Raise the sensitivity or change the feedback.`
}

export interface Comparison {
  readonly a: Observation
  readonly b: Observation
  /** b minus a, in percentage points. */
  readonly completion: number
  /** b minus a, in seconds. */
  readonly latency: number
  readonly differences: string[]
}

export function compareObservations(a: Observation, b: Observation): Comparison {
  const differences: string[] = []
  if (a.modality !== b.modality) differences.push(`modality: ${modalityOf(a.modality).name} → ${modalityOf(b.modality).name}`)
  else if (a.settings.variant !== b.settings.variant) differences.push(`variant: ${modalityOf(a.modality).variants[a.settings.variant]?.name ?? ''} → ${modalityOf(b.modality).variants[b.settings.variant]?.name ?? ''}`)
  if (a.settings.sensitivity !== b.settings.sensitivity) differences.push(`sensitivity: ${String(a.settings.sensitivity)}% → ${String(b.settings.sensitivity)}%`)
  if (a.settings.feedback !== b.settings.feedback) differences.push(`feedback: ${FEEDBACK[a.settings.feedback].label} → ${FEEDBACK[b.settings.feedback].label}`)
  return { a, b, completion: b.completion - a.completion, latency: round1(b.latency - a.latency), differences }
}

/** `today 10:42`, `yesterday`, `Nov 2`. */
export function whenLabel(iso: string, now: Date): string {
  const at = new Date(iso)
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((day(now) - day(at)) / 86_400_000)
  if (days === 0) return `today ${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
  if (days === 1) return 'yesterday'
  return at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
