# ACRYL ADE (Electrobun)

**ACRYL ADE**, the Agent Development Environment, in its **smallest build**: an Electrobun app instead of Electron. The same ADE
([acrylblends/05-acryl-ade](https://github.com/acrylblends/05-acryl-ade)): projects and git worktrees on the left, the agent's chat,
terminals (Claude Code, Codex, Pi or any terminal agent), files and diffs as tabs, what the agent changed and the review on the right. But:

- **no Chromium**: the window is the system webview (WKWebView on macOS, WebView2 on Windows, WebKitGTK on Linux);
- **no Node**: the main process, the app host, the terminals and the door all run on the Bun that Electrobun ships.

Each release also builds the Electron version of the same app, so you can compare the two installers yourself.

## Download

From the [Latest release](https://github.com/acrylblends/05-acryl-ade-eb/releases/latest):

| OS | Electrobun (this build) | Electron (for comparison) |
| --- | --- | --- |
| macOS Apple silicon | `ACRYL-ADE-Electrobun-mac-arm64.dmg` | `ACRYL-ADE-Electron-mac-arm64.dmg` |
| Windows x64 / arm64 | `ACRYL-ADE-Electrobun-win-<arch>-Setup.zip` (unzip, run the Setup) | `ACRYL-ADE-Electron-win-<arch>.exe` |
| Linux x64 / arm64 | `ACRYL-ADE-Electrobun-linux-<arch>-Setup.tar.gz` (unpack, run `installer`) | `ACRYL-ADE-Electron-linux-<arch>.deb` |

`sizes-<os>-<arch>.json` in the release holds the measured sizes of both builds. Not signed: on macOS right-click the app and choose Open;
on Windows, if SmartScreen asks, click More info and then Run anyway. On Windows the Setup unpacks for several minutes with Defender on,
and does not start the app: start it from the Start menu.

## Sizes (release v0.1.0, both builds from the same run)

| OS | Electron download | Electrobun download | Electron installed | Electrobun installed |
| --- | ---: | ---: | ---: | ---: |
| macOS arm64 | 205.5 MB | **71.0 MB (-65%)** | 548.1 MB | **263.7 MB (-52%)** |
| Windows x64 | 177.4 MB | **81.6 MB (-54%)** | 598.4 MB | **289.9 MB (-52%)** |
| Windows arm64 | 171.7 MB | **76.5 MB (-55%)** | 599.4 MB | **276.2 MB (-54%)** |
| Linux x64 | 142.6 MB | **84.7 MB (-41%)** | 504.1 MB | **304.0 MB (-40%)** |
| Linux arm64 | 137.1 MB | **83.2 MB (-39%)** | 508.0 MB | **301.2 MB (-41%)** |

Installed = the unpacked app, sum of file sizes (MB = 1,000,000 bytes); `sizes-<os>-<arch>.json` in the release has the parts (shell, app, Git).
The app part is 47.6 MB smaller than in the Electron build: on Bun, for one OS and CPU, `electrobun/slim.mjs` leaves out what never runs there
(packages only Electron or a TypeScript build uses, type declarations, source maps, C/C++ sources, other OSes' native builds, third-party docs),
and Git keeps only the commands ACRYL runs.

Tested from CI builds of the release commit on macOS arm64, Windows 10 x64 and Ubuntu 24.04 x64: the workbench, the agent door, a terminal, a plugin
added and edited while the app runs, nothing left running after closing. A change to the ADE's own plugins restarts its host (as in the Electron
build), which closes its terminals; work in the projects it opens never does.

## How the Electrobun build works

`electrobun/` holds it (the same files as [Small CRM (Electrobun)](https://github.com/acrylblends/03-small-crm-eb)):
`main.ts` is the main process (opens the app in `~/.acryl`, starts the host, opens the window), `bun-node-hooks.mjs` runs the host on Bun,
`bun-pty.cjs` gives terminals on macOS and Linux (Windows keeps node-pty's ConPTY), `run-host.mjs` keeps the host running across edits, and
`slim.mjs` leaves out what never runs on Bun. `npm run pack:electrobun` packs both builds on this machine; `.github/workflows/release.yml`
runs it on every OS, and a tag `v<version>` publishes.

Not there yet compared with the Electron build: no auto-updater, no agent window commands (`acryl window`), no Intel Mac build.

## Start from source

```bash
npm create @acryldev/blends@latest my-ade -- --from acryl.ade
cd my-ade && npm run dev
```


The first screen asks for a model key (Settings > Models). Add a project with the `+` next to Projects.

## Build from this repository

```bash
npm install
npm run dev        # in the ACRYL frame, in your browser
npm run desktop    # in its own window
npm test
npx @acryldev/blends@1.7.12 pack --from . --product "ACRYL ADE"   # an installer for this machine, in dist/
```

## Releases

A tag `v<version>` releases it: `git tag v0.2.3 && git push origin v0.2.3`. The workflow `.github/workflows/release.yml` packs the six
installers (macOS, Windows and Linux, each for arm64 and x64) with the published ACRYL packages (`acrylblends pack` of `@acryldev/blends`)
and publishes them as this repository's Latest release, under the fixed names the download links above use. An installed app looks for
its updates here.

## How it is made

ACRYL ADE is an ordinary Blend: `blend.yaml`, `src/`, `plugins/`, tests. The one difference from the blank app is its frame layer,
`cordis.patch.yml`: where every other Blend mounts the Blends frame (`@acryldev/blends-frame`) at the page's root, ACRYL ADE mounts the
IDE's workbench (`@acryldev/workspace`). The app's own pages still answer under `/app` (`/app/about`), and the agent can grow the app with
plugins like in every Blend.

## Where the shared code comes from

Most of this app is not written here:

- **The library plugins** (`plugins/door`, `acryl-router`, `desktop`, `instance`, `plugin-share` and the others named in
  `plugins/library.json`) are copies of the acrylblends library, from <https://github.com/acrylblends/acrylblends>.
  `plugins/library.lock.json` records the release each came from and a hash of every file. `npx acrylblends upgrade` brings them to the
  newest release; when a file was changed here, it stops, shows the diff and changes nothing (`--force` replaces it and keeps a backup in
  `.acryl/upgrade-backup/`). Fix a library plugin in acrylblends, not here; your own code goes in a plugin of your own under `plugins/`.
- **The frame and its parts** (`@acryldev/blends-frame`, `@acryldev/settings` and the other `@acryldev/*` packages in
  `package.json`) and the framework (`acrylblends`) come from npm, built from the same repository (`ide/` and `packages/`). `npm install`
  installs them; `npx acrylblends upgrade` moves `package.json` to the release it brings.
- **The workbench** (`@acryldev/workspace`, mounted by `cordis.patch.yml`) is ACRYL's IDE workbench ported into the acrylblends
  repository (`ide/acryl-workspace`, whose `provenance.json` names the acryl commit it was ported from and what changed), and published to
  npm from there.

What is this app's own: `blend.yaml`, `cordis.patch.yml`, `src/`, the tests and the release workflow.

## Commands

- `npm run dev`: the workbench, with the agent.
- `npm test`, `npm run check`: the app's tests and type checks.

## Forks

[ACRYL SDE](https://acrylblends.github.io/blends/ai/sde) (`acryl.sde`), the Synthetic Data Engine, is ACRYL ADE plus a pipeline that turns a
codebase into anonymized, reviewed training-data packages.

MIT licence.
