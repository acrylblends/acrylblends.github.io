import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { copyFileSync, cpSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { blends, categories, docGroups, slugify } from "./src/lib/content";
import { posts } from "./src/lib/blog";
import { cordisGroups } from "./src/lib/cordis-tutorial";

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
      // missing. Every page of the site therefore gets a real dist/<route>/index.html: the same app shell with the page's own title and description, answering 200. The router
      // then renders the page client-side as before. The routes are the ones App.tsx declares, enumerated from the data each of them reads.
      name: "real-routes",
      closeBundle() {
        const dist = resolve(__dirname, "dist");
        const shell = readFileSync(resolve(dist, "index.html"), "utf8");
        const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
        const routes = new Map<string, { title: string; description: string }>();
        const add = (path: string, title: string, description: string) => routes.set(path, { title, description });
        const site = "ACRYL Blends";
        add("/blends", "Browse Blends", "Pull a proven starting point from the Blend registry.");
        add("/ui", "UI registry", "The component registry the ACRYL interface is built from.");
        add("/cordis", "Cordis primer", "The Cordis plugin protocol, from the first plugin to a running instance.");
        add("/ecosystem", "Ecosystem", "How Cordis plugins, ACRYL Blends and registries fit together.");
        for (const page of ["three-layers", "business-model", "roadmap"])
          add(`/ecosystem/${page}`, page.replaceAll("-", " ").replace(/\b\w/g, (c) => c.toUpperCase()), "How the ACRYL Blends ecosystem fits together.");
        add("/blog", "Blog", "Essays and release notes from the ACRYL Blends project.");
        for (const post of posts) add(`/blog/${post.slug}`, post.title, post.excerpt);
        for (const category of categories) {
          add(`/blends/${category.slug}`, category.name, `Blends in the ${category.name} category.`);
          for (const sub of category.subs) add(`/blends/${category.slug}/${slugify(sub)}`, sub, `Blends for ${sub}.`);
        }
        for (const blend of blends) add(`/blends/b/${blend.slug}`, blend.name, blend.description);
        const registry = JSON.parse(readFileSync(resolve(__dirname, "registry/index.json"), "utf8")) as { entries: { id: string; name: string; description: string }[] };
        for (const entry of registry.entries) add(`/blends/b/${entry.id}`, entry.name, entry.description);
        add("/docs/blends", "Blends guide", "Practical guides for pulling a Blend, authoring Cordis plugins in place, and publishing stable compositions.");
        for (const group of docGroups) {
          add(`/docs/blends/${group.slug}`, group.title, `ACRYL Blends documentation: ${group.title}.`);
          for (const item of group.items) add(`/docs/blends/${group.slug}/${slugify(item)}`, item, `ACRYL Blends documentation: ${item}.`);
        }
        for (const group of cordisGroups) {
          add(`/cordis/${group.slug}`, group.title, group.description);
          for (const item of group.items) add(`/cordis/${group.slug}/${slugify(item)}`, item, `Cordis primer: ${item}.`);
        }
        // The framework docs (src/docs/framework, rendered at /docs): one page per markdown file.
        const root = resolve(__dirname, "src/docs/framework");
        const files = (dir: string): string[] => readdirSync(dir).flatMap((name) => statSync(resolve(dir, name)).isDirectory() ? files(resolve(dir, name)) : [resolve(dir, name)]);
        for (const file of files(root).filter((f) => f.endsWith(".md"))) {
          const key = file.slice(root.length + 1).replace(/\.md$/, "");
          const markdown = readFileSync(file, "utf8");
          const title = /^#\s+(.+)$/m.exec(markdown)?.[1]?.trim() ?? key;
          const lead = markdown.split("\n").find((line) => line.trim() !== "" && !/^(#|>|```|\||\*\*|-|\d+\.)/.test(line.trim()))?.replace(/[`*_]|\[([^\]]+)\]\([^)]*\)/g, "$1").trim().slice(0, 200) ?? "";
          add(key === "README" ? "/docs" : `/docs/${key}`, `${title} - Acryl documentation`, lead || `Acryl framework documentation: ${title}.`);
        }
        add("/docs/license", "License - Acryl documentation", "The license of the Acryl framework documentation.");
        for (const [path, page] of routes) {
          const title = page.title.includes("documentation") ? page.title : `${page.title} - ${site}`;
          const html = shell
            .replace(/<title>[^<]*<\/title>/, `<title>${escape(title)}</title>`)
            .replace(/(<meta name="description" content=")[^"]*(")/, `$1${escape(page.description)}$2`);
          const dir = resolve(dist, `.${path}`);
          mkdirSync(dir, { recursive: true });
          writeFileSync(resolve(dir, "index.html"), html);
        }
        console.log(`real-routes: ${routes.size} pages emitted as real index.html files`);
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
