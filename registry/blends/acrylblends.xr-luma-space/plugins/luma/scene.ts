/**
 * The scene (`ctx.scene`): the saved XR scene and every change to it. A change checks its input, builds the next state, saves it through the store and
 * only then makes it current, so a failed save leaves the scene as it was. Selection is not here: it is the page's `?object=`.
 */
import {
  type Mode,
  type SceneObject,
  type SceneState,
  type Trigger,
  type Vec3,
  MAX_OBJECTS,
  MAX_SCALE,
  MIN_SCALE,
  MODES,
  NO_INTERACTION,
  SceneError,
  TRIGGERS,
  descendantsOf,
  parseNumber,
  parseVec3,
  previewEvent,
} from './domain.ts'
import { seed } from './seed.ts'
import type { SceneStore } from './store.ts'

export interface SceneAdapters {
  readonly store: SceneStore
  readonly clock: () => Date
  readonly newId: (kind: 'object') => string
}

/** The raw form fields of an object edit; absent fields keep their current value. */
export interface ObjectEdit {
  readonly name?: string | undefined
  readonly position?: { x?: string | undefined; y?: string | undefined; z?: string | undefined } | undefined
  readonly rotation?: { x?: string | undefined; y?: string | undefined; z?: string | undefined } | undefined
  readonly scale?: string | undefined
  /** An object id, or '' for the scene origin. */
  readonly parent?: string | undefined
  readonly visible?: string | undefined
  readonly trigger?: string | undefined
  readonly radius?: string | undefined
  readonly action?: string | undefined
}

export class Scene {
  #state: SceneState
  readonly #adapters: SceneAdapters

  private constructor(state: SceneState, adapters: SceneAdapters) {
    this.#state = state
    this.#adapters = adapters
  }

  static async open(adapters: SceneAdapters): Promise<Scene> {
    const saved = await adapters.store.load()
    if (saved !== undefined) return new Scene(saved, adapters)
    const state = seed(adapters.clock())
    await adapters.store.save(state)
    return new Scene(state, adapters)
  }

  get state(): SceneState {
    return this.#state
  }

  now(): Date {
    return this.#adapters.clock()
  }

  object(id: string): SceneObject {
    const object = this.#state.objects.find((o) => o.id === id)
    if (object === undefined) throw new SceneError('not-found', 'There is no such object.')
    return object
  }

  async #commit(next: SceneState): Promise<void> {
    const stamped = { ...next, updatedAt: this.now().toISOString() }
    await this.#adapters.store.save(stamped)
    this.#state = stamped
  }

  #replace(object: SceneObject): SceneState {
    return { ...this.#state, objects: this.#state.objects.map((o) => (o.id === object.id ? object : o)) }
  }

  async setMode(raw: string | undefined): Promise<Mode> {
    const mode = MODES.find((m) => m === raw)
    if (mode === undefined) throw new SceneError('invalid', 'Pick AR, VR or MR.')
    await this.#commit({ ...this.#state, mode })
    return mode
  }

  async setWorldScale(raw: string | undefined): Promise<number> {
    const worldScale = parseNumber(raw, 'World scale', MIN_SCALE, MAX_SCALE, '×')
    await this.#commit({ ...this.#state, worldScale })
    return worldScale
  }

  /** Add a spatial anchor on the floor, at the first free spot of a row in front of the origin. */
  async addAnchor(): Promise<SceneObject> {
    if (this.#state.objects.length >= MAX_OBJECTS) throw new SceneError('conflict', `A scene holds at most ${String(MAX_OBJECTS)} objects.`)
    const anchors = this.#state.objects.filter((o) => o.kind === 'anchor').length
    let name = anchors === 0 ? 'New anchor' : `New anchor ${String(anchors + 1)}`
    for (let n = anchors + 2; this.#state.objects.some((o) => o.name.toLowerCase() === name.toLowerCase()); n += 1) name = `New anchor ${String(n)}`
    const object: SceneObject = {
      id: this.#adapters.newId('object'),
      name,
      kind: 'anchor',
      position: { x: -2.4 + 0.8 * anchors, y: 0, z: 0.4 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: 1,
      visible: true,
      interaction: NO_INTERACTION,
    }
    await this.#commit({ ...this.#state, objects: [...this.#state.objects, object] })
    return object
  }

  async editObject(id: string, edit: ObjectEdit): Promise<SceneObject> {
    const current = this.object(id)
    const name = edit.name === undefined ? current.name : edit.name.trim()
    if (name === '') throw new SceneError('invalid', 'Give the object a name.')
    if (name.length > 24) throw new SceneError('invalid', 'An object name is at most 24 characters.')
    if (this.#state.objects.some((o) => o.id !== id && o.name.toLowerCase() === name.toLowerCase())) throw new SceneError('conflict', `There is already an object called ${name}.`)
    const position: Vec3 = edit.position === undefined ? current.position : parseVec3({ x: edit.position.x, y: edit.position.y, z: edit.position.z }, 'Position', 10, ' m')
    const rotation: Vec3 = edit.rotation === undefined ? current.rotation : parseVec3(edit.rotation, 'Rotation', 180, '°')
    const scale = edit.scale === undefined ? current.scale : parseNumber(edit.scale, 'Scale', MIN_SCALE, MAX_SCALE, '×')
    let parentId = current.parentId
    if (edit.parent !== undefined) {
      if (edit.parent === '') parentId = undefined
      else {
        const parent = this.object(edit.parent)
        if (parent.id === id || descendantsOf(this.#state.objects, id).some((d) => d.id === parent.id)) throw new SceneError('conflict', `${name} cannot be placed inside itself or one of its children.`)
        parentId = parent.id
      }
    }
    const trigger = edit.trigger === undefined ? current.interaction.trigger : (Object.keys(TRIGGERS) as Trigger[]).find((t) => t === edit.trigger)
    if (trigger === undefined) throw new SceneError('invalid', 'Pick a trigger from the list.')
    const radius = edit.radius === undefined ? current.interaction.radius : parseNumber(edit.radius, 'Radius', 0.1, 5, ' m')
    const action = edit.action === undefined ? current.interaction.action : edit.action.trim()
    if (action.length > 60) throw new SceneError('invalid', 'An action description is at most 60 characters.')
    if (trigger !== 'none' && action === '') throw new SceneError('invalid', 'Describe what the interaction does.')
    const { parentId: _drop, ...rest } = current
    const next: SceneObject = {
      ...rest,
      ...(parentId === undefined ? {} : { parentId }),
      name,
      position,
      rotation,
      scale,
      visible: edit.visible === undefined ? current.visible : edit.visible !== 'hidden',
      interaction: { trigger, radius, action },
    }
    await this.#commit(this.#replace(next))
    return next
  }

  async deleteObject(id: string): Promise<void> {
    const object = this.object(id)
    if (descendantsOf(this.#state.objects, id).length > 0) throw new SceneError('conflict', `${object.name} has objects placed inside it; move or delete them first.`)
    await this.#commit({ ...this.#state, objects: this.#state.objects.filter((o) => o.id !== id) })
  }

  /** The simulated event for an object's interaction; nothing is saved. */
  preview(id: string): string {
    return previewEvent(this.object(id))
  }
}

