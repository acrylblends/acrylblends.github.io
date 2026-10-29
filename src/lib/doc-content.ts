// Real, hand-written content for the highest-traffic pages across Docs and
// Ecosystem — grounded in specs/036-cordis-ecosystem-and-acryl-blends in the
// acryldev/acryl repo, not placeholder copy. Keyed by a flat slug: docs
// pages use "<group-slug>/<item-slug>", Ecosystem pages use their own
// single-level route slug. The Cordis Primer has its own, much larger
// content file — see src/lib/cordis-content.ts.
export type DocEntry = {
  intro: string;
  body: { heading?: string; paragraphs: string[]; note?: string; code?: { label: string; code: string } }[];
  code?: { label: string; code: string };
};

const pluginCode = `import { Context } from 'cordis'

export const name = 'hello'

export function apply(ctx: Context) {
  ctx.on('ready', () => {
    ctx.logger.info('hello, world')
  })
}`;

const blendYamlCode = `name: agent-workbench
version: 0.1.0
runtime: cordis
plugins:
  - cordis
  - agent-runtime
  - tool-router
  - checkpoint-store`;

const loaderRowIdExample = `# Wrong: row id doesn't say what the package is
include:
  - dsh-editor          # actually acryl-dsh-editor-plugin

# Right: row id equals package name by default
include:
  - acryl-development-canvas`;

