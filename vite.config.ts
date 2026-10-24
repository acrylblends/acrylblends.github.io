import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { copyFileSync, cpSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// GitHub Pages serves this repo at the domain root (a <user>.github.io "user
// site" repo, not a project-pages subpath), so base stays "/".
export default defineConfig({
  base: "/",
  plugins: [
    react(),
    tailwindcss(),
    {
      // GitHub Pages has no server-side rewrite for a client-routed SPA, so
      // any deep link (e.g. /blends/developer) 404s on a hard reload unless
      // a 404.html exists. Serving a copy of index.html as 404.html is the
      // standard SPA-on-Pages workaround: Pages falls back to it, and the
      // app's own router then resolves the real path client-side.
      name: "copy-index-to-404",
      closeBundle() {
        copyFileSync(resolve(__dirname, "dist/index.html"), resolve(__dirname, "dist/404.html"));
      },
    },
    {
      // GitHub Pages answers a path that is not a file with HTTP 404 and only then serves 404.html, so search engines and link previews treat a client-routed page as
      // missing. Every page of the framework docs (src/docs/framework, rendered at /docs) therefore gets a real dist/docs/<page>/index.html: the same app shell with the
      // page's own title and description, answering 200. The router then renders the page client-side as before.
      name: "docs-real-routes",
      closeBundle() {
        const root = resolve(__dirname, "src/docs/framework");
        const shell = readFileSync(resolve(__dirname, "dist/index.html"), "utf8");
        const files = (dir: string): string[] => readdirSync(dir).flatMap((name) => statSync(resolve(dir, name)).isDirectory() ? files(resolve(dir, name)) : [resolve(dir, name)]);
        const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
        for (const file of files(root).filter((f) => f.endsWith(".md"))) {
          const key = file.slice(root.length + 1).replace(/\.md$/, "");
          const markdown = readFileSync(file, "utf8");
          const title = /^#\s+(.+)$/m.exec(markdown)?.[1]?.trim() ?? key;
          const lead = markdown.split("\n").find((line) => line.trim() !== "" && !/^(#|>|```|\||\*\*|-|\d+\.)/.test(line.trim()))?.replace(/[`*_]|\[([^\]]+)\]\([^)]*\)/g, "$1").trim().slice(0, 200) ?? "";
          const html = shell
            .replace(/<title>[^<]*<\/title>/, `<title>${escape(title)} - Acryl documentation</title>`)
            .replace(/(<meta name="description" content=")[^"]*(")/, `$1${escape(lead || `Acryl framework documentation: ${title}.`)}$2`);
          const dir = key === "README" ? resolve(__dirname, "dist/docs") : resolve(__dirname, "dist/docs", key);
          mkdirSync(dir, { recursive: true });
          writeFileSync(resolve(dir, "index.html"), html);
        }
        const license = resolve(__dirname, "dist/docs/license");
        mkdirSync(license, { recursive: true });
        writeFileSync(resolve(license, "index.html"), shell.replace(/<title>[^<]*<\/title>/, "<title>License - Acryl documentation</title>"));
      },
    },
    {
      // The registry (registry/: starters, their plugins, index.json) is served as it is at /registry/, so the ACRYL CLI and anyone
      // else can fetch index.json and a starter's files over HTTP. Git clients read the same folder from the repository (`#registry`).
      name: "copy-registry",
      closeBundle() {
        cpSync(resolve(__dirname, "registry"), resolve(__dirname, "dist/registry"), { recursive: true });
      },
    },
  ],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      // The UI registry gallery (spec 038-ui-component-library) renders the real registry
      // component source unmodified; this swaps its one runtime import for a working, plain
      // stand-in instead of the ACRYL app's own primitives package, which this site cannot
      // pull in (internal, CSS-coupled to the app).
      "@deepseek-ai/dsh-client-ui-primitives": resolve(__dirname, "src/ui-registry/preview-primitives.tsx"),
    },
  },
});
