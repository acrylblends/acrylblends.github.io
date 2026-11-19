import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import {
  compareVersions,
  copyEntry,
  decide,
  highestTag,
  type Product,
  PRODUCTS,
  runDecisions,
  setVersion,
  tagVersion,
} from "./sync-products.ts";

/** A registry with both product entries, at version 0.1.0, in a fresh temporary folder. */
function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "sync-products-test-"));
  for (const product of PRODUCTS) {
    const dir = join(root, "blends", product.id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "blend.yaml"),
      [
        "# The app as data, in ACRYL's Blend format (blends.acryl.dev/v1alpha1).",
        "apiVersion: blends.acryl.dev/v1alpha1",
        "kind: Blueprint",
        "metadata:",
        `  id: ${product.id}`,
        `  name: "${product.id}"`,
        "  version: 0.1.0",
        "  license: MIT",
        "  visibility: public",
        "spec:",
        "  runtime: cordis",
        "",
      ].join("\n"),
    );
    writeFileSync(join(dir, "README.md"), `${product.id}\n`);
  }
  return root;
}

/** The entry's metadata.version, as the CLI reads it. */
function entryVersionAt(root: string): (product: Product) => string | undefined {
  return product => {
    const manifest = parse(readFileSync(join(root, "blends", product.id, "blend.yaml"), "utf8")) as {
      metadata?: { version?: string };
    };
    return manifest.metadata?.version;
  };
}

/** Every file of a tree, by relative path, with its bytes: what "left exactly as it is" compares. */
function snapshot(dir: string): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (folder: string) => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) walk(path);
      else files[path.slice(dir.length + 1)] = readFileSync(path, "utf8");
    }
  };
  walk(dir);
  return files;
}

test("a product tag names a plain version; other tags are not this product's", () => {
  expect(tagVersion("ade-v0.1.21", "ade-v")).toBe("0.1.21");
  expect(tagVersion("ade-v1", "ade-v")).toBe("1");
  expect(tagVersion("control-center-v0.2.0", "ade-v")).toBeUndefined();
  expect(tagVersion("ade-v1.0.0-rc.1", "ade-v")).toBeUndefined();
  expect(tagVersion("ade-v", "ade-v")).toBeUndefined();
});

test("the highest tag wins by numeric parts, unrelated tags are ignored", () => {
  expect(highestTag(["ade-v0.1.9", "control-center-v9.0.0", "v9.9.9", "ade-v0.1.21", "ade-v0.1.20"], "ade-v")).toEqual({
    tag: "ade-v0.1.21",
    version: "0.1.21",
  });
  expect(highestTag([], "ade-v")).toBeUndefined();
  expect(highestTag(["v1.0.0", "create-v1.0.0"], "ade-v")).toBeUndefined();
  expect(compareVersions("0.1.10", "0.1.9")).toBeGreaterThan(0);
  expect(compareVersions("0.1.0", "0.1")).toBe(0);
  expect(compareVersions("0.1.0", "0.2.0")).toBeLessThan(0);
});

test("no tag: no product updates", () => {
  const decisions = decide([], () => "0.1.0");
  expect(decisions.every(decision => !decision.update && decision.tag === undefined)).toBe(true);
});

test("a tag updates only when the entry is behind it", () => {
  const decideAt = (current: string | undefined, tags: readonly string[]) =>
    decide(tags, (product: Product) => (product.id === "acryl.ade" ? current : undefined));
  expect(decideAt("0.1.0", ["ade-v0.1.21"]).find(decision => decision.product.id === "acryl.ade")).toMatchObject({
    update: true,
    tag: { tag: "ade-v0.1.21", version: "0.1.21" },
  });
  expect(decideAt("0.1.21", ["ade-v0.1.21"]).find(decision => decision.product.id === "acryl.ade")?.update).toBe(false);
  expect(decideAt("0.2.0", ["ade-v0.1.21"]).find(decision => decision.product.id === "acryl.ade")?.update).toBe(false);
  expect(decideAt(undefined, ["ade-v0.1.21"]).find(decision => decision.product.id === "acryl.ade")?.update).toBe(true);
  expect(decideAt("0.1.0", ["ade-v0.1.21"]).find(decision => decision.product.id === "acryl.control-center")?.update).toBe(false);
});

