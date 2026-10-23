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
    intro: "init scaffolds a Cordis app in an empty directory. Pick the small app template or the agent template.",
    body: [
      { paragraphs: [
        "init never writes into a directory that is not empty. --template picks one of three: blank (the default: instance, the router, the node server, manifest and save), todo (a todo list built only on the router and state) and agent (blank plus state, tasks, agent, extensions and builder, so the app can extend itself while it runs). --agent still means --template agent.",
      ], code: { label: "terminal", code: "npx acrylblends init my-app --template todo -y\ncd my-app\nnpm install\nnpm test\nnpm run dev      # prints its URL; data lives in .acrylblends/" } },
      { heading: "Where things live", paragraphs: [
        "blend.yaml is the app as data: plugin rows, config and parameters. src/app.ts is the registry of plugins your code provides. src/routes.ts is your own plugin. src/plugins/ holds plugins copied from the library and is yours to edit. extensions/ holds plugins installed while the app runs. .acrylblends/ is the app's data and is not committed.",
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
      "plugins lists the library and what each plugin needs. add copies one into src/plugins/ together with the plugins it requires, and prints the exact line to add. Run npm install afterwards in case it added dependencies.",
      "Then mount it in src/app.ts and add a row in blend.yaml. Because the code is copied, you can edit it freely.",
    ]}],
    code: { label: "terminal", code: "npx acrylblends plugins\nnpx acrylblends add settings --dir ./my-app\nnpm install\nnpm run check" },
  },
  "getting-started/lock-save-and-ship": {
    intro: "Record what the app is built from, commit it safely, and run it in a container.",
    body: [
      { paragraphs: [
        "lock writes acrylblends.lock.json with digests of what the app is built from. save commits the app to its own git repository and pushes only if a remote is set. It refuses any file that looks like it holds a secret, and refuses to push an app that is not visibility: public to a public remote. Nothing is committed when it refuses.",
      ], code: { label: "terminal", code: "npm run lock\nnpm run save -- \"add hello\"" } },
      { heading: "In a container", paragraphs: [
        "The agent template includes a Dockerfile. The data lives in /data, so what the agent built survives restarts.",
      ], code: { label: "docker", code: "docker build -t my-agent .\ndocker run -p 3100:3100 -v my-agent-data:/data \\\n  -e ACRYLBLENDS_MODEL_URL=... -e ACRYLBLENDS_MODEL=... -e ACRYLBLENDS_MODEL_KEY=... my-agent" },
      note: "Known gap: the plugin's editable source sits in /app/extensions, which is not on the volume. After a container is recreated the plugin shows as stale until it is reinstalled." },
    ],
  },
  "framework/cli-reference": {
    intro: "The acrylblends command has three verbs: init, add and plugins. Run it with npx acrylblends, or install it globally with npm install -g acrylblends.",
    body: [
      { heading: "init", paragraphs: [
        "Creates a Cordis app in an empty or new directory. It never writes into a directory that is not empty.",
      ], code: { label: "usage", code: "acrylblends init [dir] [--template blank|todo|agent] [--agent | --no-agent] [--name <name>] [--install] [-y]" } },
      { paragraphs: [
        "--template chooses blank, todo or agent (asked when not given). --agent is --template agent and --no-agent is --template blank, so older scripts keep working. --install runs npm install afterwards. -y asks nothing and uses the defaults: the blank template, no install.",
      ] },
      { heading: "add", paragraphs: [
        "Copies library plugins, and the plugins they require, into the app's src/plugins/. Given a folder path instead of a name, it brings an external plugin into the app's extensions/, where it installs at the next start through the same checks as any extension. It prints the exact line to add to src/app.ts and blend.yaml.",
      ], code: { label: "usage", code: "acrylblends add <plugin...> [--dir <app>]\nacrylblends add settings --dir ./my-app\nacrylblends add ./plugin-packages/clock --dir ./my-app" } },
      { heading: "plugins", paragraphs: [
        "Lists the plugin library with what each plugin does and what it requires.",
      ], code: { label: "usage", code: "acrylblends plugins" } },
      { heading: "Scripts in a generated app", paragraphs: [
        "npm run dev and npm start run the app. npm test runs node:test. npm run check type-checks. npm run lock writes acrylblends.lock.json. npm run save commits the app, refusing secrets and public remotes for private apps. The agent template also has npm run upgrade, which plans an upgrade before applying it.",
      ], note: "Environment: ACRYLBLENDS_HOME (where the app keeps its data), ACRYLBLENDS_PORT (first port tried, 0 for any), ACRYLBLENDS_HOST (the interface). The agent template also reads ACRYLBLENDS_MODEL_URL, ACRYLBLENDS_MODEL and ACRYLBLENDS_MODEL_KEY." },
    ],
  },
  "framework/templates": {
    intro: "Three templates ship with the CLI: blank, a Cordis app that serves routes on the ACRYL router; todo, a todo list built only on the router and state; and agent, the blank app with an agent that can extend it while it runs.",
    body: [
      { paragraphs: [
        "All three are TypeScript run directly by Node 22.19 or newer, tested with node:test, and depend at run time on @deepseek-ai/cordis, @deepseek-ai/schemastery, yaml and ACRYL's published blends-core and app-persistence packages. All mount their plugins from blend.yaml, so you choose, order and switch off plugins without editing code.",
      ] },
      { heading: "blank", paragraphs: [
        "instance, acryl-router, acryl-node-server, manifest and save, plus your own routes plugin in src/routes.ts (ctx.router.get('/', (c) => c.json({ ok: true }))). The smallest useful base for any app, not only an IDE.",
      ] },
      { heading: "todo", paragraphs: [
        "ACRYL's reference app, copied as it is: a todo list in one plugin on the router and state. GET and POST /todo/api, PATCH and DELETE /todo/api/:id, a page at /todo, a server-sent stream at /todo/events, and a file in the app's home that keeps the list across restarts. Its tests run with node:test and cover the CRUD, the validation, the stream and the restart.",
      ], code: { label: "terminal", code: "npx acrylblends init todo --template todo\ncd todo && npm install && npm test\nnpm run dev            # prints its URL\ncurl -X POST $URL/todo/api -H 'content-type: application/json' -d '{\"title\":\"write the docs\"}\ncurl $URL/todo/api" } },
      { heading: "agent", paragraphs: [
        "Everything in blank plus acryl-state, tasks (durable run records), agent (an offline scripted model by default), extensions (live install with rollback) and builder (tools that let the agent write and install plugins). Set ACRYLBLENDS_MODEL_URL, ACRYLBLENDS_MODEL and ACRYLBLENDS_MODEL_KEY and the agent uses a real OpenAI-compatible model instead. It also includes a Dockerfile whose data lives in /data.",
      ], note: "Parameters in blend.yaml: steps (the agent's step budget), taskStore (jsonl or sqlite) and approval (true makes an agent-installed plugin wait for POST /extensions/approve)." },
    ],
  },
  "framework/the-plugin-library": {
    intro: "Every plugin in the library is plain Cordis code, extracted from ACRYL, tested against a real Cordis context including disposal, and copied into your app so you own it.",
    body: [
      { paragraphs: [
        "instance: where the app keeps its data and which port it uses. acryl-router, acryl-node-server, acryl-state, acryl-inspect and acryl-router-http: ACRYL's framework, vendored as it is (see The ACRYL framework). settings: validated, layered, watched settings in one YAML file. settings: validated, layered, watched settings in one YAML file. extensions: install, update, remove and reload plugins while the app runs; a failed update restores the previous version, and a ledger records every change.",
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
      note: "The lock file is being unified with ACRYL's blend.lock.json. Until that lands, the framework writes acrylblends.lock.json." },
    ],
  },
  "framework/the-blend-registry": {
    intro: "The registry at acrylblends.github.io/registry holds starting points: Blank, and Blueprints such as the GTD Planner and the Organizer. A project started from one belongs to its owner.",
    body: [
      { paragraphs: [
        "The registry is the source of truth for Blends. Its index is plain JSON at https://acrylblends.github.io/registry/index.json, so any tool can read it. Each entry has an id, name, kind, version, path, license, category, description and, for a Blueprint grown from another, its parent. A starter's files are served at https://acrylblends.github.io/registry/blends/<id>/blend.yaml.",
        "From ACRYL, acryl new my-app --from <id> starts a project from an entry, for example acryl.organizer. A private starter needs no registry: start from its git repository instead.",
      ], code: { label: "index entry", code: "{\n  \"id\": \"acryl.gtd\",\n  \"name\": \"GTD Planner\",\n  \"kind\": \"Blueprint\",\n  \"version\": \"0.1.0\",\n  \"path\": \"blends/acryl.gtd\",\n  \"license\": \"MIT\",\n  \"category\": \"productivity\",\n  \"description\": \"Getting Things Done - ...\",\n  \"parent\": \"acryl.blank\"\n}" } },
      { heading: "Publishing", paragraphs: [
        "Open a pull request that adds blends/<id>/ with a blend.yaml (kind Blueprint, an id you own, license, visibility public, category, description), the plugins it adds under extensions/, and a README. CI validates every entry with blends-core and fails when the index is stale. A private or unlicensed entry is refused.",
      ], note: "Plugins have their own registry, cordisplugins.github.io, with an index at https://cordisplugins.github.io/registry/index.json. acryl.dev/blends and acryl.dev/packages mirror both." },
    ],
  },
  "framework/extending-a-running-app": {
    intro: "An app with the agent template can be extended while it runs, by you or by its agent, and a failed update leaves the previous version running.",
    body: [
      { paragraphs: [
        "An extension is a folder in the app's extensions/ whose name is the plugin's name, with an index.ts that exports a Cordis plugin. Installing it checks the folder, stages a copy named by its content digest, starts it as a child fiber, verifies its optional check function, and records the result in a ledger. If it fails to start or fails its check, the previous version starts again and the answer says restoredPrevious.",
        "A plugin is trusted code and is gated by approval. A tool is code you do not trust, such as a function an agent just wrote: it never runs inside the app, only in the sandbox, and its examples are the install's self-check. At startup, folders in a source marked trust: list are only reported, so code that arrived through a git pull does not run until someone asks.",
        "Look at GET /extensions for what is installed and its state, GET /tasks for every agent run as a durable task, and GET /api/state/tasks/events and GET /api/state/extensions/events for live streams of changes (GET /api/state/tasks and GET /api/state/extensions read the current value).",
      ], note: "The full contract, including approval, the builder tools and packaging a plugin for sharing, is in docs/extending-apps.md in the repository." },
    ],
  },
  "framework/the-acryl-framework": {
    intro: "The router, shared state and the node server are ACRYL's own framework, written as Cordis plugins and copied into your app as they are.",
    body: [
      { paragraphs: [
        "acryl-router gives ctx.router: routes, groups, middleware, helpers (validate, readJson, streamSSE) and an in-process request() for tests. acryl-node-server is one node:http listener that sends every request to the router (port, loopback host, next-free-port scan; it ends open streams and frees the port when unloaded). acryl-state gives observable cells that the router serves as JSON and as server-sent events at /api/state/<key> and /api/state/<key>/events. acryl-inspect reports what every plugin requires, provides and registers.",
        "Everything a plugin registers on the router, state or the inspector goes away when that plugin unloads. A plugin installed while the app runs reads the router as ctx.router.",
      ], code: { label: "a plugin", code: "export const name = 'hello'\nexport const inject = ['router']\nexport function apply(ctx) {\n  ctx.router.get('/hello/:who', (c) => c.json({ hello: c.param('who') }))\n}" } },
      { heading: "One source of truth", paragraphs: [
        "The framework lives in ACRYL (github.com/acryldev/acryl, plugins/acryl-*), where the Web, Desktop and terminal surfaces test it. This library vendors it: a sync script copies the source and the tests, rewrites only the imports between the plugins, and records the ACRYL commit and a digest in each plugin's upstream.json. pnpm run verify:framework fails when a copy was edited, so a change is made in ACRYL first and synced here.",
        "The docs are organized as concepts, api, guides and middleware, and are ACRYL's own text, copied the same way into docs/framework of the repository.",
      ], note: "The notice that acryl-state carries travels with the plugin (a NOTICE file in its folder)." },
    ],
  },
  "framework/release-notes-0-3-0": {
    intro: "0.3.0 moves generated apps onto the ACRYL framework. It is breaking, and the migration of a route is three lines. This is a draft: the release is not published yet.",
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
