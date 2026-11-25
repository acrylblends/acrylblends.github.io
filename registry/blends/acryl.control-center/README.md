# ACRYL Control Center

**ACRYL Control Center** as a Blend: the control center of your ACRYL apps. Registry id `acryl.control-center`. This repository is its
source and builds its releases.

- your apps, with their surface (web or desktop), started and stopped from one list;
- a new app from a starter or from a Blend of the registry;
- plugins to pull into an app and to share from it;
- the Blends right panel: chat, Claude Code, Codex, Pi and a terminal.

## Get started

Install ACRYL Control Center in one line. No Node and no admin for the app itself (Linux asks for sudo once if git or a desktop library is missing), the download is checked against GitHub's sha256, and Windows and macOS open it without warnings because it is not browser-downloaded.

**macOS and Linux**
```sh
curl -fsSL https://acryl.dev/install.sh | bash
```

**Windows (PowerShell)**
```powershell
irm https://acryl.dev/install.ps1 | iex
```

**Developers:** `npx acryl@latest`

## Download

The app, ready to install (the latest release, <https://github.com/acrylblends/63-acryl-control-center/releases/latest>):

| | Apple Silicon / ARM | Intel / x64 |
|---|---|---|
| macOS | [ACRYL-Control-Center-mac-arm64.dmg](https://github.com/acrylblends/63-acryl-control-center/releases/latest/download/ACRYL-Control-Center-mac-arm64.dmg) | [ACRYL-Control-Center-mac-x64.dmg](https://github.com/acrylblends/63-acryl-control-center/releases/latest/download/ACRYL-Control-Center-mac-x64.dmg) |
| Windows | [ACRYL-Control-Center-win-arm64.exe](https://github.com/acrylblends/63-acryl-control-center/releases/latest/download/ACRYL-Control-Center-win-arm64.exe) | [ACRYL-Control-Center-win-x64.exe](https://github.com/acrylblends/63-acryl-control-center/releases/latest/download/ACRYL-Control-Center-win-x64.exe) |
| Linux (Debian, Ubuntu) | [ACRYL-Control-Center-linux-arm64.deb](https://github.com/acrylblends/63-acryl-control-center/releases/latest/download/ACRYL-Control-Center-linux-arm64.deb) | [ACRYL-Control-Center-linux-x64.deb](https://github.com/acrylblends/63-acryl-control-center/releases/latest/download/ACRYL-Control-Center-linux-x64.deb) |

The apps are not signed yet. macOS: the first start is right-click > Open. Windows: SmartScreen may ask, More info > Run anyway.
Windows installers are being prepared for free code signing by [SignPath Foundation](https://signpath.org): see the [code signing policy](CODE_SIGNING_POLICY.md).
Linux: `sudo apt install ./ACRYL-Control-Center-linux-x64.deb`. On Windows and Linux it uses the git on your machine.


### Arch Linux and Omarchy

```bash
mkdir acryl-control-center && cd acryl-control-center
curl -LO https://github.com/acrylblends/63-acryl-control-center/releases/latest/download/PKGBUILD
makepkg -si
```

It installs the app in `/opt/acryl-control-center` and `acryl-control-center` on your PATH, with its menu entry. Without installing: download
[ACRYL-Control-Center-linux-x64.tar.gz](https://github.com/acrylblends/63-acryl-control-center/releases/latest/download/ACRYL-Control-Center-linux-x64.tar.gz) (or `-linux-arm64.tar.gz`),
unpack it and run `./acryl-control-center/acryl-control-center`. It runs on Wayland (Hyprland) and X11.

## Start with the `acryl` command

```bash
npx acryl --gui    # in its own window
npx acryl --web    # in your browser
```


`npm run dev` serves it to a browser instead. The apps it lists live in `~/.acryl/apps.json`; new apps are suggested in `~/ACRYL`.

## Build from source

```bash
npm install
npm run dev        # in the ACRYL frame, in your browser
npm run desktop    # in its own window
npm test
npx @acryldev/blends@1.7.12 pack --from . --product "ACRYL Control Center"   # an installer for this machine, in dist/
```

## Releases

A tag `v<version>` releases it: `git tag v0.2.6 && git push origin v0.2.6`. The workflow `.github/workflows/release.yml` packs the six
installers (macOS, Windows and Linux, each for arm64 and x64) with the published ACRYL packages (`acrylblends pack` of `@acryldev/blends`)
and publishes them as this repository's Latest release, under the fixed names the download links above use. An installed app looks for
its updates here.

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
- **The launcher** is the published package `@acryldev/launcher-desktop` (built from <https://github.com/acryldev/acryl>, `plugins/launcher-desktop`), a dependency in `package.json` like the other `@acryldev/*` packages: its Host half is the row `acryl-launcher-desktop` in `blend.yaml` (`src/launcher.ts` tells it where ACRYL's home is), its page is the `lib/page.js` the package ships (`src/routes.ts` serves it), and its tools (`acryl_launcher_apps`, `acryl_launcher_new_app` and the others) go to the chat and to every agent. Nothing of it is copied here; change it in acryl and move the pin.

What is this app's own: `blend.yaml`, `cordis.patch.yml`, `src/` (the root serves the Control Center, the template's first screen is at
`/home`), `assets/`, the tests and the release workflow.

MIT licence.
