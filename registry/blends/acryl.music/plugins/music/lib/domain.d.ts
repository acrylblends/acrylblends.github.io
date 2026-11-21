// Types for lib/domain.js, which stays exactly as the earlier ACRYL-app starter had it (pure code, no framework).
export class MusicError extends Error {}
export const TRACKS: string[]
export const STEP_COUNTS: number[]
export const TEMPO: { min: number; max: number }
export const STYLE_NAMES: string[]
export interface Pattern { tempo: number; steps: number; tracks: Record<string, string> }
export interface MusicState { version: number; pattern: Pattern; saved: Record<string, Pattern> }
export function emptyPattern(steps?: number, tempo?: number): Pattern
export function emptyState(): MusicState
export function checkPattern(input: unknown): Pattern
export function checkState(input: unknown): MusicState
export function setPattern(state: MusicState, input: unknown): MusicState
export function setTempo(state: MusicState, tempo: unknown): MusicState
export function setSteps(state: MusicState, steps: unknown): MusicState
export function setStep(state: MusicState, track: unknown, step: unknown, on: unknown): MusicState
export function setTrack(state: MusicState, track: unknown, row: unknown): MusicState
export function clearTrack(state: MusicState, track: unknown): MusicState
export function setBeats(state: MusicState, track: unknown, beats: unknown, options?: { replace?: boolean }): MusicState
export function stepsForBeats(beats: unknown, steps: number): number[]
export function style(state: MusicState, name: unknown): MusicState
export function savePattern(state: MusicState, name: unknown): MusicState
export function loadPattern(state: MusicState, name: unknown): MusicState
export function deletePattern(state: MusicState, name: unknown): MusicState
export function describe(state: MusicState): string
