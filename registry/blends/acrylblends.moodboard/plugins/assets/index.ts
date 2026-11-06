/**
 * Assets: the reference image and colour library at `/assets`, with an add form and one action per asset that places it on the board as a new object.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { artOf, BoardError, type Asset, type Boards } from '../boards/index.ts'
import { escapeHtml, pageHead, type Shell } from '../board-shell/index.ts'

export const name = 'assets'
export const inject = ['boards', 'shell', 'router']

export function apply(ctx: Context): void {
  const boards: Boards = ctx.boards
  const shell: Shell = ctx.shell
  const prefix = shell.prefix

  const card = (asset: Asset): string => {
    const visual =
      asset.kind === 'image'
        ? `<img src="${artOf(asset)}" alt="${escapeHtml(asset.name)}" loading="lazy">`
        : `<span class="swatch" style="background:${escapeHtml(asset.colorValue)}"></span>`
    const tags = asset.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')
    return `<article class="assetcard">${visual}<b>${escapeHtml(asset.name)}</b><small>${asset.kind === 'color' ? escapeHtml(asset.colorValue) : escapeHtml(asset.filename)}</small><div>${tags}</div><form method="post" action="${shell.href(`/assets/${encodeURIComponent(asset.id)}/use`)}"><button type="submit">Use on board</button></form></article>`
  }

  const form = (url: string, kind: string, error?: string): string => {
    const main = `<div class="page">${shell.notice(url)}${pageHead({
      kicker: 'LIBRARY / ASSETS',
      title: 'Assets',
      text: 'Reference images and palette colours. Add one here, then place it on the board.',
      action: `<a class="button" href="${shell.href('/')}">Back to the board</a>`,
    })}${error === undefined ? '' : `<p class="notice error" role="alert">${escapeHtml(error)}</p>`}<div class="assetgrid">${boards.assets().map(card).join('')}</div><h2 style="font:500 19px Georgia,serif;margin:30px 0 10px">Add an asset</h2><form class="form" method="post" action="${shell.href('/assets')}"><div class="formgrid"><label class="field"><span>KIND</span><select name="kind"><option value="image"${kind === 'image' ? ' selected' : ''}>Reference image</option><option value="color"${kind === 'color' ? ' selected' : ''}>Colour</option></select></label><label class="field"><span>NAME</span><input name="name" placeholder="Linen sample" required></label><label class="field"><span>COLOUR (FOR A COLOUR ASSET)</span><input name="colorValue" placeholder="#b9aa8b"></label><label class="field"><span>ART STYLE (FOR AN IMAGE)</span><select name="art"><option value="material">Material</option><option value="architecture">Architecture</option><option value="light">Window light</option><option value="fabric">Fabric</option></select></label><label class="field"><span>PALETTE</span><select name="tone"><option value="0">Warm paper</option><option value="1">Sage</option><option value="2">Terracotta</option><option value="3">Stone</option></select></label><label class="field"><span>TAGS</span><input name="tags" placeholder="material, texture"></label></div><div class="actions"><button class="button" type="submit">Add asset</button><a class="cancel" href="${shell.href('/assets')}">Cancel</a></div></form></div>`
    return shell.page({ title: 'Assets', crumbs: ['Assets'], main })
  }

  const app = new Acryl()
    .get('/assets', (c) => c.html(form(c.req.url, 'image')))
    .post('/assets', async (c) => {
      const body = await c.req.parseBody()
      const kind = body.kind === 'color' ? 'color' : 'image'
      try {
        await boards.addAsset({
          kind,
          name: String(body.name ?? ''),
          colorValue: String(body.colorValue ?? ''),
          art: String(body.art ?? 'material'),
          tone: Number(body.tone ?? 0),
          tags: String(body.tags ?? ''),
        })
        return c.redirect(shell.url('/assets', { kind: 'ok', text: 'Asset added to the library.' }), 303)
      } catch (error) {
        if (!(error instanceof BoardError)) throw error
        return c.html(form(c.req.url, kind, error.message))
      }
    })
    .post('/assets/:id/use', async (c) => {
      const asset = boards.asset(c.req.param('id'))
      if (asset === undefined) return c.redirect(shell.url('/assets', { kind: 'error', text: 'That asset no longer exists.' }), 303)
      try {
        const object =
          asset.kind === 'image'
            ? await boards.addObject({ type: asset.tags.includes('architecture') ? 'reference' : 'image', content: asset.name, name: asset.name, assetId: asset.id })
            : await boards.addObject({
                type: 'palette',
                content: `${asset.name} palette`,
                name: asset.name,
                colors: [asset.colorValue, '#b9aa8b', '#d5d5c8'],
              })
        return c.redirect(shell.url('/', { kind: 'ok', text: `${object.name} was placed on the board.` }), 303)
      } catch (error) {
        return c.redirect(shell.url('/assets', { kind: 'error', text: (error as Error).message }), 303)
      }
    })

  ctx.router.route(prefix === '' ? '/' : prefix, app)
}
