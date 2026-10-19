import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as m from '../lib/domain.js'

test('an empty pattern is 16 rests on every track at 120 bpm', () => {
  const state = m.emptyState()
  assert.equal(state.pattern.tempo, 120)
  assert.equal(state.pattern.steps, 16)
  for (const track of m.TRACKS) assert.equal(state.pattern.tracks[track], '.'.repeat(16))
})

test('every style is a valid 16-step pattern with its own tempo', () => {
  for (const name of m.STYLE_NAMES) {
    const state = m.style(m.emptyState(), name)
    assert.equal(state.pattern.steps, 16)
    assert.doesNotThrow(() => m.checkPattern(state.pattern))
  }
  assert.equal(m.style(m.emptyState(), 'Techno').pattern.tempo, 128)
  assert.equal(m.style(m.emptyState(), 'hip-hop').pattern.tempo, 90)
  assert.throws(() => m.style(m.emptyState(), 'polka'), /unknown style "polka"/)
})

test('tempo is a whole number of bpm inside the range', () => {
  assert.equal(m.setTempo(m.emptyState(), 90).pattern.tempo, 90)
  assert.equal(m.setTempo(m.emptyState(), '140').pattern.tempo, 140)
  for (const bad of [39, 241, 120.5, 'fast', NaN, undefined]) assert.throws(() => m.setTempo(m.emptyState(), bad), /tempo must be/)
})

test('beats land on steps: on 16 steps beats 2 and 4 are steps 5 and 13, on 8 steps 3 and 7', () => {
  assert.deepEqual(m.stepsForBeats('2, 4', 16), [5, 13])
  assert.deepEqual(m.stepsForBeats([1, 3], 16), [1, 9])
  assert.deepEqual(m.stepsForBeats('2 4', 8), [3, 7])
  assert.deepEqual(m.stepsForBeats('1.5', 8), [2])
  assert.throws(() => m.stepsForBeats('1.5', 1), /falls on a step/)
  assert.throws(() => m.stepsForBeats('5', 16), /not a beat/)
  assert.throws(() => m.stepsForBeats('', 16), /at least one beat/)
})

test('a snare on 2 and 4 puts hits on steps 5 and 13 and keeps the other hits', () => {
  let state = m.setStep(m.emptyState(), 'snare', 1, true)
  state = m.setBeats(state, 'snare', '2, 4')
  assert.equal(state.pattern.tracks.snare, 'x...x.......x...')
  assert.equal(m.setBeats(state, 'snare', '3', { replace: true }).pattern.tracks.snare, '........x.......')
})

test('a step is switched on and off, counted from 1, and a bad step or track is refused', () => {
  let state = m.setStep(m.emptyState(), 'kick', 3, true)
  assert.equal(state.pattern.tracks.kick, '..x.............')
  state = m.setStep(state, 'kick', 3, false)
  assert.equal(state.pattern.tracks.kick, '.'.repeat(16))
  assert.throws(() => m.setStep(state, 'kick', 0, true), /from 1 to 16/)
  assert.throws(() => m.setStep(state, 'kick', 17, true), /from 1 to 16/)
  assert.throws(() => m.setStep(state, 'cowbell', 1, true), /unknown track "cowbell"/)
})

test('a whole track is set from text of the right length', () => {
  assert.equal(m.setTrack(m.emptyState(), 'kick', 'x...x...x...x...').pattern.tracks.kick, 'x...x...x...x...')
  assert.throws(() => m.setTrack(m.emptyState(), 'kick', 'x..'), /exactly 16 characters/)
  assert.throws(() => m.setTrack(m.emptyState(), 'kick', 'x...x...x...x..1'), /exactly 16 characters/)
})

test('switching to 8 steps keeps the first steps, and back to 16 repeats them', () => {
  let state = m.setTrack(m.emptyState(), 'kick', 'x...x...x...x...')
  state = m.setSteps(state, 8)
  assert.equal(state.pattern.tracks.kick, 'x...x...')
  assert.equal(state.pattern.tracks.snare.length, 8)
  assert.equal(m.setSteps(state, 16).pattern.tracks.kick, 'x...x...x...x...')
  assert.throws(() => m.setSteps(state, 12), /steps must be 8 or 16/)
})

test('every change moves the version, so a page can tell its copy is old', () => {
  const first = m.emptyState()
  assert.equal(m.setTempo(first, 100).version, first.version + 1)
  assert.equal(m.setStep(first, 'kick', 1, true).version, first.version + 1)
  assert.equal(m.setSteps(first, 16), first)
})

test('patterns are saved by name, loaded and deleted', () => {
  let state = m.style(m.emptyState(), 'techno')
  state = m.savePattern(state, 'Warehouse')
  state = m.setTempo(state, 100)
  assert.equal(state.pattern.tempo, 100)
  state = m.loadPattern(state, 'Warehouse')
  assert.equal(state.pattern.tempo, 128)
  assert.deepEqual(Object.keys(state.saved), ['Warehouse'])
  assert.throws(() => m.loadPattern(state, 'Nope'), /no saved pattern "Nope"; saved: Warehouse/)
  assert.throws(() => m.savePattern(state, '  '), /1 to 40 characters/)
  state = m.deletePattern(state, 'Warehouse')
  assert.deepEqual(state.saved, {})
  assert.throws(() => m.deletePattern(state, 'Warehouse'), /no saved pattern/)
  assert.throws(() => m.loadPattern(state, '__proto__'), /no saved pattern/)
})

test('a bad pattern from a file or the page is refused, an unknown track dropped', () => {
  assert.throws(() => m.checkPattern({ tempo: 120, steps: 12, tracks: {} }), /steps must be/)
  assert.throws(() => m.checkPattern({ tempo: 5, steps: 16, tracks: {} }), /tempo must be/)
  assert.throws(() => m.checkPattern({ tempo: 120, steps: 16, tracks: { kick: 'xx' } }), /kick must be exactly 16/)
  const ok = m.checkPattern({ tempo: 120, steps: 8, tracks: { kick: 'x.......', cowbell: 'x.......' } })
  assert.deepEqual(Object.keys(ok.tracks), m.TRACKS)
  assert.equal(ok.tracks.snare, '........')
  assert.throws(() => m.checkState({ version: 1, pattern: m.emptyPattern(), saved: null }), /not music data/)
})

test('describe prints the tempo, a beat ruler and one line per track', () => {
  const text = m.describe(m.style(m.emptyState(), 'techno'))
  assert.match(text, /^128 bpm, 16 steps\n {7}1 {3}2 {3}3 {3}4 {3}\nkick {3}x\.\.\.x\.\.\.x\.\.\.x\.\.\./)
})
