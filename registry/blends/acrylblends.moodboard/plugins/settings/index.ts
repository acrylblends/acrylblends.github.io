/**
 * Board settings at `/settings`: the title, project, canvas dimensions and collaborators, the JSON export and the last save time. Invalid dimensions or
 * an empty title keep the form with a message.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { BoardError, slugOf, type Boards } from '../boards/index.ts'
import { escapeHtml, pageHead, type Shell } from '../board-shell/index.ts'

export const name = 'settings'
export const inject = ['boards', 'shell', 'router']

interface Values {
  readonly title: string
  readonly project: string
  readonly width: string
  readonly height: string
  readonly collaborators: string
}

export function apply(ctx: Context): void {
  const boards: Boards = ctx.boards
  const shell: Shell = ctx.shell
  const prefix = shell.prefix

  const values = (): Values => {
    const board = boards.board()
    return {
      title: board.title,
      project: board.project,
      width: String(board.width),
      height: String(board.height),
      collaborators: board.collaborators.join(', '),
    }
  }

  const form = (url: string, current: Values, error?: string): string => {
    const board = boards.board()
    const slug = slugOf(board.title) || 'board'
    const main = `<div class="page">${shell.notice(url)}${pageHead({
      kicker: 'BOARD / SETTINGS',
      title: 'Board settings',
      text: `Last saved ${new Date(board.updatedAt).toISOString().replace('T', ' ').slice(0, 16)} UTC. Every drag already autosaves; this page edits the board itself.`,
      action: `<a class="button" href="${shell.href('/')}">Back to the board</a>`,
    })}${error === undefined ? '' : `<p class="notice error" role="alert">${escapeHtml(error)}</p>`}<form class="form" method="post" action="${shell.href('/settings')}"><div class="formgrid"><label class="field"><span>TITLE</span><input name="title" value="${escapeHtml(current.title)}" required></label><label class="field"><span>PROJECT</span><input name="project" value="${escapeHtml(current.project)}" required></label><label class="field"><span>WIDTH (PX)</span><input name="width" type="number" min="600" max="2400" value="${escapeHtml(current.width)}"></label><label class="field"><span>HEIGHT (PX)</span><input name="height" type="number" min="480" max="1600" value="${escapeHtml(current.height)}"></label></div><label class="field"><span>COLLABORATORS (COMMA SEPARATED)</span><input name="collaborators" value="${escapeHtml(current.collaborators)}"><span class="hint">Up to six names, shown in the board's credits.</span></label><div class="actions"><button class="button" type="submit">Save settings</button><a class="cancel" href="${shell.href('/')}">Cancel</a></div></form><h2 style="font:500 19px Georgia,serif;margin:30px 0 8px">Export</h2><p style="font-size:10px;color:#7f887e;margin:0 0 10px">The board, its objects and the asset library as one JSON file. It contains no remote URLs: the images are generated drawings.</p><a class="button" href="${shell.href('/export.json')}">Download ${slug}.json</a></div>`
    return shell.page({ title: 'Board settings', crumbs: ['Board settings'], main })
  }

  const app = new Acryl()
    .get('/settings', (c) => c.html(form(c.req.url, values())))
    .post('/settings', async (c) => {
      const body = await c.req.parseBody()
      const current: Values = {
        title: String(body.title ?? ''),
        project: String(body.project ?? ''),
        width: String(body.width ?? ''),
        height: String(body.height ?? ''),
        collaborators: String(body.collaborators ?? ''),
      }
      try {
        await boards.updateBoard({
          title: current.title,
          project: current.project,
          width: Number.parseInt(current.width, 10),
          height: Number.parseInt(current.height, 10),
          collaborators: current.collaborators,
        })
        return c.redirect(shell.url('/settings', { kind: 'ok', text: 'Board settings saved.' }), 303)
      } catch (error) {
        if (!(error instanceof BoardError)) throw error
        return c.html(form(c.req.url, current, error.message))
      }
    })
    .get('/export.json', (c) => {
      const board = boards.board()
      c.header('content-disposition', `attachment; filename="${slugOf(board.title) || 'board'}.json"`)
      return c.json(boards.exportData())
    })

  ctx.router.route(prefix === '' ? '/' : prefix, app)
}
