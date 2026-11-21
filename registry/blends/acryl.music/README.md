# Music

A step sequencer / drum machine: four tracks, 8 or 16 steps, ready-made styles, saved patterns, played with WebAudio in the page (synthesized, no audio files). The first screen is the drum machine itself: the starter's own React UI (`plugins/music/client.js`, moved onto the page with the same views, controls, texts and styles; React 18 is served by the app). The same operations are JSON routes under `/music` (`GET /state`, `/describe`, `POST /style`, `/tempo`, `/steps`, `/beats`, `/step`, `/track`, `/clear`, `/pattern`, `/save`, `/load`, `/delete`), which is how the agent inside the app plays it; the page picks up the agent's changes within a moment. The rules are in `plugins/music/lib/domain.js` (pure, tested), the data in `music.json` in the app's home. It grew from the earlier ACRYL-app starter of the same name: `domain.js` and `store.js` are that code, unchanged, and its own domain tests run with the app's (`test/music-domain.test.ts`); `plugins/music/index.ts` is the adapter.

Below is what every app made by `acrylblends init` carries.

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
