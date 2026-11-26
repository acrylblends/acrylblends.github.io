/**
 * A project's settings as people and the agent change them, checked field by field: the screen's API and the agent's tool both go through
 * `settingsChange`, so they accept and refuse the same things.
 */
import type { Machine } from './machine.ts'
import { type CaptionStyle, type Project, Refusal, type SoundPreset } from './model.ts'

export const pick = <T extends string>(value: unknown, allowed: readonly T[], field: string): T => {
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return value as T
  throw new Refusal('invalid', `${field} is one of ${allowed.join(', ')}`)
}
export const num = (value: unknown, min: number, max: number, field: string): number => {
  const n = Number(value)
  if (!Number.isFinite(n) || n < min || n > max) throw new Refusal('invalid', `${field} is a number from ${min} to ${max}`)
  return n
}
export const bool = (value: unknown, field: string): boolean => {
  if (typeof value !== 'boolean') throw new Refusal('invalid', `${field} is true or false`)
  return value
}
export const str = (value: unknown, max: number, field: string): string => {
  if (typeof value !== 'string') throw new Refusal('invalid', `${field} is text`)
  return value.slice(0, max)
}

/**
 * A settings change, checked field by field, and what it makes old: a change to what is cut or heard makes the cut (and the finished video) old; a
 * change to what is drawn makes only the finished video old.
 */
export function settingsChange(machine: Machine, project: Project, body: Record<string, unknown>): Partial<Project> {
  const change: { -readonly [K in keyof Project]?: Project[K] } = {}
  let cutOld = false
  let finalOld = false
  if (body.name !== undefined) {
    const name = str(body.name, 120, 'name').trim()
    if (name === '') throw new Refusal('invalid', 'name is required')
    change.name = name
  }
  if (body.edit !== undefined) {
    const e = body.edit as Record<string, unknown>
    change.edit = {
      silenceMin: e.silenceMin === undefined ? project.edit.silenceMin : num(e.silenceMin, 0.2, 5, 'edit.silenceMin'),
      silenceDb: e.silenceDb === undefined ? project.edit.silenceDb : num(e.silenceDb, -70, -10, 'edit.silenceDb'),
      cutFillers: e.cutFillers === undefined ? project.edit.cutFillers : bool(e.cutFillers, 'edit.cutFillers'),
      cutRetakes: e.cutRetakes === undefined ? project.edit.cutRetakes : bool(e.cutRetakes, 'edit.cutRetakes'),
    }
  }
  if (body.sound !== undefined) {
    change.sound = { preset: pick<SoundPreset>((body.sound as Record<string, unknown>).preset, ['off', 'clean', 'podcast'], 'sound.preset') }
    cutOld = true
  }
  if (body.music !== undefined) {
    const m = body.music as Record<string, unknown>
    const track = m.track === undefined ? project.music.track : m.track === null || m.track === '' ? undefined : str(m.track, 160, 'music.track')
    if (track !== undefined) machine.libraryFile(track)
    change.music = {
      ...(track === undefined ? {} : { track }),
      volume: m.volume === undefined ? project.music.volume : num(m.volume, 0, 1, 'music.volume'),
      duck: m.duck === undefined ? project.music.duck : bool(m.duck, 'music.duck'),
      whooshOnCuts: m.whooshOnCuts === undefined ? project.music.whooshOnCuts : bool(m.whooshOnCuts, 'music.whooshOnCuts'),
    }
    cutOld = true
  }
  if (body.captions !== undefined) {
    const k = body.captions as Record<string, unknown>
    change.captions = {
      enabled: k.enabled === undefined ? project.captions.enabled : bool(k.enabled, 'captions.enabled'),
      style: k.style === undefined ? project.captions.style : pick<CaptionStyle>(k.style, ['bold', 'karaoke', 'minimal'], 'captions.style'),
    }
    finalOld = true
  }
  if (body.visuals !== undefined) {
    const v = body.visuals as Record<string, unknown>
    const overlays = v.overlays === undefined ? project.visuals.overlays : (Array.isArray(v.overlays) ? v.overlays : []).slice(0, 50).map((o, i) => {
      const item = o as Record<string, unknown>
      const file = str(item.file, 160, 'overlay.file')
      machine.libraryFile(file)
      return { id: typeof item.id === 'string' ? item.id.slice(0, 20) : `o${i + 1}`, file, kind: pick<'image' | 'video'>(item.kind, ['image', 'video'], 'overlay.kind'), at: num(item.at, 0, 86_400, 'overlay.at'), duration: num(item.duration, 0.3, 120, 'overlay.duration') }
    })
    change.visuals = {
      title: v.title === undefined ? project.visuals.title : str(v.title, 120, 'visuals.title'),
      subtitle: v.subtitle === undefined ? project.visuals.subtitle : str(v.subtitle, 160, 'visuals.subtitle'),
      punchIns: v.punchIns === undefined ? project.visuals.punchIns : bool(v.punchIns, 'visuals.punchIns'),
      progressBar: v.progressBar === undefined ? project.visuals.progressBar : bool(v.progressBar, 'visuals.progressBar'),
      overlays,
    }
    finalOld = true
  }
  if (body.shorts !== undefined) {
    change.shorts = (Array.isArray(body.shorts) ? body.shorts : []).slice(0, 10).map((s, i) => {
      const item = s as Record<string, unknown>
      const start = num(item.start, 0, 86_400, 'short.start')
      const end = num(item.end, start + 3, start + 180, 'short.end')
      const same = project.shorts.find((x) => x.id === item.id && x.start === start && x.end === end)
      return { id: typeof item.id === 'string' ? item.id.slice(0, 20) : `s${i + 1}`, title: str(item.title ?? '', 80, 'short.title'), start, end, ...(same?.output && same.title === item.title ? { output: same.output } : {}) }
    })
  }
  if (cutOld) change.outputs = { ...project.outputs, cut: undefined, final: undefined }
  else if (finalOld) change.outputs = { ...project.outputs, final: undefined }
  return change
}

