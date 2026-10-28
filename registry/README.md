# The Blends registry

Starting points other people published. Each entry is a folder under `blends/<id>/`, and `index.json` lists them all with the **runtime** each one is for:

| Runtime | What the entry is | How to start from it |
| --- | --- | --- |
| `acrylblends` | A whole app for the `acrylblends` framework: `blend.yaml`, `plugins/`, `src/`, `package.json`, `README.md`, and an `acryl.template.json`. | `npm create acrylblends@latest my-app -- --from <id>` |
| `acryl` | A starter for the ACRYL app (a Blueprint whose rows are ACRYL plugins). It runs only inside ACRYL. | Open it in the ACRYL app (<https://acryl.dev>). `create-acrylblends` refuses it with one line saying so. |

A project started from any of them is its owner's, in their own repository: the new app is private, named after its folder, and carries none of the starter's id or licence.

```bash
npm create acrylblends@latest my-notes -- --from acrylblends.notes-desktop    # npm needs the -- before the options
cd my-notes && npm install && npm run dev
```

`--registry github:owner/repo` (or a folder) reads another registry with this same layout, a team's or a workshop's.

## Publish a starter for acrylblends

Open a pull request that adds `blends/<id>/`, where `<id>` is a dotted id you own (`yourlogin.thing`). The folder is your app as it stands, without `node_modules/`, `dist/`, `data/`, and without `docs/framework/` (create adds those back):

- `blend.yaml`: `kind: Blueprint`, and in `metadata` the `id` (the same as the folder name), `name`, `version`, `license` (an SPDX id), `visibility: public`, a `category` and a one-line `description`. Your app made by `acrylblends init` has `visibility: private` and no licence; change them in the entry, not in your own app.
- `acryl.template.json`: `{ "name": "...", "description": "...", "plugins": [] }`. **This file is what marks the entry as an app for acrylblends.** `plugins` lists library plugins the app still needs (added with `npx acrylblends add`); an app that carries its `plugins/` folder lists none.
- `package.json` (its dependencies come with the starter, a desktop starter brings `electron`), `src/`, `plugins/`, `gitignore` (named without the dot), `README.md`: what it is and how to start from it.

CI refuses an entry that: is private or has no licence; lives in another folder than its id; repeats an id; has an `acryl.template.json` that is not valid or an app without `package.json` or `src/`; defines an install script (`preinstall`, `install`, `postinstall`, `prepare`, ...); holds a link, a `node_modules/` or `.git/`; is over 20 MB or 5000 files; or holds what looks like a key. It also makes the app with `create-acrylblends` (nothing is installed or run) and fails when `index.json` is not what `scripts/registry-index.ts` writes: run `bun scripts/registry-index.ts registry` after adding your folder.

## Publish a starter for the ACRYL app

`blends/<id>/` with `blend.yaml` (`kind: Blueprint`, `spec.extends` naming the Blueprint it grew from, usually `acryl.blank`), `plugins/` (the plugins it adds, source, no `node_modules`) and `README.md`. No `acryl.template.json`: that is what makes the entry `runtime: acryl`. People start from it in the ACRYL app.

## Keeping a starter private

Needs no registry at all: people start from its git repository (`npm create acrylblends@latest my-app -- --from github:you/starter`, a repository with an `acryl.template.json`). A company's own registry is this same layout in its own repository: `--registry github:company/registry`.

## The files

`index.json` is written by `scripts/registry-index.ts`: [`@acryl/blends-core`](https://github.com/acryldev/acryl/tree/main/runtime/blends-core)'s index (validation of every `blend.yaml`) plus the `runtime` of each entry. It is served as it is at <https://acrylblends.github.io/registry/index.json>.
