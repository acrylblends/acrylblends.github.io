# ACRYL Blends

The registry site for ACRYL Blends — the practical framework for composing
stable software out of Cordis plugins. A Cordis plugin is the minimal unit
(the "cell"); a Blend is a complete, pullable composition of plugins; this
site is the Blend-level registry, the Docker-Hub analog in the model
`Cordis plugin : npm :: Blend : Docker image :: Blend registry : Docker Hub`.

See the sibling registry for plugins themselves:
[cordisplugins](https://github.com/cordisplugins), and the design spec this
site implements:
[specs/036-cordis-ecosystem-and-acryl-blends](https://github.com/acryldev/acryl/tree/main/specs/036-cordis-ecosystem-and-acryl-blends)
in `acryldev/acryl`.

## Stack

Plain React + Vite + TypeScript + Tailwind CSS v4 + React Router, built as a
static site and deployed to GitHub Pages on every push to `main` via
`.github/workflows/deploy.yml`.

## Development

```sh
bun install
bun run dev
```

## Build

```sh
bun run build   # outputs dist/, with dist/404.html mirroring index.html
                # so client-side routes survive a hard reload on Pages
```
