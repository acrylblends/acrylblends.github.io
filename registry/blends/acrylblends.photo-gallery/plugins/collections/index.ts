/**
 * The smart collections: Favourites, Recently edited, Uploads and the top bar's Recently added. Each is a filtered view over the same archive; the four
 * routes share one renderer, and the entries in the rail and the top bar are registered in `ctx.effect`.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type { Gallery, PhotoFilter } from '../gallery/index.ts'
import { addPhotographs, emptyState, grid, pageHead, pager, type Shell } from '../gallery-shell/index.ts'

export const name = 'collections'
export const inject = ['gallery', 'shell', 'router']

const PAGE_SIZE = 24
const DAY = 86_400_000

interface View {
  readonly id?: string
  readonly navActive?: string
  readonly kicker: string
  readonly title: string
  readonly subtitle: string
  readonly filter: PhotoFilter
  readonly emptyTitle: string
  readonly emptyText: string
}

export function apply(ctx: Context): void {
  const gallery: Gallery = ctx.gallery
  const shell: Shell = ctx.shell
  const prefix = shell.prefix

  ctx.effect(() => shell.nav({ id: 'recent', area: 'top', label: 'Recently added', path: '/recent', order: 40 }))
  ctx.effect(() =>
    shell.nav({ id: 'favourites', area: 'side', group: 'SMART COLLECTIONS', label: '♡ Favourites', path: '/favourites', order: 100 }),
  )
  ctx.effect(() =>
    shell.nav({ id: 'edited', area: 'side', group: 'SMART COLLECTIONS', label: '◷ Recently edited', path: '/edited', order: 110 }),
  )
  ctx.effect(() => shell.nav({ id: 'uploads', area: 'side', group: 'SMART COLLECTIONS', label: '⇧ Uploads', path: '/uploads', order: 120 }))

  const render = (view: View, url: string, requestedPage: string): string => {
    const photos = gallery.photos(view.filter)
    const pages = Math.max(1, Math.ceil(photos.length / PAGE_SIZE))
    const parsed = Number.parseInt(requestedPage, 10)
    const page = Math.min(pages, Math.max(1, Number.isFinite(parsed) ? parsed : 1))
    const visible = photos.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    const base = view.id === undefined ? '/recent' : `/${view.id}`
    const urlFor = (target: number): string => `${shell.href(base)}${target > 1 ? `?page=${String(target)}` : ''}`
    const body =
      photos.length === 0
        ? emptyState(view.emptyTitle, view.emptyText, shell.href('/'))
        : `${grid(visible, shell.href)}${pager({ total: photos.length, page, pageSize: PAGE_SIZE, url: urlFor })}`
    const main = `${shell.notice(url)}${pageHead({ kicker: view.kicker, title: view.title, subtitle: view.subtitle, action: addPhotographs(shell.href('/upload')) })}${body}`
    return shell.page({ ...(view.id === undefined ? {} : { active: view.id }), ...(view.navActive === undefined ? {} : { navActive: view.navActive }), title: view.title, main })
  }

  const editedSince = new Date(gallery.now.getTime() - 14 * DAY).toISOString()
  const addedSince = new Date(gallery.now.getTime() - 30 * DAY).toISOString()

  const views: Record<string, View> = {
    favourites: {
      id: 'favourites',
      navActive: 'library',
      kicker: 'SMART COLLECTION / FAVOURITES',
      title: 'Favourites',
      subtitle: 'The frames you keep coming back to. Mark one with the heart in its lightbox.',
      filter: { favourites: true },
      emptyTitle: 'No favourites yet.',
      emptyText: 'Open a photograph and add it to favourites; it will wait for you here.',
    },
    edited: {
      id: 'edited',
      navActive: 'library',
      kicker: 'SMART COLLECTION / RECENTLY EDITED',
      title: 'Recently edited',
      subtitle: 'Every photograph whose note or tags changed in the last fourteen days.',
      filter: { editedSince, sort: 'edited' },
      emptyTitle: 'Nothing edited lately.',
      emptyText: 'Favouriting or sharing a frame updates its edit stamp, so it appears here.',
    },
    uploads: {
      id: 'uploads',
      navActive: 'library',
      kicker: 'SMART COLLECTION / UPLOADS',
      title: 'Uploads',
      subtitle: 'Frames added through the upload form, newest first by the day they arrived.',
      filter: { origin: 'upload', sort: 'added' },
      emptyTitle: 'No uploads yet.',
      emptyText: 'Add the first photograph and it will be kept here.',
    },
    recent: {
      id: undefined,
      navActive: 'recent',
      kicker: 'SMART COLLECTION / RECENTLY ADDED',
      title: 'Recently added',
      subtitle: 'What arrived in the archive over the last thirty days.',
      filter: { addedSince, sort: 'added' },
      emptyTitle: 'Nothing new this month.',
      emptyText: 'The archive is quiet. Add a photograph to start the month.',
    },
  }

  const app = new Acryl()
    .get('/favourites', (c) => c.html(render(views.favourites as View, c.req.url, c.req.query('page') ?? '1')))
    .get('/edited', (c) => c.html(render(views.edited as View, c.req.url, c.req.query('page') ?? '1')))
    .get('/uploads', (c) => c.html(render(views.uploads as View, c.req.url, c.req.query('page') ?? '1')))
    .get('/recent', (c) => c.html(render(views.recent as View, c.req.url, c.req.query('page') ?? '1')))

  ctx.router.route(prefix === '' ? '/' : prefix, app)
}
