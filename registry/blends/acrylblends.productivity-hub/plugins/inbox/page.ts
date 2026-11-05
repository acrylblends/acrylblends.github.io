/**
 * The Inbox page: one field to capture anything, then a calm card per capture with the two ways to give it a place (a task with a date and a space,
 * or a note) and a discard for the noise. The quick capture in the sidebar posts to the same route.
 */
import { capturedLabel, esc } from './format.ts'

export interface InboxItemLike {
  readonly id: string
  readonly text: string
  readonly capturedAt: string
}

export interface ProjectLike {
  readonly id: string
  readonly name: string
}

export interface InboxShellLike {
  href(path: string): string
  header(input: { readonly eyebrow?: string; readonly title: string; readonly lead?: string; readonly action?: string }): string
  notice(url: string): string
  page(input: { readonly active?: string; readonly title: string; readonly main: string; readonly scripts?: string }): string
}

export interface InboxInput {
  readonly items: readonly InboxItemLike[]
  readonly projects: readonly ProjectLike[]
  readonly today: string
  readonly now: Date
  readonly shell: InboxShellLike
  readonly url: string
}

const STYLES = `<style>
.p-inbox-text{font:500 19px Georgia,serif;margin:0 0 4px;overflow-wrap:anywhere}
.p-inbox-when{color:var(--muted);font-size:11px;margin:0 0 14px}
.p-inbox-actions{display:flex;flex-wrap:wrap;gap:8px}
.p-inbox-form{margin:22px 0 26px}
.p-inbox-capture{display:flex;gap:10px;align-items:center}
.p-inbox-capture input{flex:1}
</style>`

function itemCard(item: InboxItemLike, input: InboxInput): string {
  const { projects, shell, today } = input
  const spaces = projects
    .map((project) => `<option value="${esc(project.id)}">${esc(project.name)}</option>`)
    .join('')
  return `<article class="p-card" data-inbox="${esc(item.id)}" style="margin-top:14px">
<p class="p-inbox-text">${esc(item.text)}</p>
<p class="p-inbox-when">Captured ${esc(capturedLabel(item.capturedAt, input.now))}</p>
<form method="post" action="${esc(shell.href(`/inbox/${item.id}/task`))}" class="p-form">
  <div class="row">
    <label class="p-field">Due <input type="date" name="dueAt" value="${esc(today)}"></label>
    <label class="p-field">Space <select name="projectId"><option value="">No space</option>${spaces}</select></label>
    <div class="p-inbox-actions">
      <button class="p-btn" type="submit">Make task</button>
      <button class="p-btn ghost" type="submit" formaction="${esc(shell.href(`/inbox/${item.id}/note`))}">Make note</button>
      <button class="p-btn danger" type="submit" formaction="${esc(shell.href(`/inbox/${item.id}/discard`))}" formnovalidate>Discard</button>
    </div>
  </div>
</form>
</article>`
}

/** The Inbox page as the shell wraps it. */
export function inboxPage(input: InboxInput): string {
  const { items, shell } = input
  const count = items.length
  const lead = count === 0
    ? 'Inbox zero. Capture anything that needs a place.'
    : `${String(count)} ${count === 1 ? 'thing' : 'things'} to triage. Turn each into a task or a note.`
  const header = shell.header({ eyebrow: 'Inbox', title: 'Clear the noise.', lead })
  const capture = `<form class="p-card p-form p-inbox-form" method="post" action="${esc(shell.href('/inbox'))}">
<div class="p-inbox-capture"><input class="p-input" id="inbox-capture" name="text" placeholder="Capture anything..." aria-label="Capture anything" maxlength="500" required autocomplete="off"><button class="p-btn" type="submit">Capture</button></div>
</form>`
  const body = count === 0
    ? '<div class="p-empty"><b>Inbox zero.</b>Nothing to triage. Capture something above, or with the field in the sidebar.</div>'
    : `<div class="p-section"><h2>To triage</h2><small>${String(count)} ${count === 1 ? 'item' : 'items'}</small></div>${items.map((item) => itemCard(item, input)).join('')}`
  const main = `${header}${shell.notice(input.url)}${capture}${body}`
  return shell.page({ active: 'inbox', title: 'Inbox', main, scripts: STYLES })
}
