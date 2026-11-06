/** The pieces every page draws the same way: the tools rail, the palette, the layers list, a canvas object and the page head. */
import { artOf, type Asset, type Board, type BoardObject, type ObjectType } from '../boards/index.ts'
import { escapeHtml } from './core.ts'

const TOOLS: readonly { readonly type: ObjectType; readonly icon: string; readonly label: string }[] = [
  { type: 'image', icon: '▧', label: 'Image' },
  { type: 'note', icon: 'T', label: 'Text note' },
  { type: 'palette', icon: '◉', label: 'Colour palette' },
  { type: 'reference', icon: '▱', label: 'Reference card' },
  { type: 'link', icon: '↗', label: 'Link' },
]

export function toolsLinks(active: ObjectType | undefined, href: (path: string) => string): string {
  return TOOLS.map(
    (tool) =>
      `<a class="tool${tool.type === active ? ' active' : ''}" href="${href(`/objects/new?type=${tool.type}`)}"><span class="ico">${tool.icon}</span>${tool.label}</a>`,
  ).join('')
}

export function paletteRail(board: Board, href: (path: string) => string): string {
  const colors = ['#263f35', '#b9aa8b', '#d5d5c8', '#b96e4c', '#e7edcd']
    .map(
      (color) =>
        `<form method="post" action="${href('/palette')}"><input type="hidden" name="color" value="${color}"><button type="submit" data-color="${color}" class="${board.selectedColor === color ? 'on' : ''}" style="background:${color}" aria-label="Select colour ${color}"></button></form>`,
    )
    .join('')
  return `<div class="aside-block"><h4>PALETTE</h4><div class="colors">${colors}</div></div>`
}

export function layersRail(objects: readonly BoardObject[], href: (path: string) => string): string {
  const rows = objects
    .map(
      (object) =>
        `<a class="tool" href="${href(`/objects/${encodeURIComponent(object.id)}/edit`)}"><span class="ico">${iconOf(object.type)}</span>${escapeHtml(object.name)}</a>`,
    )
    .join('')
  return `<div class="aside-block"><h4>LAYERS</h4>${rows}</div>`
}

function iconOf(type: ObjectType): string {
  return TOOLS.find((tool) => tool.type === type)?.icon ?? '❝'
}

export function pageHead(input: { kicker: string; title: string; text: string; action?: string }): string {
  return `<div class="pagehead"><div><small>${escapeHtml(input.kicker)}</small><h1>${escapeHtml(input.title)}</h1><p>${escapeHtml(input.text)}</p></div>${input.action ?? ''}</div>`
}

/** One canvas object, positioned as a percentage of the board and linked to its edit page; arrow keys move it, Enter opens the editor. */
export function renderObject(object: BoardObject, assets: readonly Asset[], href: (path: string) => string): string {
  const asset = object.assetId === undefined ? undefined : assets.find((item) => item.id === object.assetId)
  const style = `left:${String(object.x)}%;top:${String(object.y)}%;width:${String(object.width)}px;z-index:${String(object.zIndex)};${object.rotation === 0 ? '' : `transform:rotate(${String(object.rotation)}deg);`}`
  const attributes = `class="item ${classOf(object.type)}" data-object="${escapeHtml(object.id)}" data-x="${String(object.x)}" data-y="${String(object.y)}" style="${style}" href="${href(`/objects/${encodeURIComponent(object.id)}/edit`)}"`
  switch (object.type) {
    case 'image':
      return `<a ${attributes}>${asset === undefined ? '<span></span>' : `<img src="${artOf(asset)}" alt="${escapeHtml(asset.name)}">`}<span>${escapeHtml(object.content)}</span></a>`
    case 'reference':
      return `<a ${attributes}>${asset === undefined ? '<span></span>' : `<img src="${artOf(asset)}" alt="${escapeHtml(asset.name)}">`}<span>${escapeHtml(object.content)}</span></a>`
    case 'note':
      return `<a ${attributes}>${object.label === '' ? '' : `<small>${escapeHtml(object.label)}</small>`}${escapeHtml(object.content)}</a>`
    case 'quote':
      return `<a ${attributes}>${object.label === '' ? '' : `<small>${escapeHtml(object.label)}</small>`}${escapeHtml(object.content)}</a>`
    case 'palette':
      return `<a ${attributes}><strong>${escapeHtml(object.content)}</strong><div>${object.colors.map((color) => `<i style="background:${escapeHtml(color)}"></i>`).join('')}</div></a>`
    case 'caption':
      return `<a ${attributes}>${escapeHtml(object.content)}</a>`
    case 'link':
      return `<a ${attributes}>${escapeHtml(object.content)}</a>`
  }
}

function classOf(type: ObjectType): string {
  if (type === 'image') return 'photo'
  if (type === 'reference') return 'reference'
  if (type === 'palette') return 'swatches'
  if (type === 'link') return 'linkobject'
  return type
}
