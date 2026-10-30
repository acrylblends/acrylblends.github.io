# agent

A Cordis app on the ACRYL framework: TypeScript that Node 22.19 or newer runs directly (no build step; erasable syntax only, so no enums and no
parameter properties). Every part of it is a Cordis plugin.

## The framework's API is in `docs/framework/`

Start at `docs/framework/README.md`; `api/summary.md` is the one-page summary. Read before you write routes: `api/routing.md` (the `Acryl` app), `api/request.md` (`c.req`),
`api/context.md` (`c`), `cordis/validation.md` and `guides/validation.md`, `guides/helpers.md` (`streamSSE`), `concepts/middleware.md`, `cordis/plugin-lifecycle.md` (what a plugin
owns and when it is unloaded), `cordis/mounting.md` and `cordis/node-server.md`. Pages marked "not yet available" describe parts that are not in this app.

The docs write `import { Acryl } from 'acrylblends'` and `from 'acrylblends/<subpath>'`. In this app the framework is the vendored plugin source in `plugins/acryl-router/src`
(read it, do not edit it: a change belongs in ACRYL, upstream), so from a file in `src/` import:

- `../plugins/acryl-router/src/index.ts` for `Acryl`, `Context`, `HTTPException`, `connectionOf`, `getConnInfo` and the types;
- `../plugins/acryl-router/src/middleware/index.ts` for every middleware (`cors`, `bodyLimit`, `trimTrailingSlash`, `loopbackOnly`, ...);
- `../plugins/acryl-router/src/helpers/index.ts` for the helpers and validators (`streamSSE`, `schemaValidator`, `validator`, cookies, `testClient`, ...).
- `../plugins/acryl-router/src/core/jsx/index.ts` for `acrylblends/jsx` (`jsx`, `Fragment`, the types), and `.../core/jsx/streaming.ts` for `acrylblends/jsx/streaming`.

**JSX: write `.tsx`.** The scripts in `package.json` run Node.js with `--import ./plugins/acryl-node-server/src/register.ts`, which compiles `.tsx` files with this app's own `typescript`; `tsconfig.json` sets `jsx: react-jsx` and `jsxImportSource: #acryl-jsx`, which `package.json`'s `imports` maps to the vendored runtime in `plugins/acryl-router`. See `src/about.tsx` (blank template) for a page and `test/app.test.ts` for how it is tested. Render a component with `.toString()` and return it with `c.html(...)`; import `jsx`, `Fragment` and the types from `../plugins/acryl-router/src/core/jsx/index.ts` when you need them. A command that starts the app without those scripts (a bare `node src/main.ts`) cannot load a `.tsx` file. Without a build step you can write the call JSX compiles to instead: `jsx('h1', { class: 'title' }, 'Hello')`, children after the props.

**A plugin you install into the running app** (`.acryl/bin/acryl plugin add plugins/<name>`) **imports the framework by its package name**: `import { Acryl } from 'acrylblends'` (and `acrylblends/<subpath>`, for example `acrylblends/helpers`). `acrylblends` and `acrylblends/<subpath>` resolve to the same files as the relative paths above, and the plugin is checked in a staging copy where a relative path like `../plugins/acryl-router/src/index.ts` may not resolve (a plugin that wrote it failed its first install). Plugins that `src/app.ts` imports at start-up keep using the relative paths. `App` is the
deprecated name of `Acryl`.

## How a feature is built

Routes are an ordinary `Acryl` app that a plugin mounts once with `ctx.router.route(prefix, app)`. The mount belongs to the plugin and goes away when it unloads.

```ts
import type { Context } from '@deepseek-ai/cordis'
import { Acryl, HTTPException } from '../plugins/acryl-router/src/index.ts'
import { schemaValidator, type StandardSchema } from '../plugins/acryl-router/src/helpers/index.ts'

export const name = 'notes'               // a plugin's name; blend.yaml refers to it
export const inject = ['router']          // services it needs
export function apply(ctx: Context) {
  const app = new Acryl()
    .get('/', (c) => c.json({ ok: true }))
    .get('/:id', (c) => c.json({ id: c.req.param('id') }))
    .post('/', schemaValidator('json', NewNote), (c) => c.json(c.req.valid('json'), 201))   // NewNote is a Standard Schema
  ctx.router.route('/notes', app)         // build the whole app first: routes added after route() are not served
}
```

- A small route goes on the `App` in `src/routes.ts`. A new feature is a new plugin file: add it to `registry` in `src/app.ts`, add a row
  (`- id: notes` / `name: notes`) to `blend.yaml` before the `acryl-node-server` row, and pass runtime values (a data file) as its config in `createApp`.
- State, when `plugins/acryl-state` exists: `const cell = ctx.state.cell<T>('notes.list', initial)` (add `'state'` to `inject`), then
  `cell.get()`, `cell.set(value)`, `cell.update(fn)` and `cell.subscribe(fn)` (returns the unsubscribe). Every cell is also served as JSON at `/api/state/<key>`
  and streamed at `/api/state/<key>/events`.
