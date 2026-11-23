#!/usr/bin/env node
// The size table of the README from the release's sizes-<os>-<arch>.json files: node electrobun/sizes-table.mjs <folder>
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.argv[2] ?? 'dist/release'
const mb = (n) => (n / 1e6).toFixed(1)
const pct = (a, b) => `${Math.round(((a - b) / b) * 100)}%`
const rows = readdirSync(dir)
  .filter((f) => /^sizes-.*\.json$/u.test(f))
  .sort()
  .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')))
const lines = [
  '| OS | Download: Electron | Download: Electrobun | Installed: Electron | Installed: Electrobun | Electrobun parts: shell + Node + Git + app |',
  '| --- | ---: | ---: | ---: | ---: | --- |',
]
for (const s of rows) {
  const download = Math.max(...s.electrobun.artifacts.filter((a) => !a.file.endsWith('.tar.zst')).map((a) => a.bytes), 0) || s.electrobun.artifacts[0].bytes
  const e = s.electron
  const b = s.electrobun
  lines.push(
    `| ${s.os} ${s.arch} | ${mb(e.installerBytes)} | ${mb(download)} (${pct(download, e.installerBytes)}) | ${mb(e.installedBytes)} | ${mb(b.installedBytes)} (${pct(b.installedBytes, e.installedBytes)}) | ${mb(b.shellBytes)} + ${mb(b.nodeBytes)} + ${mb(b.gitBytes)} + ${mb(b.payloadBytes)} |`,
  )
}
lines.push('', `Electron's parts on the same rows: shell ${rows.map((s) => `${s.os} ${s.arch} ${mb(s.electron.shellBytes)}`).join(', ')}; the app (payload) is the same bytes on both sides.`)
console.log(lines.join('\n'))
