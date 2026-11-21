/**
 * Music domain: a step sequencer pattern. A pattern has a tempo, a length of 8 or 16 steps, and one row of steps per track, written as text:
 * `x` is a hit and `.` is a rest ("x...x...x...x..."). Four beats make a pattern, so on 16 steps a beat is 4 steps and on 8 steps it is 2.
 * Pure functions on plain data, no I/O. The sounds are synthesized in the browser; nothing here knows about audio.
 */

export class MusicError extends Error {
  constructor(message) {
    super(message)
    this.name = 'MusicError'
  }
}

export const TRACKS = ['kick', 'snare', 'clap', 'tom']
export const STEP_COUNTS = [8, 16]
export const TEMPO = { min: 40, max: 240 }
const VERSION_LIMIT = Number.MAX_SAFE_INTEGER - 1

const rest = steps => '.'.repeat(steps)

export function emptyPattern(steps = 16, tempo = 120) {
  return { tempo, steps, tracks: Object.fromEntries(TRACKS.map(track => [track, rest(steps)])) }
}

export function emptyState() {
  return { version: 1, pattern: emptyPattern(), saved: {} }
}

function requireTrack(track) {
  const name = String(track ?? '').trim().toLowerCase()
  if (!TRACKS.includes(name)) throw new MusicError(`unknown track "${String(track)}"; the tracks are ${TRACKS.join(', ')}`)
  return name
}

function requireTempo(tempo) {
  const bpm = Number(tempo)
  if (!Number.isFinite(bpm) || !Number.isInteger(bpm) || bpm < TEMPO.min || bpm > TEMPO.max) throw new MusicError(`tempo must be a whole number from ${TEMPO.min} to ${TEMPO.max} bpm`)
  return bpm
}

function requireRow(row, steps, track) {
  const text = String(row ?? '')
  if (text.length !== steps || !/^[x.]+$/u.test(text)) throw new MusicError(`${track} must be exactly ${steps} characters of x (hit) and . (rest)`)
  return text
}

/** A pattern from untrusted data (a saved file, the page): every field checked, unknown tracks dropped, missing tracks rests. */
export function checkPattern(input) {
  const steps = Number(input?.steps)
  if (!STEP_COUNTS.includes(steps)) throw new MusicError(`steps must be ${STEP_COUNTS.join(' or ')}`)
  const tracks = Object.fromEntries(TRACKS.map(track => [track, requireRow(input.tracks?.[track] ?? rest(steps), steps, track)]))
  return { tempo: requireTempo(input.tempo), steps, tracks }
}

const bump = state => ({ ...state, version: state.version >= VERSION_LIMIT ? 1 : state.version + 1 })

export function setPattern(state, input) {
  return bump({ ...state, pattern: checkPattern(input) })
}

export function setTempo(state, tempo) {
  return bump({ ...state, pattern: { ...state.pattern, tempo: requireTempo(tempo) } })
}

/** Change the length of the pattern: a longer one repeats the old steps, a shorter one keeps the first steps. */
export function setSteps(state, steps) {
  const count = Number(steps)
  if (!STEP_COUNTS.includes(count)) throw new MusicError(`steps must be ${STEP_COUNTS.join(' or ')}`)
  if (count === state.pattern.steps) return state
  const tracks = Object.fromEntries(Object.entries(state.pattern.tracks).map(([track, row]) => [track, count > row.length ? row.repeat(count / row.length) : row.slice(0, count)]))
  return bump({ ...state, pattern: { ...state.pattern, steps: count, tracks } })
}

/** One step of one track on or off. Steps count from 1. */
export function setStep(state, track, step, on) {
  const name = requireTrack(track)
  const at = Number(step)
  if (!Number.isInteger(at) || at < 1 || at > state.pattern.steps) throw new MusicError(`step must be a whole number from 1 to ${state.pattern.steps}`)
  const row = state.pattern.tracks[name]
  const next = `${row.slice(0, at - 1)}${on ? 'x' : '.'}${row.slice(at)}`
  return bump({ ...state, pattern: { ...state.pattern, tracks: { ...state.pattern.tracks, [name]: next } } })
}

export function setTrack(state, track, row) {
  const name = requireTrack(track)
  return bump({ ...state, pattern: { ...state.pattern, tracks: { ...state.pattern.tracks, [name]: requireRow(row, state.pattern.steps, name) } } })
}

