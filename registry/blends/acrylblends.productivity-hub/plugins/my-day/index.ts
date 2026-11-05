/**
 * My Day (`/`): the day's one focus, its next actions, what was done today and two recent notes, read from the hub; the calendar's week in the
 * rail (its own agenda when the calendar is off), and any other plugin's home widget under the notes. Links to Tasks, Notes and Calendar show only
 * while those plugins are on. Every change is a form that posts here and lands back on the page with a notice; the hub does the writing.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { myDayPage } from './page.ts'

export const name = 'my-day'
export const inject = ['hub', 'hubShell', 'home', 'router']

const HREF = '/'
const noticeUrl = (base: string, kind: 'ok' | 'error', text: string): string => `${base}?${kind}=${encodeURIComponent(text)}`

export function apply(ctx: Context): void {
  const shell = ctx.hubShell
  const back = (kind: 'ok' | 'error', text: string): string => noticeUrl(shell.href(HREF), kind, text)
  const messageOf = (cause: unknown): string => (cause instanceof Error && cause.message !== '' ? cause.message : 'Something went wrong.')
  const plate = (): number => {
    const day = ctx.hub.day()
    return day.next.length + (day.focus === undefined ? 0 : 1) + day.done.length
  }

  ctx.effect(() => shell.nav({ id: 'my-day', label: 'My day', icon: '◷', path: HREF, order: 10, count: plate }))

  const render = async (url: string): Promise<string> =>
    myDayPage({
      view: ctx.hub.day(),
      projects: ctx.hub.projects(),
      openTasks: ctx.hub.tasks({ status: 'open' }),
      week: ctx.hub.week(),
      widgets: ctx.home.widgets(),
      shell,
      url,
    })

  const app = new Acryl()
    .get('/', async (c) => c.html(await render(c.req.url)))
    .post('/day/tasks/:id/complete', async (c) => {
      try {
        await ctx.hub.completeTask(c.req.param('id'))
        return c.redirect(back('ok', 'Task completed.'), 303)
      } catch (cause) {
        return c.redirect(back('error', messageOf(cause)), 303)
      }
    })
    .post('/day/focus', async (c) => {
      const body = await c.req.parseBody()
      const taskId = typeof body.taskId === 'string' ? body.taskId : ''
      if (taskId === '') return c.redirect(back('error', 'Choose a task to focus on.'), 303)
      try {
        await ctx.hub.setFocus(taskId)
        return c.redirect(back('ok', 'Focus set for today.'), 303)
      } catch (cause) {
        return c.redirect(back('error', messageOf(cause)), 303)
      }
    })

  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  // The frame opens the app's tile at `<prefix>/` and the router tells `/app` from `/app/`: serve the day at both. Links use `<prefix>` (shell.href('/')).
  if (shell.prefix !== '') ctx.router.route(`${shell.prefix}/`, new Acryl().get('/', async (c) => c.html(await render(c.req.url))))
}
