# electrobun-blank

A Cordis app on Node, scaffolded by `acrylblends init`. TypeScript, run by Node with no build step. Every part is a
Cordis plugin.

This blank app also opens in an **Electrobun** window instead of Electron: the same ACRYL Blends frame (sessions and versions on the left, the
app in the middle, chat and the agents on the right) in a native window that uses the system webview. Try it as a platform:

```sh
npm install
npm run electrobun   # builds the Electrobun shell, starts the frame (npm run dev) and opens it in the window
```

`npm run desktop` still opens the same frame in Electron. Electron stays the default; Electrobun is an option to try.

## Electrobun

- Version: Electrobun 2.0.6 (stable), from npm. Its main process runs on Bun 1.4.4; the window uses WKWebView on macOS, WebView2 on Windows,
  WebKitGTK on Linux (no bundled Chromium, `bundleCEF: false`).
- `electrobun/main.ts` is the whole shell. It does what `npm run desktop` does with the same functions (`plugins/desktop/frame.ts`): it attaches
  to a frame that already runs for this folder, or starts `npm run dev` and opens the address it prints. Closing the window stops a frame it started.
- The frame host stays on Node. The framework loads TypeScript and plugins through `node:module` `registerHooks`, which Bun does not have (the app
  fails on Bun 1.4.4 with `Export named 'registerHooks' not found in module 'node:module'`), and the terminals use node-pty, built for Node.
- First run: the `electrobun` package downloads its build tool (Hutch, about 130 MB, into `~/.hutch`) and **adds a PATH line to your shell
  profile** (`~/.zshrc` on macOS), even when `HOME` points elsewhere. Remove the `# Hutch` lines afterwards if you do not want them.
- Platforms: tried on macOS arm64. Electrobun also supports Windows x64 and Linux x64/arm64 (Linux needs GTK3, WebKitGTK 4.1, AppIndicator and
  librsvg); not tried here. It does not support Intel Macs and does not cross-compile: build on each OS. `npm run electrobun` uses a POSIX shell.
- Not done yet: a packed, installable Electrobun app of this Blend. The shell is built and measured below, but a packed app must also carry
  Node and the frame's packages, and `electrobun/main.ts` runs only from the app folder for now.

## Sizes

Measured on macOS arm64, 2026-11-18. MB = 1,000,000 bytes.

| Part | Electron 44.9.3 | Electrobun 2.0.6 |
|---|---|---|
| Shell, installed | 309.4 MB | 95.7 MB (ships as 33.5 MB, unpacks on first launch) |
| Shell, DMG | 141.1 MB | 33.1 MB (Electrobun's own DMG) |
| Node to run the frame host | none: Electron runs it as Node | 121.3 MB (Node 24.19.0) |
| The frame's packages (`node_modules` without dev packages) | 451.6 MB | 451.6 MB |
| **Total, installed** | **761.0 MB** | **668.6 MB (-12%)** |

- The shell alone is 69% smaller installed and 77% smaller as a DMG.
- The whole app is only 12% smaller, because Electron doubles as the Node that runs the frame host, while Electrobun has to ship Node beside
  Bun, and the frame's packages (451.6 MB) are the same either way. The totals are added up from the measured parts, not from a packed app.
- If the frame host could run on Electrobun's Bun (it cannot until Bun has `registerHooks`), Node would drop out: 547.3 MB, 28% smaller.
- The size lever that does not depend on the shell is the frame's packages.
- Earlier measurements from ACRYL (spec 042): a Deno-packed ACRYL was 53% smaller installed than the pruned Electron one (210.3 MB vs 447.1 MB);
  a `bun --compile` executable is 61 MB on macOS against Node's 121 MB.
- Not measured: start time and memory.

```sh
npm install
npm run dev        # prints its URL; data lives in ~/.acryl/apps/<id>/data/
npm test
npm run check      # type-check
```

- `src/main.ts` chooses where the app lives (`plugins/instance`) and starts it.
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