- Test a route without a socket: `await ctx.router.request('/notes')`, or boot the app as `test/app.test.ts` does and use `fetch`.

## Things that surprise people

- A page mounted at `/x` answers `/x`, not `/x/` (trailing slashes are strict); `trimTrailingSlash()` (middleware) redirects `/x/` to `/x` for GET and HEAD.
- `schemaValidator('json', ...)` needs a JSON `Content-Type`; without it the schema sees `{}`. A failure answers 400 with
  `{ "error": "invalid json", "issues": [{ "message", "path" }] }`: the human text is `issues[0].message`. A `jsonOnly` recipe in `docs/framework/validation.md` answers 415 instead.
- Throw `new HTTPException(404, { message })` for an error response; the body is the message as plain text (use `c.json({ error }, status)` when a page expects JSON).
- Handlers get the request as `c.req`: `c.req.param('id')`, `c.req.query('q')`, `await c.req.json()`, `c.req.raw` for the Web `Request`.
- A server-sent stream is `streamSSE(c, async (stream) => { await stream.writeSSE({ data: JSON.stringify(x) }) ... })`; call `stream.onAbort(cleanup)`.
- `npm run dev` restarts the app whenever a file changes.

## Before you say you are done

`npm test` and `npm run check` (type-check) both pass. Put tests in `test/`, written with `node:test` like `test/app.test.ts`.

## Defaults you can swap

The framework is not rigid. Every choice is a plugin behind a port, and what the app starts with is only a fallback. Name the default before you change it,
and swap it at the one place that mounts it.

| Choice | Default | To swap it |
| --- | --- | --- |
| Records | the `db` port on SQLite (already mounted in the notes and chat templates; elsewhere `npx acrylblends add db`) | mount another provider of `db` in `src/app.ts`; plugins use `ctx.db` and do not change |
| Small state | the `kv` port on one JSON file (`npx acrylblends add kv`) | mount `acryl-kv-db` (the same port over `db`) or a provider of your own |
| Server | Node (`acryl-node-server`) | mount the adapter of another runtime in `src/app.ts` |
| Window | the browser | `npx acrylblends add desktop` adds an Electron window on the same server |

- **An outside tool** (a database server, a bundler, a router such as Vike) joins the app as a provider: a plugin in `plugins/<name>/` that implements a port and
  passes that port's conformance tests, then `src/app.ts` mounts it. Postgres is such a provider and is not part of this package; add it when the app needs it.
- **The dependency rule:** only the file that mounts a provider imports it; everything else takes the port as an argument or injects it. `npx acrylblends check-deps` enforces it.

## Plugins

There is one plugin folder: `plugins/` at the root of the app. A plugin is a folder `plugins/<name>/` with an `index.ts`. `npx acrylblends add <name>` copies a library
plugin there; a plugin you or an agent write goes there too (the `extensions` plugin installs it into the running app, and `plugins/library.json` lists the copies it must not
install a second time). Do not create `src/plugins/` or `extensions/`.

## The door

The door is a command in this folder, `.acryl/bin/acryl`, that lets you look at and change the running app. The running app writes it, and it reaches only the app running from this folder. Its state (a secret and an audit log) lives under `.acryl/`, which git ignores: never commit it. It is on in development and off with `NODE_ENV=production` or `ACRYL_DOOR=off`; one process at a time serves a folder's door, so a second `npm start` in the same folder stops with a message that says so (the tests set `ACRYL_DOOR=off`). If `.acryl/bin/acryl` is not here, the app is not running: start it with `npm run dev` (in the background) and open its address in a browser.

```
.acryl/bin/acryl brief                      what this app is: its address (curl a new route there), where the docs are, the verbs, and whether a page is open
.acryl/bin/acryl look                       the page as text, with refs (1.1, 1.2, ...): roles, names, values, visible text
.acryl/bin/acryl act click --ref <r>
.acryl/bin/acryl act type --ref <r> --text <t> [--submit] [--no-clear]
.acryl/bin/acryl act select --ref <r> --option <o>
.acryl/bin/acryl act press --key <Enter|Escape|...>
.acryl/bin/acryl act scroll [--ref <r>] --direction up|down [--amount <n>]
.acryl/bin/acryl act wait (--text <t> | --role <role> [--name <n>]) [--gone] [--timeout-ms <ms>]
.acryl/bin/acryl act reload                 reload the page; answers once the new page is back
.acryl/bin/acryl act navigate --path <path> go to another path of the app, e.g. /settings (never another site)
.acryl/bin/acryl plugin list | add <folder> | remove <name> | reload
.acryl/bin/acryl tool list | call --tool <name> --args '<json>'
.acryl/bin/acryl verbs                      the verb list
```

