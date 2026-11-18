// The Electrobun window (`npm run electrobun`, `npm run electrobun:build`): see electrobun/main.ts. Electrobun 2.0.6, Bun main process, system webview.
import type { ElectrobunConfig } from 'electrobun'

export default {
  app: { name: 'electrobun-blank', identifier: 'io.github.acrylblends.electrobun-blank', version: '0.1.0' },
  runtime: { exitOnLastWindowClosed: true },
  build: {
    mainProcess: 'bun',
    bun: { entrypoint: 'electrobun/main.ts' },
    mac: { bundleCEF: false },
    linux: { bundleCEF: false },
    win: { bundleCEF: false },
  },
} satisfies ElectrobunConfig
