// Where a Blend's source lives on GitHub, in the acrylblends org. A repository is named `<category number>-<name>`: 05 is AI on /blends.
// Written by hand when a Blend gets its own repository, like the placements in registry-placement.ts.
export interface Source {
  /** The repository's page, https://github.com/acrylblends/<name>. */
  readonly url: string;
  /** The folder `git clone` makes. */
  readonly folder: string;
}

const repo = (name: string): Source => ({ url: `https://github.com/acrylblends/${name}`, folder: name });

export const registrySources: Record<string, Source> = {
  "acryl.ade": repo("05-acryl-ade"),
  "acryl.sde": repo("05-acryl-sde"),
};

/** The commands that run a Blend straight from its repository. */
export function cloneCommand(source: Source): string {
  return `git clone ${source.url}.git\ncd ${source.folder} && npm install && npm run dev`;
}