test("with no tag yet both entries stay byte-identical and nothing is written", () => {
  const root = fixture();
  try {
    const before = snapshot(root);
    const logs: string[] = [];
    let copies = 0;
    const problems = runDecisions(decide([], entryVersionAt(root)), {
      copy: () => {
        copies += 1;
      },
      log: line => logs.push(line),
      writeIndex: () => {
        throw new Error("index.json must not be written when nothing changed");
      },
    });
    expect(copies).toBe(0);
    expect(problems).toEqual([]);
    expect(snapshot(root)).toEqual(before);
    expect(logs.some(line => line.includes("no ade-v* tag yet"))).toBe(true);
    expect(logs.some(line => line.includes("no control-center-v* tag yet"))).toBe(true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a fake tag regenerates only its product, then writes the index", () => {
  const root = fixture();
  try {
    const logs: string[] = [];
    const copies: string[] = [];
    let writes = 0;
    const problems = runDecisions(decide(["ade-v9.9.9"], entryVersionAt(root)), {
      copy: (product, tag, version) => {
        copies.push(`${product.id} ${tag} ${version}`);
        setVersion(join(root, "blends", product.id, "blend.yaml"), version);
      },
      log: line => logs.push(line),
      writeIndex: () => {
        writes += 1;
        return ["refused blends/x: a fixture's problem"];
      },
    });
    expect(copies).toEqual(["acryl.ade ade-v9.9.9 9.9.9"]);
    expect(writes).toBe(1);
    expect(problems).toEqual(["refused blends/x: a fixture's problem"]);
    expect(entryVersionAt(root)(PRODUCTS[0]!)).toBe("9.9.9");
    expect(entryVersionAt(root)(PRODUCTS[1]!)).toBe("0.1.0");
    expect(logs).toContain("generated registry/blends/acryl.ade from ade-v9.9.9");
    expect(logs.some(line => line.includes("no control-center-v* tag yet"))).toBe(true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("copyEntry keeps the entry's file set: gitignore without the dot, no build or tool folders", () => {
  const scratch = mkdtempSync(join(tmpdir(), "sync-products-copy-"));
  try {
    const source = join(scratch, "app");
    for (const file of [
      ".gitignore",
      ".gitattributes",
      "acryl.template.json",
      "blend.yaml",
      "package.json",
      "src/app.ts",
      "docs/notes.md",
      "docs/framework/README.md",
      "node_modules/left/index.js",
      "dist/app.js",
      "data/state.json",
      ".git/HEAD",
      ".github/workflows/release.yml",
      ".acryl/home.json",
      ".acrylblends/bundle.json",
    ]) {
      mkdirSync(join(source, file, ".."), { recursive: true });
      writeFileSync(join(source, file), file);
    }
    const target = join(scratch, "entry");
    copyEntry(source, target);
    const files = Object.keys(snapshot(target)).sort();
    expect(files).toEqual([".gitattributes", "acryl.template.json", "blend.yaml", "docs/notes.md", "gitignore", "package.json", "src/app.ts"].sort());
    expect(readFileSync(join(target, "gitignore"), "utf8")).toBe(".gitignore");
    expect(readFileSync(join(target, "docs/notes.md"), "utf8")).toBe("docs/notes.md");
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("setVersion changes one line and leaves the comments and the other keys", () => {
  const scratch = mkdtempSync(join(tmpdir(), "sync-products-version-"));
  try {
    const file = join(scratch, "blend.yaml");
    const text = [
      "# The app as data.",
      "apiVersion: blends.acryl.dev/v1alpha1",
      "kind: Blueprint",
      "metadata:",
      "  id: acryl.ade",
      "  version: 0.1.0",
      "  license: MIT",
      "spec:",
      "  runtime: cordis",
      "",
    ].join("\n");
    writeFileSync(file, text);
    setVersion(file, "0.1.21");
    expect(readFileSync(file, "utf8")).toBe(text.replace("  version: 0.1.0", "  version: 0.1.21"));
    writeFileSync(file, "apiVersion: blends.acryl.dev/v1alpha1\n");
    expect(() => setVersion(file, "0.2.0")).toThrow("no metadata.version");
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
