# Small CRM (Electrobun)

The [Small CRM](https://github.com/acrylblends/03-small-crm) Blend in its **smallest build**: an Electrobun app instead of Electron.
Same CRM (deals pipeline with inspector, deals, contacts, companies, follow-ups, pipeline report) inside the full ACRYL Blends frame
with chat and agents, but:

- **no Chromium**: the window is the system webview (WKWebView on macOS, WebView2 on Windows, WebKitGTK on Linux);
- **no Node**: the main process, the app host, the agents' terminals and the door all run on the Bun that Electrobun ships.

This is the most size-optimized way an ACRYL Blend ships today. Each release also builds the Electron version of the same app, so you can
compare the two installers yourself.

## Download

From the [Latest release](https://github.com/acrylblends/03-small-crm-eb/releases/latest):

| OS | Electrobun (this build) | Electron (for comparison) |
| --- | --- | --- |
| macOS Apple silicon | `Small-CRM-Electrobun-mac-arm64.dmg` | `Small-CRM-Electron-mac-arm64.dmg` |
| Windows x64 / arm64 | `Small-CRM-Electrobun-win-<arch>-Setup.zip` | `Small-CRM-Electron-win-<arch>.exe` |
| Linux x64 / arm64 | `Small-CRM-Electrobun-linux-<arch>-Setup.tar.gz` | `Small-CRM-Electron-linux-<arch>.deb` |

`sizes-<os>-<arch>.json` in the release holds the measured sizes of both builds. Not signed: on macOS right-click the app and choose Open;
on Windows, if SmartScreen asks, click More info and then Run anyway. The first start unpacks the app (on Windows with Defender on this
takes minutes).

## Sizes (release v0.1.3, both builds from the same run)

| OS | Electron download | Electrobun download | Electron installed | Electrobun installed |
| --- | ---: | ---: | ---: | ---: |
| macOS arm64 | 205.8 MB | **71.0 MB (-65%)** | 548.7 MB | **264.2 MB (-52%)** |
| Windows x64 | 177.7 MB | **82.0 MB (-54%)** | 599.0 MB | **290.5 MB (-52%)** |
| Windows arm64 | 172.1 MB | **76.8 MB (-55%)** | 599.9 MB | **276.7 MB (-54%)** |
| Linux x64 | 143.0 MB | **85.0 MB (-41%)** | 504.6 MB | **304.6 MB (-40%)** |
| Linux arm64 | 137.4 MB | **83.5 MB (-39%)** | 508.6 MB | **301.8 MB (-41%)** |

Installed = the unpacked app, sum of file sizes (MB = 1,000,000 bytes); `sizes-<os>-<arch>.json` in the release has the parts (shell, app, Git).
Since 0.1.3 the app part is 47 MB smaller than in the Electron build: on Bun, for one OS and CPU, `electrobun/slim.mjs` leaves out what never runs
there (packages only Electron or a TypeScript build uses, type declarations, source maps, C/C++ sources of native modules, other OSes' native
builds, third-party docs; Bun compiles TypeScript itself), and Git keeps only the commands ACRYL runs.

## Live changes on Bun

An agent in the right panel (or you, in an editor) adds a plugin (`plugins/<name>/index.ts` plus its row in `blend.yaml`) or edits the app's
code while it runs: the frame loads the change inside the running host, the plugin is served within 2 s, and the agent's terminal stays open.
The host is started again only after it crashed, on the next saved change (`electrobun/run-host.mjs`; the Electron build restarts its host on
every change, which closes the terminals). A new plugin may import the framework by name (`import { Acryl } from 'acrylblends'`).
Tested from CI builds of the release commit on macOS arm64, Windows 10 x64 and Ubuntu 24.04 x64.

## Not there yet compared with Electron

No auto-updater, no agent window commands (`acryl window`), no Intel Mac build. The program installs into Electrobun's own folder
(`~/Library/Application Support/<id>`, `~/.local/share/<id>`, `%LOCALAPPDATA%\<id>`); app data stays in `~/.acryl`. On Windows the Setup
unpacks for about 8 minutes with Defender on.

## Develop

```sh
npm install
npm test          # the CRM's tests
npm run dev       # the app in the ACRYL frame (Node)
node electrobun/pack.mjs --arch arm64 --out out   # both installers for this machine
```

The CRM's features are plugins in `plugins/` (`crm`, `crm-shell`, `pipeline`, `deals`, `contacts`, `companies`, `activities`, `reports`);
`blend.yaml` mounts them. The Electrobun shell is `electrobun/` and `electrobun.config.ts`.
