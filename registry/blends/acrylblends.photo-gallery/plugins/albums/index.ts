/**
 * Albums: `/albums` lists the four collections with their covers and counts, `/albums/:id` is one album with its metadata and grid. Both register
 * their top-bar entry and one rail row per album in `ctx.effect`.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { artOf, coverOf, dateText, groupDigits, sizeText, type Album, type Gallery } from '../gallery/index.ts'
import { addPhotographs, emptyState, escapeHtml, grid, pageHead, pager, tabs, type Shell } from '../gallery-shell/index.ts'

export const name = 'albums'
export const inject = ['gallery', 'shell', 'router']

const PAGE_SIZE = 24

function albumCards(gallery: Gallery, href: (path: string) => string): string {
  const counts = gallery.counts()
  return `<div class="albumgrid">${gallery
    .albums()
    .map((album) => {
      const cover = album.coverPhotoId === undefined ? undefined : gallery.photo(album.coverPhotoId)
      return `<a class="albumcard" href="${href(`/albums/${encodeURIComponent(album.id)}`)}">${
        cover === undefined ? '<span></span>' : `<img src="${artOf(cover)}" alt="" loading="lazy">`
      }<div><small>ALBUM · ${groupDigits(counts.get(album.id) ?? 0)} PHOTOGRAPHS</small><b>${escapeHtml(album.name)}</b><p>${escapeHtml(album.description)}</p></div></a>`
    })
    .join('')}</div>`
}

export function apply(ctx: Context): void {
  const gallery: Gallery = ctx.gallery
  const shell: Shell = ctx.shell
  const prefix = shell.prefix

  ctx.effect(() => shell.nav({ id: 'albums', area: 'top', label: 'Albums', path: '/albums', order: 20 }))
  for (const [index, album] of gallery.albums().entries()) {
    const cover = album.coverPhotoId === undefined ? undefined : gallery.photo(album.coverPhotoId)
    ctx.effect(() =>
      shell.nav({
        id: `album:${album.id}`,
        area: 'side',
        group: 'LIBRARY',
        label: album.name,
        path: `/albums/${encodeURIComponent(album.id)}`,
        order: 20 + index,
        ...(cover === undefined ? {} : { image: coverOf(cover) }),
        count: () => gallery.counts().get(album.id) ?? 0,
      }),
    )
  }

  const index = (url: string): string => {
    const main = `${shell.notice(url)}${pageHead({
      kicker: 'LIBRARY / ALBUMS',
      title: 'Albums',
      subtitle: 'Four collections, one archive. Open an album for its cover frame and full metadata.',
      action: addPhotographs(shell.href('/upload')),
    })}${albumCards(gallery, shell.href)}`
    return shell.page({ navActive: 'albums', title: 'Albums', main })
  }

  const detail = (album: Album, url: string, q: string, requestedPage: string): string => {
    const photos = gallery.photos({ albumId: album.id, ...(q === '' ? {} : { q }) })
    const stats = gallery.albumStats(album.id)
    const pages = Math.max(1, Math.ceil(photos.length / PAGE_SIZE))
    const parsed = Number.parseInt(requestedPage, 10)
    const page = Math.min(pages, Math.max(1, Number.isFinite(parsed) ? parsed : 1))
    const visible = photos.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    const base = `/albums/${encodeURIComponent(album.id)}`
    const urlFor = (target: number): string => {
      const params = new URLSearchParams()
      if (q !== '') params.set('q', q)
      if (target > 1) params.set('page', String(target))
      const query = params.toString()
      return `${shell.href(base)}${query === '' ? '' : `?${query}`}`
    }
    const meta = `<div class="albummeta"><div><small>PHOTOGRAPHS</small><b>${groupDigits(stats.count)}</b></div><div><small>CAPTURED</small><b>${stats.first === undefined ? 'No frames yet' : `${dateText(stats.first)} – ${dateText(stats.last as string)}`}</b></div><div><small>ALBUM SIZE</small><b>${sizeText(stats.bytes)}</b></div><div><small>COVER</small><b>${escapeHtml(album.coverPhotoId === undefined ? 'Not set' : 'Frame 01')}</b></div></div>`
    const body =
      photos.length === 0
        ? emptyState(q === '' ? 'This album is empty.' : 'No photographs match.', q === '' ? 'Add a photograph to start the collection.' : 'Try another file name, title or tag.', shell.href(base))
        : `${grid(visible, shell.href)}${pager({ total: photos.length, page, pageSize: PAGE_SIZE, url: urlFor })}`
    const main = `${shell.notice(url)}${pageHead({
      kicker: `COLLECTION / ${album.name.toUpperCase()}`,
      title: album.name,
      subtitle: album.description,
      action: addPhotographs(shell.href('/upload')),
    })}${meta}${tabs(gallery.albums(), album.id, shell.href, { action: shell.href(base), q })}${body}`
    return shell.page({ active: `album:${album.id}`, navActive: 'albums', title: album.name, main })
  }

  const app = new Acryl()
    .get('/albums', (c) => c.html(index(c.req.url)))
    .get('/albums/:id', (c) => {
      const album = gallery.album(c.req.param('id'))
      if (album === undefined) return c.redirect(shell.url('/albums', { kind: 'error', text: 'That album no longer exists.' }), 303)
      return c.html(detail(album, c.req.url, (c.req.query('q') ?? '').slice(0, 100).trim(), c.req.query('page') ?? '1'))
    })

  ctx.router.route(prefix === '' ? '/' : prefix, app)
}