export function clearTrack(state, track) {
  return setTrack(state, track, rest(state.pattern.steps))
}

/** Which steps a list of beats names: beat 1 is the first step, and each further beat is `steps / 4` later. Beats are 1 to 4, or 1.5 for the off-beat. */
export function stepsForBeats(beats, steps) {
  const list = (Array.isArray(beats) ? beats : String(beats ?? '').split(/[\s,;]+/u)).filter(item => String(item).trim() !== '')
  if (list.length === 0) throw new MusicError('name at least one beat, for example "2, 4"')
  return list.map(item => {
    const beat = Number(item)
    const position = (beat - 1) * steps / 4
    if (!Number.isFinite(beat) || beat < 1 || beat >= 5 || !Number.isInteger(position)) throw new MusicError(`beat "${String(item)}" is not a beat from 1 to 4 that falls on a step`)
    return position + 1
  })
}

/** Put hits on the beats named (a track keeps its other hits unless `replace` is true). */
export function setBeats(state, track, beats, { replace = false } = {}) {
  const name = requireTrack(track)
  let next = replace ? clearTrack(state, name) : state
  for (const step of stepsForBeats(beats, state.pattern.steps)) next = setStep(next, name, step, true)
  return next
}

const STYLES = {
  techno: { tempo: 128, kick: 'x...x...x...x...', snare: '....x.......x...', clap: '....x.......x...', tom: '..............x.' },
  house: { tempo: 124, kick: 'x...x...x...x...', snare: '................', clap: '....x.......x...', tom: '......x.......x.' },
  hiphop: { tempo: 90, kick: 'x.....x...x.....', snare: '....x.......x...', clap: '................', tom: '.............x..' },
  breakbeat: { tempo: 140, kick: 'x.....x...x...x.', snare: '....x..x....x...', clap: '................', tom: '...........x..x.' },
}
export const STYLE_NAMES = Object.keys(STYLES)

/** A ready-made 16-step pattern in a style, with its usual tempo. */
export function style(state, name) {
  const wanted = String(name ?? '').trim().toLowerCase().replace(/[\s-]+/gu, '')
  const found = STYLES[wanted]
  if (found === undefined) throw new MusicError(`unknown style "${String(name)}"; the styles are ${STYLE_NAMES.join(', ')}`)
  return setPattern(state, { tempo: found.tempo, steps: 16, tracks: { kick: found.kick, snare: found.snare, clap: found.clap, tom: found.tom } })
}

function requireName(name) {
  const text = String(name ?? '').trim()
  if (text === '' || text.length > 40) throw new MusicError('a pattern name is 1 to 40 characters')
  return text
}

export function savePattern(state, name) {
  const key = requireName(name)
  return bump({ ...state, saved: { ...state.saved, [key]: state.pattern } })
}

export function loadPattern(state, name) {
  const key = requireName(name)
  if (!Object.hasOwn(state.saved, key)) throw new MusicError(`no saved pattern "${key}"; saved: ${Object.keys(state.saved).join(', ') || '(none)'}`)
  return bump({ ...state, pattern: checkPattern(state.saved[key]) })
}

export function deletePattern(state, name) {
  const key = requireName(name)
  if (!Object.hasOwn(state.saved, key)) throw new MusicError(`no saved pattern "${key}"`)
  const saved = { ...state.saved }
  delete saved[key]
  return bump({ ...state, saved })
}

/** The pattern as text a person or an agent can read: tempo, steps, one line per track. */
export function describe(state) {
  const { pattern } = state
  const rows = TRACKS.map(track => `${track.padEnd(6)} ${pattern.tracks[track]}`)
  const ruler = `${' '.repeat(7)}${Array.from({ length: pattern.steps }, (_unused, index) => index % (pattern.steps / 4) === 0 ? String(index / (pattern.steps / 4) + 1) : ' ').join('')}`
  return [`${pattern.tempo} bpm, ${pattern.steps} steps`, ruler, ...rows].join('\n')
}

/** A state loaded from a file: every field checked, so a bad file is refused instead of half played. */
export function checkState(input) {
  if (!input || !Number.isInteger(input.version) || typeof input.saved !== 'object' || input.saved === null) throw new MusicError('not music data')
  return { version: input.version, pattern: checkPattern(input.pattern), saved: Object.fromEntries(Object.entries(input.saved).map(([name, pattern]) => [requireName(name), checkPattern(pattern)])) }
}
