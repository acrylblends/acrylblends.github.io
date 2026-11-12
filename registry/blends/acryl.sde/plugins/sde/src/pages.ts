/**
 * The review pages: start a run, read what was found and what the output still holds, read any anonymized file, sign the review, export.
 * Server-rendered HTML with plain forms: the page works without scripts, and every action is a POST a person makes.
 */
import type { RunRecord } from './engine.ts'

export const e = (value: unknown): string =>
  String(value).replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;').replace(/'/gu, '&#39;')

const STYLE = `
:root{--bg:#0f1115;--panel:#161a21;--line:#262c36;--text:#e7e9ee;--muted:#9aa3b2;--accent:#7aa2ff;--ok:#3fb27f;--warn:#e0a84a;--bad:#ef6b6b;color-scheme:dark}
@media (prefers-color-scheme: light){:root{--bg:#f7f8fa;--panel:#fff;--line:#e3e6eb;--text:#161a21;--muted:#5d6675;--accent:#3159d6;color-scheme:light}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
header.top{display:flex;align-items:center;gap:12px;padding:14px 24px;border-bottom:1px solid var(--line)}
header.top b{font-size:15px;letter-spacing:.02em}header.top span{color:var(--muted);font-size:12px}
main{max-width:1180px;margin:0 auto;padding:24px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;margin:0 0 12px}p.lead{color:var(--muted);margin:0 0 20px}
.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
.card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:16px}
.stat b{display:block;font-size:22px}.stat span{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.06em}
label{display:block;font-size:12px;color:var(--muted);margin:10px 0 4px;text-transform:uppercase;letter-spacing:.05em}
input[type=text],textarea{width:100%;padding:9px 10px;border-radius:7px;border:1px solid var(--line);background:var(--bg);color:var(--text);font:inherit}
textarea{min-height:64px}
button{padding:9px 14px;border-radius:7px;border:1px solid var(--line);background:var(--panel);color:var(--text);font:inherit;cursor:pointer}
button.primary{background:var(--accent);border-color:var(--accent);color:#fff}button.danger{color:var(--bad)}
.actions{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;align-items:center}
table{width:100%;border-collapse:collapse}td,th{padding:8px 6px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
.pill{display:inline-block;padding:1px 8px;border-radius:99px;font-size:12px;border:1px solid var(--line)}
.pill.review{color:var(--warn);border-color:var(--warn)}.pill.approved,.pill.exported{color:var(--ok);border-color:var(--ok)}.pill.rejected{color:var(--bad);border-color:var(--bad)}
.notice{padding:10px 12px;border-radius:8px;margin:0 0 16px;border:1px solid var(--line)}.notice.error{border-color:var(--bad);color:var(--bad)}.notice.ok{border-color:var(--ok);color:var(--ok)}
pre{background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:12px;overflow:auto;max-height:520px;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}
.files{max-height:520px;overflow:auto;font:12px/1.7 ui-monospace,Menlo,monospace}.files a{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.split{display:grid;gap:16px;grid-template-columns:minmax(220px,300px) minmax(0,1fr)}.split>div{min-width:0}@media(max-width:760px){.split{grid-template-columns:1fr}}
.steps{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 20px}.steps span{font-size:12px;padding:3px 9px;border-radius:99px;background:var(--panel);border:1px solid var(--line);color:var(--muted)}
.muted{color:var(--muted)}ul.tight{margin:6px 0 0;padding-left:18px}
`

export interface PageInput {
  readonly title: string
  readonly base: string
  readonly notice?: { kind: 'ok' | 'error'; text: string }
  readonly body: string
}

export function page({ title, base, notice, body }: PageInput): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(title)} - ACRYL SDE</title><style>${STYLE}</style></head><body><header class="top"><a href="${e(base)}/sde"><b>ACRYL SDE</b></a><span>Synthetic Data Engine · everything stays on this machine until you approve and export</span></header><main>${notice ? `<p class="notice ${notice.kind}" role="status">${e(notice.text)}</p>` : ''}${body}</main></body></html>`
}

const STEPS = ['1 Scan', '2 Detect', '3 Anonymize', '4 Architecture', '5 Re-check', '6 Similarity', '7 Package', '8 Your review', '9 Export (local)']

export function homeBody(base: string, runs: readonly RunRecord[], suggested: { path: string; terms: string } = { path: '', terms: '' }): string {
  const rows = runs.length === 0
    ? '<p class="muted">No runs yet. Point the engine at a project folder above.</p>'
    : `<table><thead><tr><th>Run</th><th>Status</th><th>Files</th><th>Found</th><th>Left in output</th><th>Created</th></tr></thead><tbody>${runs.map((run) => `<tr><td><a href="${e(base)}/sde/runs/${e(run.id)}"><b>${e(run.label)}</b></a><br><small class="muted">${e(run.id)}</small></td><td><span class="pill ${e(run.status)}">${e(run.status)}</span></td><td>${String(run.totals.readFiles)}</td><td>${String(run.found.total)}</td><td>${String(run.residual.total)}</td><td><small>${e(run.createdAt.replace('T', ' ').slice(0, 16))}</small></td></tr>`).join('')}</tbody></table>`
  return `<h1>Turn a codebase into reviewed training data</h1><p class="lead">The engine reads a project folder (it never runs its code), finds secrets, personal data, private infrastructure and the project's own names, rewrites them, extracts the architecture and packages a Training Unit. Nothing leaves this machine: you review every unit, and only an approved one is exported, to a local folder.</p><div class="steps">${STEPS.map((step) => `<span>${e(step)}</span>`).join('')}</div>
