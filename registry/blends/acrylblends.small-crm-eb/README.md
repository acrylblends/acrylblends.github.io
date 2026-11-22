# Small CRM (Electrobun)

The [Small CRM](https://github.com/acrylblends/03-small-crm) Blend in its **smallest build**: an Electrobun app instead of Electron.
Same CRM (deals pipeline with inspector, deals, contacts, companies, follow-ups, pipeline report) inside the full ACRYL Blends frame
with chat and agents, but:

- **no Chromium**: the window is the system webview (WKWebView on macOS, WebView2 on Windows, WebKitGTK on Linux);
- **no Node**: the main process and the app host both run on the Bun that Electrobun ships.

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

## Sizes (release v0.1.2, both builds from the same run)

| OS | Electron download | Electrobun download | Electron installed | Electrobun installed |
| --- | ---: | ---: | ---: | ---: |
| macOS arm64 | 205.8 MB | **83.5 MB (-59%)** | 548.7 MB | **352.9 MB (-36%)** |
| Windows x64 | 177.7 MB | **88.3 MB (-50%)** | 598.9 MB | **353.7 MB (-41%)** |
| Windows arm64 | 172.1 MB | **83.4 MB (-52%)** | 599.9 MB | **340.3 MB (-43%)** |
| Linux x64 | 143.0 MB | **91.7 MB (-36%)** | 504.6 MB | **367.3 MB (-27%)** |
| Linux arm64 | 137.4 MB | **90.3 MB (-34%)** | 508.5 MB | **364.5 MB (-28%)** |

Installed = the unpacked app, sum of file sizes (MB = 1,000,000 bytes); `sizes-<os>-<arch>.json` in the release has the parts.
The Electron shell (Chromium) is 297-386 MB; the Electrobun shell (Bun + native libraries) is 112-159 MB. The app part (the CRM plus the
ACRYL frame, 205-215 MB) is the same in both builds.

## Not there yet compared with Electron

No auto-updater, no agent window commands (`acryl window`), no host restart after a crash, no Intel Mac build. The program installs into
Electrobun's own folder (`~/Library/Application Support/<id>`, `~/.local/share/<id>`, `%LOCALAPPDATA%\<id>`); app data stays in `~/.acryl`.

## Develop

```sh
npm install
npm test          # the CRM's tests
npm run dev       # the app in the ACRYL frame (Node)
node electrobun/pack.mjs --arch arm64 --out out   # both installers for this machine
```

The CRM's features are plugins in `plugins/` (`crm`, `crm-shell`, `pipeline`, `deals`, `contacts`, `companies`, `activities`, `reports`);
`blend.yaml` mounts them. The Electrobun shell is `electrobun/` and `electrobun.config.ts`.
