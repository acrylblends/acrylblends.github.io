# chat

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
.acryl/bin/acryl plugin list | add <folder> | remove <name> | reload
.acryl/bin/acryl tool list | call --tool <name> --args '<json>'
.acryl/bin/acryl verbs                      the verb list
```

- `look` and `act` need the app's page open in a browser (`brief` says `Page: not open` when it is not). Look again before each `act`: refs belong to the latest `look`.
- A password field is not shown and cannot be typed into through the door; sign in by hand, or test the sign-in with a test.
- Every verb takes `--json`. The exit code is 0 for done, 1 when the verb failed, 2 for a usage error and 3 when no app is running in this folder.
- `plugin add plugins/<name>` checks the plugin, installs it and makes it live without a restart (the `extensions` plugin does this; every template that has the door has it, in development only: it is left out with `NODE_ENV=production`). `tool call` reaches only the tools on the door's allowlist (empty by default). On Windows the command is `.acryl\bin\acryl.cmd`.

## This app (chat): a streamed answer, history in a database

A Cordis app: `blend.yaml` lists the plugins that are mounted (`acryl-router`, `acryl-db-sqlite`, `routes`, `acryl-node-server`), `src/app.ts` is the one file that names the SQLite provider, and `src/routes.ts` is the app's own plugin: it builds the app on the `db` port and mounts it.

- **The dependency rule:** only `src/app.ts` (the `opener` in `package.json`) imports the provider. Every other file takes a `Db` (`import type { Db } from '../plugins/acryl-db/src/index.ts'`) as an argument and never imports `node:sqlite`, `pg`, another driver or `acryl-db-sqlite`. `npm test` and `npm run check` run `acrylblends check-deps`, which names the file and line of a violation; do not move the `opener` entry to silence it.
- `src/llm.ts`: `Llm`, what the app needs from a model (messages in, pieces out, an aborted signal stops the work), and `openAiCompatible`, which calls an OpenAI-compatible chat completions API with `stream: true`. The base URL is `DEEPSEEK_BASE_URL` (default `https://api.deepseek.com`), the model `DEEPSEEK_MODEL` (default `deepseek-chat`), the key **only** the environment variable `DEEPSEEK_API_KEY`, read at the moment of the call: never write it to a file, a response or a log.
- `src/db.ts`: `chatStore(db)`. The routes only call `chatStore`; keep SQL out of them. Every `db` call returns a promise: `await` it. The database is `data/chat.sqlite` (or the file `$CHAT_DB` names), opened by the `db` row with `migrations/` applied on start. The shape of the database is `migrations/NNN-name.sql`: to change it add the next numbered file and never edit one that has run. See `docs/framework/guides/data.md`.
- `src/chat-app.ts`: `createApp(db, llm)`. `POST /api/chat` answers Server-Sent Events: `meta` (the conversation id), a `token` per piece, then `done` or `error`. The request's signal (`c.req.raw.signal`) goes to the model call, so a closed tab or the Stop button stops the request to the model; what had arrived is kept.
- `src/client/chat.tsx`: the client component (own `tsconfig.json`, browser types): sends the message with `fetch`, reads the events as they arrive, shows the answer growing, and aborts on Stop. `clientModules` compiles it when the browser asks; `npm run build` compiles it once into `dist/client`. See `docs/framework/guides/client-modules.md`.
- `test/chat.test.ts` tests every route with a mock `Llm` (never the network); keep it that way. It boots the whole app on a database file in a throwaway home and takes `app.root.db`. `test/server.test.ts` starts the real server and stops it with a signal.
- To try it with a real model: `DEEPSEEK_API_KEY=... npm run dev`.

## Before you ship

Read `docs/framework/getting-started/deploy.md`. In short: `npm ci --omit=dev`, `npm run build`, `NODE_ENV=production npm start`; the app listens on `127.0.0.1` (`HOST=0.0.0.0` only in a container); the SQLite file goes outside the code folder (`CHAT_DB=/var/lib/chat/chat.sqlite`) and is backed up; the model key is an environment variable of the service (a root-only environment file for systemd), never a file in the repository. Anyone who can reach the app can spend your key, so with `NODE_ENV=production` the chat is **closed**: every route but `GET /health` answers 503 (`src/access.ts`). Set `CHAT_ACCESS_TOKEN` (the browser asks for it; any user name, the token as the password), or name the chat in `ACRYL_PRODUCTION_KEEP=chat` to make it public on purpose: that prints a `WARNING` at start and limits one address to `CHAT_RATE_PER_MINUTE` messages a minute (default 20). Prefer your own login in front of a public chat.
