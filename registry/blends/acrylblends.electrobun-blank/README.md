# ACRYL Blends on Electrobun

The ACRYL Blends Blank app (the app `npx @acryldev/create-blends@latest` makes: the frame with sessions and versions on the left, the app in the
middle, chat and the agents on the right) as an installable desktop app on **Electrobun** instead of Electron. Same app, same Program, same data
folder (`~/.acryl/apps/<id>`). Since 0.2.2 the frame host runs on Electrobun's own Bun: no Chromium and no Node in the bundle.

![The Blank app in the Electrobun window on macOS](docs/screenshot.png)

The same release on [Windows](docs/screenshot-windows.png) and [Linux](docs/screenshot-linux.png).

## Download

From the [Latest release](https://github.com/acrylblends/63-electrobun-blank/releases/latest):

| OS | Electrobun build | Electron build of the same app (for comparison) |
| --- | --- | --- |
| macOS (Apple silicon) | `ACRYL-Blends-Electrobun-mac-arm64.dmg` | `ACRYL-Blends-Electron-mac-arm64.dmg` |
| Windows x64 / arm64 | `ACRYL-Blends-Electrobun-win-<x64/arm64>-Setup.zip` (unzip, run the Setup) | `ACRYL-Blends-Electron-win-<x64/arm64>.exe` |
| Linux x64 / arm64 | `ACRYL-Blends-Electrobun-linux-<x64/arm64>-Setup.tar.gz` (unpack, run `installer`) | `ACRYL-Blends-Electron-linux-<x64/arm64>.deb` |

Not signed. macOS: right-click the app and choose Open. Windows: if SmartScreen asks, click More info and then Run anyway. The first start
unpacks the app (macOS about 17 s and a small Setup window to close; Linux about 30 s; Windows 25 to 70 min with Defender scanning each of about 20,000 files,
and the Setup does not start the app: start it from the Start menu).

## Sizes

Installed = the app folder after its first start, `du -sk` on the machine, MB = 1,000,000 bytes. Download = the installer file. Electron =
the official `acrylblends pack` of `@acryldev/blends` 1.7.25 (Electron 44; the app resolves the framework to 1.7.28 at pack time); Electrobun = Electrobun 2.0.7 with the same app payload.

| OS | Electron | Electrobun, host on Node (v0.2.0) | Electrobun, host on Bun (v0.2.2) |
| --- | --- | --- | --- |
| macOS arm64, download | 205.2 | 112.0 | 82.7 (-60%) |
| macOS arm64, installed | 595.8 = shell 308.7 + app 251.0 + Git 36.2 | 506.5 = shell 96.7 + Node 122.6 + app 251.0 + Git 36.2 | 383.9 = shell 96.8 + app 251.0 + Git 36.2 (-36%) |
| Linux x64, download | 142.5 | 123.9 | 91.4 (-36%) |
| Linux x64, installed | 565.7 = shell 296.9 + app 268.8 | 540.0 = shell 144.4 + Node 126.9 + app 268.7 | 413.1 = shell 144.3 + app 268.8 (-27%) |
| Windows x64, download | 177.1 | 113.7 | 87.7 (-50%) |
| Windows x64, installed | 636.4 = shell 386.4 + app 249.9 | 469.4 = shell 125.6 + Node 93.9 + app 249.8 | 375.5 = shell 125.7 + app 249.8 (-41%) |

- Shell: Electron = Electron and Chromium with their helpers; Electrobun = Bun (85 MB on macOS) plus Electrobun's libraries, launcher and,
  on Linux, a 13 MB uninstaller inside the app. The app payload is the same files on both sides.
- Electrobun also keeps a `self-extraction` cache (37.9 MB) and an uninstaller outside the app folder: macOS `~/Library/Application Support/<id>`
  39.9 MB, Linux `~/.local/share/<id>` 51.0 MB, Windows `%LOCALAPPDATA%\<id>` 40.1 MB.
- Measured with `du -sk` (disk blocks). The release's `sizes-*.json` sum file sizes instead, which reads lower for the app payload (about 204 MB
  of files on macOS take 251 MB of 4 KB blocks); the table uses the disk numbers.

