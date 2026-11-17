// Where a Blend's source lives on GitHub, in the acrylblends org. A repository is named `<category number>-<name>`: 05 is AI on /blends.
// Written by hand when a Blend gets its own repository, like the placements in registry-placement.ts.
export interface Source {
  /** The repository's page, https://github.com/acrylblends/<name>. */
  readonly url: string;
  /** The folder `git clone` makes. */
  readonly folder: string;
  /** The installable app of each OS and CPU, from the repository's latest GitHub release (its Release workflow builds them). */
  readonly downloads?: readonly Download[];
}

export interface Download {
  readonly os: "macOS" | "Windows" | "Linux";
  readonly cpu: "Apple Silicon" | "Intel" | "ARM" | "x64";
  readonly url: string;
}

const repo = (name: string, downloads?: readonly Download[]): Source => ({ url: `https://github.com/acrylblends/${name}`, folder: name, downloads });

/** The six files a Blend's Release workflow publishes, named `<Product>-<mac|win|linux>-<arm64|x64>`. */
function releaseFiles(name: string, product: string): readonly Download[] {
  const file = (platform: string, arch: string, extension: string) =>
    `https://github.com/acrylblends/${name}/releases/latest/download/${product}-${platform}-${arch}.${extension}`;
  return [
    { os: "macOS", cpu: "Apple Silicon", url: file("mac", "arm64", "dmg") },
    { os: "macOS", cpu: "Intel", url: file("mac", "x64", "dmg") },
    { os: "Windows", cpu: "x64", url: file("win", "x64", "exe") },
    { os: "Windows", cpu: "ARM", url: file("win", "arm64", "exe") },
    { os: "Linux", cpu: "x64", url: file("linux", "x64", "deb") },
    { os: "Linux", cpu: "ARM", url: file("linux", "arm64", "deb") },
  ];
}

export const registrySources: Record<string, Source> = {
  "acryl.ade": repo("05-acryl-ade", releaseFiles("05-acryl-ade", "ACRYL-ADE")),
  "acryl.sde": repo("05-acryl-sde"),
};

/** The commands that run a Blend straight from its repository. */
export function cloneCommand(source: Source): string {
  return `git clone ${source.url}.git\ncd ${source.folder} && npm install && npm run dev`;
}
