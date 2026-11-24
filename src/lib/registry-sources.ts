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
  "acrylblends.acryl-ade-eb": {
    ...repo("05-acryl-ade-eb", [
      { os: "macOS", cpu: "Apple Silicon", url: "https://github.com/acrylblends/05-acryl-ade-eb/releases/latest/download/ACRYL-ADE-Electrobun-mac-arm64.dmg" },
      { os: "Windows", cpu: "x64", url: "https://github.com/acrylblends/05-acryl-ade-eb/releases/latest/download/ACRYL-ADE-Electrobun-win-x64-Setup.zip" },
      { os: "Windows", cpu: "ARM", url: "https://github.com/acrylblends/05-acryl-ade-eb/releases/latest/download/ACRYL-ADE-Electrobun-win-arm64-Setup.zip" },
      { os: "Linux", cpu: "x64", url: "https://github.com/acrylblends/05-acryl-ade-eb/releases/latest/download/ACRYL-ADE-Electrobun-linux-x64-Setup.tar.gz" },
      { os: "Linux", cpu: "ARM", url: "https://github.com/acrylblends/05-acryl-ade-eb/releases/latest/download/ACRYL-ADE-Electrobun-linux-arm64-Setup.tar.gz" },
    ]),
    sizes: {
      caption: "Release v0.1.0 (2026-11-23): the same ACRYL ADE packed with Electron and with Electrobun in one release run (@acryldev/blends 1.7.30). Installed = the unpacked app, sum of file sizes; MB = 1,000,000 bytes.",
      columns: ["OS", "Electron 44", "Electrobun 2.0.7, everything on Bun"],
      rows: [
        ["macOS arm64, download","205.5 MB","71.0 MB (-65%)"],
        ["macOS arm64, installed","548.1 MB = shell 307.8 + app 204.4 + Git 35.9","263.7 MB = shell 96.7 + app 156.8 + Git 10.1, 14,311 files (-52%)"],
        ["Windows x64, download","177.4 MB","81.6 MB (-54%)"],
        ["Windows x64, installed","598.4 MB = shell 386.1 + app 212.4","289.9 MB = shell 125.6 + app 164.3, 14,259 files (-52%)"],
        ["Windows arm64, download","171.7 MB","76.5 MB (-55%)"],
        ["Windows arm64, installed","599.4 MB = shell 384.5 + app 214.9","276.2 MB = shell 109.7 + app 166.5, 14,308 files (-54%)"],
        ["Linux x64, download","142.6 MB","84.7 MB (-41%)"],
        ["Linux x64, installed","504.1 MB = shell 296.7 + app 207.4","304.0 MB = shell 144.2 + app 159.8, 14,246 files (-40%)"],
        ["Linux arm64, download","137.1 MB","83.2 MB (-39%)"],
        ["Linux arm64, installed","508.0 MB = shell 301.5 + app 206.5","301.2 MB = shell 142.2 + app 159.0, 14,245 files (-41%)"],
      ],
      notes: [
        "The same ADE as ACRYL ADE (acrylblends/05-acryl-ade), about half the installed size: no Chromium (the system webview draws the window) and no Node (the window, the app host, the terminals and the door all run on Electrobun's Bun).",
        "The app part is 47 MB smaller than in the Electron build: what only Electron or a TypeScript build uses, types, source maps, C/C++ sources, other OSes' native builds and third-party docs are left out (Bun compiles TypeScript itself).",
        "Terminals for Claude Code, Codex, Pi or any terminal agent work on Bun on all three OSes. A change to the ADE's own plugins restarts its host (as in the Electron build), which closes its terminals; work in the projects it opens never does.",
        "Tested from CI builds of the release commit on macOS arm64, Windows 10 x64 and Ubuntu 24.04 x64: the workbench, the agent door, a terminal, a plugin added and edited, nothing left running after closing.",
        "Not yet like the Electron build: no updater, no Intel Mac build. On Windows the Setup unpacks for about 8 minutes with Defender on.",
      ],
    },
  },
  "acryl.aos": repo("01-acryl-aos"),
  "acryl.control-center": repo("63-acryl-control-center", releaseFiles("63-acryl-control-center", "ACRYL-Control-Center")),
  "acrylblends.workflow-automation": repo("48-workflow-automation", releaseFiles("48-workflow-automation", "ACRYL-Workflow-Automation")),
  "acrylblends.workflow-automation-eb": {
    ...repo("48-workflow-automation-eb", [
      { os: "macOS", cpu: "Apple Silicon", url: "https://github.com/acrylblends/48-workflow-automation-eb/releases/latest/download/ACRYL-Workflow-Automation-Electrobun-mac-arm64.dmg" },
      { os: "Windows", cpu: "x64", url: "https://github.com/acrylblends/48-workflow-automation-eb/releases/latest/download/ACRYL-Workflow-Automation-Electrobun-win-x64-Setup.zip" },
      { os: "Windows", cpu: "ARM", url: "https://github.com/acrylblends/48-workflow-automation-eb/releases/latest/download/ACRYL-Workflow-Automation-Electrobun-win-arm64-Setup.zip" },
      { os: "Linux", cpu: "x64", url: "https://github.com/acrylblends/48-workflow-automation-eb/releases/latest/download/ACRYL-Workflow-Automation-Electrobun-linux-x64-Setup.tar.gz" },
      { os: "Linux", cpu: "ARM", url: "https://github.com/acrylblends/48-workflow-automation-eb/releases/latest/download/ACRYL-Workflow-Automation-Electrobun-linux-arm64-Setup.tar.gz" },
    ]),
    sizes: {
      caption: "Release v0.1.4 (2026-11-23): the same Workflow Automation packed with Electron and with Electrobun in one release run (@acryldev/blends 1.7.30). Installed = the unpacked app, sum of file sizes; MB = 1,000,000 bytes.",
      columns: ["OS", "Electron 44", "Electrobun 2.0.7, everything on Bun"],
      rows: [
        ["macOS arm64, download","264.6 MB","83.3 MB (-69%)"],
        ["macOS arm64, installed","831.1 MB = shell 321.0 + app 474.2 + Git 35.9","517.4 MB = shell 96.7 + app 410.5 + Git 10.1, 43,432 files (-38%)"],
        ["Windows x64, download","242.4 MB","93.6 MB (-61%)"],
        ["Windows x64, installed","868.8 MB = shell 386.1 + app 482.8","544.3 MB = shell 125.6 + app 418.7, 43,380 files (-37%)"],
        ["Windows arm64, download","236.4 MB","88.0 MB (-63%)"],
        ["Windows arm64, installed","868.9 MB = shell 384.5 + app 484.4","529.7 MB = shell 109.7 + app 420.0, 43,429 files (-39%)"],
        ["Linux x64, download","178.1 MB","96.6 MB (-46%)"],
        ["Linux x64, installed","774.2 MB = shell 296.7 + app 477.5","558.1 MB = shell 144.2 + app 413.9, 43,367 files (-28%)"],
        ["Linux arm64, download","171.9 MB","95.0 MB (-45%)"],
        ["Linux arm64, installed","777.5 MB = shell 301.5 + app 476.0","554.7 MB = shell 142.2 + app 412.4, 43,366 files (-29%)"],
      ],
      notes: [
        "No Chromium (the system webview draws the window) and no Node: the window, the app host with the workflow engine, the agents' terminals and the door all run on Electrobun's Bun.",
        "The app part is larger than in other Blends because of the workflow engine's integrations (Qadam Flow packages, MIT); v0.1.3 keeps one copy of Qadam's shared packages instead of one per integration (9,400 files and 69 MB less).",
        "Tested from the v0.1.4 release builds (Electron and Electrobun) on macOS arm64 (Mac mini M4), Windows 10 x64 and Ubuntu 24.04 x64, first and second start: the workflow screen, a workflow built and test-run through the app's API (40 + 2 = 42), the agent door, a terminal, nothing left running after closing. A plugin added and edited live: tested on macOS and Linux.",
        "Not yet like the Electron build: no updater, no Intel Mac build. On Windows the Setup unpacked for 21 minutes on the test PC with Defender on (the Electron installer: 9 minutes).",
      ],
    },
  },
  "acryl.sde": repo("05-acryl-sde"),
  "acrylblends.action-rpg": repo("41-action-rpg"),
  "acrylblends.airspace": repo("41-airspace"),
  "acrylblends.corridor": repo("41-corridor"),
  "acrylblends.small-crm-eb": {
    ...repo("03-small-crm-eb", [
      { os: "macOS", cpu: "Apple Silicon", url: "https://github.com/acrylblends/03-small-crm-eb/releases/latest/download/Small-CRM-Electrobun-mac-arm64.dmg" },
      { os: "Windows", cpu: "x64", url: "https://github.com/acrylblends/03-small-crm-eb/releases/latest/download/Small-CRM-Electrobun-win-x64-Setup.zip" },
      { os: "Windows", cpu: "ARM", url: "https://github.com/acrylblends/03-small-crm-eb/releases/latest/download/Small-CRM-Electrobun-win-arm64-Setup.zip" },
      { os: "Linux", cpu: "x64", url: "https://github.com/acrylblends/03-small-crm-eb/releases/latest/download/Small-CRM-Electrobun-linux-x64-Setup.tar.gz" },
      { os: "Linux", cpu: "ARM", url: "https://github.com/acrylblends/03-small-crm-eb/releases/latest/download/Small-CRM-Electrobun-linux-arm64-Setup.tar.gz" },
    ]),
    sizes: {
      caption: "Release v0.1.4 (2026-11-23): the same Small CRM packed with Electron and with Electrobun in one release run (@acryldev/blends 1.7.25). Installed = the unpacked app, sum of file sizes; MB = 1,000,000 bytes.",
      columns: ["OS", "Electron 44", "Electrobun 2.0.7, everything on Bun"],
      rows: [
        ["macOS arm64, download","205.8 MB","71.0 MB (-65%)"],
        ["macOS arm64, installed","548.7 MB = shell 307.8 + app 205.0 + Git 35.9","264.2 MB = shell 96.7 + app 157.4 + Git 10.1, 14,396 files (-52%)"],
        ["Windows x64, download","177.7 MB","82.0 MB (-54%)"],
        ["Windows x64, installed","599.0 MB = shell 386.1 + app 212.9","290.5 MB = shell 125.6 + app 164.8, 14,344 files (-52%)"],
        ["Windows arm64, download","172.1 MB","76.7 MB (-55%)"],
        ["Windows arm64, installed","599.9 MB = shell 384.5 + app 215.4","276.7 MB = shell 109.7 + app 167.1, 14,393 files (-54%)"],
        ["Linux x64, download","143.0 MB","85.1 MB (-41%)"],
        ["Linux x64, installed","504.6 MB = shell 296.7 + app 207.9","304.6 MB = shell 144.2 + app 160.3, 14,331 files (-40%)"],
        ["Linux arm64, download","137.4 MB","83.5 MB (-39%)"],
        ["Linux arm64, installed","508.6 MB = shell 301.5 + app 207.1","301.8 MB = shell 142.2 + app 159.5, 14,330 files (-41%)"],
      ],
      notes: [
        "No Chromium (the system webview draws the window) and no Node: the window, the app host, the agents' terminals and the door all run on Electrobun's Bun.",
        "The app part is 47 MB smaller than in the Electron build: what only Electron or a TypeScript build uses, types, source maps, C/C++ sources, other OSes' native builds and third-party docs are left out (Bun compiles TypeScript itself).",
        "Live changes: an agent that adds a plugin (its folder and its blend.yaml row) or edits one sees it served within 2 s, the app view stays on the page it shows, and the agent's terminal stays open: the host loads the change in place (the Electron build restarts its host, which closes the terminals).",
        "Tested from CI builds of the release commit on macOS arm64, Windows 10 x64 and Ubuntu 24.04 x64: CRM pages, the agent door, a terminal, a plugin added and edited live, nothing left running after closing.",
        "Not yet like the Electron build: no updater, no Intel Mac build. On Windows the Setup unpacks for about 8 minutes with Defender on.",
      ],
    },
  },
  "acrylblends.electrobun-blank": {
    ...repo("63-electrobun-blank", [
      { os: "macOS", cpu: "Apple Silicon", url: "https://github.com/acrylblends/63-electrobun-blank/releases/latest/download/ACRYL-Blends-Electrobun-mac-arm64.dmg" },
      { os: "Windows", cpu: "x64", url: "https://github.com/acrylblends/63-electrobun-blank/releases/latest/download/ACRYL-Blends-Electrobun-win-x64-Setup.zip" },
      { os: "Windows", cpu: "ARM", url: "https://github.com/acrylblends/63-electrobun-blank/releases/latest/download/ACRYL-Blends-Electrobun-win-arm64-Setup.zip" },
      { os: "Linux", cpu: "x64", url: "https://github.com/acrylblends/63-electrobun-blank/releases/latest/download/ACRYL-Blends-Electrobun-linux-x64-Setup.tar.gz" },
      { os: "Linux", cpu: "ARM", url: "https://github.com/acrylblends/63-electrobun-blank/releases/latest/download/ACRYL-Blends-Electrobun-linux-arm64-Setup.tar.gz" },
    ]),
    sizes: {
      caption: "Release v0.2.4 (2026-11-23), the Blank app of @acryldev/blends 1.7.25 packed with Electron and with Electrobun in one release run. Installed = the unpacked app, sum of file sizes; MB = 1,000,000 bytes.",
      columns: ["OS", "Electron 44", "Electrobun 2.0.7, everything on Bun"],
      rows: [
        ["macOS arm64, download","205.2 MB","70.8 MB (-65%)"],
        ["macOS arm64, installed","547.9 MB = shell 307.8 + app 204.2 + Git 35.9","263.4 MB = shell 96.7 + app 156.6 + Git 10.1, 14,309 files (-52%)"],
        ["Windows x64, download","177.1 MB","81.3 MB (-54%)"],
        ["Windows x64, installed","598.2 MB = shell 386.1 + app 212.1","289.7 MB = shell 125.6 + app 164.0, 14,257 files (-52%)"],
        ["Windows arm64, download","171.4 MB","76.1 MB (-56%)"],
        ["Windows arm64, installed","599.1 MB = shell 384.5 + app 214.6","275.9 MB = shell 109.7 + app 166.2, 14,306 files (-54%)"],
        ["Linux x64, download","142.4 MB","84.5 MB (-41%)"],
        ["Linux x64, installed","503.8 MB = shell 296.7 + app 207.1","303.8 MB = shell 144.2 + app 159.5, 14,244 files (-40%)"],
        ["Linux arm64, download","136.8 MB","83.0 MB (-39%)"],
        ["Linux arm64, installed","507.8 MB = shell 301.5 + app 206.3","301.0 MB = shell 142.2 + app 158.7, 14,243 files (-41%)"],
      ],
      notes: [
        "No Chromium (the system webview draws the window) and no Node: the window, the app host, the agents' terminals and the door all run on Electrobun's Bun.",
        "The app part is 47 MB smaller than in the Electron build: what only Electron or a TypeScript build uses, types, source maps, C/C++ sources, other OSes' native builds and third-party docs are left out (Bun compiles TypeScript itself).",
        "Live changes: an agent that adds a plugin (its folder and its blend.yaml row) or edits one sees it served within 2 s, the app view stays on the page it shows, and the agent's terminal stays open: the host loads the change in place (the Electron build restarts its host, which closes the terminals).",
        "Tested from CI builds of the release commit on macOS arm64, Windows 10 x64 and Ubuntu 24.04 x64: the frame with chat, the app, the agent door, a terminal, a plugin added and edited live, nothing left running after closing.",
        "Not yet like the Electron build: no updater, no Intel Mac build. On Windows the Setup unpacks for about 8 minutes with Defender on.",
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
