/**
 * The AOS desktop as data: which icons sit on the desktop, in the dock and in folders, the files a person keeps there, and the look (wallpaper, icon
 * size, dock side, chat shown). One file, `<ACRYL home>/desktop.json` (spec 052 D13; `layout.json` beside it is the instance storage's format file and
 * `control-center-apps.json` the app list, so this file holds only the arrangement). The person's clicks, the page and the agent's `desktop_*` tools all
 * change it through the functions below, so a drag and a tool call cannot disagree.
 *
 * An item id is an app id from the app list, a folder id (`f-...`), a file id (`file-...`) or one of AOS's own views (`files`, `activity`, `settings`).
 * Apps are never stored as anything but their id: the app list stays the one source of what apps exist, and `reconcile` adds new apps and drops gone ones.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export const DESKTOP_FILE = 'desktop.json'
export const DESKTOP_VERSION = 1
/** AOS's own views: drawn inside AOS (they are AOS, not apps), always on the desktop's list of known items. */
export const VIEWS = ['files', 'activity', 'settings'] as const
export type View = (typeof VIEWS)[number]
export const WALLPAPERS = ['default', 'dusk', 'mint', 'plain'] as const
export type Wallpaper = (typeof WALLPAPERS)[number]

export interface Folder { readonly name: string; readonly items: string[] }
/** A file on the desktop: its path on disk and the app that opens it. */
export interface DeskFile { readonly name: string; readonly path: string; readonly app?: string }
/** `sleepAfter`: minutes an app may sit unused before its host stops (it wakes on the next open); 0 never. */
export interface Prefs { wallpaper: Wallpaper; big: boolean; chat: boolean; dockLeft: boolean; sleepAfter: number }
export interface Desktop {
  readonly version: number
  desk: string[]
  dock: string[]
  folders: Record<string, Folder>
  files: Record<string, DeskFile>
  prefs: Prefs
}

export class DesktopRefusal extends Error {}

const isView = (id: string): id is View => (VIEWS as readonly string[]).includes(id)

/** The first desktop: every app, then AOS's views; the dock holds Files, the first apps and Settings. */
export function freshDesktop(appIds: readonly string[]): Desktop {
  return {
    version: DESKTOP_VERSION,
    desk: [...appIds, ...VIEWS],
    dock: ['files', ...appIds.slice(0, 5), 'activity', 'settings'],
    folders: {},
    files: {},
    prefs: { wallpaper: 'default', big: false, chat: true, dockLeft: false, sleepAfter: 15 },
  }
}

/** Where an item sits: 'desk', a folder id, or undefined when it is nowhere (an app made since the file was written). */
export function parentOf(desktop: Desktop, id: string): string | undefined {
  if (desktop.desk.includes(id)) return 'desk'
  return Object.keys(desktop.folders).find((f) => desktop.folders[f]?.items.includes(id))
}

const listOf = (desktop: Desktop, where: string): string[] => {
  if (where === 'desk') return desktop.desk
  const folder = desktop.folders[where]
  if (folder === undefined) throw new DesktopRefusal(`there is no folder ${where}`)
  return folder.items
}

/** Bring the file in line with the app list: an app made since lands on the desktop, a removed app leaves every list. */
export function reconcile(desktop: Desktop, appIds: readonly string[]): Desktop {
  const known = new Set<string>([...appIds, ...VIEWS, ...Object.keys(desktop.folders), ...Object.keys(desktop.files)])
  const keep = (list: string[]): string[] => list.filter((id) => known.has(id))
  const next: Desktop = {
    ...desktop,
    desk: keep(desktop.desk),
    dock: keep(desktop.dock),
    folders: Object.fromEntries(Object.entries(desktop.folders).map(([id, f]) => [id, { ...f, items: keep(f.items) }])),
  }
  for (const id of [...appIds, ...VIEWS]) if (parentOf(next, id) === undefined) next.desk.push(id)
  return next
}

/** Resolve what a person or a model names: an id, or a folder, file or app by its shown name (case does not matter). */
export function resolveItem(desktop: Desktop, nameOrId: string, names: Readonly<Record<string, string>> = {}): string {
  const all = [...new Set([...desktop.desk, ...Object.values(desktop.folders).flatMap((f) => f.items), ...Object.keys(desktop.folders)])]
  if (all.includes(nameOrId)) return nameOrId
  const wanted = nameOrId.trim().toLowerCase()
  const nameOf = (id: string): string => desktop.folders[id]?.name ?? desktop.files[id]?.name ?? names[id] ?? id
  const found = all.find((id) => nameOf(id).toLowerCase() === wanted)
  if (found === undefined) throw new DesktopRefusal(`nothing on the desktop is called "${nameOrId}"`)
  return found
}

/** Move an item onto the desktop or into a folder. A folder stays on the desktop (folders in folders are not built). */
export function moveItem(desktop: Desktop, id: string, to: string): void {
  if (id === to) throw new DesktopRefusal('an item cannot go into itself')
  if (desktop.folders[id] !== undefined && to !== 'desk') throw new DesktopRefusal('a folder stays on the desktop; folders in folders are not built')
  const target = listOf(desktop, to)
  const from = parentOf(desktop, id)
  if (from === to) return
  if (from !== undefined) {
    const list = listOf(desktop, from)
    list.splice(list.indexOf(id), 1)
  }
  target.push(id)
}

