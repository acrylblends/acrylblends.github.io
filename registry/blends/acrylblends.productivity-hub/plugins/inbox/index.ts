/**
 * The Inbox (`/inbox`): quick capture from its own field or the sidebar's, and triage of each capture into a task (with a due date and a space) or a
 * note, or a discard. It mounts at the shell's prefix and links with the shell's href, so it answers at `/inbox` on its own server and `/app/inbox`
 * in the frame.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { todayOf } from './format.ts'
import { inboxPage } from './page.ts'

export const name = 'inbox'
export const inject = ['hub', 'hubShell', 'router']

const HREF = '/inbox'
const noticeUrl = (base: string, kind: 'ok' | 'error', text: string): string => `${base}?${kind}=${encodeURIComponent(text)}`

const field = (body: Record<string, unknown>, key: string): string | undefined => {
  const value = body[key]
  return typeof value === 'string' ? value : undefined
}

export function apply(ctx: Context): void {
  const shell = ctx.hubShell
  const back = (kind: 'ok' | 'error', text: string): string => noticeUrl(shell.href(HREF), kind, text)
  const messageOf = (cause: unknown): string => (cause instanceof Error && cause.message !== '' ? cause.message : 'Something went wrong.')

  ctx.effect(() => shell.nav({ id: 'inbox', label: 'Inbox', icon: '▦', path: HREF, order: 20, count: () => ctx.hub.inbox().length }))

  const app = new Acryl()
    .get('/inbox', (c) => {
      const now = ctx.hub.now()
      return c.html(inboxPage({
        items: ctx.hub.inbox(),
        projects: ctx.hub.projects(),
        today: todayOf(now),
        now,
        shell,
        url: c.req.url,
      }))
    })
    .post('/inbox', async (c) => {
      const body = await c.req.parseBody()
      try {
        await ctx.hub.capture(field(body, 'text'))
        return c.redirect(back('ok', 'Captured.'), 303)
      } catch (cause) {
        return c.redirect(back('error', messageOf(cause)), 303)
      }
    })
    .post('/inbox/:id/task', async (c) => {
      const body = await c.req.parseBody()
      try {
        await ctx.hub.triage(c.req.param('id'), { kind: 'task', dueAt: field(body, 'dueAt'), projectId: field(body, 'projectId') })
        return c.redirect(back('ok', 'Moved to your tasks.'), 303)
      } catch (cause) {
        return c.redirect(back('error', messageOf(cause)), 303)
      }
    })
    .post('/inbox/:id/note', async (c) => {
      try {
        await ctx.hub.triage(c.req.param('id'), { kind: 'note' })
        return c.redirect(back('ok', 'Saved as a note.'), 303)
      } catch (cause) {
        return c.redirect(back('error', messageOf(cause)), 303)
      }
    })
    .post('/inbox/:id/discard', async (c) => {
      try {
        await ctx.hub.discard(c.req.param('id'))
        return c.redirect(back('ok', 'Discarded.'), 303)
      } catch (cause) {
        return c.redirect(back('error', messageOf(cause)), 303)
      }
    })

  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
}
