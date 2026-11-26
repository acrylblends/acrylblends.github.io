#!/usr/bin/env node
// Builds Content Machine's screen (plugins/content-studio/client/src) into plugins/content-studio/client/dist: studio.js and studio.css.
// `--watch` rebuilds on every change of the source (the running app serves the new bundle on the next load).
import { build, context } from 'esbuild'

const options = {
  entryPoints: ['plugins/content-studio/client/src/studio.tsx'],
  outdir: 'plugins/content-studio/client/dist',
  bundle: true,
  format: 'esm',
  target: 'es2022',
  jsx: 'automatic',
  minify: true,
  sourcemap: false,
  legalComments: 'linked',
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'info',
}
if (process.argv.includes('--watch')) await (await context(options)).watch()
else await build(options)
