/**
 * Shared: the frames the studio marked shareable, at `/shared`. Sharing is a local flag in this build (no external service, as the spec requires);
 * the lightbox's share action is what fills this view.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type { Gallery } from '../gallery/index.ts'
import { addPhotographs, emptyState, grid, pageHead, pager, type Shell } from '../gallery-shell/index.ts'

export const name = 'shared'
export const inject = ['gallery', 'shell', 'router']

const PAGE_SIZE = 24

export function apply(ctx: Context): void {
  const gallery: Gallery = ctx.gallery
  const shell: Shell = ctx.shell
  const prefix = shell.prefix

  ctx.effect(() => shell.nav({ id: 'shared', area: 'top', label: 'Shared', path: '/shared', order: 30 }))

  const app = new Acryl().get('/shared', (c) => {
    const photos = gallery.photos({ shared: true })
    const pages = Math.max(1, Math.ceil(photos.length / PAGE_SIZE))
    const parsed = Number.parseInt(c.req.query('page') ?? '1', 10)
    const page = Math.min(pages, Math.max(1, Number.isFinite(parsed) ? parsed : 1))
    const visible = photos.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    const url = (target: number): string => `${shell.href('/shared')}${target > 1 ? `?page=${String(target)}` : ''}`
    const head = pageHead({
      kicker: 'STUDIO / SHARED',
      title: 'Shared',
      subtitle: 'Frames the studio has marked shareable. Share one from its lightbox; nothing leaves this machine.',
      action: addPhotographs(shell.href('/upload')),
    })
    const body =
      photos.length === 0
        ? emptyState('Nothing shared yet.', 'Open a photograph and choose Share to add it to this view.', shell.href('/'))
        : `${grid(visible, shell.href)}${pager({ total: photos.length, page, pageSize: PAGE_SIZE, url })}`
    return c.html(shell.page({ navActive: 'shared', title: 'Shared', main: `${shell.notice(c.req.url)}${head}${body}` }))
  })

  ctx.router.route(prefix === '' ? '/' : prefix, app)
}