- **Check your own UI work with `look` and `act`.** After you build or change something people see, open the page and use it the way a person would: look, click through the new feature, look again, and say what you saw. A plugin you add, remove or reload with `plugin add|remove|reload` reloads the open pages by itself and the verb answers once they are back; after you change any other file (`src/`, a page) run `act reload`, then `look`. A page is a path of the app: `act navigate --path /demo`.
- The door's page script is added to every HTML page in development, so a page you write needs no tag for `look` and `act` to see it.
- `look` and `act` need the app's page open in a browser (`brief` says `Page: not open` when it is not). Look again before each `act`: refs belong to the latest `look`.
- A password field is not shown and cannot be typed into through the door; sign in by hand, or test the sign-in with a test.
- Every verb takes `--json`. The exit code is 0 for done, 1 when the verb failed, 2 for a usage error and 3 when no app is running in this folder.
- `plugin add plugins/<name>` checks the plugin, installs it and makes it live without a restart (the `extensions` plugin does this; every template that has the door has it, in development only: it is left out with `NODE_ENV=production`). `tool call` reaches only the tools on the door's allowlist (empty by default). On Windows the command is `.acryl\bin\acryl.cmd`.

## This app (agent)

Besides `src/routes.ts`, the app runs an agent (`POST /ask`) that can write plugins into `plugins/` while the app runs and install them with
rollback; `GET /extensions` and `GET /tasks` show what it did. A plugin there is a folder with an `index.ts` exporting `name`, `inject`, `apply(ctx)`
and an optional `check(ctx)` that receives the plugin's own context (so `ctx.router` reads as in `apply`). It may import `acryl-router`.

**Write an extension, not a row.** A feature you build while the app runs is a folder `plugins/<name>/` installed with `.acryl/bin/acryl plugin add plugins/<name>` (the `extensions` plugin loads it again at every start). Add a row to `blend.yaml` and an entry to the `registry` of `src/app.ts` only when the person asks for a plugin that is part of the app itself. Both kinds may import the framework by name (`acrylblends`, `acrylblends/body-limit`, `acryl-router`); a row's relative imports of its sibling plugins also work.

**Drive the app you build.** `.acryl/bin/acryl look` reads the open page as text with refs, and `acryl act click|type|press|scroll|wait --ref <ref>` presses its buttons, opens its sidebars and fills its forms (look again before each act: the refs change). `act navigate --path /settings` goes to another page of the app; a path the app does not serve answers `404 at /nope` and the window shows a 404 page, so navigate on from there. In the desktop app (`npm run desktop`) the app's windows and menu are verbs too: `acryl window list`, `acryl window open --path /settings`, `acryl look --window <id>` (and `act ... --window <id>`) to drive that window's page, `acryl window resize|focus|close --id <id>`, `acryl menu list` and `acryl menu click --path "File>New Note"`. Closing the last window and Quit end the desktop app, so they need `--force`: do not use it unless the person asks. The app has a `/settings` page already (the appearance: system, light or dark, kept in the browser) and the desktop app's menu has a Settings item that opens it; add a person's other settings to that page, not to a new one, so `acryl menu click --path "File>Settings..."` and `acryl window open --path /settings` keep opening them (on macOS the item is in the application menu). Without a desktop app these answer "no desktop window is attached; run npm run desktop".

**Pages you build follow the app's appearance.** The person chooses System, Light or Dark in `/settings`, and every open window follows it at once. A page you build gets that by putting `<script src="/appearance.js"></script>` in its `<head>` (before any other script) and colouring itself with the custom properties the script defines: `var(--bg)` for the page, `var(--fg)` for text, `var(--surface)` for cards and sidebars, `var(--border)`, `var(--muted)` for secondary text and `var(--accent)`. Do not write fixed colours (`#fff`, `white`, `#111`), `color-scheme`, or a `@media (prefers-color-scheme)` of your own: they ignore the person's choice (a page that does so stays light in a window set to Dark, or the other way round). `look` reports structure and text, not colours: check a page's colours by its CSS (every colour is a `var(--...)`), and tell the person what you did.

**Follow state with `watch`, not an `EventSource`.** A browser lets a page hold six connections to one host, across all the windows of the app, and an `EventSource` holds one for as long as the page is open: a page that streams a few things in two windows fills all six, and then every request waits. A cell of `ctx.state` (`ctx.state.cell('board.cards', [])`) is followed in the page with `import { watch } from '/api/state/client.js'` and `const stop = watch('board.cards', (cards) => { render(cards) })`: one WebSocket for the whole page carries every key (a WebSocket is not one of the six), the callback gets the value now and after every change, and `stop()` ends it. Without a WebSocket it falls back to one event stream per key and prints one warning in the console; then keep to two keys a page. Do not open an `EventSource` on `/api/state/<key>/events` yourself, and do not poll in a loop what `watch` already pushes.

**Production.** The agent, the builder and the extensions are development tools: `POST /ask` spends the model key and runs tools, a plugin installed live runs in this process, and none of it is behind a login. With `NODE_ENV=production` `src/app.ts` leaves the agent and the builder out, so `/ask`, `/extensions*` and `/tasks*` are not mounted; the page and `GET /health` stay. The extensions you installed (the folders of `plugins/`, committed with the app) still run in production, read-only: nothing can be installed or changed there. `ACRYL_PRODUCTION_KEEP=agent,builder,extensions` keeps the named rows, and each one kept prints a `WARNING` line at start.
