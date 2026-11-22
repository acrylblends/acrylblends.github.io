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

## Why it is smaller

An Electron app carries a whole Chromium (about 300-390 MB installed) and the ACRYL host needed Node on top. Here the shell is Bun plus
Electrobun's small native libraries (about 97 MB on macOS), and the host runs on that same Bun. Measured on the Blank Blend with the same
setup ([63-electrobun-blank](https://github.com/acrylblends/63-electrobun-blank)): download 36-60% smaller, installed 27-41% smaller.
The rest is the app's own code and the ACRYL framework (about 250 MB), which both builds share.

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
