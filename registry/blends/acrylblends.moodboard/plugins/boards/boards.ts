/**
 * The board service: one spatial board, its typed objects, its asset library and the palette selection. It owns the state and calls the store; the clock
 * and the id maker are injected, so a test can pin both. Every mutation is persisted, which is what the canvas's autosave promises.
 */
import {
  BoardError,
  cleanColor,
  cleanColors,
  cleanCollaborators,
  cleanContent,
  cleanDimension,
  cleanLabel,
  cleanLink,
  cleanPosition,
  cleanProject,
  cleanRotation,
  cleanTitle,
  cleanWidth,
  isObjectType,
  nextSpot,
  nextZIndex,
  slugOf,
  stampOf,
  type ArtStyle,
  type Asset,
  type AssetKind,
  type Board,
  type BoardObject,
  type BoardState,
  type ObjectType,
} from './domain.ts'
import { seed } from './seed.ts'
import type { Store } from './store.ts'

export interface BoardsAdapters {
  readonly store: Store<BoardState>
  readonly clock: () => Date
  readonly newId: (kind: string) => string
}

export interface NewObjectInput {
  readonly type: string
  readonly content: string
  readonly name?: string
  readonly label?: string
  readonly colors?: readonly string[]
  readonly assetId?: string
  readonly width?: number
  readonly x?: number
  readonly y?: number
  readonly rotation?: number
}

export interface ObjectChanges {
  readonly content?: string
  readonly name?: string
  readonly label?: string
  readonly colors?: readonly string[]
  readonly width?: number
  readonly rotation?: number
}

export interface BoardChanges {
  readonly title?: string
  readonly project?: string
  readonly width?: number
  readonly height?: number
  readonly collaborators?: string
}

export interface NewAssetInput {
  readonly kind: string
  readonly name: string
  readonly colorValue?: string
  readonly art?: string
  readonly tone?: number
  readonly tags?: string
}

const WIDTHS: Record<ObjectType, number> = { image: 215, reference: 238, note: 180, palette: 180, quote: 210, caption: 160, link: 190 }

export class Boards {
  private state: BoardState
  private readonly adapters: BoardsAdapters

  private constructor(state: BoardState, adapters: BoardsAdapters) {
    this.state = state
    this.adapters = adapters
  }

  static async open(adapters: BoardsAdapters): Promise<Boards> {
    const saved = await adapters.store.load()
    return new Boards(saved ?? seed(adapters.clock(), adapters.newId), adapters)
  }

  get now(): Date {
    return this.adapters.clock()
  }

  board(): Board {
    return this.state.board
  }

  objects(): BoardObject[] {
    return [...this.state.objects].sort((a, b) => a.zIndex - b.zIndex)
  }

  /** The layers panel's order: top layer first. */
  layers(): BoardObject[] {
    return this.objects().reverse()
  }

  object(id: string): BoardObject | undefined {
    return this.state.objects.find((object) => object.id === id)
  }

  assets(): Asset[] {
    return this.state.assets
  }

  asset(id: string): Asset | undefined {
    return this.state.assets.find((asset) => asset.id === id)
  }

  async move(id: string, x: unknown, y: unknown): Promise<BoardObject> {
    const object = this.object(id)
    if (object === undefined) throw new BoardError('not-found', 'That object is no longer on the board.')
    return this.replace({ ...object, x: cleanPosition(x, 'x'), y: cleanPosition(y, 'y') })
  }

  async addObject(input: NewObjectInput): Promise<BoardObject> {
    if (!isObjectType(input.type)) throw new BoardError('invalid', 'Choose an object type that exists.')
    const type = input.type
    let content: string
    if (type === 'link') content = cleanLink(input.content)
    else content = cleanContent(input.content)
    const colors = input.colors === undefined || input.colors.length === 0 ? [] : cleanColors(input.colors)
    if (type === 'palette' && colors.length === 0) colors.push(...['#263f35', '#b9aa8b', '#d5d5c8'])
    if ((type === 'image' || type === 'reference') && input.assetId === undefined) {
      throw new BoardError('invalid', 'Choose an image asset for this card.')
    }
    if ((type === 'image' || type === 'reference') && input.assetId !== undefined) {
      const asset = this.asset(input.assetId)
      if (asset === undefined || asset.kind !== 'image') throw new BoardError('invalid', 'Choose an image asset for this card.')
    }
    const spot = nextSpot(this.state.objects)
    const object: BoardObject = {
      id: this.adapters.newId('object'),
      boardId: this.state.board.id,
      type,
      name: cleanLabel(input.name) === '' ? typeLabel(type) : cleanLabel(input.name).slice(0, 24),
      x: cleanPosition(input.x ?? spot.x, 'x'),
      y: cleanPosition(input.y ?? spot.y, 'y'),
      width: cleanWidth(input.width ?? WIDTHS[type]),
      zIndex: nextZIndex(this.state.objects),
      content,
      label: cleanLabel(input.label),
      ...(input.assetId === undefined ? {} : { assetId: input.assetId }),
      colors,
      rotation: cleanRotation(input.rotation ?? (type === 'note' ? -2 : 0)),
    }
    this.state.objects.push(object)
    await this.save()
    return object
  }

