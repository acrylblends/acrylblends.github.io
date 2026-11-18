// The checks on an app entry's two small files, shared by registry-index.ts (an entry in registry/blends/) and sync-blends.ts (a community Blend in its own repository).

/** The file that marks an entry as an app for acrylblends (create-acrylblends makes it). */
export const MARKER = "acryl.template.json";
const LIFECYCLE = ["preinstall", "install", "postinstall", "prepublish", "preprepare", "prepare", "postprepare"];

/** Everything wrong with an acryl.template.json's text; empty when it is sound. */
export function templateProblems(text: string): string[] {
  try {
    const manifest = JSON.parse(text) as Record<string, unknown>;
    const problems: string[] = [];
    if (typeof manifest.name !== "string" || manifest.name.trim() === "") problems.push(`${MARKER} needs a "name"`);
    if (typeof manifest.description !== "string") problems.push(`${MARKER} needs a "description"`);
    const plugins = manifest.plugins ?? [];
    if (!Array.isArray(plugins) || plugins.some(p => typeof p !== "string" || !/^[a-z][a-z0-9-]*$/.test(p))) problems.push(`"plugins" in ${MARKER} is a list of plugin names`);
    return problems;
  } catch {
    return [`${MARKER} is not valid JSON`];
  }
}

/** Everything wrong with a package.json's text: an entry may not define an install script. */
export function packageProblems(text: string): string[] {
  try {
    const pkg = JSON.parse(text) as { scripts?: Record<string, string> };
    return LIFECYCLE.filter(script => typeof pkg.scripts?.[script] === "string").map(script => `package.json defines the install script "${script}"; a registry entry may not`);
  } catch {
    return ["package.json is not valid JSON"];
  }
}
