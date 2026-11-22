// Where a Blend's source lives on GitHub, in the acrylblends org. A repository is named `<category number>-<name>`: 05 is AI on /blends.
// Written by hand when a Blend gets its own repository, like the placements in registry-placement.ts.
export interface Source {
  /** The repository's page, https://github.com/acrylblends/<name>. */
  readonly url: string;
  /** The folder `git clone` makes. */
  readonly folder: string;
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

/** The six files a Blend's Release workflow publishes, at the repository's fixed `releases/latest/download/` links, named `<Product>-<mac|win|linux>-<arm64|x64>`. */
function releaseFiles(name: string, product: string): readonly Download[] {
  const file = (platform: string, arch: string, extension: string) =>
    `https://github.com/acrylblends/${name}/releases/latest/download/${product}-${platform}-${arch}.${extension}`;
  return [
    { os: "macOS", cpu: "Apple Silicon", url: file("mac", "arm64", "dmg") },
    { os: "macOS", cpu: "Intel", url: file("mac", "x64", "dmg") },
    { os: "Windows", cpu: "x64", url: file("win", "x64", "exe") },
    { os: "Windows", cpu: "ARM", url: file("win", "arm64", "exe") },
    { os: "Linux", cpu: "x64", url: file("linux", "x64", "deb") },
    { os: "Linux", cpu: "ARM", url: file("linux", "arm64", "deb") },
  ];
}

export const registrySources: Record<string, Source> = {
  "acryl.ade": repo("05-acryl-ade", releaseFiles("05-acryl-ade", "ACRYL-ADE")),
  "acryl.control-center": repo("63-acryl-control-center", releaseFiles("63-acryl-control-center", "ACRYL-Control-Center")),
  "acryl.sde": repo("05-acryl-sde"),
  "acrylblends.action-rpg": repo("41-action-rpg"),
  "acrylblends.airspace": repo("41-airspace"),
  "acrylblends.corridor": repo("41-corridor"),
  "acrylblends.electrobun-blank": {
    ...repo("63-electrobun-blank", [
      { os: "macOS", cpu: "Apple Silicon", url: "https://github.com/acrylblends/63-electrobun-blank/releases/latest/download/ACRYL-Blends-Electrobun-mac-arm64.dmg" },
      { os: "Windows", cpu: "x64", url: "https://github.com/acrylblends/63-electrobun-blank/releases/latest/download/ACRYL-Blends-Electrobun-win-x64-Setup.zip" },
      { os: "Windows", cpu: "ARM", url: "https://github.com/acrylblends/63-electrobun-blank/releases/latest/download/ACRYL-Blends-Electrobun-win-arm64-Setup.zip" },
      { os: "Linux", cpu: "x64", url: "https://github.com/acrylblends/63-electrobun-blank/releases/latest/download/ACRYL-Blends-Electrobun-linux-x64-Setup.tar.gz" },
      { os: "Linux", cpu: "ARM", url: "https://github.com/acrylblends/63-electrobun-blank/releases/latest/download/ACRYL-Blends-Electrobun-linux-arm64-Setup.tar.gz" },
    ]),
    sizes: {
      caption: "Release v0.2.2 (2026-11-22), the Blank app of @acryldev/blends 1.7.25. Installed = the app folder after its first start, du -sk on a real machine; MB = 1,000,000 bytes.",
      columns: ["OS", "Electron 44", "Electrobun 2.0.7, host on Node (v0.2.0)", "Electrobun 2.0.7, host on Bun (v0.2.2)"],
      rows: [
        ["macOS arm64, download", "205.2 MB", "112.0 MB", "82.7 MB (-60%)"],
        ["macOS arm64, installed", "595.8 MB = shell 308.7 + app 251.0 + Git 36.2", "506.5 MB = shell 96.7 + Node 122.6 + app 251.0 + Git 36.2", "383.9 MB = shell 96.8 + app 251.0 + Git 36.2 (-36%)"],
        ["Linux x64, download", "142.3 MB", "123.9 MB", "91.1 MB (-36%)"],
        ["Linux x64, installed", "565.7 MB = shell 296.9 + app 268.8", "540.0 MB = shell 144.4 + Node 126.9 + app 268.7", "413.1 MB = shell 144.3 + app 268.8 (-27%)"],
        ["Windows x64, download", "177.1 MB", "113.7 MB", "87.7 MB (-50%)"],
        ["Windows x64, installed", "636.4 MB = shell 386.4 + app 249.9", "469.4 MB = shell 125.6 + Node 93.9 + app 249.8", "375.5 MB = shell 125.7 + app 249.8 (-41%)"],
      ],
      notes: [
        "Shell: Electron and Chromium on one side, Bun plus Electrobun's libraries on the other. The app payload is the same files on both sides.",
        "Electrobun also keeps a self-extraction cache and an uninstaller outside the app folder: 39.9 MB on macOS, 51.0 MB on Linux, 40.1 MB on Windows.",
        "v0.2.2 runs the frame host on Electrobun's own Bun: the Program is linked into the app's source instead of node:module registerHooks, so no Node ships.",
        "Tested on macOS arm64, Windows 10 x64 and Ubuntu 24.04 x64 from the release installers: the window opens with the frame and chat, the app answers, the door answers, closing leaves no process.",
        "Not yet like the Electron build: no updater, no door window calls, no host restart supervisor; no Intel Mac build. Windows' first start unpacks for 25 to 70 minutes with Defender on (about 20,000 files).",
      ],
    },
  },
  "acrylblends.open-city": repo("41-open-city"),
  "acrylblends.tennis": repo("41-tennis"),
  "acrylblends.tower-defense": repo("41-tower-defense"),
  "acrylblends.valley": repo("41-valley"),
};

/** The commands that run a Blend straight from its repository. */
export function cloneCommand(source: Source): string {
  return `git clone ${source.url}.git\ncd ${source.folder} && npm install && npm run dev`;
}
