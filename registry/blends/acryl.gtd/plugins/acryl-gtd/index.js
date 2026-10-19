/**
 * acryl-gtd: Getting Things Done (David Allen) - capture, triage, next actions, waiting for, someday/maybe,
 * reference, and a calendar of due dates - grown from the Blank Blueprint as one ordinary Cordis plugin. A fresh
 * implementation of the method, not a port of any other GTD app; tools the agent calls on the user's behalf, the
 * same shape as acryl-organizer. The data lives in `<workspace>/.acryl/gtd.json`. Remove the plugin and the tools
 * go; the data file stays with the project.
 *
 * The board is this app's main surface (`client.js`, through acryl-app-shell), with the agent's conversation beside it: a
 * kanban board of the buckets, a list per bucket, a week calendar of due dates and project progress, reading and writing
 * the same store the tools use, through same-origin loopback routes this plugin owns. Earlier versions showed a chat card
 * and then a separate page at `/gtd`; both were the wrong shape (specs/036-cordis-ecosystem-and-acryl-blends/
 * blend-instance-design.md 0a): a domain plugin's own UI is a slot registration, never a Host route.
 * `lib/http.js` inlines the loopback/JSON-body checks rather than depending on `acryl-loopback-http`: this
 * extension is vendored into whatever project grows from the Blueprint, outside the monorepo's own workspace
 * linking, and (discovered live, in a Blank-grown app) nothing guarantees that package is resolvable there -
 * `acryl-agent-control`, the one row that does depend on it, is not part of Blank's rows at all.
 *
 * Surfaces: tui web desktop (tools need no browser; the board needs `webServer` and a browser, web/desktop only).
 */
import { isAbsolute, join } from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'
import * as domain from './lib/domain.js'
import { error, finishJson, isLoopbackAddress, isSameOriginLoopbackRequest, parseJsonPostBody, INVALID_BODY } from './lib/http.js'
import { fileStore } from './lib/store.js'

export const name = 'acryl-gtd'
// appInstance: the app's own bulkhead (docs/acryl/APP-INSTANCES-AND-BULKHEADS.md). Both the board and the tools keep the data in the app's instance
// home, never in `process.cwd()` (inside this engine process that is the shared checkout that launched it, not the per-app folder) and never in the
// chat session's workspace (a tool that wrote there left the board empty: the agent captured items and the page showed none, found live 2026-10-19).
export const inject = ['tools', 'webServer', 'appInstance']

/**
 * The board route body may name its own workspace (`cwd`); when it does not, the data lives with the app itself
 * (its instance home) - a todo app's own tasks belong to the app, not to whatever coding workspace happens to be
 * selected in chat. This is also what makes the board a URL you can just open: no query param, no chat message,
 * required.
 */
function resolveCwd(value, appHome) {
  if (value === undefined || value === null || value === '') return appHome
  if (typeof value !== 'string' || !isAbsolute(value)) throw new Error('cwd must be an absolute path')
  return value
}
const storeForCwd = cwd => fileStore(join(cwd, '.acryl', 'gtd.json'))

const text = (_args, value) => [{ type: 'text', text: value }]
const output = { schema: { type: 'string' }, render: text }

/** One use case = one tool: load, apply a domain rule, save, describe the result. The data is the app's own, wherever the chat's workspace is, so the board shows what the agent captures. */
const makeUseCase = openStore => (definition, run) => {
  return defineTool({
    ...definition,
    output,
    async execute(args) {
      const store = openStore()
      const state = store.load()
      try {
        return run(state, args, store)
      } catch (error) {
        if (error instanceof domain.GtdError) throw new Error(error.message)
        throw error
      }
    },
  })
}

const list = lines => lines.length === 0 ? '(none)' : lines.join('\n')
const itemLine = item => {
  const bits = [`#${item.id} ${item.title}`]
  if (item.project) bits.push(`[${item.project}]`)
  if (item.due) bits.push(`(due ${item.due})`)
  if (item.tags.length > 0) bits.push(item.tags.map(tag => `@${tag}`).join(' '))
  return bits.join(' ')
}
const projectLine = summary => `${summary.project}: ${summary.open} open, ${summary.done} done`

