/**
 * The library: the first page, `/`. Albums as tabs, the archive search, the masonry grid and the pager over the whole collection. Its entry in the top
 * bar and its All photographs row in the rail are registered in `ctx.effect`, so switching the plugin off removes the page and both entries.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type { Gallery } from '../gallery/index.ts'
import { addPhotographs, emptyState, grid, pageHead, pager, tabs, type Shell } from '../gallery-shell/index.ts'

export const name = 'library'
export const inject = ['gallery', 'shell', 'router']

const PAGE_SIZE = 24

export function apply(ctx: Context): void {
  const gallery: Gallery = ctx.gallery
  const shell: Shell = ctx.shell
  const prefix = shell.prefix

  ctx.effect(() => shell.nav({ id: 'library', area: 'top', label: 'Library', path: '/', order: 10 }))
  ctx.effect(() =>
    shell.nav({
      id: 'all',
      area: 'side',
      group: 'LIBRARY',
      label: 'All photographs',
      glyph: '✦',
      path: '/',
      order: 10,
      count: () => gallery.total(),
    }),
  )

  const app = new Acryl().get('/', (c) => {
    const q = (c.req.query('q') ?? '').slice(0, 100).trim()
    const requested = Number.parseInt(c.req.query('page') ?? '1', 10)
    const photos = gallery.photos(q === '' ? {} : { q })
    const pages = Math.max(1, Math.ceil(photos.length / PAGE_SIZE))
    const page = Math.min(pages, Math.max(1, Number.isFinite(requested) ? requested : 1))
    const visible = photos.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    const url = (target: number): string => {
      const params = new URLSearchParams()
      if (q !== '') params.set('q', q)
      if (target > 1) params.set('page', String(target))
      const query = params.toString()
      return `${shell.href('/')}${query === '' ? '' : `?${query}`}`
    }
    const head = pageHead({
      kicker: q === '' ? 'COLLECTION / ALL PHOTOGRAPHS' : `SEARCH / ${q.toUpperCase()}`,
      title: 'Visual archive',
      subtitle:
        q === ''
          ? 'A considered home for every frame, location and moment.'
          : `${String(photos.length)} photograph${photos.length === 1 ? '' : 's'} matching “${q}”.`,
      action: addPhotographs(shell.href('/upload')),
    })
    const body =
      photos.length === 0
        ? emptyState('No photographs match.', 'Try another file name, title or tag, or browse the whole archive.', shell.href('/'))
        : `${grid(visible, shell.href)}${pager({ total: photos.length, page, pageSize: PAGE_SIZE, url })}`
    const main = `${shell.notice(c.req.url)}${head}${tabs(gallery.albums(), undefined, shell.href, { action: shell.href('/'), q })}${body}`
    return c.html(shell.page({ active: 'all', navActive: 'library', title: q === '' ? 'Visual archive' : `Search: ${q}`, main }))
  })

  ctx.router.route(prefix === '' ? '/' : prefix, app)
}