## How it works

- `electrobun/main.ts` is Electrobun's main process (Bun). It does for the packed product what `@acryldev/desktop-shell`'s Electron main does,
  with the same steps (`electrobun/shell-core.mjs` is a copy of them): open the product's app in `~/.acryl` (on the first start, make it from
  the bundled Blank app), start the frame host, open one window (the system webview: WKWebView on macOS, WebView2 on Windows, WebKitGTK on
  Linux) on the address it prints, and stop the host when the window closes or the app quits.
- The frame host on Bun: Bun has no `node:module` `registerHooks`, which ACRYL uses to serve the Program (the framework's plugins and packages)
  from the bundle. Instead the Program is linked into the app's source (`node_modules`, `app/`, `frame/`, `scripts/`, the library plugins,
  kept out of `git status` through `.git/info/exclude`), and `electrobun/bun-node-hooks.mjs` gives the four files that import `registerHooks` a
  stand-in. Bun compiles the app's `.tsx` itself. `--no-install` keeps Bun from fetching a missing package from its own cache.
- `electrobun/pack.mjs` packs both: `npx @acryldev/blends pack` (the official Electron product), then an Electrobun bundle from the same files.
  `--host node` builds the 0.2.0 variant (Node in the bundle). `.github/workflows/release.yml` runs it on every OS; a tag `v<version>` publishes.

```sh
npm run pack:electrobun    # this machine's OS and CPU; writes dist/release
```

Hutch (Electrobun's build tool, downloaded on first use into `~/.hutch`) may add a PATH line to your shell profile. Run it in CI or check
`~/.zshrc` afterwards.

## Not the same as the Electron build yet

- No updater (Electrobun has its own update channel; ACRYL's GitHub-release updater is Electron code), no door window calls
  (`acryl window ...`), no Settings > App pages that need the Electron preload, no host restart supervisor.
- On Bun: reloading the app's code in place after an edit (the frame's app generation) is not carried over, and terminals (node-pty) are not tried.
- The window's process is named `bun`; the Dock shows the app's name and icon. On Windows the menu bar shows Edit and Window only.
- No Intel Mac build: Electrobun's DMG step fails on the Intel runner.
- Linux: the app canvas renders light in WebKitGTK where the other two show it dark.

## The app itself

A Cordis app on Node, scaffolded by `acrylblends init`. TypeScript, run by Node with no build step. Every part is a
Cordis plugin.

```sh
npm install
npm run dev        # prints its URL; data lives in ~/.acryl/apps/<id>/data/
npm test
npm run check      # type-check
```

- `src/main.ts` chooses where the app lives (the `@acryldev/instance` package) and starts it.
- `blend.yaml` is the app as data: which plugins it mounts, in what order, with what config and parameters. Switch
  one off with `disabled: true`. `npm run lock` writes `blend.lock.json`: the manifest's digest and a digest of
  every plugin folder, so a diff of the lock shows what changed.
- `src/app.ts` holds the registry of plugins the code provides, and mounts the manifest's rows.
- `src/routes.ts` is your own plugin: it builds an `App` (`import { App } from './plugins/router/src/index.ts'`) and mounts it with `ctx.router.route(prefix, app)`. Routes added to the app after it is mounted are not served. A page mounted at `/x` answers `/x`, not `/x/` (trailing slashes are strict). The router API is documented at https://acrylblends.github.io/docs/framework/the-acryl-framework and in `docs/framework` of the acrylblends repository.
- `plugins/` holds the plugins copied from the ACRYLBLENDS library. They are yours now; edit them freely.
  Add more with `acrylblends add <plugin>`.

`npm run save -- "message"` commits the app with git (and pushes when it has a remote). It refuses a file that looks like
it holds a secret, and refuses to push a private app (anything but `visibility: public` in `blend.yaml`) to a public
remote.

Set `ACRYLBLENDS_HOME` to keep data elsewhere, and `ACRYLBLENDS_PORT` to choose the first port tried.
