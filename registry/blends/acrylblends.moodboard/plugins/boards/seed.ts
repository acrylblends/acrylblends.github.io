/**
 * The board a new install opens: the mockup's Quiet Modern direction board with its six objects at their positions, three reference images and the five
 * palette colours, so the first screen is the composition the mockup shows.
 */
import type { Asset, Board, BoardObject, BoardState } from './domain.ts'
import { DEFAULT_COLORS, stampOf } from './domain.ts'

const MATERIAL: Asset = { id: '', kind: 'image', name: 'Natural materials', filename: 'natural-materials.jpg', colorValue: '', tags: ['material', 'texture'], art: 'material', tone: 0 }
const ARCHITECTURE: Asset = { id: '', kind: 'image', name: 'Architecture reference', filename: 'architecture-reference.jpg', colorValue: '', tags: ['architecture', 'geometry'], art: 'architecture', tone: 1 }
const LIGHT: Asset = { id: '', kind: 'image', name: 'Window light', filename: 'window-light.jpg', colorValue: '', tags: ['light', 'interior'], art: 'light', tone: 2 }

const PALETTE_NAMES: readonly [string, string][] = [
  ['#263f35', 'Forest'],
  ['#b9aa8b', 'Sand'],
  ['#d5d5c8', 'Chalk'],
  ['#b96e4c', 'Terracotta'],
  ['#e7edcd', 'Pale lime'],
]

export function seed(now: Date, newId: (kind: string) => string): BoardState {
  const board: Board = {
    id: newId('board'),
    title: 'Quiet Modern',
    project: 'Brand refresh',
    width: 1_200,
    height: 760,
    background: '#dcdcd3',
    collaborators: ['Design Studio', 'Maya Chen'],
    selectedColor: '#263f35',
    updatedAt: stampOf(now),
  }
  const materials = { ...MATERIAL, id: newId('asset') }
  const architecture = { ...ARCHITECTURE, id: newId('asset') }
  const light = { ...LIGHT, id: newId('asset') }
  const colors: Asset[] = PALETTE_NAMES.map(([colorValue, name]) => ({
    id: newId('asset'),
    kind: 'color',
    name,
    filename: '',
    colorValue,
    tags: ['palette'],
    art: 'material',
    tone: 0,
  }))
  const objects: BoardObject[] = [
    {
      id: newId('object'),
      boardId: board.id,
      type: 'image',
      name: 'Materials',
      x: 7,
      y: 13,
      width: 215,
      zIndex: 1,
      content: 'Natural materials / tactile detail',
      label: '',
      assetId: materials.id,
      colors: [],
      rotation: 0,
    },
    {
      id: newId('object'),
      boardId: board.id,
      type: 'note',
      name: 'Direction',
      x: 38,
      y: 11,
      width: 180,
      zIndex: 2,
      content: 'Warmth without noise. Materials should feel honest, quiet and lived-in.',
      label: 'DESIGN PRINCIPLE 01',
      colors: [],
      rotation: -2,
    },
    {
      id: newId('object'),
      boardId: board.id,
      type: 'palette',
      name: 'Palette v2',
      x: 69,
      y: 15,
      width: 180,
      zIndex: 3,
      content: 'Earth / muted palette',
      label: '',
      colors: DEFAULT_COLORS.slice(0, 4),
      rotation: 0,
    },
    {
      id: newId('object'),
      boardId: board.id,
      type: 'reference',
      name: 'References',
      x: 15,
      y: 52,
      width: 238,
      zIndex: 4,
      content: 'Architecture / calm geometry',
      label: '',
      assetId: architecture.id,
      colors: [],
      rotation: 0,
    },
    {
      id: newId('object'),
      boardId: board.id,
      type: 'quote',
      name: 'Quote',
      x: 49,
      y: 49,
      width: 210,
      zIndex: 5,
      content: 'Less decoration.\nMore intention.',
      label: 'ART DIRECTION / 02',
      colors: [],
      rotation: 0,
    },
    {
      id: newId('object'),
      boardId: board.id,
      type: 'caption',
      name: 'Caption',
      x: 77,
      y: 63,
      width: 160,
      zIndex: 6,
      content: 'Soft contrast\nNatural light\nOpen space',
      label: '',
      colors: [],
      rotation: 0,
    },
  ]
  return { version: 1, board, objects, assets: [materials, architecture, light, ...colors] }
}

export const SEED_FACTS = { objects: 6, images: 3, colors: 5 } as const
