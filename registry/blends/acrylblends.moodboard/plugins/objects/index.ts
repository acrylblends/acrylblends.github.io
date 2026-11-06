/**
 * Objects: the add form (`/objects/new`), the editor (`/objects/:id/edit`) with duplicate, layer and delete, and the autosave move endpoint a drag posts
 * to. Every object type has its own fields, and invalid input keeps the form with a message.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { BoardError, isObjectType, type BoardObject, type Boards, type ObjectType } from '../boards/index.ts'
import { escapeHtml, pageHead, renderObject, type Shell } from '../board-shell/index.ts'

export const name = 'objects'
export const inject = ['boards', 'shell', 'router']

interface Values {
  readonly type: string
  readonly content: string
  readonly name: string
  readonly label: string
  readonly colors: string
  readonly assetId: string
  readonly width: string
  readonly rotation: string
}

const EMPTY: Values = { type: 'note', content: '', name: '', label: '', colors: '', assetId: '', width: '', rotation: '' }

function valuesOf(object: BoardObject): Values {
  return {
    type: object.type,
    content: object.content,
    name: object.name,
    label: object.label,
    colors: object.colors.join(', '),
    assetId: object.assetId ?? '',
    width: String(object.width),
    rotation: String(object.rotation),
  }
}

function valuesFrom(form: Record<string, unknown>, fallback: Values): Values {
  const text = (key: keyof Values): string => (typeof form[key] === 'string' ? (form[key] as string) : fallback[key])
  return {
    type: text('type'),
    content: text('content'),
    name: text('name'),
    label: text('label'),
    colors: text('colors'),
    assetId: text('assetId'),
    width: text('width'),
    rotation: text('rotation'),
  }
}

export function apply(ctx: Context): void {
  const boards: Boards = ctx.boards
  const shell: Shell = ctx.shell
  const prefix = shell.prefix

  const assetOptions = (selected: string): string =>
    boards
      .assets()
      .filter((asset) => asset.kind === 'image')
      .map(
        (asset) =>
          `<option value="${escapeHtml(asset.id)}"${asset.id === selected ? ' selected' : ''}>${escapeHtml(asset.name)}</option>`,
      )
      .join('')

  const form = (url: string, values: Values, editing: BoardObject | undefined, error?: string): string => {
    const type: ObjectType = isObjectType(values.type) ? values.type : 'note'
    const typeNames: Record<string, string> = {
      image: 'Image',
      note: 'Text note',
      palette: 'Colour palette',
      reference: 'Reference card',
      quote: 'Quote',
      caption: 'Caption',
      link: 'Link',
    }
    const types = Object.keys(typeNames)
      .map((value) => `<option value="${value}"${value === type ? ' selected' : ''}>${typeNames[value] as string}</option>`)
      .join('')
    const needsAsset = type === 'image' || type === 'reference'
    const needsLabel = type === 'note' || type === 'quote'
    const needsColors = type === 'palette'
    const labelField = needsLabel
      ? `<label class="field"><span>SMALL LABEL (OPTIONAL)</span><input name="label" value="${escapeHtml(values.label)}" placeholder="DESIGN PRINCIPLE 01"></label>`
      : ''
    const colorsField = needsColors
      ? `<label class="field"><span>PALETTE COLOURS (COMMA SEPARATED)</span><input name="colors" value="${escapeHtml(values.colors)}" placeholder="#263f35, #b9aa8b, #d5d5c8"></label>`
      : ''
    const previewBoard = boards.board()
    const preview =
      editing === undefined
        ? ''
        : `<div class="preview" style="position:relative;min-height:260px;background-color:#dcdcd3;background-image:radial-gradient(#bfc1b6 .7px,transparent .7px);background-size:15px 15px;border:1px solid #d7d8cf;margin-bottom:14px">${renderObject({ ...editing, x: 40, y: 20 }, boards.assets(), shell.href)}</div>`
    const title = editing === undefined ? 'Add to canvas' : `Edit ${editing.name}`
    const main = `<div class="page">${shell.notice(url)}${pageHead({
      kicker: editing === undefined ? 'CANVAS / NEW OBJECT' : `CANVAS / ${editing.type.toUpperCase()}`,
      title,
      text:
        editing === undefined
          ? 'Choose a type, write the content and pick its place. Positions stay percentages, so the composition survives any window.'
          : `Layer ${String(editing.zIndex)} at ${editing.x.toFixed(1)}%, ${editing.y.toFixed(1)}% on a ${String(previewBoard.width)} x ${String(previewBoard.height)} board.`,
      action: `<a class="button" href="${shell.href('/')}">Back to the board</a>`,
    })}${error === undefined ? '' : `<p class="notice error" role="alert">${escapeHtml(error)}</p>`}${preview}<form class="form" method="post" action="${shell.href(editing === undefined ? '/objects/new' : `/objects/${encodeURIComponent(editing.id)}`)}"><div class="formgrid">${
      editing === undefined
        ? `<label class="field"><span>TYPE</span><select name="type" onchange="location.search='?type='+this.value">${types}</select></label>`
        : `<label class="field"><span>TYPE</span><input value="${escapeHtml(editing.type)}" disabled></label>`
    }<label class="field"><span>NAME IN LAYERS</span><input name="name" value="${escapeHtml(values.name)}" placeholder="Direction"></label>${labelField}</div><label class="field"><span>${type === 'link' ? 'URL' : 'CONTENT'}</span><textarea name="content" placeholder="${type === 'link' ? 'https://example.com/reference' : 'What this object says'}" required>${escapeHtml(values.content)}</textarea></label><div class="formgrid">${colorsField}<label class="field"><span>WIDTH (PX)</span><input name="width" type="number" min="120" max="420" placeholder="180" value="${escapeHtml(values.width)}"></label></div>${
      needsAsset
        ? `<label class="field"><span>IMAGE ASSET</span><select name="assetId">${assetOptions(values.assetId)}</select><span class="hint">Add more images on the Assets page.</span></label>`
        : ''
    }<label class="field"><span>ROTATION (DEGREES)</span><input name="rotation" type="number" min="-15" max="15" step="0.5" value="${escapeHtml(values.rotation === '' ? '0' : values.rotation)}"></label><div class="actions"><button class="button" type="submit">${editing === undefined ? 'Add to canvas' : 'Save object'}</button><a class="cancel" href="${shell.href('/')}">Cancel</a></div></form>${editing === undefined ? '' : `<div class="actions" style="margin-top:18px"><form method="post" action="${shell.href(`/objects/${encodeURIComponent(editing.id)}/duplicate`)}"><button class="button" type="submit">Duplicate object</button></form><form method="post" action="${shell.href(`/objects/${encodeURIComponent(editing.id)}/layer`)}"><input type="hidden" name="direction" value="up"><button class="button" type="submit">Bring forward</button></form><form method="post" action="${shell.href(`/objects/${encodeURIComponent(editing.id)}/layer`)}"><input type="hidden" name="direction" value="down"><button class="button" type="submit">Send back</button></form></div><div class="actions" style="margin-top:10px"><form method="post" action="${shell.href(`/objects/${encodeURIComponent(editing.id)}/delete`)}"><button class="danger" type="submit">Delete object</button></form></div>`}</div>`
    return shell.page({ title, crumbs: [editing === undefined ? 'New object' : editing.name], main })
  }

  const editPage = (object: BoardObject, url: string, error?: string): string => {
    const main = form(url, valuesOf(object), object, error)
    return main
  }

  const app = new Acryl()
    .get('/objects/new', (c) => {
      const requested = c.req.query('type')
      const type: ObjectType = isObjectType(requested) ? requested : 'note'
      const firstImage = boards.assets().find((asset) => asset.kind === 'image')
      return c.html(form(c.req.url, { ...EMPTY, type, ...(firstImage === undefined ? {} : { assetId: firstImage.id }) }, undefined))
    })
    .post('/objects/new', async (c) => {
      const values = valuesFrom(await c.req.parseBody(), EMPTY)
      const colors = values.colors.split(',').map((color) => color.trim()).filter((color) => color !== '')
      try {
        const object = await boards.addObject({
          type: values.type,
          content: values.content,
          name: values.name,
          label: values.label,
          colors,
          ...(values.assetId === '' ? {} : { assetId: values.assetId }),
          ...(values.width === '' ? {} : { width: Number(values.width) }),
          ...(values.rotation === '' ? {} : { rotation: Number(values.rotation) }),
        })
        return c.redirect(shell.url('/', { kind: 'ok', text: `${object.name} was added to the board.` }), 303)
      } catch (error) {
        if (!(error instanceof BoardError)) throw error
        return c.html(form(c.req.url, values, undefined, error.message))
      }
    })
    .get('/objects/:id/edit', (c) => {
      const object = boards.object(c.req.param('id'))
      if (object === undefined) return c.redirect(shell.url('/', { kind: 'error', text: 'That object is no longer on the board.' }), 303)
      return c.html(editPage(object, c.req.url))
    })
    .post('/objects/:id/move', async (c) => {
      const form = await c.req.parseBody()
      const wantsJson = (c.req.header('accept') ?? '').includes('application/json')
      try {
        const object = await boards.move(c.req.param('id'), form.x, form.y)
        if (wantsJson) return c.json({ ok: true, x: object.x, y: object.y })
        return c.redirect(shell.url('/', { kind: 'ok', text: 'Position saved.' }), 303)
      } catch (error) {
        if (wantsJson) return c.json({ ok: false, error: (error as Error).message }, 400)
        return c.redirect(shell.url('/', { kind: 'error', text: (error as Error).message }), 303)
      }
    })
    .post('/objects/:id', async (c) => {
      const object = boards.object(c.req.param('id'))
      if (object === undefined) return c.redirect(shell.url('/', { kind: 'error', text: 'That object is no longer on the board.' }), 303)
      const values = valuesFrom(await c.req.parseBody(), valuesOf(object))
      const colors = values.colors.split(',').map((color) => color.trim()).filter((color) => color !== '')
      try {
        await boards.updateObject(object.id, {
          content: values.content,
          name: values.name,
          label: values.label,
          colors,
          width: values.width === '' ? object.width : Number(values.width),
          rotation: values.rotation === '' ? object.rotation : Number(values.rotation),
        })
        return c.redirect(shell.url(`/objects/${encodeURIComponent(object.id)}/edit`, { kind: 'ok', text: 'Object saved.' }), 303)
      } catch (error) {
        if (!(error instanceof BoardError)) throw error
        return c.html(editPage(object, c.req.url, error.message))
      }
    })
    .post('/objects/:id/duplicate', async (c) => {
      try {
        const copy = await boards.duplicate(c.req.param('id'))
        return c.redirect(shell.url(`/objects/${encodeURIComponent(copy.id)}/edit`, { kind: 'ok', text: 'Object duplicated.' }), 303)
      } catch (error) {
        return c.redirect(shell.url('/', { kind: 'error', text: (error as Error).message }), 303)
      }
    })
    .post('/objects/:id/layer', async (c) => {
      const form = await c.req.parseBody()
      const direction = form.direction === 'up' ? 'up' : 'down'
      try {
        await boards.layer(c.req.param('id'), direction)
        return c.redirect(shell.url(`/objects/${encodeURIComponent(c.req.param('id'))}/edit`, { kind: 'ok', text: `Object moved ${direction} one layer.` }), 303)
      } catch (error) {
        return c.redirect(shell.url('/', { kind: 'error', text: (error as Error).message }), 303)
      }
    })
    .post('/objects/:id/delete', async (c) => {
      try {
        await boards.remove(c.req.param('id'))
        return c.redirect(shell.url('/', { kind: 'ok', text: 'Object removed from the board.' }), 303)
      } catch (error) {
        return c.redirect(shell.url('/', { kind: 'error', text: (error as Error).message }), 303)
      }
    })

  ctx.router.route(prefix === '' ? '/' : prefix, app)
}
