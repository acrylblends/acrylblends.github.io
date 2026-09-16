// Real, hand-written content for the highest-traffic pages across Docs,
// Cordis Primer and Ecosystem — grounded in specs/036-cordis-ecosystem-and-acryl-blends
// in the acryldev/acryl repo, not placeholder copy. Keyed by a flat slug:
// docs pages use "<group-slug>/<item-slug>", Cordis Primer and Ecosystem
// pages use their own single-level route slug.
export type DocEntry = {
  intro: string;
  body: { heading?: string; paragraphs: string[]; note?: string }[];
  code?: { label: string; code: string };
};

const pluginCode = `import { Context } from 'cordis'

export const name = 'hello'

export function apply(ctx: Context) {
  ctx.on('ready', () => {
    ctx.logger.info('hello, world')
  })
}`;

const cordisYamlCode = `# cordis.yml
plugins:
  hello: {}`;

const serviceCode = `import { Context, Service } from 'cordis'

declare module 'cordis' {
  interface Context {
    greeter: GreeterService
  }
}

class GreeterService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'greeter')
  }
  greet(name: string) {
    return \`hello, \${name}\`
  }
}

export const name = 'greeter'
export function apply(ctx: Context) {
  ctx.plugin(GreeterService)
}`;

const injectCode = `export const name = 'consumer'
export const inject = ['greeter']

export function apply(ctx: Context) {
  ctx.on('ready', () => {
    ctx.logger.info(ctx.greeter.greet('cordis'))
  })
}`;