export const docContent: Record<string, DocEntry> = {
  "getting-started/what-is-acryl-blends": {
    intro: "ACRYLBLENDS is a framework for Cordis apps, built from ACRYL's best parts: a library of proven plugins and a command that copies them into your app as code you own.",
    body: [
      { paragraphs: [
        "Cordis already has what an app framework needs: plugins, services, inject, lifecycle, effects that clean up after themselves, and events. ACRYLBLENDS adds no runtime on top. It is a library of Cordis plugins extracted from ACRYL, plus the acrylblends command that scaffolds an app and copies plugins in.",
        "Generated apps are plain TypeScript, run by Node 22.18 or newer with no build step, tested with node:test, and depend at run time only on @deepseek-ai/cordis and yaml.",
      ]},
      { heading: "What the library gives you", paragraphs: [
        "instance (where an app keeps its data), settings (validated, layered, watched), extensions (install, update and remove plugins while the app runs, with rollback), builder and agent (an agent that writes plugins into the app it runs in), tasks (durable records of every run), manifest (the app as data in blend.yaml) and save (commit the app, refusing secrets).",
      ], note: "This is a prototype. There is no package registry yet: a plugin comes from the built-in library or from a folder you own." },
    ],
  },
  "getting-started/install": {
    intro: "There is nothing to install: npx runs the acrylblends command from npm. You need Node 22.19 or newer and npm; git, to save your app.",
    body: [{ paragraphs: [
      "The package is acrylblends on npm and its source is public at github.com/acrylblends/acrylblends. To work on the framework itself, clone the repository, run pnpm install and pnpm run build, and use packages/cli/bin/acrylblends.js in place of npx acrylblends.",
      "Node runs the generated app's TypeScript directly, so there is no compile step for your own code.",
    ]}],
    code: { label: "terminal", code: "npx acrylblends --help\nnpx acrylblends --version" },
  },
  "getting-started/create-your-first-app": {
    intro: "init scaffolds a Cordis app in an empty directory. Pick one of the six templates, from the small blank app to the agent template that extends itself.",
    body: [
      { paragraphs: [
        "init never writes into a directory that is not empty. --template picks one of six: blank (the default: instance, the router, the node server, manifest and save), nodejs (a page and a client component), notes (accounts, SQLite and migrations), chat (a streamed answer over server-sent events), todo (a to-do list on the router and state) and agent (blank plus state, tasks, agent, extensions, builder, sandbox and the door, so the app can extend itself while it runs). --agent still means --template agent and acryl-app still means agent.",
      ], code: { label: "terminal", code: "npx acrylblends init my-app --template todo -y\ncd my-app\nnpm install\nnpm test\nnpm run dev      # prints its URL; data lives in .acrylblends/" } },
      { heading: "Where things live", paragraphs: [
        "blend.yaml is the app as data: plugin rows, config and parameters. src/app.ts is the registry of plugins your code provides. src/routes.ts is your own plugin. plugins/ is the one folder every plugin lives in: the library plugins acrylblends add copies, and the ones you or an agent write. .acrylblends/ is the app's data and is not committed.",
        "Set ACRYLBLENDS_HOME to keep the data elsewhere and ACRYLBLENDS_PORT to choose the first port tried (0 for any free port).",
      ] },
    ],
  },
  "getting-started/let-the-agent-build-a-plugin": {
    intro: "With the agent template running, describe a feature and the agent writes a Cordis plugin, installs it live and checks it works. No restart.",
    body: [
      { paragraphs: [
        "Without a model the agent uses a scripted one that understands a few commands, enough to see the wiring. The question below creates a route, installs it and verifies it answers.",
      ], code: { label: "offline demo", code: "curl -X POST <url>/ask -H 'content-type: application/json' \\\n  -d '{\"question\":\"create route hello /hello Hello\"}'\n# {\"status\":\"completed\",\"output\":\"hello: installed, active.\", ...}\ncurl <url>/hello        # {\"text\":\"Hello\"}\ncurl <url>/tasks        # the run, as a durable task that owns its tool calls" } },
      { heading: "With a real model", paragraphs: [
        "Any OpenAI-compatible API works: OpenAI, DeepSeek, Ollama or LM Studio. Keep the key in your own secret store and export it as an environment variable. Never write it into a file.",
      ], code: { label: "real model", code: "export ACRYLBLENDS_MODEL_URL=https://api.deepseek.com/v1\nexport ACRYLBLENDS_MODEL=deepseek-chat\nexport ACRYLBLENDS_MODEL_KEY=...     # your key\nnpm start\n\ncurl -X POST localhost:3100/ask -H 'content-type: application/json' \\\n  -d '{\"question\":\"Build a plugin named clock that adds GET /time returning the ISO time. Install it.\"}'\ncurl localhost:3100/time\ncurl localhost:3100/extensions    # what is installed, its state and version" } },
      { heading: "If an update fails", paragraphs: [
        "Ask for a change with another /ask. If the new version fails to start or fails its own check, the previous version comes back and the answer says restoredPrevious. Set approval: true on the extensions row of blend.yaml and an install waits until you answer POST /extensions/approve.",
      ] },
    ],
  },
  "getting-started/add-plugins": {
    intro: "Copy a plugin from the library into your app, mount it, and list it in blend.yaml.",
    body: [{ paragraphs: [
      "plugins lists the library and what each plugin needs. add copies one into plugins/ together with the plugins it requires, records it in plugins/library.lock.json, and prints the exact line to add. Run npm install afterwards in case it added dependencies.",
      "Then mount it in src/app.ts and add a row in blend.yaml. Because the code is copied, you can edit it freely.",
    ]}],
    code: { label: "terminal", code: "npx acrylblends plugins\nnpx acrylblends add settings --dir ./my-app\nnpm install\nnpm run check" },
  },
  "getting-started/lock-save-and-ship": {
    intro: "Record what the app is built from, commit it safely, and run it in a container.",
    body: [
      { paragraphs: [
        "lock writes blend.lock.json with digests of what the app is built from, the same lock ACRYL writes. save commits the app to its own git repository and pushes only if a remote is set. It refuses any file that looks like it holds a secret, and refuses to push an app that is not visibility: public to a public remote. Nothing is committed when it refuses. When the framework moves on, acrylblends upgrade brings the library plugins the app carries up to the installed version.",
      ], code: { label: "terminal", code: "npm run lock\nnpm run save -- \"add hello\"" } },
      { heading: "In a container", paragraphs: [
        "The agent template includes a Dockerfile. The data lives in /data, so what the agent built survives restarts.",
      ], code: { label: "docker", code: "docker build -t my-agent .\ndocker run -p 3100:3100 -v my-agent-data:/data \\\n  -e ACRYLBLENDS_MODEL_URL=... -e ACRYLBLENDS_MODEL=... -e ACRYLBLENDS_MODEL_KEY=... my-agent" },
      note: "Known gap: the plugin's editable source sits in /app/plugins, which is not on the volume. After a container is recreated the plugin shows as stale until it is reinstalled. The agent template is a development app: see the page on what runs in production before deploying it." },
    ],
  },
  "framework/cli-reference": {
    intro: "The acrylblends command has six verbs: init, add, upgrade, plugins, build-client and check-deps, plus kv import for moving a JSON kv file into SQL. Run it with npx acrylblends, or install it globally with npm install -g acrylblends.",
    body: [
      { heading: "init", paragraphs: [
        "Creates a Cordis app in an empty or new directory. It never writes into a directory that is not empty.",
      ], code: { label: "usage", code: "acrylblends init [dir] [--template blank|nodejs|notes|chat|todo|agent] [--name <name>] [--desktop] [--install] [-y]" } },
      { paragraphs: [
        "--template chooses one of the six templates (asked when not given; acryl-app still means agent). --agent is --template agent and --no-agent is --template blank, so older scripts keep working. --desktop also adds the Electron shell, so npm run desktop opens a window on the app. --install runs npm install afterwards. -y asks nothing and uses the defaults: the blank template, no install.",
      ] },
      { heading: "add", paragraphs: [
        "Copies library plugins, and the plugins they require, into the app's plugins/ folder, the one folder every plugin of an app lives in, and records them in plugins/library.lock.json. Given a folder path instead of a name, it brings that plugin's source into the same folder. It prints the exact line to add to src/app.ts and blend.yaml. --suite also copies the port's conformance suite, so a provider the app writes can be checked against it (acrylblends add kv --suite).",
      ], code: { label: "usage", code: "acrylblends add <plugin...> [--dir <app>]\nacrylblends add desktop --dir ./my-app\nacrylblends add ./plugin-packages/clock --dir ./my-app" } },
      { heading: "upgrade", paragraphs: [
        "Brings the library plugins an app carries (the router, the server, the door, extensions, ...) up to the installed version. An untouched file is replaced; a file the app edited stops the upgrade with the diff of what would be lost, unless --force, which saves the edit under .acrylblends/upgrade-backup/ first. --dry-run shows the plan and --diff every changed file.",
      ], code: { label: "usage", code: "acrylblends upgrade [plugin...] [--dir <app>] [--dry-run] [--force] [--diff]" } },
      { heading: "plugins, build-client and check-deps", paragraphs: [
        "plugins lists the library with what each plugin does and what it requires. build-client compiles the client modules once for production, from src/client to dist/client. check-deps fails when app code imports a database driver or opener outside the one file named in package.json, so a port is imported and a provider is not.",
      ], code: { label: "usage", code: "acrylblends plugins\nacrylblends build-client [root] [out]\nacrylblends check-deps [dir]" } },
      { heading: "Scripts in a generated app", paragraphs: [
        "npm run dev and npm start run the app. npm test runs node:test. npm run check type-checks. npm run lock writes blend.lock.json, what the app is built from. npm run save commits the app and pushes it to its remote, refusing secrets and public remotes for private apps. npm run upgrade plans an upgrade before applying it.",
      ], note: "Environment: ACRYLBLENDS_HOME (where the app keeps its data), ACRYLBLENDS_PORT (first port tried, 0 for any), ACRYLBLENDS_HOST (the interface). The agent template also reads ACRYLBLENDS_MODEL_URL, ACRYLBLENDS_MODEL and ACRYLBLENDS_MODEL_KEY." },
    ],
  },
  "framework/templates": {
    intro: "Six templates ship with the CLI, the same list in npm create acrylblends and acrylblends init, each with the framework docs (docs/framework), an AGENTS.md and a CLAUDE.md, and one skill for a coding agent: blank, nodejs, notes, chat, todo and agent.",
    body: [
      { paragraphs: [
        "All six are TypeScript run directly by Node 22.19 or newer, tested with node:test, and depend at run time on @deepseek-ai/cordis, @deepseek-ai/schemastery, yaml and ACRYL's published blends-core and app-persistence packages. All mount their plugins from blend.yaml, so you choose, order and switch off plugins without editing code. Every plugin of an app is a folder in plugins/.",
      ] },
      { heading: "blank", paragraphs: [
        "The smallest app: the instance plugin (where the app keeps its data), acryl-router, acryl-node-server, manifest and save, plus the app's own routes plugin in src/routes.ts, which builds an Acryl app and mounts it with ctx.router.route('/', app).",
      ] },
      { heading: "nodejs, notes and chat", paragraphs: [
        "nodejs adds a page rendered with JSX and a client component compiled without a bundler. notes is a multi-user notes app on the db port (sign-up, log-in, sessions, migrations, search, a JSON API and a typed test client). chat streams an answer from an OpenAI-compatible API (DeepSeek by default, key only from DEEPSEEK_API_KEY) with a Stop button that also stops the request, and keeps history in SQLite.",
      ] },
      { heading: "todo", paragraphs: [
        "A to-do list built only on the router and state: GET and POST /todo/api, PATCH and DELETE /todo/api/:id, a page at /todo, a server-sent stream at /todo/events, and a file in the app's home that keeps the list across restarts. Its tests run with node:test and cover the CRUD, the validation, the stream and the restart.",
      ], code: { label: "terminal", code: "npx acrylblends init todo --template todo\ncd todo && npm install && npm test\nnpm run dev            # prints its URL\ncurl -X POST $URL/todo/api -H 'content-type: application/json' -d '{\"title\":\"write the docs\"}'\ncurl $URL/todo/api" } },
      { heading: "agent", paragraphs: [
        "Everything in blank plus acryl-state, tasks (durable run records), agent (an offline scripted model by default), extensions (live install with rollback), builder (tools that let the agent write and install plugins), sandbox (a tool runs in its own process under Node's permission model) and the door. Set ACRYLBLENDS_MODEL_URL, ACRYLBLENDS_MODEL and ACRYLBLENDS_MODEL_KEY and the agent uses a real OpenAI-compatible model instead. It also includes a Dockerfile whose data lives in /data. It is a development app: see the page on what runs in production before deploying it.",
      ], note: "Parameters in blend.yaml: steps (the agent's step budget), taskStore (jsonl or sqlite) and approval (true makes an agent-installed plugin wait for POST /extensions/approve)." },
    ],
  },
  "framework/the-plugin-library": {
    intro: "Every plugin in the library is plain Cordis code, extracted from ACRYL, tested against a real Cordis context including disposal, and copied into your app so you own it.",
    body: [
      { paragraphs: [
        "instance: where the app keeps its data and which port it uses. acryl-router, acryl-node-server, acryl-router-http, acryl-state and acryl-inspect: ACRYL's framework, vendored as it is (see The ACRYL framework). settings: validated, layered, watched settings in one YAML file. extensions: install, update, remove and reload plugins while the app runs; a failed update restores the previous version, and a ledger records every change. acryl-door: the development-only door an agent uses from the app folder.",
        "sandbox: runs untrusted code (an agent-written tool) in a separate Node process under the permission model, with a time limit and a memory cap. It does not block the network. builder and agent: the agent loop and its tools for building the app it runs in. openai: any OpenAI-compatible model over fetch, no SDK. tasks: durable records of every run and tool call, readable after a restart. manifest: reads and validates blend.yaml, with Blueprints and Blends resolving over them. save: commit the app, refusing secrets. digest: the one definition of a folder's content digest.",
      ], note: "acrylblends plugins prints this list with what each plugin requires. The full reference is docs/plugins.md in the repository." },
    ],
  },
  "framework/the-app-manifest": {
    intro: "blend.yaml is the app as data: which plugins it mounts, in what order and with what config. It uses ACRYL's own Blend format, so an app can move into ACRYL without conversion.",
    body: [
      { paragraphs: [
        "Rows mount in order. A row's id names the slot and its name is the plugin it loads. Parameters are typed and a config value that is exactly a parameter reference keeps its type. disabled: true switches a row off without touching code. Runtime values such as the port win over the manifest.",
        "A Blueprint is a definition others build on. A Blend is an instance of one: it names its Blueprint and version in lineage, overrides inherited rows by id and adds its own rows. npm run lock records what the app is built from in acrylblends.lock.json.",
      ], code: { label: "blend.yaml", code: "apiVersion: blends.acryl.dev/v1alpha1\nkind: Blueprint\nmetadata:\n  id: acrylblends.my-app\n  name: my-app\n  version: 0.1.0\n  visibility: private\nspec:\n  runtime: cordis\n  parameters:\n    hostname: { type: string, default: 127.0.0.1 }\n  rows:\n    - id: http\n      name: http\n    - id: routes\n      name: routes\n    - id: server\n      name: server\n      config:\n        hostname: \"{{parameters.hostname}}\"" },
      note: "The lock is blend.lock.json, the same format ACRYL writes; plugins/library.lock.json separately records which version each copied library plugin came from, which is what acrylblends upgrade reads." },
    ],
  },
  "framework/the-blend-registry": {
    intro: "The registry at acrylblends.github.io/registry holds starting points: Blank, and Blueprints such as the GTD Planner and the Organizer. A project started from one belongs to its owner.",
    body: [
      { paragraphs: [
        "The registry is the source of truth for Blends. Its index is plain JSON at https://acrylblends.github.io/registry/index.json, so any tool can read it. Each entry has an id, name, kind, version, path, license, runtime, category, description and, for a Blueprint grown from another, its parent. The runtime says what the entry is for: acrylblends is a whole app for the acrylblends framework, acryl is a starter for the ACRYL app. A starter's files are served at https://acrylblends.github.io/registry/blends/<id>/blend.yaml.",
        "For an acrylblends entry, npm create acrylblends@latest my-app -- --from <id> makes the app from npm alone (for example acrylblends.notes-desktop); npm needs the -- before the options. A starter for the ACRYL app (runtime acryl, for example acryl.organizer) is opened in the ACRYL app, and create-acrylblends refuses it with a line that says so. A private starter needs no registry: start from its git repository instead (--from github:you/starter).",
      ], code: { label: "index entry", code: "{\n  \"id\": \"acryl.gtd\",\n  \"name\": \"GTD Planner\",\n  \"kind\": \"Blueprint\",\n  \"version\": \"0.1.0\",\n  \"path\": \"blends/acryl.gtd\",\n  \"license\": \"MIT\",\n  \"category\": \"productivity\",\n  \"description\": \"Getting Things Done - ...\",\n  \"parent\": \"acryl.blank\"\n}" } },
      { heading: "Publishing", paragraphs: [
        "Open a pull request that adds blends/<id>/ with a blend.yaml (kind Blueprint, an id you own, license, visibility public, category, description), the plugins it adds under plugins/, and a README. For an app for acrylblends, the folder is the whole app and holds an acryl.template.json, which is what marks its runtime. CI validates every entry with blends-core, makes each acrylblends app with create-acrylblends, and fails when the index is stale. A private or unlicensed entry is refused.",
      ], note: "Plugins have their own registry, cordisplugins.github.io, with an index at https://cordisplugins.github.io/registry/index.json. acryl.dev/blends and acryl.dev/packages mirror both." },
    ],
  },
  "framework/extending-a-running-app": {
    intro: "An app with the agent template can be extended while it runs, by you or by its agent, and a failed update leaves the previous version running.",
    body: [
      { paragraphs: [
        "A plugin is a folder in the app's plugins/ whose name is the plugin's name, with an index.ts that exports a Cordis plugin. Installing it checks the folder, stages a copy named by its content digest, starts it as a child fiber, verifies its optional check function, and records the result in a ledger. If it fails to start or fails its check, the previous version starts again and the answer says restoredPrevious. There is one plugin folder: an app made before this layout keeps its src/plugins/ and extensions/ for the upgrade, and the CLI says how to move them.",
        "A plugin is trusted code and is gated by approval. A tool is code you do not trust, such as a function an agent just wrote: it never runs inside the app, only in the sandbox, and its examples are the install's self-check. At startup, folders in a source marked trust: list are only reported, so code that arrived through a git pull does not run until someone asks.",
        "Look at GET /extensions for what is installed and its state, GET /tasks for every agent run as a durable task, and GET /api/state/tasks/events and GET /api/state/extensions/events for live streams of changes (GET /api/state/tasks and GET /api/state/extensions read the current value).",
      ], note: "The full contract, including approval, the builder tools and packaging a plugin for sharing, is in docs/extending-apps.md in the repository." },
    ],
  },
  "framework/the-acryl-framework": {
    intro: "The router, shared state and the node server are ACRYL's own framework, written as Cordis plugins and copied into your app as they are.",
    body: [
      { paragraphs: [
        "acryl-router gives ctx.router: a plugin builds an ordinary Acryl app (the ported core of a mature Web-standard framework, with its routing, middleware, validators and test suites) and mounts it with ctx.router.route(prefix, app), and an in-process request() serves tests. acryl-node-server is one node:http listener that sends every request to the router (port, loopback host, next-free-port scan; it ends open streams and frees the port when unloaded). acryl-state gives observable cells that the router serves as JSON and as server-sent events at /api/state/<key> and /api/state/<key>/events. acryl-inspect reports what every plugin requires, provides and registers.",
        "Everything a plugin registers on the router, state or the inspector goes away when that plugin unloads. A plugin installed while the app runs reads the router as ctx.router. Outside an app the same classes are the published entries: import { Acryl } from 'acrylblends' and the Cordis forms at acrylblends/cordis/router, acrylblends/cordis/node-server and so on; App and AppRequest are gone in 1.0.",
      ], code: { label: "a plugin", code: "import type { Context } from '@deepseek-ai/cordis'\nimport { Acryl } from 'acrylblends'\nexport const name = 'hello'\nexport const inject = ['router']\nexport function apply(ctx: Context) {\n  ctx.router.route('/', new Acryl().get('/hello/:who', (c) => c.json({ hello: c.req.param('who') })))\n}" } },
      { heading: "One source of truth", paragraphs: [
        "The framework lives in ACRYL (github.com/acryldev/acryl, plugins/acryl-*), where the Web, Desktop and terminal surfaces test it. This library vendors it: a sync script copies the source and the tests, rewrites only the imports between the plugins, and records the ACRYL commit and a digest in each plugin's upstream.json. pnpm run verify:framework fails when a copy was edited, so a change is made in ACRYL first and synced here.",
        "The docs (concepts, routing, context, request, middleware, validation, the node server and the migration from 0.3) are ACRYL's own text, copied the same way into docs/framework of the repository.",
      ] },
    ],
  },
  "framework/release-notes-1-0-4": {
    intro: "An agent that builds a page can now look at it and click through it in the same run. For the workshop's \"built from the inside, then driven\" demo: the page an agent builds is seen by the door, the page refreshes when the app changes, and the panel keeps the run alive across those refreshes.",
    body: [
      { heading: "The door", paragraphs: [
        "act reload and act navigate --path /settings (CLI, MCP and the built-in chat: one verb table). They answer first, move the page, and then wait up to 15 s for the new page to connect to the door, so the next look sees it. A path must start with one / and name no other site; a path whose page does not load the door fails with a timeout that says so.",
        "The open pages reload after a live plugin change (plugin add, plugin remove, plugin reload, except for a plugin that was already as it should be); the verb answers once they are back. reloadOnChange: false in the door row turns it off.",
        "The door's page script is added to every HTML page in development, including the pages of a plugin that loaded at boot, so a page an agent writes can be looked at and driven with no tag. Production is untouched (it has no door).",
        "The .acryl/bin/acryl command uses a real Node when the app runs in Electron (a node of 22.19 or newer on the PATH), so each call no longer prints a code-signing complaint on macOS.",
      ] },
      { heading: "The router", paragraphs: [
        "ctx.router.wrap(middleware) runs a middleware around every request, whenever the plugin that asks was mounted; a middleware in an ordinary mount wraps only the routes mounted after it. It goes away with the calling plugin.",
      ] },
      { heading: "The agent panel", paragraphs: [
        "A run belongs to the app, not to the page. A page that reloads, closes or moves no longer cancels the agent: the next page that loads shows the question and the events so far (GET /api/agent-panel/run) and follows the run to its end. Only Stop (POST /api/agent-panel/stop) cancels it. A run that ended before a page loaded is shown there, and does not reload it again.",
      ] },
      { heading: "Docs", paragraphs: [
        "The agent docs (AGENTS.md, the app guide) say that look and act are how you check your own UI work, and name act reload and act navigate. The workshop pages say to run the agent from a clean configuration and to word tasks as \"do it now, without asking for approval\". The recorded run is in Build, then check it through the door.",
      ] },
      { heading: "Upgrading", paragraphs: [
        "An app made by an earlier release gets all of it with npx acrylblends@latest upgrade (the door, the router and the panel are library plugins). An app keeps working without it.",
      ] },
    ],
  },
  "framework/release-notes-1-0-3": {
    intro: "Fixes from the workshop rehearsals, and a correctness fix that matters on the Node most Mac users now have.",
    body: [
      { heading: "Correctness", paragraphs: [
        "Node 26. A request body that arrived complete but whose connection closed before the app read it could be cut to its first chunk on Node 26 (Homebrew's current node): the adapter read the stream's buffer once, and Node 26 returns only the first chunk of a destroyed stream's buffer in one read(). It now reads until the stream says there is no more, which is the contract of Readable#read() on every version. Node 26 joins the CI matrix (the full check on Linux, and the framework packages on Linux, macOS and Windows).",
      ] },
      { heading: "Starting an app", paragraphs: [
        "A relative path in a blend.yaml row is read from the app's folder. config: { migrations: migrations } (and path: data/app.sqlite) on the acryl-db-sqlite row, and path on acryl-kv-json, used to stop the app with \"no file base URL\". The add db hint and the data guide show the row.",
        "create-acrylblends takes a GitHub address pasted from the browser as a source or a registry (https://github.com/owner/repo, with .git or /tree/<ref>), like github:owner/repo.",
      ] },
      { heading: "Behind the release", paragraphs: [
        "Two flaky tests were fixed at the root: the node-server spec served a fixture that a ported test makes unreadable for one test while another worker read it, and the PTY gate read the audit log before the line that follows the process's death.",
        "The packed-install gate now runs the refusal of an ACRYL starter through npm exec, and an app that mounts the database with a relative migrations path (the row and its registry entry written the way the hint says).",
      ] },
    ],
  },
  "framework/release-notes-1-0-2": {
    intro: "The release for people starting from nothing: every friction found by walking the published 1.0.0 as a newcomer on macOS and Linux, fixed, plus one more production default.",
    body: [
      { heading: "Security", paragraphs: [
        "The chat template is closed in production. Anyone who could reach a deployed chat app spent the owner's model key. With NODE_ENV=production every route but GET /health now answers 503 until you choose: CHAT_ACCESS_TOKEN (the browser asks for a login: any user name, the token as the password), or ACRYL_PRODUCTION_KEEP=chat to make it public on purpose, which prints a WARNING at start and limits one address to CHAT_RATE_PER_MINUTE messages a minute (default 20). Development is unchanged. An app made by 1.0.0 or 1.0.1 keeps its own src/routes.ts: copy src/access.ts, src/chat-app.ts and src/routes.ts from a fresh acrylblends init my-app --template chat, or put your own login in front. See What runs in production.",
      ] },
      { heading: "Start from the registry, from npm alone", paragraphs: [
        "npm create acrylblends@latest my-app -- --from <id> makes an app from a registry starter (npm needs the -- before the options). --from also takes github:owner/repo, @scope/name, a .tgz and a template folder; --registry github:owner/repo (or a folder) reads another registry. Nothing is installed or run, the manifest of the new app is its own (private, named after its folder, no licence of the starter's), and the secrets scan runs first.",
        "Registry entries declare their runtime. The index now carries runtime: acrylblends | acryl. A starter for the ACRYL app (acryl.gtd and the other acryl.* Blueprints) is refused with one line: it is an ACRYL app starter, open it in the ACRYL app. create-acrylblends never writes disabled rows.",
        "Three starters that work today: acrylblends.notes-desktop (the notes app with a desktop window), acrylblends.chat and acrylblends.agent, made from the templates by the release routine. acrylblends.github.io/blends shows the runtime as a badge and filters on it.",
      ] },
      { heading: "The newcomer path", paragraphs: [
        "acrylblends add agent-panel mounts itself. It adds the panel's row and its registration (and driver-pty and driver-acp after it), or refuses before copying anything, naming the rows the app lacks (agent, extensions) and where they come from (the agent template). A blank app no longer ends in a silent 404.",
        "pi is offered in the panel when it has a DeepSeek key in the environment or its own stored login (~/.pi/agent/auth.json). The docs say that the panel's coding agents use the login of the person who runs the app.",
        "node-pty: add driver-pty explains the npm 11 / pnpm warning about its install script (the prebuilt binaries work without it; the exact approve and rebuild commands are printed and documented).",
        "todo prints the URL it serves (/todo), create-acrylblends prints its Next: block once, and init --desktop says what the desktop shell added and why.",
        "npx acrylblends@latest upgrade is the documented form, with the reason: an app's own older copy shadows a bare npx acrylblends and has no upgrade verb (it prints its help and exits 0, or says \"unknown command\" and exits 2).",
        "Node 22.19 or newer is checked first. The two commands and every new app (scripts/check-node.cjs, run before dev, start, test and check) stop an older Node with \"Node 22.19+ needed, you have 18.x: install it from nodejs.org or with nvm\".",
        "Linux, Ubuntu 23.10 and later: npm run desktop no longer aborts at Chromium's sandbox. Where kernel.apparmor_restrict_unprivileged_userns=1, and only there, it starts Electron with --no-sandbox and prints one line saying why; the desktop page says how to keep the sandbox with an AppArmor profile.",
      ] },
      { heading: "Things to know", paragraphs: [
        "A registry starter is a whole app, about 2.6 MB with its plugin copies, so a registry grows by that much per entry.",
        "acrylblends upgrade still does not edit an app's own src/ files (the second pass is planned).",
      ] },
    ],
  },
  "framework/release-notes-1-0-1": {
    intro: "A security fix for apps made from the agent template.",
    body: [
      { heading: "Security", paragraphs: [
        "If you deployed the agent template to production on 1.0.0, upgrade or remove the rows. With NODE_ENV=production the template left its agent, builder and extensions rows mounted, and none of them is behind a login:",
        "POST /ask runs the agent: anyone who can reach the app spends your model key and makes the agent call its tools.",
        "Live plugin install (extensions, builder) runs a plugin's code in the app's process with its permissions, and POST /extensions/approve decides installs.",
        "1.0.1 fixes the template: with NODE_ENV=production the agent, builder and extensions rows are left out, together with the door, so /ask, /extensions* and /tasks* are not mounted (the page and GET /health stay). ACRYL_PRODUCTION_KEEP=agent,builder,extensions keeps the named rows, and every row kept prints a WARNING line at start. The production test now checks this, and What runs in production says it.",
        "An app already made by 1.0.0 is not changed by npm install or acrylblends upgrade: src/app.ts and src/routes.ts are your files. For such an app, before it runs anywhere reachable, do one of: set the agent, builder and extensions rows to disabled: true in blend.yaml; or copy the src/app.ts and src/routes.ts of a fresh acrylblends init my-app --template agent over yours (keep your own routes); or take the app off the network. The other templates (blank, nodejs, notes, chat, todo) were not affected: they have no agent or builder row, and nodejs, notes and chat already left extensions out in production. The chat template's chat endpoint spends the model key by design, as a chat app does: put a login in front of it before you publish it.",
      ] },
      { heading: "Things to know", paragraphs: [
        "create-acrylblends 1.0.1 depends on acrylblends ^1.0.1. No other behaviour changed.",
      ] },
    ],
  },
  "framework/release-notes-1-0-0": {
    intro: "This is also the text of the release candidate 1.0.0-rc.1 (on the next tag). acrylblends 1.0 fixes the public surface, gives an app a way to move its copies of the framework plugins forward, and says plainly what is for development only. Move an 0.9.1 or later app with Migration to 1.0.",
    body: [
      { heading: "Added", paragraphs: [
        "acrylblends upgrade. Replaces the library plugins an app carries (the router, the server, the door, extensions, ...) with the installed version's. An untouched file is replaced; a file the app edited stops the upgrade with the diff of what would be lost, unless --force, which saves the edit under .acrylblends/upgrade-backup/ first. --dry-run shows the plan, --diff every changed file. plugins/library.lock.json records what was copied; apps made by 0.9.1 to 0.11.0 are covered by the hashes of those releases. Tested on apps made by the published 0.9.1 and 0.10.0, which then install, type-check and pass their tests.",
        "One list of templates, the same in npm create acrylblends and acrylblends init: blank, nodejs, notes, chat, todo, agent, each with a one-line summary in both helps (acryl-app still means agent).",
        "The API surface is written down. packages/framework/api-surface.mjs lists every subpath as PUBLIC (96 of them, in exports and covered by semver), EXPERIMENTAL (bun, the door) or INTERNAL, and a test fails when a built subpath is in neither list or exports differs from PUBLIC.",
        "acrylblends/drivers: the driver contract (ChatDriver, ChatEvent, TerminalDriver, TerminalSession, Drivers, createDrivers), with no Cordis in it, that the agent panel and the driver plugins (driver-pty, and driver-acp for the Agent Client Protocol) are written against.",
        "driver-acp: any agent that speaks the Agent Client Protocol (v1, over stdio) as a chat in the agent panel. acrylblends add driver-acp (next to agent-panel) offers acp:dsh (DeepSeek Harness, dsh --profile acp) when dsh is on the PATH, and config.agents adds other ACP agents. Written against acrylblends/drivers, with its own small stdio client checked against the official ACP v1 JSON schema; each agent process is started in one effect and ended, with the tools it started, when the plugin unloads. Development only, like the panel.",
        "What runs in production: which parts are development-only, exactly what live plugin install and the sandbox do and do not stop, and a test that mounts every development tool in one app and checks NODE_ENV=production.",
        "scripts/sync-sites.mjs: one release-checklist step brings both sites up to the repository (docs, new release notes, build, push, live check). Every published version 0.3.0 to 0.11.0 now has a git tag and a GitHub release.",
      ] },
      { heading: "Changed", paragraphs: [
        "The door plugin starts nothing with NODE_ENV=production (no service, route or .acryl/ folder), as the agent panel and the PTY driver already did. A host that means to run it in production sets allowInProduction: true; ACRYL_DOOR=off always wins.",
        "The docs use the published names (acrylblends/cordis/router, acrylblends/cordis/node-server, ...) instead of the names of an app's copies.",
      ] },
      { heading: "Removed", paragraphs: [
        "App and AppRequest (the 0.4 names): use Acryl and AcrylRequest.",
        "acrylblends/utils/* and acrylblends/acryl-base are internal and no longer exported.",
        "The adapters for AWS Lambda, Lambda@Edge, Cloudflare Workers and Pages, Vercel, Netlify and Service Workers: no gate of ours deploys to them. An app is plain fetch code, so a platform that calls a fetch handler can call app.fetch. Their ported sources stay in the repository and may return as separate plugins, each with its own gate.",
      ] },
      { heading: "Experimental", paragraphs: [
        "The door, the agent panel, the PTY driver, live plugin install (extensions, builder) and acrylblends/bun are experimental: they work and are gated, their interface may still change in a minor version, and none of them is for the public internet. Bun has one smoke gate, run on Bun in CI.",
      ] },
      { heading: "Things to know", paragraphs: [
        "Node.js 22.19 or newer. Bun is optional; Deno is not supported.",
        "create-acrylblends 1.0.0 depends on acrylblends ^1.0.0.",
      ] },
    ],
  },
  "framework/release-notes-0-3-0": {
    intro: "0.3.0 moves generated apps onto the ACRYL framework. It is breaking, and the migration of a route is three lines. Superseded by 0.4.0, which replaces ctx.router.get with an App mounted by ctx.router.route.",
    body: [
      { heading: "Breaking", paragraphs: [
        "The http, server and events plugins are removed: use acryl-router (ctx.router), acryl-node-server and acryl-state. The app template is now blank, and init takes --template with blank, todo or agent (--agent and --no-agent still work). In blend.yaml the rows http and server become acryl-router and acryl-node-server, and GET /events becomes /api/state/tasks/events and /api/state/extensions/events. Generated apps also depend on @deepseek-ai/schemastery. Node 22.19 or newer, as before.",
      ] },
      { heading: "Migrating a route", paragraphs: [
        "The old handler shape maps directly: { status: 404, body } is c.json(body, 404), the request body is await c.req.json(), a path parameter is c.param('id'), and ctx.http.handle(...) in a test is await ctx.router.request('/hello'). A route registered through the plugin's context is removed when the plugin unloads, so the ctx.effect wrapper goes.",
      ], code: { label: "0.2.x to 0.3.0", code: "// 0.2.x\nexport const inject = ['http']\nctx.effect(() => ctx.http.route('GET', '/hello', () => ({ body: { text: 'Hello' } })))\n\n// 0.3.0\nexport const inject = ['router']\nctx.router.get('/hello', (c) => c.json({ text: 'Hello' }))" } },
      { heading: "New", paragraphs: [
        "The framework plugins in the library, the todo template, state cells for tasks and extensions, a fix that lets a plugin installed live read ctx.router, an offline agent and a model prompt that write router plugins, and docs in one tree. The full list is docs/release-notes/0.3.0.md in the repository.",
      ] },
      { heading: "Every release", paragraphs: [
        "This page is the oldest of the releases written up here. The releases in between without a page of their own (0.5.1, 0.6.0, 0.6.2, 0.6.3, 0.6.4) and everything published since 0.3.0 are in the GitHub releases list: https://github.com/acrylblends/acrylblends/releases.",
      ] },
    ],
  },
  "framework/release-notes-0-11-0": {
    intro: "0.11.0 adds WebSocket upgrades to the router: upgrade routes are ordinary routes, and the plugin that mounts one owns its sockets.",
    body: [
      { heading: "New", paragraphs: [
        "A plugin takes upgrades with ctx.nodeServer.upgrades() (the standalone server) or ctx.routerHttp.upgrades() with ctx.routerHttp.mount(prefix, { upgrade: [paths] }) (the ACRYL Host's web server): the ported upgradeWebSocket on an ordinary route, with ordinary middleware in front of it. The origin, loopback and host checks run before the upgrade, and a refusal is a plain HTTP status with Connection: close. A non-WebSocket Upgrade request is answered 400.",
        "The plugin owns its sockets. When it unloads, every socket its routes accepted is closed with 1001 within websocket.grace, the handler sees close exactly once, other plugins' sockets are untouched, and ctx.nodeServer.sockets and ctx.routerHttp.sockets count what is open.",
        "Limits: text frames only with { textOnly: true }, websocket.maxPayload (default 1 MiB, a bigger frame closes with 1009), no per-message compression, bufferedAmount on the socket for back-pressure, application close codes, and a ping every websocket.heartbeat ms that ends a peer that stops answering. testWebSocket from acrylblends/node-server runs an upgrade route in process, with no network.",
        "acryl brief prints the app's address (text and --json), so an agent can curl a route it just added.",
      ] },
      { heading: "Fixed", paragraphs: [
        "The app guide names the import a plugin installed into the running app uses: import { Acryl } from 'acrylblends'.",
      ] },
      { heading: "Things to know", paragraphs: [
        "ws is a new optional peer of acrylblends; install it to use upgrades. acryl-node-server no longer requires acryl-router-http, and acryl-router-http requires acryl-node-server. create-acrylblends 0.4.1 depends on acrylblends ^0.11.0.",
      ] },
    ],
  },
  "framework/release-notes-0-10-0": {
    intro: "0.10.0 puts a coding agent in a real terminal inside your app.",
    body: [
      { heading: "New", paragraphs: [
        "driver-pty: acrylblends add driver-pty (next to agent-panel) offers pty:claude, pty:codex and pty:pi in the panel. Choosing one shows the program's own interactive terminal (xterm.js) in the app folder, with .acryl/bin on its PATH, so it builds through the door in its interactive mode. When it installs or removes a plugin the page reloads and the same terminal comes back with its output. Server-sent events down, POST up, no WebSocket. Every process is started in one effect and ended with the plugin. Development only.",
        "The panel's drivers are a registry: each driver is a chat or a terminal session, and other plugins can add drivers with ctx.drivers.register inside ctx.effect.",
        "Evidence: claude, codex and pi each built a feature in the terminal tab from the published 0.10.0 (see the PTY driver evidence page in the repository).",
      ] },
      { heading: "Things to know", paragraphs: [
        "node-pty is installed by acrylblends add driver-pty; xterm.js 6.0.0 and its fit addon 0.11.0 are vendored with their licenses. GET /api/agent-panel/session now answers drivers as [{ name, kind }]. create-acrylblends 0.4.0 depends on acrylblends ^0.10.0.",
      ] },
    ],
  },
  "framework/release-notes-0-9-2": {
    intro: "0.9.2: Stop cancels the app's own agent, and a secrets scan guards what ships into apps.",
    body: [
      { heading: "New", paragraphs: [
        "agent.run(question, { signal }) ends the run cancelled as soon as the signal aborts: the model call or tool in flight is dropped, the trace marks an interrupted tool call as cancelled, and a task record is marked failed. The agent panel's Stop button uses it.",
        "pnpm run check runs verify:secrets, the scan save uses, over the framework docs, the templates and the packages' source.",
      ] },
      { heading: "Fixed", paragraphs: [
        "The npm page of acrylblends shows the logo from the site. Flaky gates: the node server's memory-leak tests collect until the request objects are gone, and the probes never take a port fetch refuses. create-acrylblends 0.3.4 depends on acrylblends ^0.9.2.",
      ] },
    ],
  },
  "framework/release-notes-0-9-1": {
    intro: "0.9.1 fixes 0.9.0: apps made by the installed command line start again.",
    body: [
      { heading: "Fixed", paragraphs: [
        "acrylblends init, add and create-acrylblends made apps whose framework plugins could not find each other (Cannot find package 'acryl-router'). 0.9.0 rewrote the imports between the plugins at copy time only when the plugin's source folder in the package had a package.json, which the published package leaves out, so it worked from the repository and not from the installed package. The rewrite now goes by the entries table of each plugin's plugin.json. Use 0.9.1; 0.9.0 is deprecated. pnpm run verify:packed installs only the two tarballs, makes an app of every template with the installed commands and runs its tests and type-check; it fails on 0.9.0.",
      ] },
      { heading: "Things to know", paragraphs: [
        "create-acrylblends 0.3.3 depends on acrylblends ^0.9.1.",
      ] },
    ],
  },
  "framework/release-notes-0-9-0": {
    intro: "0.9.0: the framework has one home, this repository.",
    body: [
      { heading: "New", paragraphs: [
        "The Cordis forms are subpaths of acrylblends: cordis/router, cordis/router-http, cordis/state, cordis/inspect, cordis/node-server, cordis/db, cordis/db-sqlite, cordis/kv, cordis/kv-json, cordis/kv-db and cordis/door, with optional peers (@deepseek-ai/cordis, @deepseek-ai/schemastery, react, vitest). new Acryl() from acrylblends is the class cordis/router mounts. More subpaths (126 in all): door/host, door/protocol, door/page, db/conformance and kv/conformance.",
        "The source, tests and history of the router, node server, state, inspect, db, kv providers and the door moved here from ACRYL; their suites run on Linux, macOS and Windows with Node 22 and 24. acrylblends init and add rewrite the imports of a library plugin to relative paths when they copy it; the sync, vendor and verify scripts are gone.",
      ] },
      { heading: "Things to know", paragraphs: [
        "acrylblends add kv --suite installs vitest 3.2.4, because npm 10 (Node 22) crashes on the dependency tree of vitest 4 and 5. This release is deprecated: it has a defect fixed in 0.9.1.",
      ] },
    ],
  },
  "framework/release-notes-0-8-1": {
    intro: "0.8.1 makes the door's plugin verbs work in every web template.",
    body: [
      { heading: "New", paragraphs: [
        "nodejs, notes and chat now mount the extensions plugin (and its sandbox), so .acryl/bin/acryl plugin list|add|remove|reload work in them as they do in the agent template: an agent working in the folder can add a plugin to the running app, take it out again, or swap a provider, and brief no longer says Live plugins: unavailable. What is installed lives in plugins/, next to the plugins copied from the library. Development only, like the door: the extensions row is left out with NODE_ENV=production. verify:scaffolder adds a plugin live in each web template, calls its route and removes it.",
      ] },
      { heading: "Things to know", paragraphs: [
        "create-acrylblends 0.3.1 depends on acrylblends ^0.8.1. An app made with 0.8.0 does not change: copy the extensions row, the registry entry and the sources config from a new app.",
      ] },
    ],
  },
  "framework/release-notes-0-8-0": {
    intro: "0.8.0 makes every new app a Cordis app and lets an agent working in the app folder look at the running page and act on it.",
    body: [
      { heading: "New", paragraphs: [
        "Every template is a Cordis app. nodejs, notes and chat are made by acrylblends init like blank, todo and agent: blend.yaml lists the plugins, every plugin is a folder in plugins/, src/main.ts starts the app and src/routes.ts is the app's own plugin. create-acrylblends only calls init now, bun is no longer a template, and a bare template name works: npm create acrylblends@latest my-app notes.",
        "The door. The running app writes .acryl/bin/acryl, a command that reaches only the app running from that folder: brief, look (the page as text with refs, including its visible text), act (click, type, select, press, scroll, wait), plugin add|remove|reload|list and tool list|call. Loopback only, a per-run secret in .acryl/door.json, an audit log, an in-page indicator with a stop button, and .acryl/ ignored by git. On in development, off with NODE_ENV=production or ACRYL_DOOR=off.",
        "The agent panel (opt-in, development only): acrylblends add agent-panel adds a chat panel to the running app. Say what you want; the app's own agent, or Claude Code, Codex or pi started in the app folder, builds it through the door, and the page reloads when a plugin was installed or removed, with no restart.",
        "Bring your own tool: one guide wraps an npm package as a provider of a port, passes the port's conformance suite and swaps it into the running app through the door. acrylblends add kv --suite copies the suite and vitest, and package.json imports (#acryl-kv, #acryl-db) let your provider import the port by name. Three agents followed the guide alone and swapped in a different tool.",
        "Every template passes its own tests in Codex's default sandbox (no network, no system temp folder). The product test: Claude Code, Codex and pi each build the same feature in a fresh app from the docs alone; the gate reads it off the running page through the door in a real browser, restarts the app, installs and tests a fresh git clone, and checks that git stages no secret. clientModules also works inside a sub-app now.",
      ] },
      { heading: "Things to know", paragraphs: [
        "For claude, codex and pi the Stop button of the panel ends the program; the app's own agent cannot be cancelled yet (the run finishes in the background). One process at a time serves a folder's door. The extensions plugin (live plugin add) is part of the agent template; the web templates do not mount it yet. create-acrylblends 0.3.0 depends on acrylblends ^0.8.0.",
      ] },
    ],
  },
  "framework/release-notes-0-7-8": {
    intro: "0.7.8 gives an app one plugin folder and its own self-knowledge, and adds readSSE for the browser.",
    body: [
      { heading: "New", paragraphs: [
        "One plugin folder, plugins/. In an app made by acrylblends init, every plugin lives in plugins/<name>/ at the root of the app: the library plugins acrylblends add copies, and the plugins you or an agent write. src/plugins/ and extensions/ are gone. plugins/library.json lists the library copies, so the extensions plugin never mounts a copy twice. acrylblends check-deps scans plugins/. An app made before 0.7.8 keeps working for this release, with a warning that names the move.",
        "Self-knowledge in every new app. AGENTS.md and CLAUDE.md carry the same text, and one skill, app-guide, is written to .claude/skills/app-guide/SKILL.md and .agents/skills/app-guide/SKILL.md. Both name the defaults (database, key-value store, server, window, browser code) and how each is swapped: every choice is a plugin behind a port, and the default is only a fallback. .acryl/ is ignored by git in every template.",
        "acrylblends/read-sse (109 subpaths): readSSE(response) reads a server-sent event stream as an async iterable of { event, data, id, retry }, in the browser and on Node. acryl-kv-json groups concurrent writes into one file write, with the same crash guarantees.",
      ] },
      { heading: "Things to know", paragraphs: [
        "create-acrylblends 0.2.8 depends on acrylblends ^0.7.8. Postgres is not part of this package: it is an optional provider you add when an app needs a server database.",
      ] },
    ],
  },
  "framework/release-notes-0-7-7": {
    intro: "0.7.7 adds kv: named JSON documents for an app too small for SQL.",
    body: [
      { heading: "New", paragraphs: [
        "acrylblends/kv, acrylblends/kv/json and acrylblends/kv/db (108 subpaths). openKv({ path }) opens one JSON file and returns { kv, close }; kv has get, set, update, delete and list(prefix), every call a promise, values JSON. update is atomic and its callback is a plain synchronous function (an async one is a type error and is rejected with a message that says what to do). Every write is a whole new file renamed over the old one, so a crash leaves the old file or the new one, never half of one; a file that does not parse stops the app with a message that names it. The release check kills a writer with SIGKILL forty times and reads the file every time.",
        "Moving to SQL keeps the data: kvOnDb(db) gives the same kv over a kv table of the database openDb returned, copyKv copies a store into another, and npx acrylblends kv import data/kv.json data/app.sqlite does it from the command line. acrylblends add kv brings the port and the JSON-file provider to a Blend app. The data guide gains A tiny app: kv, including when to move to SQL: more than one process, or a file above a few megabytes.",
      ] },
      { heading: "Things to know", paragraphs: [
        "create-acrylblends 0.2.7 depends on acrylblends ^0.7.7. The starters stay on db. One process owns a JSON file; keys are listed in code point order.",
      ] },
    ],
  },
  "framework/release-notes-0-7-6": {
    intro: "0.7.6 adds the dependency rule: app code takes the db port, and one file opens the database.",
    body: [
      { heading: "New", paragraphs: [
        "acrylblends check-deps fails when a file of the app imports a database driver (node:sqlite, pg, postgres, @electric-sql/pglite and the like), an opener (acrylblends/db/sqlite, acryl-db-sqlite) or electron outside src/plugins/desktop, other than the one file the app names in package.json as its opener. It names the file and the line. The notes and chat templates declare src/db.ts as their opener and run the check in npm test and npm run check; the nodejs template runs it with no opener. acrylblends add db declares src/app.ts, where the provider is mounted, as the opener of a Blend app. The data guide gains Why the database is opened in one place.",
      ] },
      { heading: "Things to know", paragraphs: [
        "create-acrylblends 0.2.6 depends on acrylblends ^0.7.6. An existing app is not changed: add the acryl.opener entry and run npx acrylblends check-deps to adopt the rule.",
      ] },
    ],
  },
  "framework/release-notes-0-7-5": {
    intro: "0.7.5 adds a database for the starters: the db port, numbered migrations, and the notes and chat templates on them.",
    body: [
      { heading: "New", paragraphs: [
        "acrylblends/db and acrylblends/db/sqlite (105 subpaths). openDb({ path, migrations }) opens one SQLite file (its folder is created), enforces foreign keys, applies the numbered SQL files in migrations/ once, in order, in one transaction, and returns { db, close }. db is the same small interface a Postgres provider will serve: exec, run (resolves { changes }), get, all and transaction, every call a promise, ? bindings. The new data guide covers the port, migrations, a table for choosing a store, transactions, tests, shutdown and writing SQL that moves to Postgres.",
        "The notes and chat templates use it: migrations/001-notes.sql and 001-chat.sql hold the schema, the stores take a Db, the files live in data/, and the tests open :memory: with the real migrations. To change the schema, add the next numbered file; never edit one that has run. acrylblends add db brings the port and the SQLite provider to a Blend app.",
      ] },
      { heading: "Changed", paragraphs: [
        "A new notes or chat app keeps its file in data/ (it was notes.db and chat.db). Existing apps are not touched. create-acrylblends 0.2.5 depends on acrylblends ^0.7.5. Postgres, kv and durable are planned, not released.",
      ] },
    ],
  },
  "framework/release-notes-0-7-4": {
    intro: "0.7.4 adds hosting adapters for AWS Lambda, Cloudflare, Vercel, Netlify and Bun, and templates from other people's repositories.",
    body: [
      { heading: "New", paragraphs: [
        "acrylblends/aws-lambda (API Gateway, ALB, Function URLs, VPC Lattice, response streaming), lambda-edge, cloudflare-workers, cloudflare-pages, vercel, netlify, service-worker and bun are part of the package (103 subpaths). The release check calls each handler with the platform's own events, runs a Worker in workerd with wrangler dev --local, and runs the Bun adapter on Bun; none has been deployed to a platform account by the ACRYL team. Each has a getting-started page. create-acrylblends accepts a template source: github:owner/repo[#ref], @scope/name or a packed tarball, fetched without running anything, with an acryl.template.json manifest required, secrets scanned before the folder is created, and install scripts listed and never run without --install.",
      ] },
      { heading: "Fixed", paragraphs: [
        "Importing acrylblends/bun on Node no longer throws. create-acrylblends 0.2.4 depends on acrylblends ^0.7.4.",
      ] },
    ],
  },
  "framework/release-notes-0-7-3": {
    intro: "0.7.3 adds an AI chat starter and the documentation for streaming an answer from a model.",
    body: [
      { heading: "New", paragraphs: [
        "create-acrylblends --template chat makes a small chat app: the answer streams token by token over Server-Sent Events from an OpenAI-compatible API (DeepSeek by default, the key only from the DEEPSEEK_API_KEY environment variable), a client component shows it as it arrives, and a Stop button aborts the request and the server's own request to the model. History is stored with node:sqlite; the tests use a mock model. The streaming helper page gains cancelling work when the client leaves, a server example that reads a streaming upstream, and a snippet that reads a POST event stream in the browser.",
      ] },
      { heading: "Fixed", paragraphs: [
        "A production check meant for the 0.7.2 release gate had silently not been applied; it is in now for the notes and chat templates. create-acrylblends 0.2.3 depends on acrylblends ^0.7.3.",
      ] },
    ],
  },
  "framework/release-notes-0-7-2": {
    intro: "0.7.2 adds client components without a bundler, binds serve() to 127.0.0.1 by default and ships a production-ready notes starter.",
    body: [
      { heading: "New", paragraphs: [
        "clientModules and buildClientModules from acrylblends/node-server serve a folder of .tsx client modules to the browser, compiled when the browser asks; acrylblends build-client compiles them once for production. create-acrylblends --template notes makes a small full-stack app: sign up and log in, notes in SQLite through node:sqlite, validated forms, search, a JSON API with a typed test client, csrf, a test for every route, and a client-component character counter. The docs gain a Deploy page and a client components guide. schemaValidator takes the full Standard Schema shape and testClient takes default headers.",
      ] },
      { heading: "Changed", paragraphs: [
        "serve() binds 127.0.0.1 unless hostname is given (it used to listen on every interface); set HOST=0.0.0.0 or pass hostname where you mean to expose the app. The nodejs and notes templates read HOST and PORT, stop gracefully on SIGTERM and SIGINT, and keep typescript as a runtime dependency so npm ci --omit=dev can start an app with .tsx pages. create-acrylblends 0.2.2 depends on acrylblends ^0.7.2.",
      ] },
    ],
  },
  "framework/release-notes-0-7-1": {
    intro: "0.7.1 updates Electron in the desktop window, removes a warning on Windows and makes the first hour with a coding agent smoother.",
    body: [
      { heading: "Fixed", paragraphs: [
        "Electron 44.9.3 (was 44.0.0, which has published advisories) in both desktop plugins; an app that already has the shell sets electron to 44.9.3 in package.json and runs npm install. acrylblends init --install and create-acrylblends start the package manager without a shell, so Node no longer prints the DEP0190 warning on Windows.",
      ] },
      { heading: "Better for coding agents", paragraphs: [
        "A nodejs app's AGENTS.md says how to run the app as a desktop window and that testClient only types chained routes. The framework docs gain Forms, sessions and a database: node:sqlite, scrypt passwords, a cookie session, validated HTML forms, a JSON API that shares the rules and tests for every route. create-acrylblends 0.2.1 depends on acrylblends ^0.7.1.",
      ] },
    ],
  },
  "framework/release-notes-0-7-0": {
    intro: "0.7.0 lets you write pages in .tsx on Node.js with no build step, as the framework docs show.",
    body: [
      { heading: "New", paragraphs: [
        "acrylblends/node-server/register is a Node.js module hook: node --import acrylblends/node-server/register app.tsx compiles .tsx and .jsx files with the app's own typescript (react-jsx, the jsxImportSource of the nearest tsconfig.json, acrylblends/jsx by default) and leaves every other module to Node. An error stack names the .tsx line. The templates use it: create-acrylblends 0.2.0 apps run dev, start and test with the hook and have a .tsx page at /about with a test that renders it and a test that an error in it names the .tsx line; the Blend templates use the vendored hook and the blank template has the same page. The desktop shells register the hook before they load the app. AGENTS.md makes .tsx the normal path, with jsx(tag, props, ...children) as the build-free alternative.",
      ], code: { label: "package.json", code: "\"scripts\": {\n  \"dev\": \"node --watch --import acrylblends/node-server/register src/index.ts\",\n  \"start\": \"node --import acrylblends/node-server/register src/index.ts\",\n  \"test\": \"node --import acrylblends/node-server/register --test \\\"test/**/*.test.{ts,tsx}\\\"\"\n}" } },
    ],
  },
  "framework/release-notes-0-6-1": {
    intro: "0.6.0 and 0.6.1 add the desktop shell: an Electron window on the app's own server, for a Blend app and for a plain Acryl app.",
    body: [
      { heading: "New", paragraphs: [
        "acrylblends init my-app --template todo --desktop, or acrylblends add desktop in an existing app, adds npm run desktop. It starts the app's own server in an Electron main process and opens one window on it, with a locked-down renderer, navigation limited to the app's own origin, a single-instance lock, Electron's user data inside the app's own folder (.acrylblends/electron), and a bounded shutdown when the window closes. In a plain Acryl app (npm create acrylblends@latest, template nodejs) add desktop adds src/plugins/desktop-web, which serves app.fetch on 127.0.0.1 with a free port through acrylblends/node-server. Only that folder imports electron.",
        "create-acrylblends 0.1.2 stamps the acrylblends version it was released with into a new app's package.json, so a new app depends on the release that created it. Electron is pinned to 44.0.0 and downloads its binary the first time npm run desktop runs, about 100 MB once per machine. It runs from source; packaging a distributable app is not part of it. The full text is docs/desktop.md and docs/release-notes/0.6.1.md in the repository.",
      ], code: { label: "terminal", code: "npm create acrylblends@latest my-app -- --template nodejs\ncd my-app && npm install\nnpx acrylblends add desktop && npm install\nnpm run desktop" } },
    ],
  },
  "framework/release-notes-0-5-0": {
    intro: "0.5.0 makes acrylblends the framework: import { Acryl } from 'acrylblends', with every middleware and helper at its own subpath, and npm create acrylblends@latest to start a project.",
    body: [
      { heading: "Breaking", paragraphs: [
        "The package root is the framework. What the root exported before (runCli, init, copyPlugin and the rest of the scaffolder) moved to acrylblends/cli; the acrylblends command is unchanged. The application class is Acryl and the request type is AcrylRequest; App and AppRequest still work in Blend apps and are deprecated. A plugin the agent writes while the app runs imports the framework by the docs' names (acrylblends, acrylblends/cors, ...).",
      ] },
      { heading: "New", paragraphs: [
        "74 subpaths: the root, 25 middleware, the helpers, the five routers, utils and the Node.js adapter at acrylblends/node-server, plus two of ours, acrylblends/schema-validator and acrylblends/loopback-only. No dependencies, ESM, types that stand without the DOM library. create-acrylblends asks for a template (nodejs, bun (experimental) or acryl-app) or takes --template, --install, --pm and -y, and every template includes AGENTS.md, CLAUDE.md and the docs. The framework documentation is a new tree of 87 pages, and every code block that imports the package is type-checked against it. Node.js is the verified runtime; Bun is experimental. The full list is docs/release-notes/0.5.0.md.",
      ], code: { label: "terminal", code: "npm create acrylblends@latest my-app -- --template nodejs\ncd my-app && npm run dev" } },
    ],
  },
  "framework/release-notes-0-4-1": {
    intro: "0.4.1 puts the framework's docs inside every generated app, so a coding agent working there finds the API in the folder it is in. Nothing breaks.",
    body: [
      { heading: "New", paragraphs: [
        "acrylblends init copies docs/framework (routing, request, context, validation, helpers, middleware, plugin lifecycle, the node server, a one-page API summary and the migration from 0.3) into the app, for all three templates: 15 files, about 63 KB of text. It also writes AGENTS.md, which says where the API is, how to build a feature (an App mounted with ctx.router.route, a plugin registered in src/app.ts and blend.yaml, a state cell) and the things that surprise people, and CLAUDE.md, which is @AGENTS.md. A manual gate, scripts/verify-coding-agent.mjs, starts a headless coding agent in a fresh app with a one-line task and checks that the tests and the type-check pass afterwards.",
      ] },
      { heading: "Changed", paragraphs: [
        "A live plugin's check receives the plugin's own context, so ctx.router reads the same in apply and in check. The framework docs are re-synced from ACRYL: the trailing-slash rule with a measured table (trimTrailingSlash redirects /x/ for GET and HEAD), the exact validation failure shape, and the JSON Content-Type trap. The todo template uses trimTrailingSlash with tests, and the inspector lists each route as its own entry. The full list is docs/release-notes/0.4.1.md.",
      ] },
    ],
  },
  "framework/release-notes-0-4-0": {
    intro: "0.4.0 ships the ported framework core. It is breaking for every plugin that registered a route: build an App and mount it once.",
    body: [
      { heading: "Breaking", paragraphs: [
        "Routes are an App mounted with ctx.router.route(prefix, app); ctx.router.get, post, put, patch, delete, all, on, use and group are gone, with no aliases. The handler context is the ported one: c.req.param('id'), c.req.query(name), c.req.raw, HTTPException, schemaValidator with c.req.valid, bodyLimit with maxSize, and transport facts in c.env.connection. A server-sent stream is written with stream.writeSSE. Routes added to an app after it was mounted are not served.",
        "Plugins the agent writes while the app runs import App from 'acryl-router', the app's own copy; the model prompt and the builder write them this way.",
      ] },
      { heading: "Migrating a route", paragraphs: [
        "Build an App, register on it, mount it once from the plugin's own context. The mount is removed when the plugin unloads and public paths do not change. The complete table of old and new calls is the Migration from 0.3 page in docs/framework of the repository.",
      ], code: { label: "0.3.0 to 0.4.0", code: "// 0.3.0\nctx.router.get('/hello', (c) => c.json({ text: 'Hello' }))\n\n// 0.4.0\nimport { App } from 'acryl-router'\nctx.router.route('/', new App().get('/hello', (c) => c.json({ text: 'Hello' })))" } },
      { heading: "Changed", paragraphs: [
        "acryl-router and acryl-node-server carry the ported core with its test suites (about 3,100 tests run in the repository), vendored from ACRYL and checked for drift. Generated apps type-check with lib ES2024 plus DOM and strict on. The todo template is ACRYL's updated reference app. An app no longer receives a plugin's colocated test files. The full list is docs/release-notes/0.4.0.md.",
      ] },
    ],
  },
  "framework/examples-and-demos": {
    intro: "Three end-to-end demos, each checked against the real repository: a blank app with a plugin added, an agent that builds a plugin live, and an app in a container.",
    body: [
      { heading: "1. A blank app, then add a plugin", paragraphs: [
        "A blank app mounts only what it needs. Add settings from the library, then mount it in src/app.ts and list it in blend.yaml.",
      ], code: { label: "terminal", code: "npx acrylblends init ./my-app --template blank --yes\ncd my-app && npm install && npm run check\nnpx acrylblends add settings --dir .\nnpm install && npm run check" } },
      { heading: "2. The agent builds a clock", paragraphs: [
        "Start the agent template, then ask it to build and install a plugin. It writes the plugin, installs it live and calls it. The plugin survives a restart. Ask again to change it; if the update fails, the previous version comes back.",
      ], code: { label: "terminal", code: "npx acrylblends init ./my-agent --template agent --yes\ncd my-agent && npm install && npm start\n\ncurl -X POST localhost:3100/ask -H 'content-type: application/json' \\\n  -d '{\"question\":\"Build a plugin named clock that adds GET /time returning the ISO time. Install it.\"}'\ncurl localhost:3100/time\ncurl localhost:3100/tasks" } },
      { heading: "3. In a container", paragraphs: [
        "The agent template's Dockerfile keeps the app's data in /data. A recreated container on the same volume still serves the plugin.",
      ], code: { label: "docker", code: "docker build -t my-agent .\ndocker run -p 3100:3100 -v my-agent-data:/data my-agent" },
      note: "Known gaps: there is no package registry for plugins yet, the sandbox does not restrict network access, its OS layer is tested only on macOS, and hosted approval needs a web route that is not built yet." },
    ],
  },
  "core-concepts/cordis-plugins-the-atom": {
    intro: "A Cordis plugin does one thing, with an explicit lifecycle and an explicit dependency graph.",
    body: [{ paragraphs: [
      "The minimal Cordis plugin is a function plugin: a `name`, and an `apply(ctx)` that does something with the context it's given. There is no required base class, no mandatory configuration schema, no forced directory shape.",
    ]}],
    code: { label: "hello.ts", code: pluginCode },
  },
  "core-concepts/blends-the-composed-instance": {
    intro: "A Blend names the plugins that become one working instance, in a manifest a human can read top to bottom.",
    body: [{ paragraphs: [
      "Where a plugin is the atom, a Blend is the recipe: a YAML file naming a runtime and a list of plugins, nothing more structurally required. The manifest is not a new package boundary — it doesn't wrap or hide the plugins it names, it just records which ones compose into this particular instance and at which versions.",
    ]}],
    code: { label: "blend.yml", code: blendYamlCode },
  },
  "core-concepts/the-two-registries": {
    intro: "cordisplugins is the atom registry. acrylblends is the Blend registry. Neither one absorbs the other.",
    body: [{ paragraphs: [
      "cordisplugins.github.io is where a single Cordis plugin gets published and discovered — README, version history, what it provides and consumes, npm-shaped. acrylblends.github.io is where a composed Blend gets published and discovered — the full manifest, the plugins it pulls in, browsable by the same 100-category taxonomy a Blend itself is tagged with.",
      "A Blend's detail page links out to every plugin it composes on cordisplugins; a plugin's detail page on cordisplugins links back to every Blend that uses it. The two sites stay siblings at different layers rather than merging into one undifferentiated catalog.",
    ]}],
  },
  "core-concepts/the-blank-canvas": {
    intro: "The blank-canvas Blend is the floor of the model: only `cordis` itself, nothing assumed.",
    body: [{ paragraphs: [
      "Starting from blank and growing only what the work needs is the whole point of keeping plugins small and Blends explicit. A stripped-down instance with nothing but the ability to accept input and load a plugin is a legitimate, first-class Blend — not a degraded version of a \"real\" one.",
    ]}],
  },
  "core-concepts/acryl-as-a-maxed-out-blend": {
    intro: "ACRYL, the flagship product, is just one Blend among many possible ones — the one that composes the most.",
    body: [{ paragraphs: [
      "Terminal, web and desktop surfaces, the agent control plane, the development canvas, the editor, the market provider, the brand slot — every one of those is a Cordis plugin, and ACRYL is the manifest that names all of them together. Nothing about being the flagship product exempts it from the same model a one-plugin blank-canvas Blend follows.",
      "This is deliberate: it means the framework that builds ACRYL is the same framework anyone else uses to build something far smaller and more specialized.",
    ]}],
  },
  "building-blocks/generate-a-plugin-from-template": {
    intro: "Scaffolding a plugin is meant to guarantee Cordis compatibility by construction, not by review.",
    body: [{ paragraphs: [
      "The scaffolding skill an agent (or a human) uses to generate a new Cordis plugin exists so that the six-part mini-design discipline — capability boundary, provides/consumes, effects/disposal, configuration/composition, events/durability, verification — is baked into the generated shape rather than something a reviewer has to check for after the fact.",
    ]}],
  },
  "building-blocks/package-identity-convention": {
    intro: "A Loader row's id equals its package name by default — no unrelated shorthand a reader has to decode.",
    body: [{ paragraphs: [
      "This is not a style preference; it is a rule this ecosystem's own repository learned the hard way. `acryl-development-canvas` shipped for a time under the row id `desktop-development-canvas`, and a sibling plugin's row id `dsh-editor` (for the package `acryl-dsh-editor-plugin`) went undiscovered as opaque until it broke a real boot. Both were real incidents, not hypotheticals.",
      "The one legitimate exception is a deliberately shared, multi-provider slot, where the id names a capability rather than a package because more than one interchangeable package can fill it — and that exception has to be named as such, explicitly, in the plugin's own mini-design. It is never a default excuse for an abbreviated id.",
    ]}],
    code: { label: "cordis.patch.yml", code: loaderRowIdExample },
  },
  "building-blocks/six-part-mini-design": {
    intro: "Before writing a plugin, write down six things: what it is, what it needs, how it cleans up, how it's configured, how it communicates, and how you'll prove it works.",
    body: [{ paragraphs: [
      "1. Capability and plugin boundary — what domain owns it and why it needs an independent lifecycle.",
      "2. Provides and consumes — services, tools, events, durable facts, hard `inject` requirements versus optional `ctx.get()` dependencies.",
      "3. Effects and disposal — every activation-owned resource, its disposer, cleanup order, cancellation and quiescence.",
      "4. Configuration and composition — validated runtime schema, stable Loader row id, scopes/isolation, provider replacement behavior.",
      "5. Events and durability — dispatch mode, waterfall `next()` semantics, which replay-critical facts belong in durable session state.",
      "6. Verification — real Loader activation plus PENDING/reactivation, provider replacement, disposal, repeated mount/reload, leak checks.",
    ]}],
  },
  "in-instance-authoring/hot-reload-authoring": {
    intro: "Build a plugin without publishing it first — hot reload lets it live and iterate inside a running Blend.",
    body: [{ paragraphs: [
      "For true self-evolution, an instance has to be able to build its own plugins without the friction of a full publish cycle every time. A plugin written this way stays local, hot-reloadable, and immediately usable — it only graduates to a registry once it reaches a shape stable enough to be worth sharing.",
      "This is what lets a Blend genuinely grow rather than only ever recompose things that already existed as finished, published packages.",
    ]}],
  },
  "in-instance-authoring/the-acryl-package-keyword": {
    intro: "A suffix/tag convention that lets a plugin opt into automatic discoverability inside ACRYL's own in-instance market without requiring every plugin on the public registry to be ACRYL-specific.",
    body: [{ paragraphs: [
      "Anyone can publish a Cordis plugin to cordisplugins.github.io without it being ACRYL-flavored at all — that's what keeps the registry usable by stock DeepSeek Harness communities too. The \"Acryl-package\" convention is the opt-in on top: declare it, and the plugin is automatically surfaced inside ACRYL's own in-instance market (cordis-plugin-market) the way other plugin marketplaces (like deepseek1024.com) already do for their own ecosystems.",
    ]}],
  },
  "in-instance-authoring/differentiation-engine": {
    intro: "Live, agent-driven capability addition to a running Blend — checkpointed and reversible. Not yet built.",
    body: [{ paragraphs: [
      "The Differentiation Engine is the mechanism that would let an agent add capability to a live instance safely: checkpoint before the change, apply it, and roll back cleanly if it doesn't work out. It is active design work, tracked as its own spec, not a shipped feature — referenced here because the rest of the in-instance-authoring story depends on it existing eventually.",
    ]}],
  },
  "building-and-publishing/the-blend-yaml-format": {
    intro: "A Blend manifest is a name, a version, a runtime, and the plugins that compose it — nothing hidden.",
    body: [{ paragraphs: [
      "The format is deliberately minimal because the manifest's job is to stay legible, not to become a second configuration system on top of Cordis. Anything a plugin needs beyond \"which plugins, which versions\" belongs in that plugin's own `cordis.patch.yml`, not smeared into the Blend manifest.",
    ]}],
    code: { label: "blend.yml", code: blendYamlCode },
  },
  "building-and-publishing/publish-to-acrylblends": {
    intro: "Publishing a Blend lists it on this registry, tagged into the same 100-category taxonomy every category page already uses.",
    body: [{ paragraphs: [
      "A category with no Blends yet is a real, addressable target on this site, not a hidden gap — publishing the first Blend into it is exactly what that empty state is waiting for.",
    ]}],
  },
  "nesting-and-composition/grouping-plugins-into-larger-units": {
    intro: "Whether plugins should be nestable into intermediate groupings — between a single atom and a full Blend — is an open, unresolved question.",
    body: [{ paragraphs: [
      "One direction under consideration borrows from biology: something like a cell/organism distinction, where a group of plugins could compose into a stable intermediate unit before being folded into a full Blend. Nothing here is settled protocol; this page exists to record the question honestly rather than present speculation as a finished design.",
    ]}],
  },
  "private-and-enterprise/self-hosted-registries": {
    intro: "Teams can run their own registry boundary instead of publishing to the public catalog.",
    body: [{ paragraphs: [
      "This is part of the same open-core posture as the rest of the ecosystem: the protocol, the framework, and the public registries stay open and free, while a private registry is the option for a team or company that wants the exact same publish/pull workflow without anything leaving their own boundary.",
    ]}],
  },
  "private-and-enterprise/enterprise-only-blends": {
    intro: "Not every Blend is meant to be public — some are pre-built, specialized, white-label products sold under an enterprise license.",
    body: [{ paragraphs: [
      "The open source project is free and stays free. Consulting, adapting the framework to a specific business, and enterprise-only pre-built Blends are the commercial layer on top, built by Webboxes — never a paywall on the protocol or the public registries themselves.",
    ]}],
  },

  // Ecosystem pages
  "three-layers": {
    intro: "Atom, Blend, and registry — three layers that stay legible because none of them absorbs another.",
    body: [{ paragraphs: [
      "A Cordis plugin provides a capability. A Blend composes plugins into a complete, pullable instance. A registry — cordisplugins for plugins, acrylblends for Blends — makes either layer discoverable without collapsing the distinction between them.",
    ]}],
  },
  "business-model": {
    intro: "Open source, free, built by Webboxes — with consulting and private options for teams who need more than the public commons.",
    body: [{ paragraphs: [
      "The protocol (Cordis), the framework (ACRYL Blends), and the public registries (cordisplugins, acrylblends) are completely open and free — this is genuinely open source, not a free tier in front of a paid product.",
      "Webboxes, the company behind the project, earns by adapting the framework for businesses through consulting, by building pre-built specialized white-label Blends that are sold enterprise-only rather than published publicly, and by supporting private, proprietary registries for teams who want the same tooling entirely inside their own boundary.",
    ]}],
  },
  "roadmap": {
    intro: "Not every layer of this model is finished — this page names the real gaps rather than implying they're already closed.",
    body: [{ paragraphs: [
      "The Differentiation Engine (live, checkpointed, reversible in-instance capability addition) is active design work, not shipped. The plugin-from-template scaffolding skill exists as a concept, not yet a guaranteed-compatible generator. Nesting/grouping plugins into intermediate units is an open question with no settled protocol. None of these are hidden — each has its own honest page rather than an implied claim of completeness.",
    ]}],
  },
};
