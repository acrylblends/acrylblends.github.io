import { CLIENT_SCRIPT } from './client.ts'
import { formatBytes, formatDuration } from './format.ts'
import type { SortBy } from './kill-list.ts'
import type { Disk, Memory, ProcessInfo, Snapshot } from './system.ts'

export interface KillRow extends ProcessInfo {
  /** Set when the process is not offered for ending, and says why. */
  readonly protectedReason?: string
}

/** What `/api/snapshot` answers and the page draws: the machine, and the heaviest processes with what may be done to each. */
export interface View extends Omit<Snapshot, 'processes'> {
  readonly sort: SortBy
  readonly processCount: number
  readonly heaviest: readonly KillRow[]
}

const STYLE = `
:root { color-scheme: light dark; --bg: #f6f7f9; --card: #fff; --text: #1c1f24; --dim: #626b78; --line: #dfe3e8; --ok: #2f9e6a; --warn: #d9962b; --high: #d64545; --accent: #3b5bdb; }
@media (prefers-color-scheme: dark) { :root { --bg: #0f1114; --card: #181b20; --text: #e7e9ec; --dim: #9aa3b0; --line: #2a2f37; --accent: #7b93ff; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.45 system-ui, sans-serif; }
main { max-width: 920px; margin: 0 auto; padding: 24px 16px 48px; }
header { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 16px; margin-bottom: 16px; }
h1 { margin: 0; font-size: 22px; }
h2 { margin: 0 0 10px; font-size: 13px; letter-spacing: .06em; text-transform: uppercase; color: var(--dim); font-weight: 600; }
.sub { color: var(--dim); }
#live { margin-left: auto; color: var(--dim); font-size: 12px; }
#live[data-state="on"]::before { content: ""; display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: var(--ok); margin-right: 6px; }
#live[data-state="off"] { color: var(--high); }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; margin-bottom: 12px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; }
.bar { margin: 0 0 10px; }
.bar:last-child { margin-bottom: 0; }
.bar .label { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; color: var(--dim); margin-bottom: 4px; }
.track { height: 8px; border-radius: 4px; background: var(--line); overflow: hidden; }
.fill { height: 100%; border-radius: 4px; background: var(--ok); }
.fill[data-level="warn"] { background: var(--warn); }
.fill[data-level="high"] { background: var(--high); }
.facts { display: grid; grid-template-columns: auto 1fr; gap: 4px 14px; margin: 0; }
.facts dt { color: var(--dim); } .facts dd { margin: 0; font-variant-numeric: tabular-nums; }
.tools { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.tools h2 { margin: 0; margin-right: auto; }
button { font: inherit; padding: 3px 10px; border: 1px solid var(--line); border-radius: 6px; background: transparent; color: var(--text); cursor: pointer; }
button[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: #fff; }
button.danger { border-color: var(--high); color: var(--high); margin-right: 4px; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 6px 8px; border-top: 1px solid var(--line); }
tbody td { height: 41px; }
th { color: var(--dim); font-weight: 500; font-size: 12px; border-top: 0; }
.num { text-align: right; font-variant-numeric: tabular-nums; } th.num { text-align: right; }
td.action { text-align: right; white-space: nowrap; } td.muted { color: var(--dim); font-size: 12px; }
#note { min-height: 20px; margin-top: 10px; font-size: 13px; } #note[data-state="error"] { color: var(--high); } #note[data-state="ok"] { color: var(--ok); }
.hint { color: var(--dim); font-size: 12px; margin: 10px 0 0; }
`

function Bar({ id, label, text, percent }: { id: string; label: string; text: string; percent: number }) {
  const level = percent >= 90 ? 'high' : percent >= 75 ? 'warn' : 'ok'
  return (
    <div class="bar" id={id}>
      <div class="label"><span>{label}</span><span data-text>{text}</span></div>
      <div class="track"><div class="fill" data-fill data-level={level} style={`width:${String(Math.min(100, percent))}%`} /></div>
    </div>
  )
}

const memoryText = (m: Memory): string => `${formatBytes(m.usedBytes)} of ${formatBytes(m.totalBytes)} (${String(m.usedPercent)}%)`
const diskText = (d: Disk): string => `${formatBytes(d.freeBytes)} free of ${formatBytes(d.totalBytes)} (${String(d.usedPercent)}% used)`

export function monitorPage(view: View): string {
  const load = view.load.map(n => n.toFixed(2)).join('  ')
  const page = (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>System Monitor</title>
        <style dangerouslySetInnerHTML={{ __html: STYLE }} />
      </head>
      <body data-sort-by={view.sort}>
        <main>
          <header>
            <h1>System Monitor</h1>
            <span class="sub">{view.host} · {view.platform} · {String(view.cpuCount)} cores · {String(view.processCount)} processes</span>
            <span id="live" data-state="off">Loading...</span>
          </header>
          <div class="grid">
            <section class="card" aria-label="Memory and load">
              <h2>Memory</h2>
              <Bar id="memory" label="In use" text={memoryText(view.memory)} percent={view.memory.usedPercent} />
              <dl class="facts">
                <dt>Up for</dt><dd id="uptime">{formatDuration(view.uptimeSeconds)}</dd>
                <dt>Load (1, 5, 15 min)</dt><dd id="load">{load}</dd>
              </dl>
            </section>
            <section class="card" aria-label="Disks">
              <h2>Disk</h2>
              {view.disks.length === 0 && <p class="sub">No disk could be read.</p>}
              {view.disks.map((disk, index) => <Bar id={`disk-${String(index)}`} label={disk.mount} text={diskText(disk)} percent={disk.usedPercent} />)}
            </section>
          </div>
          <section class="card" aria-label="Kill-list">
            <div class="tools">
              <h2>Kill-list: the heaviest processes</h2>
              <button type="button" data-sort="memory" aria-pressed={view.sort === 'memory' ? 'true' : 'false'}>By memory</button>
              <button type="button" data-sort="cpu" aria-pressed={view.sort === 'cpu' ? 'true' : 'false'}>By CPU</button>
            </div>
            <table>
              <thead><tr><th>Program</th><th class="num">PID</th><th class="num">CPU</th><th class="num">Memory</th><th>Account</th><th /></tr></thead>
              <tbody id="rows">
                {view.heaviest.map(process => (
                  <tr data-pid={String(process.pid)}>
                    <td>{process.name}</td>
                    <td class="num">{String(process.pid)}</td>
                    <td class="num">{process.cpu.toFixed(1)}%</td>
                    <td class="num">{formatBytes(process.memoryBytes)}</td>
                    <td>{process.user}</td>
                    <td class={process.protectedReason === undefined ? 'action' : 'action muted'}>{process.protectedReason ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div id="note" role="status" />
            <p class="hint">End... asks first. Stop asks the program to quit; Force stop ends it at once and it cannot save. Only your own programs can be ended, and only from this machine.</p>
          </section>
        </main>
        <script dangerouslySetInnerHTML={{ __html: CLIENT_SCRIPT }} />
      </body>
    </html>
  )
  return `<!doctype html>${page.toString()}`
}
