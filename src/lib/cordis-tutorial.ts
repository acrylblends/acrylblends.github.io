// The exhaustive Cordis Primer structure — a full recreation of the real
// DeepSeek Harness Cordis/Harness developer documentation, extended with an
// ACRYL-specific bridging chapter. Every item here has a real source page at
// deepseek-harness.github.io; see src/lib/cordis-content.ts for the content
// and each entry's sourceUrl.
export const cordisGroups = [
  {
    slug: "tutorial",
    title: "Part 1 — Cordis Core",
    description: "The real seven-chapter curriculum, built step by step against a scratch Cordis runtime with no API key.",
    items: [
      "1. Your first plugin",
      "2. Lifecycle and effects",
      "3. Services",
      "4. Events",
      "5. Configuration",
      "6. Composition and HMR",
      "7. Into the harness",
    ],
  },
  {
    slug: "basics",
    title: "Part 2 — ACRYL Harness Basics",
    description: "The bridge from generic Cordis to a real ACRYL instance, then the same primitives against a real Harness checkout and the Web UI instead of a scratch directory.",
    items: [
      "Your first ACRYL Harness Plugin",
      "What is a plugin?",
      "Build a tool",
      "Plugin configuration",
      "Package and install a plugin",
    ],
  },
  {
    slug: "services",
    title: "Part 3 — ACRYL's Built-in Services",
    description: "Real named services present on every ACRYL instance, even a blank one — cited by file, not maintained as a second static list.",
    items: [
      "ACRYL's built-in services",
    ],
  },
  {
    slug: "framework",
    title: "Framework Reference",
    description: "The plugin model, service system, and event system as standalone reference material — the same concepts Part 1's tutorial builds, indexed for lookup rather than read start to finish.",
    items: [
      "Plugins and lifecycle",
      "Services and dependencies",
      "Event system",
    ],
  },
  {
    slug: "practice",
    title: "Part 4 — Practice",
    description: "Applied patterns for building real, replaceable capabilities: the three-role split, LLM adapters, runtime plugin tools, and ACRYL's own Plugin Manager.",
    items: [
      "Three-role capability design",
      "LLM adapters",
      "Runtime Cordis tools",
      "ACRYL Plugin Manager",
    ],
  },
];