export function newFolder(desktop: Desktop, name: string, id = `f-${Math.random().toString(36).slice(2, 8)}`): string {
  const clean = name.trim()
  if (clean === '') throw new DesktopRefusal('a folder needs a name')
  desktop.folders[id] = { name: clean, items: [] }
  desktop.desk.push(id)
  return id
}

/** Remove a folder; what was in it goes back on the desktop where the folder was. */
export function removeFolder(desktop: Desktop, id: string): void {
  const folder = desktop.folders[id]
  if (folder === undefined) throw new DesktopRefusal(`there is no folder ${id}`)
  const at = desktop.desk.indexOf(id)
  desktop.desk.splice(at < 0 ? desktop.desk.length : at, at < 0 ? 0 : 1, ...folder.items)
  desktop.dock = desktop.dock.filter((d) => d !== id)
  delete desktop.folders[id]
}

/** Rename a folder or a file (an app's name is its own, from its folder). */
export function rename(desktop: Desktop, id: string, name: string): void {
  const clean = name.trim()
  if (clean === '') throw new DesktopRefusal('a name cannot be empty')
  if (desktop.folders[id] !== undefined) desktop.folders[id] = { ...desktop.folders[id], name: clean }
  else if (desktop.files[id] !== undefined) desktop.files[id] = { ...desktop.files[id], name: clean }
  else throw new DesktopRefusal('only folders and files are renamed here; an app keeps its own name')
}

export function addFile(desktop: Desktop, file: DeskFile, id = `file-${Math.random().toString(36).slice(2, 8)}`): string {
  desktop.files[id] = file
  desktop.desk.push(id)
  return id
}

export function setDock(desktop: Desktop, id: string, keep: boolean): void {
  desktop.dock = desktop.dock.filter((d) => d !== id)
  if (keep) desktop.dock.push(id)
}

/** Sort the desktop by name, or by kind (folders, then apps and views, then files) and name. */
export function sortDesk(desktop: Desktop, by: 'name' | 'kind', names: Readonly<Record<string, string>> = {}): void {
  const nameOf = (id: string): string => desktop.folders[id]?.name ?? desktop.files[id]?.name ?? names[id] ?? id
  const rank = (id: string): number => (desktop.folders[id] !== undefined ? 0 : desktop.files[id] !== undefined ? 2 : 1)
  desktop.desk.sort((a, b) => (by === 'kind' ? rank(a) - rank(b) : 0) || nameOf(a).localeCompare(nameOf(b)))
}

export function setPrefs(desktop: Desktop, change: Partial<Prefs>): void {
  if (change.wallpaper !== undefined && !(WALLPAPERS as readonly string[]).includes(change.wallpaper))
    throw new DesktopRefusal(`the wallpapers are ${WALLPAPERS.join(', ')}`)
  for (const key of ['big', 'chat', 'dockLeft'] as const)
    if (change[key] !== undefined && typeof change[key] !== 'boolean') throw new DesktopRefusal(`${key} is true or false`)
  if (change.sleepAfter !== undefined && !(Number.isInteger(change.sleepAfter) && change.sleepAfter >= 0 && change.sleepAfter <= 1440))
    throw new DesktopRefusal('sleepAfter is whole minutes from 0 (never) to 1440')
  desktop.prefs = { ...desktop.prefs, ...Object.fromEntries(Object.entries(change).filter(([, v]) => v !== undefined)) }
}

/** The desktop in `home`, made fresh on the first read and reconciled with the app list on every read. A broken file is kept aside, never lost. */
export function readDesktop(home: string, appIds: readonly string[]): Desktop {
  const file = join(home, DESKTOP_FILE)
  if (!existsSync(file)) return freshDesktop(appIds)
  try {
    const value = JSON.parse(readFileSync(file, 'utf8')) as Partial<Desktop>
    if (value.version !== DESKTOP_VERSION || !Array.isArray(value.desk)) throw new Error('not a desktop file')
    const fresh = freshDesktop(appIds)
    return reconcile({
      version: DESKTOP_VERSION,
      desk: value.desk.filter((x): x is string => typeof x === 'string'),
      dock: Array.isArray(value.dock) ? value.dock.filter((x): x is string => typeof x === 'string') : fresh.dock,
      folders: value.folders ?? {},
      files: value.files ?? {},
      prefs: { ...fresh.prefs, ...value.prefs },
    }, appIds)
  } catch {
    renameSync(file, `${file}.broken-${Date.now()}`)
    return freshDesktop(appIds)
  }
}

/** Written whole: to a sibling first, then renamed over, so a crash never leaves half a file. */
export function writeDesktop(home: string, desktop: Desktop): void {
  const file = join(home, DESKTOP_FILE)
  mkdirSync(dirname(file), { recursive: true })
  const next = `${file}.${process.pid}.next`
  writeFileSync(next, `${JSON.stringify(desktop, null, 2)}\n`)
  renameSync(next, file)
}

export { isView }
