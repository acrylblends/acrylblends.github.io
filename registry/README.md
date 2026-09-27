# The ACRYL Blends registry

Starting points for apps built on ACRYL Blends: **Blank** (the empty house with the builder inside) and **Blueprints** (starter kits specialized enough to start
from). A project started from any of them is its owner's, in their own repository.

```bash
acryl new my-app --from <id>        # e.g. acryl.organizer
```

## Publish a starter

Open a pull request that adds `blends/<id>/`:

- `blend.yaml`: `kind: Blueprint`, `spec.extends` naming the Blueprint it grew from (usually `acryl.blank`), and in `metadata`: an id you own (`yourname.thing`),
  `license`, `visibility: public`, a `category` and a one-line `description`.
- `extensions/`: the plugins it adds (source, no `node_modules`).
- `README.md`: what it is and how to start from it.

CI validates every entry with `@acryl/blends-core` and fails when `index.json` is stale; run the index tool locally to regenerate it. A private or unlicensed entry
is refused. Keeping a starter private needs no registry at all: people start from its git repository (`acryl new my-app --from git@host:you/starter.git`).
A company's private registry is this same layout in its own repository.