<div class="grid"><form class="card" method="post" action="${e(base)}/sde/runs"><h2>New run</h2>
<label for="path">Project folder (absolute path)</label><input id="path" type="text" name="path" required placeholder="/Users/you/code/project" value="${e(suggested.path)}">
<label for="terms">Project words to remove (company, product, customer names; comma separated)</label><input id="terms" type="text" name="terms" placeholder="Acme, Billingo, Contoso" value="${e(suggested.terms)}">
<label for="label">Label (optional, shown instead of the folder)</label><input id="label" type="text" name="label" maxlength="80">
<div class="actions"><button class="primary" type="submit">Scan and package</button><button type="submit" formaction="${e(base)}/sde/suggest" formmethod="post">Suggest project words</button></div></form>
<div class="card"><h2>What the engine guarantees</h2><ul class="tight"><li>Reads files as text; never executes, imports or installs the project.</li><li>Values it finds are never stored, only masked previews.</li><li>The mapping from original to replacement stays in the run's private folder and is never packaged.</li><li>No network connection is opened by the engine.</li><li>Approval needs your name and your statement that you may license the code; a unit with secrets, personal data or project words left in it cannot be approved.</li></ul></div></div>
<div class="card" style="margin-top:16px"><h2>Runs</h2>${rows}</div>`
}

const kv = (record: Readonly<Record<string, number>>): string => {
  const entries = Object.entries(record)
  return entries.length === 0 ? '<span class="muted">none</span>' : entries.sort((a, b) => b[1] - a[1]).map(([key, value]) => `<span class="pill">${e(key)} ${String(value)}</span>`).join(' ')
}

export function runBody(base: string, run: RunRecord, files: readonly string[], selected: { path: string; text: string } | undefined, security: number): string {
  const href = (path: string): string => `${base}/sde/runs/${encodeURIComponent(run.id)}${path}`
  const reviewForm = run.status === 'review' || run.status === 'rejected'
    ? `<form method="post" action="${e(href('/review'))}"><label for="reviewer">Your name (signs the review)</label><input id="reviewer" type="text" name="reviewer" required>
<label><input type="checkbox" name="rights" value="yes"> I own this code or am authorized to license training data derived from it</label>
<label for="notes">Notes</label><textarea id="notes" name="notes"></textarea>
<div class="actions"><button class="primary" name="decision" value="approved"${run.blockers.length > 0 ? ' disabled' : ''}>Approve</button><button name="decision" value="rejected" class="danger">Reject</button>${run.blockers.length > 0 ? `<span class="muted">Approval is blocked: ${e(run.blockers.join('; '))}. Add the missing project words and scan again.</span>` : ''}</div></form>`
    : run.status === 'approved'
      ? `<p>Approved by <b>${e(run.review?.reviewer)}</b> on ${e(run.review?.at.slice(0, 16).replace('T', ' '))}.</p><form method="post" action="${e(href('/export'))}"><div class="actions"><button class="primary">Export to a local folder</button><span class="muted">Writes the unit, dataset.jsonl and MANIFEST.sha256 under the app's data folder. Nothing is uploaded.</span></div></form>`
      : `<p>Exported to <code>${e(run.exportedTo)}</code>.</p>`
  return `<p><a href="${e(base)}/sde">All runs</a></p><h1>${e(run.label)} <span class="pill ${e(run.status)}">${e(run.status)}</span></h1><p class="lead">Run ${e(run.id)} · ${e(run.createdAt.replace('T', ' ').slice(0, 16))}</p>
<div class="grid"><div class="card stat"><b>${String(run.totals.readFiles)}</b><span>files read</span></div><div class="card stat"><b>${String(run.totals.lines)}</b><span>lines</span></div><div class="card stat"><b>${String(run.found.total)}</b><span>private items found</span></div><div class="card stat"><b>${String(run.residual.total)}</b><span>left in output</span></div><div class="card stat"><b>${String(security)}</b><span>risky code spots</span></div><div class="card stat"><b>${run.similarity.meanJaccard.toFixed(2)}</b><span>text kept (mean Jaccard)</span></div></div>
<div class="grid" style="margin-top:16px"><div class="card"><h2>Found in the original</h2><p>${kv(run.found.byRule)}</p><h2 style="margin-top:14px">Left in the output</h2><p>${kv(run.residual.byRule)}</p><h2 style="margin-top:14px">Languages</h2><p>${run.languages.slice(0, 8).map((language) => `<span class="pill">${e(language.language)} ${String(language.files)}</span>`).join(' ') || '<span class="muted">none</span>'}</p><p class="muted"><a href="${e(href('/report/architecture.json'))}">architecture.json</a> · <a href="${e(href('/report/privacy-report.json'))}">privacy</a> · <a href="${e(href('/report/security-report.json'))}">security</a> · <a href="${e(href('/report/similarity-report.json'))}">similarity</a> · <a href="${e(href('/report/quality-score.json'))}">quality</a></p></div>
<div class="card"><h2>Review</h2>${reviewForm}</div></div>
<div class="card" style="margin-top:16px"><h2>The anonymized code</h2><div class="split"><div class="files">${files.map((file) => `<a href="${e(href(`?file=${encodeURIComponent(file)}`))}"${selected?.path === file ? ' style="font-weight:700"' : ''}>${e(file)}</a>`).join('')}</div><div>${selected ? `<p><b>${e(selected.path)}</b></p><pre>${e(selected.text)}</pre>` : '<p class="muted">Pick a file to read what will be packaged.</p>'}</div></div></div>
<form method="post" action="${e(href('/delete'))}" style="margin-top:16px"><button class="danger">Delete this run</button></form>`
}
