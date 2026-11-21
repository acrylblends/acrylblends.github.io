# ACRYL ADE

**ACRYL ADE**, the Agent Development Environment: the ACRYL IDE (<https://github.com/acryldev/acryl>) as one Blend. Registry id `acryl.ade`. This repository is its source and builds its releases. Page: <https://acrylblends.github.io/blends/ai/ade/acryl.ade>.

It opens the IDE's workbench, ported into the Blends framework as `@acryldev/workspace`:

- **left:** your projects, each with its git branches and worktrees, and the chats and terminals open on each;
- **centre:** tabs: the agent's chat (DeepSeek Harness), terminals, files, diffs;
- **right:** what the agent changed, the review of a turn, and the project's files.

The chat is the same agent ACRYL IDE runs, with its shell, file tools and jobs. Claude Code, Codex or any other terminal agent runs in a terminal tab beside it.

## Download

The app, ready to install (the latest release, <https://github.com/acrylblends/05-acryl-ade/releases/latest>):

| | Apple Silicon / ARM | Intel / x64 |
|---|---|---|
| macOS | [ACRYL-ADE-mac-arm64.dmg](https://github.com/acrylblends/05-acryl-ade/releases/latest/download/ACRYL-ADE-mac-arm64.dmg) | [ACRYL-ADE-mac-x64.dmg](https://github.com/acrylblends/05-acryl-ade/releases/latest/download/ACRYL-ADE-mac-x64.dmg) |
| Windows | [ACRYL-ADE-win-arm64.exe](https://github.com/acrylblends/05-acryl-ade/releases/latest/download/ACRYL-ADE-win-arm64.exe) | [ACRYL-ADE-win-x64.exe](https://github.com/acrylblends/05-acryl-ade/releases/latest/download/ACRYL-ADE-win-x64.exe) |
| Linux (Debian, Ubuntu) | [ACRYL-ADE-linux-arm64.deb](https://github.com/acrylblends/05-acryl-ade/releases/latest/download/ACRYL-ADE-linux-arm64.deb) | [ACRYL-ADE-linux-x64.deb](https://github.com/acrylblends/05-acryl-ade/releases/latest/download/ACRYL-ADE-linux-x64.deb) |

The apps are not signed yet. macOS: the first start is right-click > Open. Windows: SmartScreen may ask, More info > Run anyway.
Linux: `sudo apt install ./ACRYL-ADE-linux-x64.deb`. On Windows and Linux ACRYL ADE uses the git on your machine.

Or with the `acryl` command, which makes and runs it from source in `~/.acryl/ade`: `npx acryl ade` (browser) or `npx acryl ade --gui` (window).


### Arch Linux and Omarchy

```bash
mkdir acryl-ade && cd acryl-ade
curl -LO https://github.com/acrylblends/05-acryl-ade/releases/latest/download/PKGBUILD
makepkg -si
```

It installs the app in `/opt/acryl-ade` and `acryl-ade` on your PATH, with its menu entry. Without installing: download
[ACRYL-ADE-linux-x64.tar.gz](https://github.com/acrylblends/05-acryl-ade/releases/latest/download/ACRYL-ADE-linux-x64.tar.gz) (or `-linux-arm64.tar.gz`),
unpack it and run `./acryl-ade/acryl-ade`. It runs on Wayland (Hyprland) and X11.

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

- **The library plugins** (`plugins/acryl-door`, `acryl-router`, `desktop`, `instance`, `plugin-share` and the others named in
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