export function apply(ctx) {
  const useCase = makeUseCase(() => storeForCwd(ctx.appInstance.home))
  const tools = [
    useCase({ name: 'gtd_capture', description: 'Capture something into the inbox - get it out of your head. Nothing is decided yet.', parameters: { title: { type: 'string', required: true, description: 'What it is' }, note: { type: 'string', description: 'Extra detail' }, due: { type: 'string', description: 'Due day, YYYY-MM-DD, if it has one' }, tags: { type: 'array', items: { type: 'string' }, description: 'Contexts, e.g. @calls, @errands' } } },
      (state, args, store) => { const next = domain.capture(state, args); store.save(next); return `Captured ${itemLine(next.items.at(-1))}` }),
    useCase({ name: 'gtd_inbox', description: 'List everything waiting to be triaged.', parameters: {} }, state => list(domain.byStatus(state, 'inbox').map(itemLine))),
    useCase({ name: 'gtd_triage', description: 'Decide what an inbox item is: a next action, waiting for someone else, someday/maybe, reference material, or done. The one GTD decision.', parameters: { id: { type: 'number', required: true, description: 'Item number' }, status: { type: 'string', required: true, description: 'next, waiting, someday, reference, done or trash' }, project: { type: 'string', description: 'Which project this belongs to, if any' }, due: { type: 'string', description: 'Due day, YYYY-MM-DD' }, tags: { type: 'array', items: { type: 'string' }, description: 'Replace the contexts' } } },
      (state, args, store) => { const next = domain.triage(state, { ...args, id: Number(args.id) }); store.save(next); const item = next.items.find(candidate => candidate.id === Number(args.id)); return `#${args.id} is now ${item.status}: ${itemLine(item)}` }),
    useCase({ name: 'gtd_complete', description: 'Mark a next action or waiting-for item done.', parameters: { id: { type: 'number', required: true, description: 'Item number' } } },
      (state, args, store) => { store.save(domain.complete(state, Number(args.id))); return `Done: #${args.id}` }),
    useCase({ name: 'gtd_next', description: 'List next actions - things to actually do.', parameters: {} }, state => list(domain.byStatus(state, 'next').map(itemLine))),
    useCase({ name: 'gtd_waiting', description: "List what you're waiting on someone else for.", parameters: {} }, state => list(domain.byStatus(state, 'waiting').map(itemLine))),
    useCase({ name: 'gtd_someday', description: 'List someday/maybe: not now, not never.', parameters: {} }, state => list(domain.byStatus(state, 'someday').map(itemLine))),
    useCase({ name: 'gtd_reference', description: 'List reference material: no action needed, kept for later.', parameters: {} }, state => list(domain.byStatus(state, 'reference').map(itemLine))),
    useCase({ name: 'gtd_projects', description: 'List every project in play, with open and done counts.', parameters: {} }, state => list(domain.projects(state).map(projectLine))),
    useCase({ name: 'gtd_project', description: 'List every item in one project.', parameters: { project: { type: 'string', required: true, description: 'Project name' } } },
      (state, args) => list(domain.itemsForProject(state, args.project).map(itemLine))),
    useCase({ name: 'gtd_agenda', description: 'What is due on one day.', parameters: { day: { type: 'string', required: true, description: 'YYYY-MM-DD' } } },
      (state, args) => { const due = domain.agenda(state, args.day); return `Due ${args.day}:\n${list(due.map(itemLine))}` }),
    useCase({ name: 'gtd_upcoming', description: 'What is due over the next few days (default 7).', parameters: { from: { type: 'string', required: true, description: 'First day, YYYY-MM-DD' }, days: { type: 'number', description: 'How many days (default 7)' } } },
      (state, args) => { const weeks = domain.upcoming(state, args.from, args.days === undefined ? 7 : Number(args.days)); return weeks.length === 0 ? '(nothing due)' : weeks.map(day => `${day.day}:\n${list(day.items.map(itemLine))}`).join('\n') }),
    useCase({ name: 'gtd_board', description: 'Say where the GTD board is: it is this app\'s main view, next to this chat (board, list, calendar, projects), and it updates as items change. Use it when the user asks where to see their tasks.', parameters: {} },
      state => `The board is the app's main view, to the left of this chat, and it updates by itself: ${state.items.length} item(s) across ${domain.projects(state).length} project(s) right now.`),
  ]
  for (const tool of tools) ctx.effect(() => ctx.tools.register(tool), `acryl-gtd: ${tool.name}`)

  const origin = `http://127.0.0.1:${String(ctx.webServer.port)}`

  // The data routes the board calls: same-origin fetches from the app's own page, loopback only.
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/api/acryl-gtd/state',
    handler: (req, res) => {
      if (req.method !== 'GET') return finishJson(res, 405, error('method not allowed'), 'GET')
      if (!isSameOriginLoopbackRequest(req, origin, false)) return finishJson(res, 403, error('forbidden'))
      let cwd
      try { cwd = resolveCwd(new URL(req.url ?? '', origin).searchParams.get('cwd'), ctx.appInstance.home) } catch (cause) { return finishJson(res, 400, error(cause.message)) }
      finishJson(res, 200, storeForCwd(cwd).load())
    },
  }), 'acryl-gtd: state route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/api/acryl-gtd/capture',
    handler: async (req, res) => {
      if (req.method !== 'POST') return finishJson(res, 405, error('method not allowed'), 'POST')
      if (!isSameOriginLoopbackRequest(req, origin, true)) return finishJson(res, 403, error('forbidden'))
      const body = await parseJsonPostBody(req, res)
      if (body === INVALID_BODY) return
      try {
        const cwd = resolveCwd(body?.cwd, ctx.appInstance.home)
        const store = storeForCwd(cwd)
        const next = domain.capture(store.load(), body)
        store.save(next)
        finishJson(res, 200, next)
      } catch (cause) {
        finishJson(res, cause instanceof domain.GtdError ? 422 : 400, error(cause.message))
      }
    },
  }), 'acryl-gtd: capture route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/api/acryl-gtd/triage',
    handler: async (req, res) => {
      if (req.method !== 'POST') return finishJson(res, 405, error('method not allowed'), 'POST')
      if (!isSameOriginLoopbackRequest(req, origin, true)) return finishJson(res, 403, error('forbidden'))
      const body = await parseJsonPostBody(req, res)
      if (body === INVALID_BODY) return
      try {
        const cwd = resolveCwd(body?.cwd, ctx.appInstance.home)
        const store = storeForCwd(cwd)
        const next = domain.triage(store.load(), { ...body, id: Number(body?.id) })
        store.save(next)
        finishJson(res, 200, next)
      } catch (cause) {
        finishJson(res, cause instanceof domain.GtdError ? 422 : 400, error(cause.message))
      }
    },
  }), 'acryl-gtd: triage route')
}
