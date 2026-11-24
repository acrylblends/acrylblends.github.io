/**
 * What the agent can do on this computer, as deterministic tools: arrange the desktop (`desktop_*`), open, stop and list apps (`system_*`), and drive
 * an open app through its own door (`app_*`: look at its page, act on it, list and call its own tools). The page's clicks call the same functions,
 * and a saved workflow replays them by name (`runTool`), so a replay does exactly what the run did, with no model.
 */
import type { Door } from '@acryldev/launcher-desktop/node'
import {
  type Desktop,
  DesktopRefusal,
  isView,
  moveItem,
  newFolder,
  type Prefs,
  removeFolder,
  rename,
  resolveItem,
  setDock,
  setPrefs,
  sortDesk,
} from './desktop.ts'

type Schema = Readonly<Record<string, unknown>>

/** One app as the tools see it: its id, shown name, folder, whether it runs. */
export interface AppInfo {
  readonly id: string
  readonly name: string
  readonly path: string
  readonly state: string
  readonly surface: string
}

/** What the tools act on; the plugin wires it to the launcher service, the door client and desktop.json. */
export interface ComputerPorts {
  apps(): readonly AppInfo[]
  /** Read the desktop, change it, write it back; returns what `change` returned. */
  arrange<T>(change: (desktop: Desktop, names: Readonly<Record<string, string>>) => T): T
  desktop(): Desktop
  open(id: string): void
  stop(id: string): void
  readonly door: Door
}

export interface AosTool {
  readonly name: string
  readonly description: string
  readonly parameters: Schema
  run(input: Record<string, unknown>, ports: ComputerPorts): Promise<unknown> | unknown
}

const object = (properties: Record<string, unknown>, required: readonly string[] = []): Schema => ({ type: 'object', properties, required, additionalProperties: false })
const str = (description: string): Schema => ({ type: 'string', description })
const text = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || value.trim() === '') throw new DesktopRefusal(`${field} is required`)
  return value
}

/** An app named by its id or its name (case does not matter). */
export function findApp(ports: ComputerPorts, nameOrId: unknown): AppInfo {
  const wanted = text(nameOrId, 'app').trim().toLowerCase()
  const app = ports.apps().find((a) => a.id.toLowerCase() === wanted || a.name.toLowerCase() === wanted)
  if (app === undefined) throw new DesktopRefusal(`there is no app "${String(nameOrId)}"; system_apps lists them`)
  return app
}

/** Call a verb of a running app's door; an app that is not running is told so, never started behind the person's back. */
async function door(ports: ComputerPorts, nameOrId: unknown, verb: string, args: Record<string, unknown>): Promise<unknown> {
  const app = findApp(ports, nameOrId)
  // Its door answers when the app runs, whoever started it (AOS, the Control Center, a terminal).
  const answer = await ports.door.call(app.path, verb, args).catch((cause: unknown) => {
    throw new DesktopRefusal(`${app.name} is not running (${cause instanceof Error ? cause.message : String(cause)}); open it first with system_open`)
  })
  if (!answer.ok) throw new DesktopRefusal(`${answer.code ?? 'failed'}: ${answer.message ?? `the door of ${app.name} refused ${verb}`}`)
  return answer.value ?? answer.text
}

const view = (desktop: Desktop, names: Readonly<Record<string, string>>) => {
  const nameOf = (id: string): string => desktop.folders[id]?.name ?? desktop.files[id]?.name ?? names[id] ?? id
  const kind = (id: string): string => (desktop.folders[id] ? 'folder' : desktop.files[id] ? 'file' : isView(id) ? 'view' : 'app')
  const item = (id: string) => ({ id, name: nameOf(id), kind: kind(id) })
  return {
    desktop: desktop.desk.map(item),
    folders: Object.entries(desktop.folders).map(([id, f]) => ({ id, name: f.name, items: f.items.map(item) })),
    dock: desktop.dock.map(item),
    prefs: desktop.prefs,
  }
}

