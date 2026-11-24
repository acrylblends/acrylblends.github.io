# ACRYL AOS

**ACRYL AOS** is an agentic operating system for your ACRYL apps, as a Blend (registry id `acryl.aos`, category System > Agentic operating systems).

- A desktop with your apps' icons, folders that group apps and files, a dock, menus (File, View, Go) and Settings (wallpaper, icon size, dock side, chat shown).
- Each app opens in its own window with its own host (the ACRYL launcher's `start`), and can be stopped from its menu.
- One chat drives every app: the frame's chat calls this computer's tools (`desktop_*`, `system_*`) and each running app's own tools through its door (`app_look`, `app_act`, `app_tools`, `app_call`).
- **Last run** shows a chat turn's tool steps (0 tokens) apart from its model steps (the provider's token usage).
- **Save as workflow** turns a run's tool steps into a workflow in the Workflow Automation Blend; **Run again** replays it with no model call.
- Per app: Add to Applications and Export as installer (`acrylblends pack`).

The desktop is one file, `~/.acryl/desktop.json`. The app list is the ACRYL launcher's (`~/.acryl/control-center-apps.json`).

## Start

```sh
npm create acrylblends@latest my-aos -- --from acryl.aos
cd my-aos && npm install && npm run dev
```

The chat needs a model key in the environment (for example `DEEPSEEK_API_KEY`).

## Develop
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
