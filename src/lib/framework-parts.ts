// What the framework is made of today: one row per capability, with the service name a plugin injects and the providers that implement it.
// Source of truth is spec 049 ("The map") in acryldev/acryl and acrylblends 1.0's packages; this file is the site's copy of it, kept in the same order so a reader
// can compare the two. Status words match the release notes: experimental means it works, is gated, and its interface may change in a minor version.

export type PartStatus = "stable" | "optional" | "experimental";

export interface FrameworkPart {
  /** The row's name in spec 049's map. */
  layer: string;
  /** What a person asks when they reach for this layer. */
  question: string;
  /** The service a plugin injects (or, for the tooling rows, the command). */
  service: string;
  /** The packages that implement it, the default first. */
  providers: string[];
  status: PartStatus;
  /** One line of context that the table alone would hide. */
  note?: string;
}

export const frameworkParts: FrameworkPart[] = [
  {
    layer: "Core",
    question: "How do plugins start, stop and find each other?",
    service: "Context, inject, effect, Loader",
    providers: ["cordis"],
    status: "stable",
    note: "A capability is one plugin providing one service; consumers depend on the name, never the provider.",
  },
  {
    layer: "Routing",
    question: "How does a request become a response?",
    service: "router",
    providers: ["acryl-router"],
    status: "stable",
    note: "One Acryl app per plugin, mounted with ctx.router.route. Five routers behind one API: RegExp, Trie, Smart (default), Linear, Pattern.",
  },
  {
    layer: "Serving",
    question: "How is it served?",
    service: "routerHttp",
    providers: ["acryl-node-server", "Desktop's loopback host", "in process"],
    status: "stable",
    note: "Node.js is the verified runtime (22.19+); Bun is experimental. Tests and the terminal UI call the app without a socket.",
  },
  {
    layer: "Records",
    question: "Where does my app keep its records?",
    service: "db",
    providers: ["acryl-db-sqlite", "acryl-db-pglite", "acryl-db-postgres"],
    status: "optional",
    note: "SQL with numbered migrations. SQLite is the default; embedded Postgres (PGlite) and a hosted Postgres are one provider row away, and the app's SQL does not change.",
  },
  {
    layer: "Tiny data",
    question: "My app is small; can it skip SQL?",
    service: "kv",
    providers: ["acryl-kv-json", "acryl-kv-db"],
    status: "stable",
    note: "Named JSON documents. The file provider replaces atomically, so a crash leaves the old or the new file; the db provider carries the same data into SQL.",
  },
  {
    layer: "Live state",
    question: "How does the page see changes without a reload?",
    service: "state",
    providers: ["acryl-state"],
    status: "stable",
    note: "Observable cells over server-sent events.",
  },
  {
    layer: "UI",
    question: "How is a page rendered?",
    service: "jsx, clientModules, acryl-ui",
    providers: ["acrylblends/jsx", "acrylblends/jsx/dom"],
    status: "stable",
    note: "JSX on the server and the same JSX in the browser, and client components without a bundler. A richer React component library is used by the ACRYL IDE and not yet in templates.",
  },
  {
    layer: "Desktop",
    question: "The same app as a window?",
    service: "desktop",
    providers: ["desktop (Electron)"],
    status: "stable",
    note: "acrylblends add desktop to an existing app; the routes and plugins are the ones the web build runs.",
  },
  {
    layer: "Agents",
    question: "Who can work inside the running app?",
    service: "drivers",
    providers: ["driver-pty"],
    status: "experimental",
    note: "One driver per agent behind acrylblends/drivers: the PTY driver runs claude, codex or pi inside the app folder. A driver for the Agent Client Protocol, with dsh as its first preset, is in review.",
  },
  {
    layer: "The door",
    question: "How does an agent look at and change the app?",
    service: "acryl control",
    providers: ["acryl-door", "agent-panel"],
    status: "experimental",
    note: "brief, look, act and plugin add|remove|reload over the CLI, MCP and the in-app chat. Loopback, per-run secret, audit log, and off with NODE_ENV=production or ACRYL_DOOR=off.",
  },
  {
    layer: "Live plugins",
    question: "Can a plugin be installed while the app runs?",
    service: "extensions, builder, sandbox",
    providers: ["plugins/extensions", "plugins/builder"],
    status: "experimental",
    note: "A plugin is staged, imported, mounted and reported as active, pending or failed, with the previous version kept on failure. It is a correctness check, not a security boundary.",
  },
  {
    layer: "Tooling",
    question: "How do I start and grow an app?",
    service: "acrylblends init, add, upgrade",
    providers: ["acrylblends", "create-acrylblends"],
    status: "stable",
    note: "Six templates (blank, nodejs, notes, chat, todo, agent), a plugin library, and upgrade for the framework plugins an app carries.",
  },
];