export const AOS_TOOLS: readonly AosTool[] = [
  {
    name: 'desktop_get',
    description: 'What is on the AOS desktop: the icons on it, the folders and what is in each, the dock, and the look (wallpaper, icon size, dock side, chat).',
    parameters: object({}),
    run: (_input, ports) => ports.arrange(view),
  },
  {
    name: 'desktop_folder_create',
    description: 'Make a folder on the desktop. Answers its id; an existing folder of that name is reused.',
    parameters: object({ name: str('The folder name, such as "Sales"') }, ['name']),
    run: (input, ports) => ports.arrange((d) => {
      const name = text(input.name, 'name').trim()
      const existing = Object.entries(d.folders).find(([, f]) => f.name.toLowerCase() === name.toLowerCase())?.[0]
      return { folder: existing ?? newFolder(d, name), created: existing === undefined }
    }),
  },
  {
    name: 'desktop_move',
    description: 'Move apps, files or folders onto the desktop ("desk") or into a folder. Items and the target are named by id or by their shown name.',
    parameters: object({ items: { type: 'array', items: { type: 'string' }, description: 'What to move' }, to: str('A folder (id or name), or "desk"') }, ['items', 'to']),
    run: (input, ports) => ports.arrange((d, names) => {
      if (!Array.isArray(input.items) || input.items.length === 0) throw new DesktopRefusal('items is a list of what to move')
      const to = text(input.to, 'to') === 'desk' ? 'desk' : resolveItem(d, text(input.to, 'to'), names)
      const moved = input.items.map((name) => { const id = resolveItem(d, text(name, 'item'), names); moveItem(d, id, to); return id })
      return { moved, to }
    }),
  },
  {
    name: 'desktop_rename',
    description: 'Rename a folder or a file on the desktop.',
    parameters: object({ item: str('The folder or file (id or name)'), name: str('Its new name') }, ['item', 'name']),
    run: (input, ports) => ports.arrange((d, names) => { const id = resolveItem(d, text(input.item, 'item'), names); rename(d, id, text(input.name, 'name')); return { renamed: id } }),
  },
  {
    name: 'desktop_folder_remove',
    description: 'Remove a folder; what was in it goes back on the desktop. Nothing is deleted.',
    parameters: object({ folder: str('The folder (id or name)') }, ['folder']),
    run: (input, ports) => ports.arrange((d, names) => { const id = resolveItem(d, text(input.folder, 'folder'), names); removeFolder(d, id); return { removed: id } }),
  },
  {
    name: 'desktop_dock',
    description: 'Keep an app or view in the dock, or take it out.',
    parameters: object({ item: str('The app or view (id or name)'), keep: { type: 'boolean' } }, ['item', 'keep']),
    run: (input, ports) => ports.arrange((d, names) => { const id = resolveItem(d, text(input.item, 'item'), names); setDock(d, id, input.keep === true); return { dock: d.dock } }),
  },
  {
    name: 'desktop_arrange',
    description: 'Change how the desktop looks: sort the icons (by name or by kind), wallpaper (default, dusk, mint, plain), large icons, the dock on the left, the chat shown.',
    parameters: object({
      sort: { type: 'string', enum: ['name', 'kind'] },
      wallpaper: { type: 'string', enum: ['default', 'dusk', 'mint', 'plain'] },
      big: { type: 'boolean' }, dockLeft: { type: 'boolean' }, chat: { type: 'boolean' },
    }),
    run: (input, ports) => ports.arrange((d, names) => {
      if (input.sort === 'name' || input.sort === 'kind') sortDesk(d, input.sort, names)
      setPrefs(d, { wallpaper: input.wallpaper, big: input.big, dockLeft: input.dockLeft, chat: input.chat } as Partial<Prefs>)
      return { prefs: d.prefs }
    }),
  },
  {
    name: 'system_apps',
    description: 'The apps on this computer: id, name, whether each is running, and where its folder is.',
    parameters: object({}),
    run: (_input, ports) => ({ apps: ports.apps().map(({ id, name, state, surface }) => ({ id, name, state, surface })) }),
  },
  {
    name: 'system_open',
    description: 'Open an app in its own window (it starts its own host the first time). Answers at once; the window shows when the app is up.',
    parameters: object({ app: str('The app (id or name)') }, ['app']),
    run: (input, ports) => { const app = findApp(ports, input.app); ports.open(app.id); return { opening: app.id } },
  },
  {
    name: 'system_stop',
    description: 'Stop an app: its window closes and its host ends.',
    parameters: object({ app: str('The app (id or name)') }, ['app']),
    run: (input, ports) => { const app = findApp(ports, input.app); ports.stop(app.id); return { stopped: app.id } },
  },
  {
    name: 'app_look',
    description: 'Look at the page of a running app: what it shows and the refs of what can be clicked or typed into (for app_act).',
    parameters: object({ app: str('The app (id or name)') }, ['app']),
    run: (input, ports) => door(ports, input.app, 'look', {}),
  },
  {
    name: 'app_act',
    description: 'Act on the page of a running app, as a person would: { op: "click", ref } or { op: "type", ref, text }, refs from app_look.',
    parameters: object({
      app: str('The app (id or name)'),
      op: { type: 'string', enum: ['click', 'type', 'select', 'press', 'wait', 'reload', 'navigate'] },
      ref: str('The ref from app_look'), text: str('type: what to type; wait: the text to wait for'), submit: { type: 'boolean', description: 'type: press Enter after' },
      option: str('select: the option'), key: str('press: Enter, Escape, Tab, ...'), path: str('navigate: a path of the app'),
    }, ['app', 'op']),
    run: (input, ports) => { const { app, ...act } = input; return door(ports, app, 'act', act) },
  },
  {
    name: 'app_tools',
    description: 'The tools a running app offers: its own deterministic operations, cheaper and surer than acting on its page.',
    parameters: object({ app: str('The app (id or name)') }, ['app']),
    run: (input, ports) => door(ports, input.app, 'tool-list', {}),
  },
  {
    name: 'app_call',
    description: 'Call one of a running app\'s own tools (names from app_tools) with its input.',
    parameters: object({ app: str('The app (id or name)'), tool: str('The tool name'), args: { type: 'object', description: 'The tool\'s input' } }, ['app', 'tool']),
    run: (input, ports) => door(ports, input.app, 'tool-call', { tool: text(input.tool, 'tool'), ...(input.args === undefined ? {} : { args: input.args }) }),
  },
]

export const TOOL_NAMES = AOS_TOOLS.map((t) => t.name)

/** Run a tool by name: what the chat, the page and a workflow replay all go through. */
export async function runTool(ports: ComputerPorts, name: string, input: unknown): Promise<unknown> {
  const tool = AOS_TOOLS.find((t) => t.name === name)
  if (tool === undefined) throw new DesktopRefusal(`there is no tool ${name}`)
  return tool.run((input ?? {}) as Record<string, unknown>, ports)
}
