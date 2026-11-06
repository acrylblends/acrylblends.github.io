/** Integrity and receipt (aside): the latest integrity check of the room and, once the transfer is complete and the check passed, the completion receipt with each peer's share. */
import type { Context } from '@deepseek-ai/cordis'
import { receiptOf, sizeLabel, RANGES } from '../swarmdrop/index.ts'
import { escapeHtml } from '../swarm-shell/index.ts'

export const name = 'receipt'
export const inject = ['swarm', 'swarmShell']

export function apply(ctx: Context): void {
  const shell = ctx.swarmShell
  const render = (sel: ReturnType<typeof shell.selection>): string => {
    const r = sel.room
    const check = r.checks.at(-1)
    const receipt = receiptOf(r)
    const checkHtml = check === undefined ? '<div class="muted" style="margin-top:8px">No integrity check yet. Verified ranges are checked against the manifest.</div>' : `<div class="kv"><span>Last check</span><b class="${check.result === 'passed' ? 'okc' : 'warnc'}" id="check">${check.result}</b></div><div class="muted" id="checkdetail">${escapeHtml(check.detail)} (${String(check.checked)} of ${String(RANGES)})</div>`
    const rec = receipt === undefined
      ? `<div class="muted" style="margin-top:10px" id="receipt">Receipt available after the transfer completes and passes the integrity check.</div>`
      : `<div id="receipt" style="margin-top:12px"><h2>Transfer receipt</h2><div class="kv"><span>File</span><b>${escapeHtml(receipt.file)}</b></div><div class="kv"><span>Size</span><b>${escapeHtml(sizeLabel(receipt.sizeMb))} · ${String(receipt.chunks)} chunks</b></div><div class="kv col2"><span>SHA-256 fixture</span><b class="rate">${escapeHtml(receipt.digest)}</b></div>${receipt.contributors.map((c) => `<div class="kv"><span>${escapeHtml(c.peer)}</span><b>${String(c.share)}%</b></div>`).join('')}</div>`
    return `<section class="panel"><h2>Integrity</h2>${checkHtml}${rec}</section>`
  }
  ctx.effect(() => shell.side({ id: 'receipt', column: 'aside', order: 20, render }))
}
