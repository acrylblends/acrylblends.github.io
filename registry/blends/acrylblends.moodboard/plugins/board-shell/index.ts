/** The Moodboard shell: the field-notes top bar with the project crumb, the history/share actions and the save form. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type { Boards } from '../boards/index.ts'
import { createShell, escapeHtml, type Shell } from './core.ts'
import { STYLES } from './styles.ts'
export * from './core.ts'
export * from './ui.ts'
export const APP_TITLE = 'Moodboard'
export interface ShellConfig {
  readonly prefix?: string
}
export const name = 'board-shell'
export const inject = ['boards', 'router']
declare module '@deepseek-ai/cordis' {
  interface Context {
    shell: Shell
  }
}

export function apply(ctx: Context, config: ShellConfig = {}): void {
  const boards: Boards = ctx.boards
  const prefix = config.prefix ?? ''
  const topbar = (crumbs: readonly string[], href: (path: string) => string): string => {
    const board = boards.board()
    const trail = ['Projects', board.project, ...(crumbs.length === 0 ? [board.title] : crumbs)]
    const crumb = trail
      .map((segment, index) => (index === trail.length - 1 ? `<b>${escapeHtml(segment)}</b>` : escapeHtml(segment)))
      .join(' / ')
    return `<header class="top"><a class="brand" href="${href('/')}">FIELD<span>NOTES</span></a><div class="crumb">${crumb}</div><div class="grow"></div><button type="button" data-toast="Version history is kept locally in this demo">↶ History</button><button type="button" data-toast="Share link copied">↗ Share</button><form method="post" action="${href('/save')}"><button class="share" type="submit">Save board</button></form></header>`
  }
  const shell = createShell(prefix, { appTitle: APP_TITLE, css: STYLES, bodyClass: 'moodboard', topbar })
  ctx.provide('shell', shell)
  const app = new Acryl()
    .get('/health', (c) => c.json({ ok: true }))
    .post('/save', async (c) => {
      try {
        await boards.save()
        return c.redirect(shell.url('/', { kind: 'ok', text: 'Board saved locally.' }), 303)
      } catch (error) {
        return c.redirect(shell.url('/', { kind: 'error', text: (error as Error).message }), 303)
      }
    })
  ctx.router.route(prefix === '' ? '/' : prefix, app)
}
