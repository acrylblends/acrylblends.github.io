/**
 * The lightbox: `/photos/:id` shows one frame at full size with its filename, capture date, dimensions, tags, previous and next, and the favourite and
 * share actions (POST `/photos/:id/favourite`, POST `/photos/:id/share`). Arrow keys and Escape work through the shell's shared script.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { artOf, dateText, dimensionText, sizeText, type Gallery, type Photo } from '../gallery/index.ts'
import { escapeHtml, type Shell } from '../gallery-shell/index.ts'

export const name = 'lightbox'
export const inject = ['gallery', 'shell', 'router']

export function apply(ctx: Context): void {
  const gallery: Gallery = ctx.gallery
  const shell: Shell = ctx.shell
  const prefix = shell.prefix

  const render = (photo: Photo, url: string): string => {
    const pair = gallery.pair(photo)
    const album = gallery.album(photo.albumId)
    const back = album === undefined ? shell.href('/') : shell.href(`/albums/${encodeURIComponent(album.id)}`)
    const target = shell.href(`/photos/${encodeURIComponent(photo.id)}`)
    const side = (item: Photo | undefined, direction: 'prev' | 'next'): string => {
      if (item === undefined) return ''
      const arrow = direction === 'prev' ? '‹' : '›'
      return `<a class="lb${direction}" data-lightbox-${direction} href="${shell.href(`/photos/${encodeURIComponent(item.id)}`)}" aria-label="${direction === 'prev' ? 'Previous photograph' : 'Next photograph'}: ${escapeHtml(item.title)}">${arrow}</a>`
    }
    const stage = `<div class="lbstage"><a class="lbclose" data-lightbox-close href="${back}" aria-label="Close the lightbox">×</a>${side(pair.prev, 'prev')}<img src="${artOf(photo)}" alt="${escapeHtml(photo.title)}" width="${String(photo.width)}" height="${String(photo.height)}">${side(pair.next, 'next')}<div class="lbtitle">${escapeHtml(photo.title)}${album === undefined ? '' : ` &nbsp; · &nbsp; ${escapeHtml(album.name)}`}</div></div>`
    const meta = `<div class="lbmeta"><div><small>FILE</small><b>${escapeHtml(photo.filename)}</b></div><div><small>CAPTURED</small><b>${dateText(photo.capturedAt)}</b></div><div><small>DIMENSIONS</small><b>${dimensionText(photo)}</b></div><div><small>SIZE</small><b>${sizeText(photo.sizeBytes)}</b></div><div class="lbactions"><form method="post" action="${shell.href(`/photos/${encodeURIComponent(photo.id)}/favourite`)}"><input type="hidden" name="back" value="${escapeHtml(url)}"><button type="submit"${photo.favourite ? ' class="on"' : ''}>${photo.favourite ? '♥ Remove from favourites' : '♡ Add to favourites'}</button></form><form method="post" action="${shell.href(`/photos/${encodeURIComponent(photo.id)}/share`)}"><input type="hidden" name="back" value="${escapeHtml(url)}"><button type="submit"${photo.shared ? ' class="on"' : ''}>${photo.shared ? '✓ Shared' : '⇧ Share'}</button></form></div></div>`
    const below = `<div class="lbsub"><div class="lbtags">${photo.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}</div><p>${escapeHtml(photo.description)}${album === undefined ? '' : ` &nbsp; <a href="${back}">Back to ${escapeHtml(album.name)} ↗</a>`}</p></div>`
    const active = album === undefined ? 'all' : `album:${album.id}`
    return shell.page({
      active,
      navActive: 'library',
      title: photo.title,
      bodyClass: 'lightbox-open',
      main: `${shell.notice(url)}<div class="lbpage">${stage}${meta}${below}</div>`,
    })
  }

  const app = new Acryl()
    .get('/photos/:id', (c) => {
      const photo = gallery.photo(c.req.param('id'))
      if (photo === undefined) return c.redirect(shell.url('/', { kind: 'error', text: 'That photograph no longer exists.' }), 303)
      return c.html(render(photo, c.req.url))
    })
    .post('/photos/:id/favourite', async (c) => {
      const form = await c.req.parseBody()
      const back = shell.back(form.back, `/photos/${encodeURIComponent(c.req.param('id'))}`)
      try {
        const photo = await gallery.toggleFavourite(c.req.param('id'))
        return c.redirect(shell.url(back, { kind: 'ok', text: photo.favourite ? 'Added to favourites.' : 'Removed from favourites.' }), 303)
      } catch (error) {
        return c.redirect(shell.url(back, { kind: 'error', text: (error as Error).message }), 303)
      }
    })
    .post('/photos/:id/share', async (c) => {
      const form = await c.req.parseBody()
      const back = shell.back(form.back, `/photos/${encodeURIComponent(c.req.param('id'))}`)
      try {
        const photo = await gallery.toggleShared(c.req.param('id'))
        return c.redirect(shell.url(back, { kind: 'ok', text: photo.shared ? 'Marked as shared.' : 'No longer shared.' }), 303)
      } catch (error) {
        return c.redirect(shell.url(back, { kind: 'error', text: (error as Error).message }), 303)
      }
    })

  ctx.router.route(prefix === '' ? '/' : prefix, app)
}
