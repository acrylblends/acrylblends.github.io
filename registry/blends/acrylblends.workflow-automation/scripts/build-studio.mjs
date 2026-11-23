#!/usr/bin/env node
// Builds Workflow Automation's screen (plugins/automation-studio/client/src) into plugins/automation-studio/client/dist: studio.js and studio.css.
// `--watch` rebuilds on every change of the source (the running app serves the new bundle on the next load).
import { build, context } from 'esbuild'

const options = {
  entryPoints: ['plugins/automation-studio/client/src/studio.tsx'],
  outdir: 'plugins/automation-studio/client/dist',
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
