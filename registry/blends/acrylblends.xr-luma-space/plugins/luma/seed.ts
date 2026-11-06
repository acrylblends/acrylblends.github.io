/** The scene a person sees on the first start: the mockup's North wing experience with its four objects, updated four minutes ago, in AR at 1.0×. */
import { type SceneObject, type SceneState, NO_INTERACTION } from './domain.ts'

const object = (o: Omit<SceneObject, 'interaction' | 'visible'> & Partial<Pick<SceneObject, 'interaction'>>): SceneObject => ({ visible: true, interaction: NO_INTERACTION, ...o })

export function seed(now: Date): SceneState {
  return {
    version: 1,
    project: 'Gallery / North wing',
    name: 'North wing experience',
    updatedAt: new Date(now.getTime() - 4 * 60_000).toISOString(),
    mode: 'AR',
    worldScale: 1,
    objects: [
      object({ id: 'portal', name: 'Spatial portal', kind: 'portal', position: { x: 0, y: 1.2, z: -0.8 }, rotation: { x: 0, y: 18, z: 0 }, scale: 1, interaction: { trigger: 'proximity', radius: 1.5, action: 'opens the gallery overlay' } }),
      object({ id: 'marker', name: 'Info marker', kind: 'marker', position: { x: -1.8, y: 1.5, z: -1.4 }, rotation: { x: 0, y: 0, z: 0 }, scale: 1, interaction: { trigger: 'gaze', radius: 1.5, action: 'shows the artwork card' } }),
      object({ id: 'light', name: 'Light source', kind: 'light', position: { x: 1.6, y: 2.4, z: -2 }, rotation: { x: -35, y: 0, z: 0 }, scale: 1 }),
      object({ id: 'path', name: 'Visitor path', kind: 'path', position: { x: 0.8, y: 0, z: 1.2 }, rotation: { x: 0, y: -20, z: 0 }, scale: 1, interaction: { trigger: 'tap', radius: 1.5, action: 'highlights the route' } }),
    ],
  }
}
