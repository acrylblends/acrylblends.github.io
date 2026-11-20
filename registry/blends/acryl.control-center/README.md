# ACRYL Control Center

**ACRYL Control Center** as a Blend: the control center of your ACRYL apps. Registry id `acryl.control-center`. Source:
<https://github.com/acryldev/acryl/tree/main/apps/acryl-control-center> (the ACRYL monorepo).

- your apps, with their surface (web or desktop), started and stopped from one list;
- a new app from a starter or from a Blend of the registry;
- plugins to pull into an app and to share from it;
- the Blends right panel: chat, Claude Code, Codex, Pi and a terminal.

## Download

The app, ready to install (release 0.2.2, <https://github.com/acryldev/acryl/releases/tag/control-center-v0.2.2>):

| | Apple Silicon / ARM | Intel / x64 |
|---|---|---|
| macOS | [ACRYL-Control-Center-mac-arm64.dmg](https://github.com/acryldev/acryl/releases/download/control-center-v0.2.2/ACRYL-Control-Center-mac-arm64.dmg) | [ACRYL-Control-Center-mac-x64.dmg](https://github.com/acryldev/acryl/releases/download/control-center-v0.2.2/ACRYL-Control-Center-mac-x64.dmg) |
| Windows | [ACRYL-Control-Center-win-arm64.exe](https://github.com/acryldev/acryl/releases/download/control-center-v0.2.2/ACRYL-Control-Center-win-arm64.exe) | [ACRYL-Control-Center-win-x64.exe](https://github.com/acryldev/acryl/releases/download/control-center-v0.2.2/ACRYL-Control-Center-win-x64.exe) |
| Linux (Debian, Ubuntu) | [ACRYL-Control-Center-linux-arm64.deb](https://github.com/acryldev/acryl/releases/download/control-center-v0.2.2/ACRYL-Control-Center-linux-arm64.deb) | [ACRYL-Control-Center-linux-x64.deb](https://github.com/acryldev/acryl/releases/download/control-center-v0.2.2/ACRYL-Control-Center-linux-x64.deb) |

The apps are not signed yet. macOS: the first start is right-click > Open. Windows: SmartScreen may ask, More info > Run anyway.
Linux: `sudo apt install ./ACRYL-Control-Center-linux-x64.deb`. On Windows and Linux it uses the git on your machine.

## Start with the `acryl` command

```bash
npx acryl --gui    # in its own window
npx acryl --web    # in your browser
```

The first start makes it in `~/.acryl/control-center` and installs it (about a minute). Its source is `apps/acryl-control-center` in the monorepo.

The apps it lists live in `~/.acryl/apps.json`; new apps are suggested in `~/ACRYL`.

MIT licence.
