/**
 * The board canvas at `/`: the tools rail with the palette and layers, the board head and the spatial canvas. Its objects are links to their edit pages,
 * focusable and movable with the arrow keys; the shared script autosaves a pointer drag.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type { Boards } from '../boards/index.ts'
import { escapeHtml, layersRail, paletteRail, renderObject, toolsLinks, type Shell } from '../board-shell/index.ts'

export const name = 'canvas'
export const inject = ['boards', 'shell', 'router']

export function apply(ctx: Context): void {
  const boards: Boards = ctx.boards
  const shell: Shell = ctx.shell
  const prefix = shell.prefix

  const app = new Acryl()
    .get('/', (c) => {
      const board = boards.board()
      const objects = boards.objects()
      const canvas = objects.length === 0
        ? `<div class="emptyboard"><b>An empty board.</b><span>Add a note, an image or a palette to start the composition.</span><a href="${shell.href('/objects/new?type=note')}">Add a text note</a></div>`
        : objects.map((object) => renderObject(object, boards.assets(), shell.href)).join('')
      const main = `<div class="work"><aside class="tools"><h4>ADD TO CANVAS</h4>${toolsLinks('image', shell.href)}${paletteRail(board, shell.href)}${layersRail(objects, shell.href)}</aside><main class="canvaswrap">${shell.notice(c.req.url)}<div class="boardhead"><div><small>BRAND SYSTEM / DIRECTION BOARD</small><h1>${escapeHtml(board.title)}</h1><p>Drag any element to explore a composition. This is a spatial canvas, not a document.</p></div><button type="button" data-toast="Zoom controls: 75%">75% ⌄</button></div><section class="board" id="board" data-move="${shell.href('/objects/__id__/move')}" style="aspect-ratio:${String(board.width)}/${String(board.height)}">${canvas}<div class="detail">${String(objects.length)} OBJECT${objects.length === 1 ? '' : 'S'} &nbsp;·&nbsp; AUTOSAVE ON &nbsp;·&nbsp; OWNER: DESIGN STUDIO</div></section></main></div>`
      return c.html(shell.page({ title: board.title, main }))
    })
    .post('/palette', async (c) => {
      const form = await c.req.parseBody()
      try {
        await boards.selectColor(form.color)
        return c.redirect(shell.url('/', { kind: 'ok', text: 'Palette colour selected.' }), 303)
      } catch (error) {
        return c.redirect(shell.url('/', { kind: 'error', text: (error as Error).message }), 303)
      }
    })

  ctx.router.route(prefix === '' ? '/' : prefix, app)
}