const compositionYamlCode = `# cordis.yml
plugins:
  hello:
    id: my-hello
    disabled: false
  greeter: {}
  group:my-group:
    isolate: true
    plugins:
      consumer: {}`;

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
    intro: "ACRYL Blends is the practical framework for composing stable software out of Cordis plugins — the machinery and libraries that turn the Cordis protocol into something you can actually spin up, grow, and publish.",
    body: [
      { paragraphs: [
        "A Cordis plugin is the minimal unit — the building block, the brick, the \"cell\" — the smallest thing everything else is built out of. Cordis itself is only the protocol: context, services, injection, lifecycle. It defines how plugins cooperate; it does not ship the tooling to scaffold one, hot-reload it inside a live instance, or compose many of them into a describable, pullable product.",
        "That's the gap ACRYL Blends fills. Where Cordis is the formal meta-framework both ACRYL and stock DeepSeek Harness build on to stay compatible, ACRYL Blends is the opinionated, practical layer on top: a way to describe a complete instance as a readable YAML recipe, a registry to publish and pull those recipes from, and a workflow for growing one in place with hot reload before anything is published at all.",
      ]},
      { heading: "The three-layer picture", paragraphs: [
        "Atom : Blend : Registry maps directly onto the model most developers already know from npm and Docker: a Cordis plugin is to a Blend what an npm package is to a Docker image, and the acrylblends registry is to a Blend what Docker Hub is to an image. cordisplugins.github.io is the atom-level registry — the npm analog — and this site, acrylblends.github.io, is the Blend-level registry — the Docker Hub analog.",
      ], note: "ACRYL, the flagship product, is not a special case of this model — it is just one Blend, the maxed-out one that composes the most plugins into the most complete surface." },
    ],
  },
  "getting-started/install": {
    intro: "Install the CLI that pulls, inspects and develops Blends.",
    body: [{ paragraphs: [
      "The CLI wraps ordinary package-manager operations — pulling a Blend means resolving its manifest and materializing its plugins as real, installed dependencies, the same way any other workspace package gets installed. There is no separate binary format or custom archive; a Blend is a YAML file plus the plugins it names.",
      "Once installed, `acryl blend inspect ./blend.yml` reads a manifest without booting anything, and `acryl blend dev --hot` brings up a live instance with hot reload wired in from the first plugin.",
    ]}],
    code: { label: "terminal", code: "npm install -g @acryl/cli\nacryl --version" },
  },
  "getting-started/pull-your-first-blend": {
    intro: "Pulling a Blend brings up a real, working Cordis instance from a published manifest.",
    body: [{ paragraphs: [
      "`acryl blend pull <publisher>/<slug>@<version>` resolves the Blend's manifest, installs every plugin it names, and boots a Cordis Loader composition from the result. Nothing about the instance is hidden after that: the manifest stays the durable explanation of what's running, and every plugin remains independently inspectable and replaceable.",
      "The blank-canvas Blend is the deliberate floor of this: it pulls in only `cordis` itself, so the very first thing you get is an empty, addressable instance with nothing to undo before you start adding capability.",
    ]}],
  },
  "getting-started/publish-your-first-cordis-plugin": {
    intro: "Publishing a plugin is what graduates it from local, hot-reloaded code into something the whole ecosystem can pull.",
    body: [{ paragraphs: [
      "A plugin does not need to be published to be useful — in-instance authoring exists precisely so you can build and hot-reload a plugin inside a running Blend without ever touching a registry. Publishing is the deliberate step you take once a plugin has reached a stable shape worth sharing.",
      "Use `pnpm publish`, not `npm publish` or `npm pack`, for any plugin whose manifest declares workspace-protocol dependencies (`workspace:*`) — only `pnpm publish`/`pnpm pack` rewrite those to real semver ranges before the package leaves your workspace. Publishing with plain `npm` ships the literal `workspace:*` specifier, which breaks the package for anyone installing it standalone. This is not a hypothetical: it is exactly the failure that blocked this ecosystem's own first real release before the fix landed.",
    ]}],
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

  // Cordis Primer pages
  "what-is-cordis": {
    intro: "Cordis is the protocol both ACRYL and stock DeepSeek Harness build on to stay compatible — the common ground, not either product's own branding.",
    body: [{ paragraphs: [
      "It defines context, services, dependency injection, an explicit plugin lifecycle (PENDING, LOADING, ACTIVE, FAILED, UNLOADING, DISPOSED), and a Loader that composes plugins from declarative YAML. ACRYL Blends is built on top of Cordis, not a replacement for it — this page is a concise on-ramp, not a competing tutorial; the full seven-chapter tutorial lives at the source.",
    ]}],
  },
  "the-minimal-plugin": {
    intro: "The smallest Cordis plugin is a name and an `apply` function — nothing else is required.",
    body: [{ paragraphs: [
      "A function plugin like this is the default shape; reach for a `Service` class only when the plugin exposes a direct, named capability other plugins will `inject`.",
    ]}],
    code: { label: "hello.ts", code: pluginCode },
  },
  "services-and-injection": {
    intro: "A Service is a named, typed capability other plugins depend on explicitly through `inject` — never through a concrete provider reference or YAML row order.",
    body: [{ paragraphs: [
      "Declaring `inject = ['greeter']` makes the dependency hard: the consuming plugin stays PENDING until a provider for `greeter` is available, and reactivates cleanly if that provider is replaced. `ctx.get('greeter')` is the optional-dependency counterpart, for a consumer that can function without it.",
    ]}],
    code: { label: "greeter.ts + consumer.ts", code: `${serviceCode}\n\n${injectCode}` },
  },
  "composition-and-hot-reload": {
    intro: "A Loader composes many plugins from one declarative YAML file, and can hot-reload any one of them without restarting the rest.",
    body: [{ paragraphs: [
      "Row `id`, `disabled`, groups and `isolate` are the composition primitives: an id names a specific plugin instance (and, per this ecosystem's own convention, should equal the package name by default), `disabled` toggles a row off without deleting it, and a group with `isolate: true` scopes service resolution so plugins inside it don't leak dependencies to plugins outside it.",
    ]}],
    code: { label: "cordis.yml", code: `${cordisYamlCode}\n\n${compositionYamlCode}` },
  },
  "where-acryl-blends-begins": {
    intro: "Cordis ends at the plugin and its composition. Everything about naming a complete instance, publishing it, and browsing a catalog of them is ACRYL Blends.",
    body: [{ paragraphs: [
      "The Blend YAML format, the acrylblends registry, the blank-canvas starting point, hot-reload in-instance authoring before publishing — none of that is part of the Cordis protocol itself. It's the practical machinery this framework adds on top, so that the atoms Cordis defines can become real, distributable products.",
    ]}],
  },
};
