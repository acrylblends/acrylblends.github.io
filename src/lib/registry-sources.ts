// Where a Blend's source lives on GitHub, in the acrylblends org. A repository is named `<category number>-<name>`: 05 is AI on /blends.
// Written by hand when a Blend gets its own repository, like the placements in registry-placement.ts.
export interface Source {
  /** The repository's page, https://github.com/acrylblends/<name>. */
  readonly url: string;
  /** The folder `git clone` makes. */
  readonly folder: string;
  /** For a Blend whose source lives inside a monorepo: its folder there. Its page then offers no clone-and-run commands (the repository above holds only releases). */
  readonly directory?: string;
  /** The folder in the monorepo, shown as a second link beside the Blend's own repository. */
  readonly monorepo?: string;
  /** The installable app of each OS and CPU, from the repository's latest GitHub release (its Release workflow builds them). */
  readonly downloads?: readonly Download[];
  /** Measured sizes the page shows, for a Blend whose point is its size (the Electrobun one). */
  readonly sizes?: SizeTable;
}

export interface SizeTable {
  /** When and where it was measured. */
  readonly caption: string;
  /** The first column names the part; the others are what is compared. */
  readonly columns: readonly string[];
  readonly rows: readonly (readonly string[])[];
  readonly notes: readonly string[];
}

export interface Download {
  readonly os: "macOS" | "Windows" | "Linux";
  readonly cpu: "Apple Silicon" | "Intel" | "ARM" | "x64";
  readonly url: string;
}

const repo = (name: string, downloads?: readonly Download[]): Source => ({ url: `https://github.com/acrylblends/${name}`, folder: name, downloads });

const MONOREPO = "https://github.com/acryldev/acryl";

/**
 * A product built in the ACRYL monorepo and released from a release-only repository in the acrylblends organisation: that repository is the Blend's home in the
 * catalogue (its README and its fixed `releases/latest/download/<file>` links), the monorepo folder is the source. No clone-and-run commands: the repository holds no code.
 */
function releaseRepo(name: string, directory: string, product: string): Source {
  const file = (platform: string, arch: string, extension: string) =>
    `https://github.com/acrylblends/${name}/releases/latest/download/${product}-${platform}-${arch}.${extension}`;
  return {
    url: `https://github.com/acrylblends/${name}`,
    folder: name,
    directory,
    monorepo: `${MONOREPO}/tree/main/${directory}`,
    downloads: [
      { os: "macOS", cpu: "Apple Silicon", url: file("mac", "arm64", "dmg") },
      { os: "macOS", cpu: "Intel", url: file("mac", "x64", "dmg") },
      { os: "Windows", cpu: "x64", url: file("win", "x64", "exe") },
      { os: "Windows", cpu: "ARM", url: file("win", "arm64", "exe") },
      { os: "Linux", cpu: "x64", url: file("linux", "x64", "deb") },
      { os: "Linux", cpu: "ARM", url: file("linux", "arm64", "deb") },
    ],
  };
}

export const registrySources: Record<string, Source> = {
  "acryl.ade": releaseRepo("05-acryl-ade", "apps/acryl-ade", "ACRYL-ADE"),
  "acryl.control-center": releaseRepo("63-acryl-control-center", "apps/acryl-control-center", "ACRYL-Control-Center"),
  "acryl.sde": repo("05-acryl-sde"),
  "acrylblends.action-rpg": repo("41-action-rpg"),
  "acrylblends.airspace": repo("41-airspace"),
  "acrylblends.corridor": repo("41-corridor"),
  "acrylblends.electrobun-blank": {
    ...repo("63-electrobun-blank"),
    sizes: {
      caption: "Measured on macOS arm64, 2026-11-18. MB = 1,000,000 bytes.",
      columns: ["Part", "Electron 44.9.3", "Electrobun 2.0.6"],
      rows: [
        ["Shell, installed", "309.4 MB", "95.7 MB (ships as 33.5 MB, unpacks on first launch)"],
        ["Shell, DMG", "141.1 MB", "33.1 MB"],
        ["Node to run the frame host", "none: Electron runs it as Node", "121.3 MB (Node 24.19.0)"],
        ["The frame's packages (node_modules without dev packages)", "451.6 MB", "451.6 MB"],
        ["Total, installed", "761.0 MB", "668.6 MB (-12%)"],
      ],
      notes: [
        "The shell alone is 69% smaller installed and 77% smaller as a DMG.",
        "The whole app is only 12% smaller: Electron doubles as the Node that runs the frame host, Electrobun ships Node beside Bun, and the frame's packages are the same either way. The totals are added up from the measured parts, not from a packed app.",
        "If the frame host could run on Electrobun's Bun (it cannot until Bun has node:module registerHooks), Node would drop out: 547.3 MB, 28% smaller.",
        "Earlier ACRYL measurements (spec 042): a Deno-packed ACRYL was 53% smaller installed than the pruned Electron one (210.3 MB vs 447.1 MB); a bun --compile executable is 61 MB on macOS against Node's 121 MB.",
        "Limits: tried on macOS arm64 only; Electrobun has no Intel Mac build and does not cross-compile. Electron stays the default; Electrobun is an option to try. Start time and memory are not measured yet.",
      ],
    },
  },
  "acrylblends.open-city": repo("41-open-city"),
  "acrylblends.tennis": repo("41-tennis"),
  "acrylblends.tower-defense": repo("41-tower-defense"),
  "acrylblends.valley": repo("41-valley"),
};

/** The commands that run a Blend straight from its repository. */
export function cloneCommand(source: Source): string | undefined {
  if (source.directory !== undefined) return undefined;
  return `git clone ${source.url}.git\ncd ${source.folder} && npm install && npm run dev`;
}