  async updateObject(id: string, changes: ObjectChanges): Promise<BoardObject> {
    const object = this.object(id)
    if (object === undefined) throw new BoardError('not-found', 'That object is no longer on the board.')
    const type = object.type
    const content =
      changes.content === undefined ? object.content : type === 'link' ? cleanLink(changes.content) : cleanContent(changes.content)
    return this.replace({
      ...object,
      content,
      name: changes.name === undefined ? object.name : cleanLabel(changes.name) === '' ? typeLabel(type) : cleanLabel(changes.name).slice(0, 24),
      label: changes.label === undefined ? object.label : cleanLabel(changes.label),
      colors:
        changes.colors === undefined
          ? object.colors
          : changes.colors.length === 0
            ? object.type === 'palette'
              ? object.colors
              : []
            : cleanColors(changes.colors),
      width: changes.width === undefined ? object.width : cleanWidth(changes.width),
      rotation: changes.rotation === undefined ? object.rotation : cleanRotation(changes.rotation),
    })
  }

  async duplicate(id: string): Promise<BoardObject> {
    const object = this.object(id)
    if (object === undefined) throw new BoardError('not-found', 'That object is no longer on the board.')
    const copy: BoardObject = {
      ...object,
      id: this.adapters.newId('object'),
      name: `${object.name} copy`.slice(0, 28),
      x: Math.min(90, object.x + 4),
      y: Math.min(90, object.y + 4),
      zIndex: nextZIndex(this.state.objects),
    }
    this.state.objects.push(copy)
    await this.save()
    return copy
  }

  async remove(id: string): Promise<void> {
    if (!this.state.objects.some((object) => object.id === id)) throw new BoardError('not-found', 'That object is no longer on the board.')
    this.state.objects = this.state.objects.filter((object) => object.id !== id)
    await this.save()
  }

  /** Move an object one layer up or down; at the edge the order stays and nothing is written. */
  async layer(id: string, direction: 'up' | 'down'): Promise<BoardObject> {
    const ordered = this.objects()
    const index = ordered.findIndex((object) => object.id === id)
    if (index === -1) throw new BoardError('not-found', 'That object is no longer on the board.')
    const target = direction === 'up' ? index + 1 : index - 1
    if (target < 0 || target >= ordered.length) return ordered[index] as BoardObject
    const swapped = [...ordered]
    const first = swapped[index] as BoardObject
    const second = swapped[target] as BoardObject
    swapped[index] = second
    swapped[target] = first
    const reordered = swapped.map((object, position) => ({ ...object, zIndex: position + 1 }))
    const byId = new Map(reordered.map((object) => [object.id, object]))
    this.state.objects = this.state.objects.map((object) => byId.get(object.id) ?? object)
    await this.save()
    return byId.get(id) as BoardObject
  }

  async selectColor(value: unknown): Promise<Board> {
    const color = cleanColor(value)
    this.state.board = { ...this.state.board, selectedColor: color, updatedAt: stampOf(this.adapters.clock()) }
    await this.save()
    return this.state.board
  }

  async updateBoard(changes: BoardChanges): Promise<Board> {
    const board = this.state.board
    this.state.board = {
      ...board,
      title: changes.title === undefined ? board.title : cleanTitle(changes.title),
      project: changes.project === undefined ? board.project : cleanProject(changes.project),
      width: changes.width === undefined ? board.width : cleanDimension(changes.width, 'width'),
      height: changes.height === undefined ? board.height : cleanDimension(changes.height, 'height'),
      collaborators: changes.collaborators === undefined ? board.collaborators : cleanCollaborators(changes.collaborators),
      updatedAt: stampOf(this.adapters.clock()),
    }
    await this.save()
    return this.state.board
  }

  async addAsset(input: NewAssetInput): Promise<Asset> {
    const kind: AssetKind = input.kind === 'color' ? 'color' : 'image'
    if (typeof input.name !== 'string' || input.name.trim() === '') throw new BoardError('invalid', 'Give the asset a name.')
    const name = input.name.trim().slice(0, 60)
    const art: ArtStyle = input.art === 'architecture' || input.art === 'light' || input.art === 'fabric' ? input.art : 'material'
    const tone = Number.isInteger(input.tone) && (input.tone as number) >= 0 && (input.tone as number) <= 3 ? (input.tone as number) : 0
    const tags = (input.tags ?? '')
      .split(',')
      .map((tag) => tag.trim().toLowerCase())
      .filter((tag) => tag !== '')
      .slice(0, 5)
    const asset: Asset = {
      id: this.adapters.newId('asset'),
      kind,
      name,
      filename: kind === 'image' ? `${slugOf(name) || 'reference'}.jpg` : '',
      colorValue: kind === 'color' ? cleanColor(input.colorValue) : '',
      tags,
      art,
      tone,
    }
    this.state.assets.push(asset)
    await this.save()
    return asset
  }

  /** Persist the board as it stands (the top bar's Save board confirms autosave). */
  async save(): Promise<Board> {
    this.state.board = { ...this.state.board, updatedAt: stampOf(this.adapters.clock()) }
    this.state = { ...this.state, objects: [...this.state.objects], assets: [...this.state.assets] }
    try {
      await this.adapters.store.save(this.state)
    } catch (error) {
      throw new BoardError('storage', `The board could not be saved: ${(error as Error).message}`)
    }
    return this.state.board
  }

  exportData(): { board: Board; objects: BoardObject[]; assets: Asset[] } {
    return { board: this.state.board, objects: this.objects(), assets: this.state.assets }
  }

  private async replace(object: BoardObject): Promise<BoardObject> {
    this.state.objects = this.state.objects.map((item) => (item.id === object.id ? object : item))
    await this.save()
    return object
  }
}

/** The label a new object gets in the layers panel. */
function typeLabel(type: ObjectType): string {
  switch (type) {
    case 'image':
      return 'Image'
    case 'reference':
      return 'Reference'
    case 'note':
      return 'Note'
    case 'palette':
      return 'Palette'
    case 'quote':
      return 'Quote'
    case 'caption':
      return 'Caption'
    case 'link':
      return 'Link'
  }
}
