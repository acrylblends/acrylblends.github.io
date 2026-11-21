/**
 * The game: its files in `public/`, served at the app's root, so a browser's first screen is the game itself. Every URL the game asks for
 * (its scripts, models, textures, sounds) is a file under `public/`, so the same folder runs on the app's own server (`npm start`, at `/`)
 * and in the ACRYL frame (`npm run dev`, under `/app/`).
 *
 * What the game does not answer goes on to the app's own routes: a path it has no file for (`/health`, `/about`), and the root asked for by
 * an API client rather than a browser, which still gets the app's JSON hello.
 */
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { serveStatic } from '../node-server/src/index.ts'
import { Acryl } from '../router/src/index.ts'

export const name = 'game'
export const inject = ['router']

/** The game's files. */
export const PUBLIC_DIR = fileURLToPath(new URL('./public/', import.meta.url))

/** The path the game is mounted at, from the route that matched: '' at the root, '/app' in the frame. */
const mountOf = (routePath: string): string => routePath.replace(/\/?\*$/u, '')

export function apply(ctx: Context): void {
  const serve = serveStatic({ root: PUBLIC_DIR, rewriteRequestPath: (path, c) => path.slice(mountOf(c.req.routePath).length) || '/' })
  const game = new Acryl()
    // A page goes out without its file's length: in development the door adds its script to every page, and the router copies the old
    // response's headers onto the new one, so a stale length would cut the longer page short.
    .use('*', async (c, next) => {
      await next()
      if ((c.res.headers.get('content-type') ?? '').includes('text/html')) c.res.headers.delete('content-length')
    })
    .use('*', async (c, next) => {
      const mount = mountOf(c.req.routePath)
      // The address as the browser sent it (the frame hands /app/ to its routes as /app). The game's page links its files relatively
      // (./bundle.js), so its address must end in a slash: /app becomes /app/.
      const sent = new URL(c.req.url)
      if (mount !== '' && sent.pathname === mount) return c.redirect(`${mount}/${sent.search}`, 308)
      const atRoot = c.req.path.slice(mount.length) === '' || c.req.path.slice(mount.length) === '/'
      if (atRoot && !(c.req.header('accept') ?? '').includes('text/html')) return next()
      return serve(c, next)
    })
  ctx.router.route('/', game)
}
