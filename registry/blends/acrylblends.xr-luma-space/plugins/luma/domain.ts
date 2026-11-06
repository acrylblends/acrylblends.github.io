/**
 * Luma Space's domain: an XR scene made of objects (a portal, markers, a light, a path, spatial anchors), each with a position in metres, a rotation in
 * degrees and a scale, optionally parented to another object; a preview mode (AR, VR or MR), a world scale, interactions and validation. Pure functions
 * and plain data: the {@link Scene} in scene.ts applies them to the saved state and the pages only read what they return.
 *
 * Nothing here is an XR session: no camera, tracking or sensor input, and no claim of spatial accuracy. The units are scene metres.
 */

export class SceneError extends Error {
  override readonly name = 'SceneError'
  readonly code: 'invalid' | 'not-found' | 'conflict'
  constructor(code: 'invalid' | 'not-found' | 'conflict', message: string) {
    super(message)
    this.code = code
  }
}

/** A typed 3D vector; what the unit is depends on where it is used (metres for positions, degrees for rotations). */
export interface Vec3 {
  readonly x: number
  readonly y: number
  readonly z: number
}

export type Mode = 'AR' | 'VR' | 'MR'
export const MODES: readonly Mode[] = ['AR', 'VR', 'MR']

export type Kind = 'portal' | 'marker' | 'light' | 'path' | 'anchor'
export const KINDS: Readonly<Record<Kind, { name: string; icon: string }>> = {
  portal: { name: 'Portal', icon: '◈' },
  marker: { name: 'Marker', icon: '⌖' },
  light: { name: 'Light', icon: '☼' },
  path: { name: 'Path', icon: '⌁' },
  anchor: { name: 'Anchor', icon: '⌖' },
}

export type Trigger = 'none' | 'proximity' | 'gaze' | 'tap'
export const TRIGGERS: Readonly<Record<Trigger, string>> = { none: 'No interaction', proximity: 'Proximity', gaze: 'Gaze (simulated)', tap: 'Tap' }

export interface Interaction {
  readonly trigger: Trigger
  /** Metres; used by the proximity trigger. */
  readonly radius: number
  readonly action: string
}

export interface SceneObject {
  readonly id: string
  readonly name: string
  readonly kind: Kind
  /** The object this one is placed relative to; absent for a root object. */
  readonly parentId?: string
  /** Metres, relative to the parent (or the scene origin). */
  readonly position: Vec3
  /** Degrees about X, Y and Z, applied in Z·Y·X order. */
  readonly rotation: Vec3
  readonly scale: number
  readonly visible: boolean
  readonly interaction: Interaction
}

export interface SceneState {
  readonly version: 1
  readonly project: string
  readonly name: string
  readonly updatedAt: string
  readonly mode: Mode
  readonly worldScale: number
  readonly objects: readonly SceneObject[]
}

export const BOUND = 10
export const MIN_SCALE = 0.5
export const MAX_SCALE = 2
export const MAX_OBJECTS = 12
export const OVERLAP = 0.25

const round = (n: number, places = 3): number => Math.round(n * 10 ** places) / 10 ** places

/** A number typed into a form field, checked against its range; `label` names it in the message. */
export function parseNumber(raw: string | undefined, label: string, min: number, max: number, unit: string): number {
  const text = (raw ?? '').trim()
  const n = text === '' ? Number.NaN : Number(text)
  if (!Number.isFinite(n) || n < min || n > max) throw new SceneError('invalid', `${label} must be a number from ${String(min)} to ${String(max)}${unit}.`)
  return round(n)
}

export function parseVec3(raw: { x?: string | undefined; y?: string | undefined; z?: string | undefined }, label: string, bound: number, unit: string): Vec3 {
  return {
    x: parseNumber(raw.x, `${label} X`, -bound, bound, unit),
    y: parseNumber(raw.y, `${label} Y`, -bound, bound, unit),
    z: parseNumber(raw.z, `${label} Z`, -bound, bound, unit),
  }
}

type Matrix = readonly [readonly [number, number, number], readonly [number, number, number], readonly [number, number, number]]

const IDENTITY: Matrix = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]

const multiply = (a: Matrix, b: Matrix): Matrix =>
  a.map((row) => [0, 1, 2].map((c) => row[0] * b[0][c] + row[1] * b[1][c] + row[2] * b[2][c])) as unknown as Matrix

/** The rotation matrix of Euler angles in degrees, applied Z·Y·X (X first). */
export function rotationMatrix(r: Vec3): Matrix {
  const [cx, sx, cy, sy, cz, sz] = [Math.cos((r.x * Math.PI) / 180), Math.sin((r.x * Math.PI) / 180), Math.cos((r.y * Math.PI) / 180), Math.sin((r.y * Math.PI) / 180), Math.cos((r.z * Math.PI) / 180), Math.sin((r.z * Math.PI) / 180)]
  const rx: Matrix = [[1, 0, 0], [0, cx, -sx], [0, sx, cx]]
  const ry: Matrix = [[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]]
  const rz: Matrix = [[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]]
  return multiply(rz, multiply(ry, rx))
}

