// Real content, fetched verbatim from deepseek-harness.github.io's own
// Cordis/Harness developer documentation (docs/cordis-tutorial/,
// docs/user/develop/, docs/subsystems/, packages/*/README.md in
// github.com/deepseek-ai/deepseek-harness at commit master as of this
// writing). Code samples are reproduced exactly as published. Every entry
// links back to its real source page — this recreates and extends the
// curriculum, it does not replace attribution to the original.
const HARNESS_DOCS = "https://deepseek-harness.github.io/deepseek-harness/en";
const HARNESS_REPO = "https://github.com/deepseek-ai/deepseek-harness/blob/master";

export type CordisCode = { label: string; code: string };
export type CordisSection = {
  heading?: string;
  paragraphs: string[];
  code?: CordisCode[];
  note?: string;
  table?: { headers: string[]; rows: string[][] };
};
export type CordisEntry = {
  intro: string;
  body: CordisSection[];
  sourceUrl: string;
  sourceLabel?: string;
};

export const cordisContent: Record<string, CordisEntry> = {
  // ---------------------------------------------------------------------
  // Cordis Framework Tutorial (chapters 1-7, real, built against a scratch
  // Cordis runtime with no API key) + the ACRYL bridging chapter.
  // ---------------------------------------------------------------------
  "tutorial/1-your-first-plugin": {
    intro: "In the loader configuration used here, a Cordis plugin module named-exports an apply function. When Cordis loads it, it calls apply with a context — the ctx object through which the plugin registers everything it contributes.",
    sourceUrl: `${HARNESS_DOCS}/develop/cordis-tutorial/01-first-plugin`,
    body: [
      { heading: "Write the plugin", paragraphs: [
        "In your tmp/cordis-tutorial directory, create hello.ts. The name export is optional display metadata; it labels the plugin in diagnostics.",
      ], code: [{ label: "hello.ts", code: `import type { Context } from '@deepseek-ai/cordis'

export const name = 'hello'

export function apply(ctx: Context) {
  console.log('hello from my first plugin')
}` }] },
      { heading: "Compose the app", paragraphs: [
        "This tutorial's launcher assembles the application from configuration. Create cordis.yml. The file is a list of plugin entries. name is a module specifier — a relative path or an npm package name — and the loader mounts every entry. Entries start concurrently, so list position guarantees nothing about which plugin loads first; ordering comes from service dependencies (inject, chapter 3), not from position in the file.",
      ], code: [{ label: "cordis.yml", code: `- name: './hello.ts'` }] },
      { heading: "Run it", paragraphs: [
        "Run node --import tsx ../../vendor/cordis/bin.js. Expected output: hello from my first plugin. The process exits on its own once nothing is left running.",
        "What happened: (1) The launcher created a root Context and mounted the Loader plugin. (2) The Loader read cordis.yml, resolved ./hello.ts, and mounted it as a child plugin. (3) Cordis called your apply(ctx).",
        "There is no framework bootstrap code in your file: a plugin describes what it contributes, and cordis.yml composes the application.",
      ] },
      { heading: "The two other plugin shapes", paragraphs: [
        "A function is the most common form, but Cordis accepts three. Use the function form until you need to expose a service; chapter 3 covers when the class form earns its place.",
      ], code: [{ label: "shapes.ts", code: `import { Service, type Context } from '@deepseek-ai/cordis'

// 1. Function plugin (what you just wrote).
export function apply(ctx: Context) {}

// 2. Object plugin: an object with an \`apply\` method.
export const objectPlugin = {
  name: 'object-plugin',
  apply(ctx: Context) {},
}

// 3. Class plugin: a Service subclass (covered in chapter 3).
export class MyService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'myTutorialService')
  }
}` }] },
      { heading: "Try breaking it", paragraphs: [
        "Make apply throw. Run again: the process dies with your error. A plugin that fails to load is a loud failure, not a skipped entry.",
      ], code: [{ label: "hello.ts (broken)", code: `export function apply(ctx: Context) {
  throw new Error('apply exploded')
}` }], note: "A config entry whose module cannot be resolved — a typo'd path or package name — is reported through the Cordis logger service instead of crashing the process, and at boot that report can be lost before a console exporter is watching. If a freshly added entry seems to do nothing, check the spelling first." },
    ],
  },

  "tutorial/2-lifecycle-and-effects": {
    intro: "A Cordis plugin can be unloaded by a config edit, hot reload, explicit disposal, or loss of a required service. Registrations made through Cordis APIs are effects and are undone when their owning plugin unloads; resources managed outside those APIs must be wrapped in ctx.effect().",
    sourceUrl: `${HARNESS_DOCS}/develop/cordis-tutorial/02-lifecycle-and-effects`,
    body: [
      { heading: "Effects", paragraphs: [
        "For a resource Cordis does not already manage — a timer, a connection, a watcher — wrap it in ctx.effect() and return a disposer. Create lifecycle.ts.",
        "Run (node --import tsx ../../vendor/cordis/bin.js) and you get: heartbeat plugin loading / tick / tick / tick / heartbeat cleaned up / disposed.",
      ], code: [{ label: "lifecycle.ts", code: `import type { Context } from '@deepseek-ai/cordis'

export const name = 'lifecycle-demo'

function heartbeat(ctx: Context) {
  console.log('heartbeat plugin loading')
  ctx.effect(() => {
    const timer = setInterval(() => console.log('tick'), 200)
    return () => {
      clearInterval(timer)
      console.log('heartbeat cleaned up')
    }
  })
}

export function apply(ctx: Context) {
  // Mount a child plugin and keep its fiber to dispose it later.
  const fiber = ctx.plugin(heartbeat)
  // The demo timer is itself an effect: if THIS plugin is unloaded first,
  // the pending callback is cancelled instead of firing on a dead app.
  ctx.effect(() => {
    const timer = setTimeout(async () => {
      await fiber.dispose()
      console.log('disposed')
      process.exit(0)
    }, 700)
    return () => clearTimeout(timer)
  })
}`, }, { label: "cordis.yml", code: `- name: './lifecycle.ts'` }] },
      { heading: "Three things to notice", paragraphs: [
        "ctx.plugin(heartbeat) mounts a function from code as a plugin — the same operation the YAML loader performs for each config entry. A function plugin needs no apply method: Cordis calls the function directly and uses its name only for diagnostics. An apply method is required only for the object form, ctx.plugin({ apply(ctx) { ... } }). The call returns a fiber, the runtime handle for one loaded plugin instance.",
        "The effect body runs during load; the disposer it returns runs during unload. You never call the disposer yourself for a plugin-lifetime resource.",
        "fiber.dispose() resolves after all of the plugin's cleanup — including async disposers — has finished, and recursively unloads any child plugins it mounted.",
      ] },
      { heading: "The fiber state machine", paragraphs: [
        "Every loaded plugin instance owns a fiber that moves through these states. You will meet PENDING again in chapter 6, where it is the usual answer to \"why does my plugin print nothing?\".",
      ], code: [{ label: "fiber states", code: `PENDING → LOADING → ACTIVE → UNLOADING → DISPOSED
                 ↘ FAILED` }], table: {
        headers: ["State", "Meaning"],
        rows: [
          ["PENDING", "declared, but a required service (chapter 3) is not available yet"],
          ["LOADING / ACTIVE", "apply is running / has completed"],
          ["FAILED", "apply or config validation threw"],
          ["UNLOADING / DISPOSED", "disposers are running / everything is torn down"],
        ],
      } },
      { heading: "What is already an effect", paragraphs: [
        "You rarely write ctx.effect() yourself, because the built-in registration APIs are effects already: ctx.on(event, listener) — the listener is removed on unload (chapter 4). ctx.plugin(child) — the child is disposed with its parent. Service registrations are effects. Harness registries such as ctx.tools.register(...) also attach their returned disposers to the calling plugin, so they unwind automatically (chapter 7).",
        "For a resource Cordis does not manage, acquire it inside ctx.effect() and return a disposer that releases it. Cordis then invokes that release during unloading, including hot reload.",
      ], note: "Disposers start in reverse registration order, but multiple async disposers run concurrently. If teardown steps must run in sequence, keep them in one disposer and await them there." },
    ],
  },

  "tutorial/3-services": {
    intro: "A service is a named capability one plugin provides and other plugins consume through ctx. In the harness, ctx.tools, ctx.llm, and ctx.agents are services. A consumer names the capability, such as 'tools', rather than importing its provider, so configuration can select a provider without changing the consumer.",
    sourceUrl: `${HARNESS_DOCS}/develop/cordis-tutorial/03-services`,
    body: [
      { heading: "Provide a service", paragraphs: [
        "Create greeter.ts. Two pieces work together: Runtime — super(ctx, 'greeter') registers the instance under the name greeter. From then on, any plugin can reach it as ctx.greeter. The registration is an effect — unloading the provider removes the service. Compile time — the declare module block is TypeScript declaration merging. It adds greeter to the Context interface so ctx.greeter typechecks everywhere. It generates no code; without it the service still works at runtime, but consumers lose type safety.",
        "A Service subclass is itself a plugin (the class form from chapter 1), so ctx.plugin(GreeterService) mounts it like any other.",
      ], code: [{ label: "greeter.ts", code: `import { Service, type Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    greeter: GreeterService
  }
}

export class GreeterService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'greeter')
  }

  greet(who: string) {
    return \`Hello, \${who}!\`
  }
}

export const name = 'greeter'

export function apply(ctx: Context) {
  ctx.plugin(GreeterService)
}` }] },
      { heading: "Consume a service with inject", paragraphs: [
        "Create consumer.ts. inject lists the services this plugin requires. Cordis holds the plugin in PENDING until every listed service exists, so inside apply, ctx.greeter is guaranteed ready. Load order in cordis.yml does not matter — dependencies, not file order, decide when plugins start.",
        "Swap the two lines in cordis.yml and rerun: same output. Try removing ./greeter.ts entirely: the consumer stays PENDING and prints nothing — no crash, no partial run. A PENDING fiber does not keep Node's event loop alive either, so a composition with nothing else running exits 0 silently.",
      ], code: [{ label: "consumer.ts", code: `import type { Context } from '@deepseek-ai/cordis'

export const name = 'consumer'
export const inject = ['greeter']

export function apply(ctx: Context) {
  console.log(ctx.greeter.greet('world'))
}` }, { label: "cordis.yml", code: `- name: './greeter.ts'
- name: './consumer.ts'` }] },
      { heading: "Dependencies are tracked after load", paragraphs: [
        "inject is not a one-shot boot check. If a required service disappears while the app runs — its provider was unloaded or hot-replaced — every dependent plugin is unloaded too, and loads again when the service returns. Combined with effects, this prevents a running consumer from retaining a reference to an unavailable service: its own registrations are unwound when the dependency disappears.",
        "This is also why service replacement works in config: unload the dsh-bash-local entry, mount a different shell provider, and every plugin injecting 'shell' cleanly restarts against the new implementation.",
      ] },
      { heading: "Optional dependencies", paragraphs: [
        "inject is for hard requirements. For a capability the plugin can live without, skip inject and probe at the use site.",
      ], code: [{ label: "optional.ts", code: `export function apply(ctx: Context) {
  // undefined when no provider is loaded; the plugin still runs.
  const greeter = ctx.get('greeter')
  console.log(greeter?.greet('maybe') ?? 'no greeter available')
}` }] },
      { heading: "Naming", paragraphs: [
        "Service names live in one flat namespace per application. Prefix or namespace your own services distinctively (the harness claims plain names like tools and llm); the generated cordis-surface regions on the subsystem pages list every name the harness registers.",
      ] },
    ],
  },

  "tutorial/4-events": {
    intro: "Services support direct calls; events let a plugin announce something without knowing which plugins listen. The harness uses events for interactions such as tool results, model requests, and approval decisions.",
    sourceUrl: `${HARNESS_DOCS}/develop/cordis-tutorial/04-events`,
    body: [
      { heading: "Declare, emit, listen", paragraphs: [
        "Create stats.ts — a service that counts things and announces each change. The interface Events merge is the event-system twin of the interface Context merge from chapter 3: it declares the event name and its listener signature, so ctx.emit and ctx.on are fully typed. The namespace/action naming convention keeps the flat event namespace readable.",
      ], code: [{ label: "stats.ts", code: `import { Service, type Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    stats: StatsService
  }
  interface Events {
    'stats/report'(name: string, count: number): void
  }
}

export class StatsService extends Service {
  private counts = new Map<string, number>()

  constructor(ctx: Context) {
    super(ctx, 'stats')
  }

  bump(name: string) {
    const next = (this.counts.get(name) ?? 0) + 1
    this.counts.set(name, next)
    this.ctx.emit('stats/report', name, next)
  }
}

export const name = 'stats'

export function apply(ctx: Context) {
  ctx.plugin(StatsService)
}` }] },
      { heading: "The listener", paragraphs: [
        "Create reporter.ts. The import type {} from './stats.ts' line imports nothing at runtime; it exists so TypeScript sees the declaration merges.",
        "Output: [stats] tool_call -> 1 / [stats] tool_call -> 2 / [stats] prompt -> 1. Because ctx.on() is an effect, the listener disappears with the plugin — no manual removeListener bookkeeping, ever.",
      ], code: [{ label: "reporter.ts", code: `import type { Context } from '@deepseek-ai/cordis'
import type {} from './stats.ts'

export const name = 'reporter'
export const inject = ['stats']

export function apply(ctx: Context) {
  ctx.on('stats/report', (name, count) => {
    console.log(\`[stats] \${name} -> \${count}\`)
  })
  ctx.stats.bump('tool_call')
  ctx.stats.bump('tool_call')
  ctx.stats.bump('prompt')
}` }] },
      { heading: "Dispatch modes", paragraphs: [
        "emit is one of five dispatch modes. Which one an event uses is part of its contract — it decides whether listeners can return values, run concurrently, or short-circuit each other. Every harness event documents its mode in the generated reference on its owning subsystem page.",
      ], table: {
        headers: ["Mode", "Call", "Semantics"],
        rows: [
          ["emit", "ctx.emit(name, ...args)", "Synchronous broadcast; returned promises and values are not awaited or collected."],
          ["parallel", "await ctx.parallel(name, ...args)", "All listeners run concurrently; awaited together."],
          ["serial", "await ctx.serial(name, ...args)", "Listeners run in order, awaited; the first non-null/false/undefined return wins and stops the rest."],
          ["bail", "ctx.bail(name, ...args)", "Synchronous version of serial."],
          ["waterfall", "ctx.waterfall(name, ...args, next)", "Around-middleware; see below."],
        ],
      } },
      { heading: "Waterfall: transform or short-circuit", paragraphs: [
        "Waterfall is the mode that powers interception. Each listener receives the arguments plus a next() continuation; it can transform what next() returns, or return without calling next() and short-circuit the rest of the chain — what the Cordis docs call the veto.",
        "Point cordis.yml at just this file and run: HELLO / ** BLOCKED **. Walk through the second line: listener 1 runs first, calls next(), which invokes listener 2; listener 2 sees blocked and returns without calling next() — the innermost default (the function passed to ctx.waterfall) never runs — and listener 1 uppercases the replacement message on the way out.",
      ], code: [{ label: "waterfall-demo.ts", code: `import type { Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Events {
    'demo/transform'(input: string, next: () => Promise<string>): Promise<string>
  }
}

export const name = 'waterfall-demo'

export function apply(ctx: Context) {
  // Listener 1: wrap the downstream result.
  ctx.on('demo/transform', async (input, next) => {
    const downstream = await next()
    return downstream.toUpperCase()
  })

  // Listener 2: short-circuit when it owns the decision.
  ctx.on('demo/transform', async (input, next) => {
    if (input.includes('blocked')) return '** blocked **'
    return next()
  })

  void (async () => {
    console.log(await ctx.waterfall('demo/transform', 'hello', async () => 'hello'))
    console.log(await ctx.waterfall('demo/transform', 'blocked words', async () => 'blocked words'))
  })()
}` }], note: "A waterfall listener that only observes or annotates must call next(); returning without it is a deliberate short-circuit. Forgetting next() in a logging listener silently swallows the default behavior for everyone downstream. It is a standing rule of this repository. The harness uses waterfalls for decisions that cooperating plugins may wrap or answer: agent/request lets a plugin replace the model-call config, and approval/request lets a policy answer instead of the user." },
    ],
  },

  "tutorial/5-configuration": {
    intro: "Each cordis.yml entry can carry a config block, and the plugin declares a schema that validates it before apply runs. Bad config fails the load with a precise error — the plugin never starts half-configured.",
    sourceUrl: `${HARNESS_DOCS}/develop/cordis-tutorial/05-config`,
    body: [
      { heading: "A configurable plugin", paragraphs: [
        "Create config-demo.ts. The exported Config is both a TypeScript interface and a runtime schema with the same name — consumers get the type, Cordis gets the validator. This repo uses Schemastery for schemas; Cordis itself accepts any Standard Schema validator, so a plain object exported as Config will not work.",
        "greeting was omitted, so the schema default filled it in — apply always receives complete, validated config.",
      ], code: [{ label: "config-demo.ts", code: `import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

export const name = 'config-demo'

export interface Config {
  greeting: string
  targets: string[]
}

export const Config: Schema<Config> = Schema.object({
  greeting: Schema.string().default('Hello'),
  targets: Schema.array(String).default(['world']),
})

export function apply(ctx: Context, config: Config) {
  for (const target of config.targets) {
    console.log(\`\${config.greeting}, \${target}!\`)
  }
}` }, { label: "cordis.yml", code: `- name: './config-demo.ts'
  config:
    targets: ['alpha', 'beta']` }] },
      { heading: "Fail loud", paragraphs: [
        "Now feed it something invalid. The plugin's fiber goes to FAILED, and this tutorial's launcher exits with status 1 after printing the error. A plugin should also reject schema-valid config that names an unavailable resource or provider as soon as it can resolve that reference.",
      ], code: [{ label: "cordis.yml (invalid)", code: `- name: './config-demo.ts'
  config:
    targets: 'not-an-array'` }, { label: "error output", code: `ValidationError: invalid config:
  - $.targets expected array but got not-an-array (at targets)` }] },
      { heading: "Computed config values", paragraphs: [
        "The loader used in this repo supports a !!js tag for config values that must be computed at load time. !!js works only inside config and in an entry's disabled field. disabled: !!js ... evaluates against the loader context at every mount decision (this repo's extension), so a row can gate itself on platform or environment; the other metadata (name, id, inject, ...) stays static, where an expression is ordinary truthy data.",
      ], code: [{ label: "cordis.yml", code: `- name: './config-demo.ts'
  config:
    greeting: !!js process.env.DEMO_GREETING ?? 'Hello'` }] },
    ],
  },

  "tutorial/6-composition-and-hmr": {
    intro: "Every capability built so far is a plugin, and cordis.yml selects the application's plugin tree. This chapter changes that composition, hot-reloads a plugin, and diagnoses a plugin that never loads.",
    sourceUrl: `${HARNESS_DOCS}/develop/cordis-tutorial/06-composition-and-hmr`,
    body: [
      { heading: "Entries are more than a name", paragraphs: [
        "A config entry accepts metadata beyond name and config. id gives the entry a stable identity so the loader can tell an edit to an existing entry apart from a removal plus an addition. disabled: true unmounts a plugin without deleting its entry — flip it back and the plugin (and everything PENDING on its services) loads again.",
        "Groups nest a sub-list of entries that load and unload as one unit, and isolate gives a group its own instance of a service name — two groups can each see a differently configured shell provider without affecting each other.",
      ], code: [{ label: "cordis.yml", code: `- id: greeter          # stable identity for this entry
  name: './greeter.ts'
- id: consumer
  name: './consumer.ts'
  disabled: true       # keep the entry, skip mounting it` }] },
      { heading: "Hot module replacement", paragraphs: [
        "Because unloading releases effects (chapter 2) and loading follows dependencies (chapter 3), HMR can replace a running plugin by unloading and loading it. The @deepseek-ai/dsh-hmr plugin watches your files and does exactly that on save.",
        "Two support plugins joined the list: HMR logs through the Cordis logger service, so without a console exporter you would not see its messages, and it injects the timer service for debouncing — without @deepseek-ai/cordis-plugin-timer it sits in PENDING forever, silently.",
        "Run under tsx. Now edit hello.ts — change the log message — and save. The old instance unloaded (all its effects unwound), the new code loaded, apply ran again.",
        "Editing cordis.yml itself is also picked up: the loader diffs entries by id and mounts, unmounts, or reconfigures only what changed. This is why the entries above carry explicit ids — an entry without one gets a generated id on every read, so after any config-file edit it counts as removed-plus-added and remounts even if its own lines did not change.",
      ], code: [{ label: "cordis.yml", code: `- id: logger
  name: '@deepseek-ai/cordis-plugin-logger-console'
- id: timer
  name: '@deepseek-ai/cordis-plugin-timer'
- id: hmr
  name: '@deepseek-ai/dsh-hmr'
  config:
    root: ['.']
- id: hello
  name: './hello.ts'` }, { label: "output after editing hello.ts and saving", code: `hello from my first plugin
2026-07-22 15:44:36 [I] hmr watching [ '.' ]
2026-07-22 15:44:39 [I] hmr reload plugin at hello.ts
hello from my EDITED plugin` }] },
      { heading: "Diagnosing a plugin that never loads", paragraphs: [
        "The flip side of dependency-driven loading: a plugin whose inject names a service nobody provides waits forever, printing nothing. No error — PENDING is a legitimate state, since the provider may be mounted later.",
        "You can see the states directly. Every context can enumerate the plugin registry.",
        "inject: ['timer'] has no provider. Add - name: '@deepseek-ai/cordis-plugin-timer' to the list and the plugin loads. When a plugin does nothing and reports nothing, inspect its fiber state. Iterating without the PENDING filter also shows the loader's own plugins (Loader, Include) as ACTIVE fibers because plugins mount the config file itself.",
      ], code: [{ label: "diagnose.ts", code: `import { FiberState, type Context } from '@deepseek-ai/cordis'

export const name = 'diagnose'

export function apply(ctx: Context) {
  setTimeout(() => {
    for (const runtime of ctx.registry.values()) {
      for (const fiber of runtime.fibers) {
        if (fiber.state === FiberState.PENDING) {
          console.log(\`\${fiber.name} is PENDING — a required service is missing\`)
        }
      }
    }
  }, 500)
}` }, { label: "needs-timer.ts", code: `import type { Context } from '@deepseek-ai/cordis'

export const name = 'needs-timer'
export const inject = ['timer']

export function apply(ctx: Context) {
  console.log('needs-timer loaded')
}` }, { label: "output", code: `needs-timer is PENDING — a required service is missing` }] },
    ],
  },

  "tutorial/7-into-the-harness": {
    intro: "This chapter registers a model-callable tool with the harness's tools service, executes it through the harness tool pipeline, and observes the result event. It remains keyless and does not call a model.",
    sourceUrl: `${HARNESS_DOCS}/develop/cordis-tutorial/07-into-the-harness`,
    body: [
      { heading: "A tool plugin", paragraphs: [
        "Create greet-tool.ts. Every pattern here is from the earlier chapters: inject: ['tools'] (chapter 3) holds the plugin until the tool registry exists; ctx.tools.register(...) attaches the registration disposer to the plugin (chapter 2), so unloading unregisters the tool. defineTool converts the parameters spec to the JSON Schema shown to the model, infers the type of args, and validates model-supplied arguments before execute runs. The tool returns the canonical value declared by output.schema; output.render separately produces the Native and durable result content.",
      ], code: [{ label: "greet-tool.ts", code: `import type { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolCallId } from '@deepseek-ai/dsh-llm'

export const name = 'greet-tool'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'greet',
    description: 'Greet the named person.',
    parameters: {
      name: { type: 'string', required: true, description: 'Who to greet' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      return \`Hello, \${args.name}!\`
    },
  }))

  // Drive one call through the real execution pipeline, standing in for
  // the model. ToolCallId brands the correlation id a provider would issue.
  void (async () => {
    const result = await ctx.tools.execute({
      callId: brandString<ToolCallId>('demo-1'),
      name: 'greet',
      arguments: { name: 'Cordis' },
      signal: new AbortController().signal,
    })
    console.log('tool replied:', JSON.stringify(result.content))
  })()
}` }] },
      { heading: "An observer plugin", paragraphs: [
        "Create tool-logger.ts — a separate plugin that watches every tool call in the app through the harness's tools/result event. The import type {} from '@deepseek-ai/dsh-tools' line pulls in the package's declaration merges so 'tools/result' and its payload are typed — the same move as chapter 4's stats.ts import, at package scale.",
      ], code: [{ label: "tool-logger.ts", code: `import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-tools'

export const name = 'tool-logger'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.on('tools/result', (exec, result) => {
    const text = result.content
      .map(block => (block.type === 'text' ? block.text : ''))
      .join('')
    console.log(\`[tool-logger] \${exec.name} -> \${text}\`)
  })
}` }] },
      { heading: "Compose and run", paragraphs: [
        "@deepseek-ai/dsh-tools injects the systemPrompt service because tools contribute schemas to the system prompt, so the composition lists its provider too. Without it, the tools plugin remains PENDING as described in chapter 6.",
        "The logger fired first: tools/result is emitted as part of result materialization, before execute's promise resolves to the caller. Neither of your plugins knows the other exists — the registry service and the event connect them.",
      ], code: [{ label: "cordis.yml", code: `- name: '@deepseek-ai/dsh-system-prompt'
- name: '@deepseek-ai/dsh-tools'
- name: './tool-logger.ts'
- name: './greet-tool.ts'` }, { label: "output", code: `[tool-logger] greet -> Hello, Cordis!
tool replied: [{"type":"text","text":"Hello, Cordis!"}]` }] },
      { heading: "From here to a full agent", paragraphs: [
        "A real agent is this composition plus more plugins: an LLM adapter, the agent loop, persistence, and an application entry. Compare the base profile layer and headless layer — you can read their entries now.",
      ], note: "Where to go next: Build a tool (more of defineTool, presentation and richer schemas); Three-layer capability design (how the harness structures replaceable capabilities); the generated cordis-surface regions on the subsystem pages (everything you can inject and listen to)." },
    ],
  },

  "tutorial/your-first-acryl-harness-plugin": {
    intro: "Every pattern from chapters 1-7 transfers directly to ACRYL: ACRYL Desktop's Cordis Host/Client composition is the exact same Loader mechanism the tutorial just walked through, just running against a real, shipped set of services instead of a scratch directory.",
    sourceUrl: "https://github.com/cordisplugins",
    sourceLabel: "Browse real ACRYL plugins on cordisplugins.github.io",
    body: [
      { heading: "The bridge from here", paragraphs: [
        "This page is not from the DeepSeek Harness docs — it's the deliberate handoff this tutorial section was built for: chapter 7 ends by registering a tool against a real tools service, and the next real step for an ACRYL author is registering a plugin against ACRYL Desktop's own real composition instead of a tutorial scratch directory. Every plugin currently published to cordisplugins.github.io — the public Cordis plugin registry — is exactly this: a normal Cordis plugin, written with the same function/object/class shapes, the same inject contract, the same ctx.effect() cleanup discipline covered above.",
      ] },
      { heading: "A real plugin, not a hypothetical one", paragraphs: [
        "acryl-development-canvas is a real, published Cordis plugin that adds a Canvas to ACRYL Desktop — multiple PTYs, quick-launch of coding agents, a built-in browser — using nothing beyond what chapters 1-7 already covered: a function plugin, a Loader row id equal to its own package name, and services it injects from ACRYL Desktop's own composition rather than a tutorial stub.",
        "cordis-plugin-market is another: it provides the market and registry.catalog services — the in-instance counterpart to the public registry — and is itself installable through the exact publish path chapter 6 and the Basics 'Package and install a plugin' page describe.",
      ], code: [{ label: "acryl-development-canvas (shape, not full source)", code: `import type { Context } from '@deepseek-ai/cordis'

export const name = 'acryl-development-canvas'
export const inject = ['desktop.shell', 'commands']

export function apply(ctx: Context) {
  // Registers the Canvas UI contribution, PTY quick-launch, and browser
  // surface against ACRYL Desktop's real shell and command services —
  // the same ctx.plugin / ctx.effect discipline as every earlier chapter.
}` }] },
      { heading: "The Loader row-id convention ACRYL adds", paragraphs: [
        "ACRYL's own Cordis development discipline (documented in the acryldev/acryl repository) adds one rule beyond the base Cordis tutorial: a Loader row's id must equal its package name by default. acryl-development-canvas gets row id acryl-development-canvas, never an unrelated shorthand a reader has to look up in the package's own cordis.patch.yml to decode.",
        "This isn't a style preference — it's a rule the ecosystem learned from two real incidents. acryl-development-canvas itself shipped for a time under the row id desktop-development-canvas. A sibling plugin's row id dsh-editor (for the package actually named acryl-dsh-editor-plugin) went undiscovered as opaque until it broke a real production boot.",
        "The one legitimate exception is a deliberately shared, multi-provider slot, where the id names a capability rather than a package because more than one interchangeable package can fill it — exactly the pattern dsh-client-ui-brand-acryl uses, sharing the ui-brand-official slot with the official DSH brand package by design.",
      ] },
      { heading: "Where to publish it", paragraphs: [
        "A plugin you build against a running ACRYL instance does not need to be published to be useful — everything chapter 2's effects discipline and chapter 6's HMR section describe works identically for a local, unpublished plugin hot-reloading inside your own instance. Publishing is the deliberate step you take once it has reached a shape stable enough to share: list it on cordisplugins.github.io, using pnpm publish (not npm publish or npm pack) so workspace-protocol dependencies get rewritten to real semver ranges — the exact failure that blocked this ecosystem's own first real plugin release before the fix landed.",
      ] },
    ],
  },

  // ---------------------------------------------------------------------
  // Basics
  // ---------------------------------------------------------------------
  "basics/what-is-a-plugin": {
    intro: "This tutorial creates a minimal Harness plugin and loads it into the Web UI, against a real repository checkout instead of a scratch runtime.",
    sourceUrl: `${HARNESS_DOCS}/develop/basic/`,
    body: [
      { heading: "What is a plugin?", paragraphs: [
        "In Harness, a plugin is a TypeScript module that exports an apply function. The framework calls apply when loading the plugin and passes a ctx context object through which the plugin registers capabilities. That is the complete configuration.",
      ], code: [{ label: "shape", code: `import type { Context } from '@deepseek-ai/cordis'

export const name = 'my-plugin'

export function apply(ctx: Context) {
  // Register capabilities here.
}` }] },
      { heading: "Create the plugin file", paragraphs: [
        "From the repository root, create a scratch project: mkdir -p scratch-plugin/src, then create scratch-plugin/src/my-plugin.ts.",
      ], code: [{ label: "scratch-plugin/src/my-plugin.ts", code: `import type { Context } from '@deepseek-ai/cordis'

export const name = 'hello-plugin'

export function apply(ctx: Context) {
  // Required dependencies are ready before apply runs.
  console.log('[hello-plugin] plugin loaded!')
}` }] },
      { heading: "Register it in cordis.yml", paragraphs: [
        "Run pwd from the repository root, then create scratch-plugin/cordis.yml as a Web overlay that inserts the local plugin, replacing the path with the printed absolute path. The plugin path must be absolute. A patch file contributes configuration but does not change the profile directory from which the loader resolves module paths.",
        "Start the Web UI with that overlay and open http://127.0.0.1:3080. The terminal prints [hello-plugin] plugin loaded! during startup.",
      ], code: [{ label: "scratch-plugin/cordis.yml", code: `- insert:
    - id: hello
      name: '/absolute/path/to/deepseek-harness/scratch-plugin/src/my-plugin.ts'` }, { label: "terminal", code: `pnpm dsh web --patch ./scratch-plugin/cordis.yml` }] },
      { heading: "Automatic cleanup", paragraphs: [
        "Anything registered through ctx — event listeners, tools, or timers — is cleaned up when the plugin unloads. You do not need to call removeListener or clearInterval manually.",
        "For a resource that needs explicit cleanup, such as a network connection, use ctx.effect() to provide its disposer.",
      ], code: [{ label: "cleanup.ts", code: `import type { Context } from '@deepseek-ai/cordis'

export function apply(ctx: Context) {
  ctx.effect(() => {
    const timer = setInterval(() => {
      console.log('heartbeat')
    }, 5000)

    // The returned function runs when the plugin unloads.
    return () => clearInterval(timer)
  })
}` }] },
      { heading: "Declare dependencies", paragraphs: [
        "If the plugin consumes another service such as tools or llm, declare it in inject. The framework waits for every required service before loading the plugin.",
      ], code: [{ label: "deps.ts", code: `import type { Context } from '@deepseek-ai/cordis'

export const name = 'my-tool-plugin'
export const inject = ['tools']

export function apply(ctx: Context) {
  // ctx.tools is ready here.
  ctx.tools.register(/* ... */)
}` }] },
      { heading: "Three plugin forms", paragraphs: [
        "In addition to a function module, a plugin can use object or class form. Function form is sufficient in most cases. Use class form when the plugin provides a service to other plugins.",
      ], code: [{ label: "object form", code: `import type { Context } from '@deepseek-ai/cordis'

export default {
  name: 'my-plugin',
  inject: ['tools'],
  apply(ctx: Context) {
    // ...
  },
}` }, { label: "class form", code: `import { Service, type Context } from '@deepseek-ai/cordis'

export default class MyService extends Service {
  static inject = ['tools']

  constructor(ctx: Context) {
    super(ctx, 'myService')
    // Perform synchronous initialization in the constructor.
  }
}` }] },
    ],
  },

  "basics/build-a-tool": {
    intro: "This tutorial adds a greet tool to the Web UI. It builds directly on the first plugin above and its scratch-plugin directory.",
    sourceUrl: `${HARNESS_DOCS}/develop/basic/tool`,
    body: [
      { heading: "Create the tool plugin", paragraphs: [
        "Replace scratch-plugin/src/my-plugin.ts. inject makes Cordis wait for the tool registry. defineTool infers and validates args from parameters; execute returns the canonical value declared by output.schema, and output.render converts that value to model-facing content.",
      ], code: [{ label: "scratch-plugin/src/my-plugin.ts", code: `import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'greet-tool'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'greet',
    description: 'Greet someone by name.',
    parameters: {
      name: { type: 'string', required: true, description: 'The name to greet' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      return \`Hello, \${args.name}!\`
    },
  }))
}` }] },
      { heading: "Run and call the tool", paragraphs: [
        "Restart the development command if it is not running, open http://127.0.0.1:3080 and ask: \"Use the greet tool to greet Ada.\" The model can call greet and receives Hello, Ada! as the tool result.",
      ], code: [{ label: "terminal", code: `pnpm dsh web --patch ./scratch-plugin/cordis.yml` }] },
    ],
  },

  "basics/plugin-configuration": {
    intro: "Accept configuration supplied through cordis.yml.",
    sourceUrl: `${HARNESS_DOCS}/develop/basic/config`,
    body: [
      { heading: "Define the Config type", paragraphs: [
        "Export a Config type and a same-named Schemastery schema. Put defaults directly on the schema fields. When loading the plugin, Cordis uses the exported schema to validate configuration and fill defaults. Do not export a plain object as Config; it does not implement the Standard Schema interface required by Cordis.",
      ], code: [{ label: "my-plugin.ts", code: `import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

export const name = 'my-plugin'

export interface Config {
  greeting: string
  maxRetries: number
  verbose?: boolean
}

export const Config: Schema<Config> = Schema.object({
  greeting: Schema.string().default('Hello'),
  maxRetries: Schema.number().default(3),
  verbose: Schema.boolean().default(false),
})

export function apply(ctx: Context, config: Config) {
  console.log(config.greeting)  // User value or schema default.
}` }, { label: "scratch-plugin/cordis.yml", code: `- insert:
    - id: hello
      name: './src/my-plugin.ts'
      config:
        greeting: 'Hi there'
        maxRetries: 5` }] },
      { heading: "Schema validation", paragraphs: [
        "Use Schemastery to express stricter validation. The schema runs while the plugin loads. Invalid configuration fails the load with an actionable error.",
      ], code: [{ label: "validated-plugin.ts", code: `import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

export const name = 'validated-plugin'

export interface Config {
  apiKey: string
  timeout: number
  mode: 'fast' | 'accurate'
}

export const Config = Schema.object({
  apiKey: Schema.string().required(),
  timeout: Schema.number().default(30000),
  mode: Schema.union(['fast', 'accurate']).default('fast'),
})

export function apply(ctx: Context, config: Config) {
  // config is validated and type-safe.
}` }] },
      { heading: "Design principles", paragraphs: [
        "Do not hardcode tunable values. Harness requires anything that two deployments may want to set differently to be a configuration field. The test is whether cordis.yml can change the value without a code edit.",
        "Fail loudly on invalid configuration. Express self-contained constraints in the schema so invalid configuration fails while the plugin loads. References to services or registered resources require dependency injection.",
      ], code: [{ label: "hardcode vs. config", code: `// Wrong: hardcoded timeout.
const TIMEOUT = 30000

// Correct: configurable.
export interface Config {
  timeoutMs: number  // Defaults to 30000.
}` }] },
      { heading: "Work with HMR", paragraphs: [
        "A configuration edit hot-replaces the plugin: the framework unloads the old instance and loads a new one. Because registrations are effects and clean themselves up, replacement does not retain the old instance's registrations.",
      ] },
    ],
  },

  "basics/package-and-install-a-plugin": {
    intro: "The previous tutorials loaded a local plugin through a --patch overlay. This tutorial packages it as an installable bundle, installs it into a profile with dsh plugin add, and explains the layer order that determines the composed configuration.",
    sourceUrl: `${HARNESS_DOCS}/develop/basic/publish`,
    body: [
      { heading: "Two concepts, two manifests", paragraphs: [
        "Installation is built on two concepts. Both are described by a package.json, but they carry different kinds of manifest under the dsh key, and they answer different questions.",
        "A bundle is an npm package that ships a configuration layer. Its manifest declares dsh.bundle, answering \"what does this package contribute?\": a patch file that inserts or overrides plugin rows.",
        "A profile is a directory under $DSH_HOME/profiles/<name> describing one runnable composition. Its manifest declares dsh.profile, answering \"which bundles compose this setup, in what order?\". A bundle is what you author and distribute; a profile is what a user boots with dsh --profile <name>. Nothing is both.",
      ] },
      { heading: "The bundle manifest", paragraphs: [
        "Create the package directory: hello-plugin/package.json (declares dsh.bundle), cordis.patch.yml (the layer applied when a profile lists this bundle), index.js (plugin modules the patch rows reference).",
        "A package without the dsh.bundle declaration still installs, but only as a plain dependency: dsh plugin prints a warning and activates no layer. Use that package format for a library that plugin packages import rather than a plugin users enable.",
      ], code: [{ label: "hello-plugin/package.json", code: `{
  "name": "dsh-hello-plugin",
  "version": "0.1.0",
  "type": "module",
  "main": "index.js",
  "files": ["index.js", "cordis.patch.yml"],
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
}` }, { label: "hello-plugin/index.js", code: `export const name = 'hello-plugin'

export function apply() {
  console.log('[hello-plugin] plugin loaded!')
}` }, { label: "hello-plugin/cordis.patch.yml", code: `- insert:
    - id: hello
      name: dsh-hello-plugin` }] },
      { heading: "The profile manifest", paragraphs: [
        "A profile directory holds two files: package.json — the profile's out-of-tree plugin dependencies (managed by pnpm) plus the dsh.profile manifest with its ordered bundles list — and cordis.patch.yml — the user's own patch layer, applied after every bundle layer.",
        "You never write a profile manifest by hand: dsh --profile <name> --from-default-profile <template> can create one from a shipped application template, while dsh plugin creates a base-backed profile and maintains its installed bundle list.",
      ] },
      { heading: "Install into a profile", paragraphs: [
        "dsh plugin --profile <name> <args...> forwards to pnpm in the profile directory, so every pnpm verb works. From the directory that contains hello-plugin, install the package checkout.",
        "The first use initializes the profile (with @deepseek-ai/dsh-base as its first bundle), pnpm links the checkout, and dsh appends the bundle to dsh.profile.bundles because the package declares dsh.bundle.",
      ], code: [{ label: "terminal", code: `dsh plugin --profile demo add ./hello-plugin` }, { label: "resulting profile package.json", code: `{
  "name": "dsh-profile-demo",
  "private": true,
  "dependencies": {
    "dsh-hello-plugin": "link:/path/to/hello-plugin"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "dsh-hello-plugin"
      ]
    }
  }
}` }, { label: "verify and boot", code: `dsh --profile demo --dump-config   # shows a "# == dsh-hello-plugin" layer
dsh --profile demo` }] },
      { heading: "The loading order", paragraphs: [
        "The effective configuration composes over an empty root by applying, in order: (1) Each bundle patch named in the profile's dsh.profile.bundles list, in list order — @deepseek-ai/dsh-base first, then each installed bundle in the order it was added. (2) The profile's own cordis.patch.yml. (3) The home-level $DSH_HOME/cordis.patch.yml — machine-local preferences shared by every profile. (4) Each --patch <path> overlay, in argv order. App arguments are not another patch layer.",
        "Later layers win per row, and a patch replaces a row's entire config value rather than deep-merging keys. Two consequences: your patch can override rows from earlier layers by id but must restate every key the row needs, not just the changed one. Users can override your rows in their profile's cordis.patch.yml without touching your package, so prefer configuration defaults users are likely to keep and let the schema carry the rest.",
      ] },
      { heading: "Give a surface bundle its own command line", paragraphs: [
        "A bundle that defines a runnable app mounts an ordinary provider plugin. The plugin exports inject = ['cmdlineArgs'], calls parseCmdline from @deepseek-ai/dsh-cmdline with its own commander program, and provides its app-owned service from the program's action. The launcher hands every plugin the same immutable arguments after launcher flags, so app-specific flags need no launcher change.",
        "Rows configured by those arguments inject the provider's service and read it from their own !!js options, with the deployment value beside it as the fallback.",
      ], code: [{ label: "startup row", code: `- id: hello-startup
  name: 'dsh-hello-plugin/startup'` }, { label: "consuming row", code: `- id: my-app
  name: '@example/my-app'
  inject: [myAppStartup]
  config:
    port: !!js ctx.myAppStartup.port ?? 8080` }] },
      { heading: "Installing from GitHub: the build-script catch", paragraphs: [
        "Publishing to a registry is not required — users can install straight from a git host. But a git install fetches sources, not built artifacts: nothing runs your build script, so a TypeScript package arrives without its lib/ output and fails to load.",
        "The author ships a prepare script — pnpm runs it after a git install — that builds the published entry points from source, self-contained. The user allowlists the build: pnpm ≥10 refuses to run a git dependency's prepare script until it is explicitly allowed, so the first add fails; dsh points at the fix — copy the exact package key pnpm printed into the profile's pnpm-workspace.yaml.",
      ], code: [{ label: "terminal", code: `dsh plugin --profile demo add github:you/hello-plugin` }, { label: "pnpm-workspace.yaml", code: `allowBuilds:
  dsh-hello-plugin: true` }], note: "Treat that allowance as permission to execute the package's code on your machine at install time, outside any sandbox the agent runs under. Only allow packages whose source you trust, and pin a commit (github:you/hello-plugin#<sha>) so a later push cannot silently change what runs. If you would rather not ask users for the allowance, distribute built artifacts instead: publish to npm with lib/ built at pnpm publish time, or ship a tarball from pnpm pack." },
    ],
  },

  // ---------------------------------------------------------------------
  // Framework
  // ---------------------------------------------------------------------
  "framework/plugins-and-lifecycle": {
    intro: "This page describes the Cordis plugin model and lifecycle state machine.",
    sourceUrl: `${HARNESS_DOCS}/develop/framework/`,
    body: [
      { heading: "Fiber state machine", paragraphs: [
        "Every loaded plugin owns a Fiber scope with the following states.",
      ], code: [{ label: "states", code: `PENDING → LOADING → ACTIVE
                 ↘ FAILED
ACTIVE → UNLOADING → DISPOSED` }], table: {
        headers: ["State", "Meaning"],
        rows: [
          ["PENDING", "Declared, but required dependencies are not ready"],
          ["LOADING", "Dependencies are ready and apply is running"],
          ["ACTIVE", "The plugin is running"],
          ["FAILED", "apply threw an error"],
          ["UNLOADING", "The plugin is unloading and disposing resources"],
          ["DISPOSED", "The plugin is fully unloaded"],
        ],
      } },
      { heading: "Dependency-driven loading", paragraphs: [
        "A plugin with inject waits for every required service before loading. If a required service disappears, for example during provider replacement, the plugin unloads automatically (ACTIVE → DISPOSED) and loads again when the service returns.",
      ], code: [{ label: "dependency-driven.ts", code: `export const inject = ['tools', 'llm']

export function apply(ctx: Context) {
  // ctx.tools and ctx.llm are ready here.
}` }] },
      { heading: "Automatic cleanup", paragraphs: [
        "Every registration made through ctx is undone when the plugin unloads. The framework tracks and disposes: ctx.on(event, handler) — event listener; ctx.tools.register(tool) — tool registration; ctx.llm.registerAdapter(names, adapter) — LLM adapter registration; ctx.effect(() => cleanup) — custom resource.",
      ], code: [{ label: "cleanup.ts", code: `export function apply(ctx: Context) {
  // Event listener: removed automatically on unload.
  ctx.on('some-event', handler)

  // Custom resource: the returned disposer runs on unload.
  ctx.effect(() => {
    const connection = createConnection()
    return () => connection.close()
  })
}` }], note: "During unload, disposer invocation starts in reverse registration order, but multiple async disposers run concurrently and have no serial completion guarantee. Put order-dependent cleanup in one disposer returned from a single ctx.effect() and await its steps serially there." },
      { heading: "Nested contexts", paragraphs: [
        "ctx.plugin() creates a child Fiber that inherits the parent context but has an independent lifecycle.",
      ], code: [{ label: "nested.ts", code: `export function apply(ctx: Context) {
  // Register a child plugin.
  ctx.plugin(childPlugin)

  // The child has its own Fiber and unloads with its parent.
}` }] },
      { heading: "Dispose semantics", paragraphs: [
        "dispose guarantees: (1) All registrations owned by the plugin are removed. (2) Child plugins are recursively unloaded. (3) The returned promise resolves after all asynchronous cleanup finishes.",
      ], code: [{ label: "dispose.ts", code: `import type { Context } from '@deepseek-ai/cordis'

declare const ctx: Context
declare function myPlugin(ctx: Context): void

const fiber = ctx.plugin(myPlugin)

// Dispose it manually later.
await fiber.dispose()` }] },
      { heading: "Hot replacement (HMR)", paragraphs: [
        "With @deepseek-ai/dsh-hmr loaded from cordis.yml, editing a plugin source file triggers: (1) Unload the old plugin and clean up its registrations. (2) Load the new code. (3) Run the new apply. Because plugin registrations clean themselves up, hot replacement does not retain registrations from the old instance.",
      ] },
      { heading: "Example lifecycle", paragraphs: [
        "Loading prints: plugin loading / effect registered. Unloading prints: effect cleaned up.",
      ], code: [{ label: "example.ts", code: `export function apply(ctx: Context) {
  console.log('plugin loading')

  ctx.effect(() => {
    console.log('effect registered')
    return () => console.log('effect cleaned up')
  })
}` }] },
    ],
  },

  "framework/services-and-dependencies": {
    intro: "A service is a capability one plugin exposes to other plugins. inject declares the services a plugin requires.",
    sourceUrl: `${HARNESS_DOCS}/develop/framework/service`,
    body: [
      { heading: "What is a service?", paragraphs: [
        "In Harness, tools, llm, and agents are services. Each is a named capability mounted on ctx. Any plugin can provide a service for other plugins to consume.",
      ], code: [{ label: "built-in services", code: `ctx.tools    // ToolRuntime service
ctx.llm      // LLM service
ctx.agents   // Agent service` }] },
      { heading: "Consume a service", paragraphs: [
        "Declare inject to use an existing service. When apply runs, every service declared by inject is ready. If a service is not ready, the plugin waits instead of running.",
      ], code: [{ label: "consume.ts", code: `export const inject = ['tools']

export function apply(ctx: Context) {
  // ctx.tools exists and is ready here.
  ctx.tools.register(/* ... */)
}` }] },
      { heading: "Provide a service", paragraphs: [
        "Extend Service. After loading this plugin, consumers access the service as ctx.metrics. Use TypeScript declaration merging to type ctx.metrics.",
      ], code: [{ label: "MetricsService.ts", code: `import { Service, type Context } from '@deepseek-ai/cordis'

export default class MetricsService extends Service {
  static inject = ['llm']  // A service may depend on other services.

  constructor(ctx: Context) {
    super(ctx, 'metrics')  // 'metrics' is the service name.
  }

  // Public service method.
  record(event: string, value: number) {
    // ...
  }
}` }, { label: "consumer of metrics", code: `export const inject = ['metrics']

export function apply(ctx: Context) {
  ctx.metrics.record('tool_call', 1)
}` }, { label: "typed with declaration merging", code: `import { Service, type Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    metrics: MetricsService
  }
}

export default class MetricsService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'metrics')
  }

  record(event: string, value: number) { /* ... */ }
}` }] },
      { heading: "Dependency behavior", paragraphs: [
        "Required: the plugin does not load while the service is absent. Optional: omit inject and query with ctx.get() at the use site.",
        "When a service disappears while the application is running, for example because its provider unloads: (1) Dependent plugins dispose automatically. (2) They load again when the service returns. This prevents a plugin from calling a service that no longer exists.",
      ], code: [{ label: "required vs optional", code: `// Required: the plugin does not load while the service is absent.
export const inject = ['tools']

// Optional: omit inject and query with ctx.get() at the use site.
export function apply(ctx: Context) {
  const metrics = ctx.get('metrics')
  metrics?.record('plugin_loaded', 1)
}` }] },
      { heading: "Service isolation", paragraphs: [
        "cordis.yml can isolate services so separate plugin groups see separate instances of the same service. plugin-a and plugin-b each see the Bash instance in their own group, with no cross-group effect.",
      ], code: [{ label: "cordis.yml", code: `- id: group-a
  name: '@deepseek-ai/cordis-plugin-group'
  group: true
  isolate:
    shell: true
  config:
    - name: '@deepseek-ai/dsh-bash-local'
      config:
        timeoutMs: 5000
    - name: './src/plugin-a.ts'

- id: group-b
  name: '@deepseek-ai/cordis-plugin-group'
  group: true
  isolate:
    shell: true
  config:
    - name: '@deepseek-ai/dsh-bash-local'
      config:
        timeoutMs: 60000
    - name: './src/plugin-b.ts'` }] },
      { heading: "Built-in Harness services", paragraphs: [
        "The repository generates the service names, public methods, and source locations into each service's subsystem page. Use those generated regions and the service's TypeScript interface while developing a plugin; do not maintain a second static list.",
      ], note: "This site links to the live generated reference at deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/core rather than mirroring it statically, exactly as the source page itself instructs." },
    ],
  },

  "framework/event-system": {
    intro: "Events are the core communication mechanism between Cordis plugins. Harness uses them extensively for loosely coupled extension points.",
    sourceUrl: `${HARNESS_DOCS}/develop/framework/events`,
    body: [
      { heading: "Basic use", paragraphs: [
        "Listen for an event with ctx.on(). Emit an event with ctx.emit().",
      ], code: [{ label: "listen", code: `ctx.on('event-name', (payload) => {
  // Handle the event.
})` }, { label: "emit", code: `ctx.emit('event-name', payload)` }] },
      { heading: "Event modes — emit (broadcast)", paragraphs: [
        "Every listener runs synchronously and return values are ignored.",
      ], code: [{ label: "emit example", code: `// Emit
ctx.emit('my-plugin/ready', { id: 'worker-1' })

// Listen
ctx.on('my-plugin/ready', ({ id }) => {
  console.log(\`\${id} is ready\`)
})` }] },
      { heading: "Event modes — bail (short circuit)", paragraphs: [
        "Listeners run in order; the first result other than null, false, or undefined becomes the final result.",
      ], code: [{ label: "bail example", code: `// Dispatch
const result = ctx.bail('some-check', input)

// Listen: a returned value stops later listeners.
ctx.on('some-check', (input) => {
  if (shouldBlock(input)) return 'blocked'
  // Return null, false, or undefined to continue to the next listener.
})` }] },
      { heading: "Event modes — serial (ordered execution)", paragraphs: [
        "Listeners run in registration order and asynchronous results are awaited. The first result other than null, false, or undefined stops further execution.",
      ], code: [{ label: "serial example", code: `await ctx.serial('setup-phase', context)` }] },
      { heading: "Event modes — waterfall (pipeline)", paragraphs: [
        "Each listener may wrap the downstream result to form a processing chain. A listener must call next() to delegate downstream; omitting the call short-circuits the pipeline.",
      ], code: [{ label: "waterfall example", code: `// Dispatch
const output = await ctx.waterfall('my-plugin/transform', input, async () => input)

// Listen: next() is mandatory.
ctx.on('my-plugin/transform', async (_input, next) => {
  const downstream = await next()
  return downstream.trim()
})` }], note: "A waterfall listener must call next(). Omitting it short-circuits the pipeline by design, enabling interception and gateway behavior." },
      { heading: "Typed events", paragraphs: [
        "Harness uses TypeScript declaration merging for type-safe events.",
      ], code: [{ label: "typed-events.ts", code: `import '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Events {
    'my-plugin/ready': (payload: { id: string }) => void
    'my-plugin/check': (input: string) => boolean | undefined
    'my-plugin/transform': (input: string, next: () => Promise<string>) => Promise<string>
  }
}

// ctx.on('my-plugin/ready', ...) and ctx.emit('my-plugin/ready', ...)
// are now inferred correctly.` }] },
      { heading: "Cordis events and session records", paragraphs: [
        "Harness Cordis events use namespace/action names, including agent/pre-step, agent/request, agent/request-error, tools/result, and session/event. The generated cordis-surface regions on the subsystem pages record complete signatures and modes.",
        "turn/*, step/*, tool/call, tool/result, and compaction/* are durable session-event types, not same-named Cordis events. To observe them, listen to session/event and inspect event.type.",
      ] },
      { heading: "Event listeners are effects", paragraphs: [
        "A listener registered with ctx.on() is removed automatically when its plugin unloads.",
      ], code: [{ label: "listener-lifecycle.ts", code: `export function apply(ctx: Context) {
  // This listener is removed when the plugin disposes.
  ctx.on('tools/result', handler)
}` }] },
      { heading: "Example: logging plugin", paragraphs: [
        "This plugin logs tool calls and results.",
      ], code: [{ label: "tool-logger.ts", code: `import type { Context } from '@deepseek-ai/cordis'
import '@deepseek-ai/dsh-tools'

export const name = 'tool-logger'

export function apply(ctx: Context) {
  ctx.on('tools/result', (exec, result) => {
    console.log(\`[tool] \${exec.name}(\${JSON.stringify(exec.arguments)})\`)
    const text = result.content
      .map(block => block.type === 'text' ? block.text : '')
      .join('')
    console.log(\`[tool result] \${text.slice(0, 100)}\`)
  })
}` }] },
    ],
  },

  // ---------------------------------------------------------------------
  // Practice
  // ---------------------------------------------------------------------
  "practice/three-role-capability-design": {
    intro: "This page has two parts: a concept reference for the three-role capability pattern, followed by an advanced tutorial that builds one capability.",
    sourceUrl: `${HARNESS_DOCS}/develop/practice/`,
    body: [
      { heading: "Concept reference", paragraphs: [
        "When a capability is general enough to need replaceable providers, such as Bash execution, Harness separates three roles: a Service Definition, a Service Provider, and a Consumer. Put the roles in separate packages when they need to evolve or be replaced independently; a package may otherwise own more than one role. The complete capability is its seam. No individual role is a seam.",
      ] },
      { heading: "Bash example", paragraphs: [
        "The Bash execution capability consists of: Service Definition (dsh-shell) — defines the Cordis service and Bash request and result types. Service Provider (dsh-bash-local) — executes commands on the local machine. Consumer (dsh-tool-bash) — exposes the capability as a model-callable tool.",
      ], code: [{ label: "the three-role shape", code: `┌─────────────┐     ┌──────────────────┐     ┌──────────────┐
│  dsh-shell   │────▶│  dsh-bash-local  │     │ dsh-tool-bash│
│(definition) │     │    (provider)     │     │(consumer/tool)│
└─────────────┘     └──────────────────┘     └──────────────┘
       ▲                                            │
       └────────────────────────────────────────────┘
                    inject: ['shell']` }] },
      { heading: "Benefits of the split", paragraphs: [
        "Replace providers: one Service Definition can have multiple providers selected through cordis.yml. The Service Definition and tool remain unchanged while the provider changes.",
        "Evolve independently: the Service Definition changes rarely after callers depend on its contract. Service Providers can improve performance and security independently. Consumers can change how they present the capability to the model.",
        "Decouple dependencies: the Service Provider depends on the Service Definition. The Consumer depends on the Service Definition. The Service Provider and Consumer do not depend on each other.",
      ], code: [{ label: "replacing a provider in cordis.yml", code: `# Local execution
- name: '@deepseek-ai/dsh-bash-local'

# Replace this row with another package that provides the same service.` }] },
      { heading: "Tutorial: develop a three-role capability — Step 1: write the Service Definition", paragraphs: [], code: [{ label: "packages/my-cap/my-cap/src/index.ts", code: `import { Service, type Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    myCap: MyCapService
  }
}

export abstract class MyCapService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'myCap')
  }

  /** Execute the capability. */
  abstract execute(request: MyCapRequest): Promise<MyCapResult>
}

export interface MyCapRequest {
  input: string
}

export interface MyCapResult {
  output: string
}` }] },
      { heading: "Step 2: write a Service Provider", paragraphs: [], code: [{ label: "packages/my-cap/my-cap-local/src/index.ts", code: `import type { Context } from '@deepseek-ai/cordis'
import { MyCapService, type MyCapRequest, type MyCapResult } from '@deepseek-ai/dsh-my-cap'

class MyCapLocal extends MyCapService {
  async execute(request: MyCapRequest): Promise<MyCapResult> {
    // Local provider behavior.
    return { output: request.input.toUpperCase() }
  }
}

export const name = 'my-cap-local'

export function apply(ctx: Context) {
  ctx.plugin(MyCapLocal)
}` }] },
      { heading: "Step 3: write a consumer", paragraphs: [], code: [{ label: "packages/my-cap/tool-my-cap/src/index.ts", code: `import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'tool-my-cap'
export const inject = ['tools', 'myCap']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'my_cap',
    description: 'Execute my capability.',
    parameters: {
      input: { type: 'string', required: true },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      const result = await ctx.myCap.execute({ input: args.input })
      return result.output
    },
  }))
}` }, { label: "compose them in cordis.yml", code: `- name: '@deepseek-ai/dsh-my-cap-local'
- name: '@deepseek-ai/dsh-tool-my-cap'` }] },
      { heading: "Design points", paragraphs: [
        "Do not split preemptively — use separate packages only when the roles need to evolve independently. A simple tool plugin does not.",
        "The Service Definition owns Request/Result types — Service Providers and Consumers depend only on the Service Definition package.",
        "Explicit > implicit — resolve defaults in an explicit resolve(request): Spec step rather than hiding ?? default expressions inside run().",
      ] },
    ],
  },

  "practice/llm-adapters": {
    intro: "This guide connects a new LLM provider to Harness. An LLM adapter extends LlmAdapter and implements stream(), translating Harness's provider-neutral request into a provider API call and translating the response back into Harness chunks.",
    sourceUrl: `${HARNESS_DOCS}/develop/practice/llm-adapter`,
    body: [
      { heading: "Minimal implementation", paragraphs: [], code: [{ label: "my-llm-adapter.ts", code: `import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { LlmAdapter, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'

class MyAdapter extends LlmAdapter {
  private apiKey: string

  constructor(apiKey: string) {
    super()
    this.apiKey = apiKey
  }

  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    // 1. Convert options.messages to the provider format.
    // 2. Call the streaming API.
    // 3. Convert the response into StreamChunk values.
  }
}

export interface Config {
  apiKey: string
  providers: string[]
}

export const Config: Schema<Config> = Schema.object({
  apiKey: Schema.string().required(),
  providers: Schema.array(Schema.string()).required(),
})

export const name = 'my-llm-adapter'
export const inject = ['llm']

export function apply(ctx: Context, config: Config) {
  const adapter = new MyAdapter(config.apiKey)
  ctx.llm.registerAdapter(config.providers, adapter)
}` }] },
      { heading: "StreamChunk protocol", paragraphs: [
        "stream() yields chunks using this protocol.",
      ], code: [{ label: "protocol example", code: `import { brandString } from '@deepseek-ai/dsh-brand'
import type { StreamChunk, ToolCallId } from '@deepseek-ai/dsh-llm'

async function* exampleChunks(): AsyncIterable<StreamChunk> {
  // 1. Start each content block with block-start.
  yield { type: 'block-start', index: 0, blockType: 'text' }

  // 2. Stream text through text-delta.
  yield { type: 'text-delta', index: 0, text: 'Hello' }
  yield { type: 'text-delta', index: 0, text: ' world' }

  // 3. End each content block with block-end and the complete block.
  yield {
    type: 'block-end',
    index: 0,
    block: { type: 'text', text: 'Hello world' },
  }

  // 4. Tool-call block.
  yield { type: 'block-start', index: 1, blockType: 'tool-call' }
  yield {
    type: 'tool-call-delta',
    index: 1,
    id: brandString<ToolCallId>('call-123'),
    name: 'bash',
    argumentsDelta: '{"command":"ls"}',
  }
  yield {
    type: 'block-end',
    index: 1,
    block: {
      type: 'tool-call',
      id: brandString<ToolCallId>('call-123'),
      name: 'bash',
      arguments: '{"command":"ls"}',
    },
  }

  // 5. Token usage.
  yield { type: 'usage', usage: { inputTokens: 100, outputTokens: 50 } }

  // 6. Finish reason.
  yield { type: 'finish', reason: { kind: 'stop' } }
  // Alternatively, { kind: 'tool-calls' } requests tool execution.
}` }], note: "Key rules: every block-start has a matching block-end. index increases from 0 and identifies content-block order. A tool-call-delta carries raw JSON text in argumentsDelta, either all at once or over multiple chunks. finish is the final chunk. Emit usage before finish." },
      { heading: "GenerateOptions", paragraphs: [
        "stream() receives the exported GenerateOptions type. It includes the model, adapter-owned reasoning-effort id, conversation history, system prompt, tool schemas, generation parameters, stop sequences, and abort signal; treat the TypeScript type exported by @deepseek-ai/dsh-llm as authoritative. Map supported fields to the provider API. If the provider cannot honor a field, throw LlmError with a stable code instead of silently dropping it.",
        "Override resolveModel(provider, model, signal?) to return exact provider/model identity plus optional context and reasoning metadata in one lookup. Reasoning metadata contains ordered opaque ids and display names plus an optional configured default; preserve the adapter's authoritative selectable list, including off when its upstream capability API returns it, instead of promoting those values into a core enum. Honor the optional signal for asynchronous lookup so cancellation and disposal reach quiescence. The service validates the aggregate and rejects unsupported explicit efforts before stream(); omitting reasoning means that model has no selectable reasoning-effort capability.",
      ] },
      { heading: "Register an adapter", paragraphs: [
        "The first argument lists provider routes handled by the adapter. GenerateOptions.provider selects the registered adapter, while GenerateOptions.model passes an adapter-owned model id without lifecycle registration. Override listModels() when the adapter can advertise model choices to selectors.",
      ], code: [{ label: "register", code: `ctx.llm.registerAdapter(['my-provider'], adapter)` }] },
      { heading: "Use it from cordis.yml", paragraphs: [], code: [{ label: "cordis.yml", code: `- id: my-llm
  name: './src/my-llm-adapter.ts'
  config:
    apiKey: !!js process.env.MY_API_KEY
    providers:
      - my-provider

- id: agent-loop
  name: '@deepseek-ai/dsh-agent-loop'
  config:
    agents:
      - id: main
        provider: my-provider
        model: my-model-v1` }] },
      { heading: "Reference implementations", paragraphs: [
        "The repository contains complete implementations: packages/llm/llm-deepseek/ — DeepSeek API adapter using the OpenAI-compatible format. packages/llm/llm-pi-ai/ — Pi AI adapter using a different API format. Compare the two shipped adapters to see the same harness contract implemented over different provider SDKs.",
      ] },
      { heading: "Error handling", paragraphs: [
        "Adapters throw transport and protocol failures as LlmError values with stable codes. The agent loop preserves the error and code for diagnostics and policy; it does not convert an ordinary Error automatically. Every provider HTTP request must also merge attributionHeaders() and forward options.signal.",
      ], code: [{ label: "HttpAdapter example", code: `import {
  attributionHeaders,
  LlmAdapter,
  LlmError,
  type GenerateOptions,
  type StreamChunk,
} from '@deepseek-ai/dsh-llm'

class HttpAdapter extends LlmAdapter {
  constructor(private readonly endpoint: string) {
    super()
  }

  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...attributionHeaders(),
      },
      body: JSON.stringify({ model: options.model, messages: options.messages }),
      ...options.signal ? { signal: options.signal } : {},
    })
    if (!response.ok) {
      throw new LlmError(\`Provider API error: \${response.status}\`, 'PROVIDER_HTTP_ERROR')
    }
    // A real adapter parses the response and emits the complete chunk sequence.
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}` }] },
    ],
  },

  "practice/runtime-cordis-tools": {
    intro: "Creator mode provides Plugin Manager and read-only runtime inspection. Plugin configuration belongs to the current profile, affects its sessions, and survives process restarts.",
    sourceUrl: `${HARNESS_DOCS}/develop/practice/dynamic-cordis`,
    body: [
      { heading: "Connect an MCP server", paragraphs: [
        "Start the Web profile and select Creator mode. With a reachable Streamable HTTP MCP server that exposes ping, send a prompt naming its actual endpoint: \"Configure the MCP server at <endpoint> in this profile as demo. Make its tools available now, then call its ping tool and tell me the result.\"",
        "The agent writes a configuration-only bundle whose patch inserts @deepseek-ai/dsh-mcp-client, then installs it with plugin_manager install_bundle. With HMR enabled, the tools appear in the same running session. Verify both the management result (application: applied) and a successful mcp__demo__ping call. A saved entry with restart-required has not activated yet; a failed entry needs configuration repair.",
        "Read the bundle patch before editing its configuration. Use Plugin Manager to disable entries or remove the bundle.",
      ] },
      { heading: "Read-only runtime inspection (dsh-tool-cordis)", paragraphs: [
        "Creator mode includes a toolset for inspecting Host and Client runtime APIs before writing plugin code — read-only tools alongside Plugin Manager, which owns persistent profile changes. The inspection registry is supplied by the Cordis host runner; browser queries need a connected page.",
        "Call cordis_inspect_list to discover providers, then cordis_inspect_query for a provider's exact methods and types. Use Plugin Manager to install bundles containing plugin code or MCP configuration.",
        "Implementation: Host providers combine generated Service/Event catalogs and the requesting agent's tool registry. Client providers synchronize their manifests through the existing inspection registry and answer queries from a connected page. The tool plugin owns its registrations through Cordis effects; disposal removes both tools and prompt contributions.",
      ], note: "Known limitation: client queries wait for a responding page or cancellation. Inspection cannot invoke service methods, configure plugins, or execute generated code." },
    ],
  },

  "practice/acryl-plugin-manager": {
    intro: "@deepseek-ai/dsh-plugin-manager manages the current profile's plugins without editing configuration by hand — enable or disable individual plugin entries, select installed bundles, and install or remove external bundles. This is the real package ACRYL's own in-instance plugin management builds on.",
    sourceUrl: `${HARNESS_REPO}/packages/boot/plugin-manager/README.md`,
    sourceLabel: "packages/boot/plugin-manager/README.md",
    body: [
      { heading: "Use this package", paragraphs: [
        "Base-backed profiles provide the manager. In Web, the sidebar's Plugins page manages the profile's bundles and their uniquely addressable rows; the Settings Plugin list stays read-only. Agent-preset rows remain read-only. The plugin_manager tool exposes the same operations and is enabled in Creator mode. Other presets keep it disabled by default. Every tool action requires danger-full-access or approval for that call.",
        "A plugin toggle updates only disabled in the last matching override in the profile's cordis.patch.yml, or appends an override when none matches. A bundle toggle changes package.json's ordered dsh.profile.bundles list. Disabling retains the dependency; enabling appends the bundle at the end, which can change configuration precedence.",
      ], code: [{ label: "enabling the tool in a profile patch", code: `- id: tool-plugin-manager
  disabled: false` }] },
      { heading: "Inspecting and installing", paragraphs: [
        "inspect(spec) reads what a spec names before anything installs: a registry name is asked of the registry through pnpm view; an absolute path has its package.json read; a git address or tarball answers only its form. The answer carries the name, version, description, and whether the package declares a bundle, or a problem: invalid-spec, already-installed, not-found, not-a-package, not-a-bundle, network, or unknown.",
        "installBundle accepts a caller-generated requestId, under which plugin-manager/install-log streams each pnpm run's output and plugin-manager/install-state announces installing, cancelling, and applying. A run that fails, is cancelled, or adds a package without a bundle patch restores package.json and pnpm-lock.yaml as they were.",
        "listBundles carries each bundle's one-liner (the package description), the rows its patch declares with their live entries, and the built-in rows it overrides. A bundle the launcher's OPTIONAL_BUNDLES names is optional: shipped switched off for the person to turn on, never removable, and selected by no shipped template. Every completed operation emits plugin-manager/changed.",
      ] },
      { heading: "Configuration", paragraphs: [] , table: {
        headers: ["Field", "Default", "Meaning"],
        rows: [
          ["pnpmCommand", "pnpm", "The pnpm executable name or path, resolved through PATH like the dsh plugin command."],
          ["inspectTimeoutMs", "20000", "Bound on one registry lookup an inspection runs, in milliseconds."],
          ["outputBytes", "16384", "Maximum pnpm diagnostic bytes returned per operation; the full output remains in the returned log path."],
          ["lockWaitMs", "120000", "Maximum time in milliseconds to acquire the profile write lock."],
        ],
      } },
      { heading: "Failure behavior", paragraphs: [
        "Failures preserve completed steps and report the actual remaining state. Profile dependencies without valid bundle metadata remain visible and removable, with enablement unavailable.",
      ], table: {
        headers: ["Failed operation", "Handling"],
        rows: [
          ["Install: pnpm or bundle validation fails", "Restore package.json and pnpm-lock.yaml as snapshotted before pnpm ran; files pnpm downloaded may remain. Report installation failure."],
          ["Enable: saving selection or loading fails", "Keep the installed dependency and any saved selection. Report enablement failure; allow repair, disablement or removal."],
          ["Remove: any step fails", "Stop at the failed step. Preserve completed changes, retain remaining dependencies for retry, and report removal failure. Do not re-enable the bundle."],
        ],
      } },
      { heading: "Known limitations and deferred work", paragraphs: [
        "Web approves the entire displayed pending group; it has no per-package selection. Package replacements require restarting the process to load a fresh JavaScript module generation. Startup-only profiles cannot remove packages used to start the current process; stop it and use dsh plugin. The manager cannot disable its own management components, change another profile, or edit an agent preset's composition. Desktop package operations remain owned by the Desktop shell — this is the real hook ACRYL Desktop's own in-instance market (cordis-plugin-market) builds on for the ACRYL surface specifically, layered on top of this same profile/bundle model.",
      ] },
    ],
  },
};
