/** The pieces every page draws the same way: the head, the album tabs and search, the masonry grid, the pager and the empty state. */
import { artOf, groupDigits, type Album, type Photo } from '../gallery/index.ts'
import { escapeHtml } from './core.ts'

export interface HeadInput {
  readonly kicker: string
  readonly title: string
  readonly subtitle: string
  readonly action?: string
}

export function pageHead({ kicker, title, subtitle, action }: HeadInput): string {
  return `<div class="head"><div><small>${escapeHtml(kicker)}</small><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p></div>${action ?? ''}</div>`
}

export function addPhotographs(href: string): string {
  return `<a class="button" href="${href}">＋ Add photographs</a>`
}

export interface TabSearch {
  readonly action: string
  readonly q: string
}

/** The album tabs (All first) and the archive search, in the mockup's single row above the grid. */
export function tabs(albums: readonly Album[], active: string | undefined, href: (path: string) => string, search?: TabSearch): string {
  const entries: readonly { readonly id: string | undefined; readonly name: string }[] = [{ id: undefined, name: 'All' }, ...albums]
  const links = entries
    .map((album) => {
      const target = album.id === undefined ? href('/') : href(`/albums/${encodeURIComponent(album.id)}`)
      return `<a href="${target}"${album.id === active || (active === undefined && album.id === undefined) ? ' class="active"' : ''}>${escapeHtml(album.name.toUpperCase())}</a>`
    })
    .join('')
  const form =
    search === undefined
      ? ''
      : `<form class="searchform" method="get" action="${search.action}" role="search"><input type="search" name="q" value="${escapeHtml(search.q)}" placeholder="Search filename, title or tag" aria-label="Search the archive"></form>`
  return `<div class="tabs">${links}${form}</div>`
}

/** The masonry grid: one generated picture per photograph, its caption on hover, all of it a link to the lightbox. */
export function grid(photos: readonly Photo[], href: (path: string) => string): string {
  return `<div class="photos">${photos
    .map(
      (photo) =>
        `<a class="photo" href="${href(`/photos/${encodeURIComponent(photo.id)}`)}"><img loading="lazy" src="${artOf(photo, photo.tile)}" alt="${escapeHtml(photo.title)}" style="min-height:${String(photo.tile)}px;object-fit:cover"><span class="cap">${escapeHtml(photo.title)}</span></a>`,
    )
    .join('')}</div>`
}

export interface PagerInput {
  readonly total: number
  readonly page: number
  readonly pageSize: number
  readonly url: (page: number) => string
}

export function pager({ total, page, pageSize, url }: PagerInput): string {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1
  const end = Math.min(total, page * pageSize)
  return `<div class="pager"><span>Showing ${groupDigits(start)}-${groupDigits(end)} of ${groupDigits(total)}</span><div class="pager-links">${
    page > 1 ? `<a href="${url(page - 1)}">‹ Previous</a>` : ''
  }<span>Page ${groupDigits(page)} of ${groupDigits(pages)}</span>${page < pages ? `<a href="${url(page + 1)}">Next ›</a>` : ''}</div></div>`
}

export function emptyState(title: string, text: string, href?: string): string {
  return `<div class="empty"><b>${escapeHtml(title)}</b><p>${escapeHtml(text)}</p>${href === undefined ? '' : `<a class="button" href="${href}">Show all photographs</a>`}</div>`
}