export interface WorldTransform {
  readonly position: Vec3
  readonly rotation: Matrix
  readonly scale: number
}

/**
 * The object's place in the scene: a child's local position is scaled and rotated by every ancestor before it is added to theirs, and scales multiply.
 * An unknown or cyclic parent chain stops at the object, so a damaged file cannot loop.
 */
export function worldTransform(objects: readonly SceneObject[], id: string): WorldTransform {
  const chain: SceneObject[] = []
  const seen = new Set<string>()
  for (let cursor = objects.find((o) => o.id === id); cursor !== undefined && !seen.has(cursor.id); cursor = objects.find((o) => o.id === cursor?.parentId)) {
    seen.add(cursor.id)
    chain.unshift(cursor)
  }
  let transform: WorldTransform = { position: { x: 0, y: 0, z: 0 }, rotation: IDENTITY, scale: 1 }
  for (const o of chain) {
    const m = transform.rotation
    const local = { x: o.position.x * transform.scale, y: o.position.y * transform.scale, z: o.position.z * transform.scale }
    transform = {
      position: {
        x: transform.position.x + m[0][0] * local.x + m[0][1] * local.y + m[0][2] * local.z,
        y: transform.position.y + m[1][0] * local.x + m[1][1] * local.y + m[1][2] * local.z,
        z: transform.position.z + m[2][0] * local.x + m[2][1] * local.y + m[2][2] * local.z,
      },
      rotation: multiply(m, rotationMatrix(o.rotation)),
      scale: transform.scale * o.scale,
    }
  }
  return { ...transform, position: { x: round(transform.position.x), y: round(transform.position.y), z: round(transform.position.z) } }
}

/** The objects that hang under `id`, directly or not. */
export function descendantsOf(objects: readonly SceneObject[], id: string): SceneObject[] {
  const direct = objects.filter((o) => o.parentId === id)
  return [...direct, ...direct.flatMap((o) => descendantsOf(objects, o.id))]
}

export const distance = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)

export interface Finding {
  readonly level: 'error' | 'warning'
  readonly text: string
}

/** The scene checks: overlaps and out-of-bounds placements are errors, a hidden object that has an interaction is a warning. */
export function validate(scene: Pick<SceneState, 'objects'>): Finding[] {
  const findings: Finding[] = []
  const placed = scene.objects.map((o) => ({ o, at: worldTransform(scene.objects, o.id).position }))
  for (const { o, at } of placed) {
    if (Math.max(Math.abs(at.x), Math.abs(at.y), Math.abs(at.z)) > BOUND) findings.push({ level: 'error', text: `${o.name} is outside the ${String(BOUND)} m scene bounds.` })
    if (!o.visible && o.interaction.trigger !== 'none') findings.push({ level: 'warning', text: `${o.name} has an interaction but is hidden in preview.` })
  }
  const visible = placed.filter(({ o }) => o.visible)
  for (const [i, a] of visible.entries())
    for (const b of visible.slice(i + 1)) {
      const d = distance(a.at, b.at)
      if (d < OVERLAP) findings.push({ level: 'error', text: `${a.o.name} and ${b.o.name} overlap (${d.toFixed(2)} m apart).` })
    }
  return findings
}

/** `Updated 4 minutes ago`. */
export function ago(iso: string, now: Date): string {
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${String(minutes)} ${minutes === 1 ? 'minute' : 'minutes'} ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${String(hours)} ${hours === 1 ? 'hour' : 'hours'} ago`
  const days = Math.round(hours / 24)
  return `${String(days)} ${days === 1 ? 'day' : 'days'} ago`
}

/** What the local interaction preview reports for an object; nothing is sensed, the event is simulated. */
export function previewEvent(o: SceneObject): string {
  const i = o.interaction
  if (i.trigger === 'none') throw new SceneError('conflict', `${o.name} has no interaction to preview. Choose a trigger first.`)
  const when = i.trigger === 'proximity' ? `proximity event (within ${i.radius.toFixed(1)} m)` : `${i.trigger} event`
  return `Interaction preview: ${o.name} ${when} fired in simulation → ${i.action}.`
}

export const NO_INTERACTION: Interaction = { trigger: 'none', radius: 1.5, action: '' }

/** The objects in outline order (each parent before the objects placed in it) with their depth, for the hierarchy list. */
export function hierarchy(objects: readonly SceneObject[]): { readonly object: SceneObject; readonly depth: number }[] {
  const ids = new Set(objects.map((o) => o.id))
  const walk = (parent: string | undefined, depth: number, seen: ReadonlySet<string>): { object: SceneObject; depth: number }[] =>
    objects
      .filter((o) => (parent === undefined ? o.parentId === undefined || !ids.has(o.parentId) : o.parentId === parent))
      .filter((o) => !seen.has(o.id))
      .flatMap((o) => [{ object: o, depth }, ...walk(o.id, depth + 1, new Set([...seen, o.id]))])
  return walk(undefined, 0, new Set())
}
