// Electrobun's build tool (Hutch) reads this file; the npm scripts call it through the `electrobun` package, pinned in package.json.
export default {
  scripts: {
    start: ['hutch', 'electrobun', 'dev'],
    build: ['hutch', 'electrobun', 'build', '--env=stable'],
  },
}
