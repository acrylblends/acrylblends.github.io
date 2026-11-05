/**
 * The contacts directory: every person in the CRM with their company and role, a search, the contacts without a company (orphans), a form to add one and a
 * CSV paste to import many.
 *
 * Routes (under the shell's prefix): GET /contacts?q&orphans=1, POST /contacts, POST /contacts/import.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'

export const name = 'contacts'
export const inject = ['crm', 'shell', 'router']

export function apply(ctx: Context): void {
  const { crm, shell } = ctx
  const { initialsOf, isRefusal } = crm.kit
  const e = shell.e
  const prefix = shell.prefix

  const app = new Acryl()
    .get('/contacts', (c) => {
      const q = (c.req.query('q') ?? '').trim().toLowerCase().slice(0, 80)
      const orphansOnly = c.req.query('orphans') === '1'
      const rows = crm
        .contacts()
        .filter((x) => !orphansOnly || x.companyId === undefined)
        .filter((x) => {
          if (q === '') return true
          const company = x.companyId === undefined ? '' : crm.company(x.companyId).name
          return `${x.name} ${x.email} ${x.role} ${company}`.toLowerCase().includes(q)
        })
      const orphanCount = crm.orphans().length
      const table =
        rows.length === 0
          ? `<p class="empty">No contacts match${q === '' ? '' : ` “${e(q)}”`}. <a href="${shell.href('/contacts')}">Show everyone</a></p>`
          : `<table><thead><tr><th>Name</th><th>Company</th><th>Role</th><th>Email</th><th>Open deals</th></tr></thead><tbody>${rows
              .map((x) => {
                const company = x.companyId === undefined ? undefined : crm.company(x.companyId)
                const open = crm.deals().filter((d) => d.contactId === x.id && d.stage !== 'won' && d.stage !== 'lost').length
                return `<tr><td><div class="who"><span class="avatar">${e(initialsOf(x.name))}</span><span><b>${e(x.name)}</b></span></div></td><td>${company === undefined ? '<span class="pill warn">No company</span>' : `<div class="who">${shell.mark(company)}<a href="${shell.href(`/companies/${encodeURIComponent(company.id)}`)}">${e(company.name)}</a></div>`}</td><td>${e(x.role)}</td><td>${x.email === '' ? '<small>none</small>' : `<a href="mailto:${e(x.email)}">${e(x.email)}</a>`}</td><td>${open}</td></tr>`
              })
              .join('')}</tbody></table>`
      const addForm = `<section class="panel"><h2>Add a contact</h2><form class="row" method="post" action="${shell.href('/contacts')}"><label>Name<input name="name" required maxlength="120"></label><label>Email<input name="email" type="email" maxlength="160"></label><label>Role<input name="role" maxlength="80"></label><label>Company<select name="companyId"><option value="">No company</option>${crm.companies().map((co) => `<option value="${e(co.id)}">${e(co.name)}</option>`).join('')}</select></label><button class="btn primary">Add contact</button></form></section>`
      const importForm = `<section class="panel" id="import"><h2>Import contacts</h2><form method="post" action="${shell.href('/contacts/import')}"><label>Paste CSV: name,email,role,company (one per line; a company that is new is added)<textarea name="csv" rows="4" required maxlength="50000" placeholder="Lea Brandt,lea@brandt.example,COO,Brandt Logistics"></textarea></label><p><button class="btn">Import</button></p></form></section>`
      const main = `${shell.header({ eyebrow: 'Sales / Contacts', title: 'Contacts', lead: 'Everyone you sell to, with the company they work at.' })}${shell.notice(c.req.url)}<nav class="tabs" aria-label="Contact views"><a href="${shell.href('/contacts')}"${orphansOnly ? '' : ' class="on" aria-current="page"'}>Everyone <i>${crm.contacts().length}</i></a><a href="${shell.href('/contacts?orphans=1')}"${orphansOnly ? ' class="on" aria-current="page"' : ''}>No company <i>${orphanCount}</i></a><form method="get" action="${shell.href('/contacts')}" role="search">${orphansOnly ? '<input type="hidden" name="orphans" value="1">' : ''}<input name="q" value="${e(q)}" placeholder="Search contacts…" aria-label="Search contacts" maxlength="80"><button class="btn">Search</button></form></nav>${table}${addForm}${importForm}`
      return c.html(shell.page({ active: 'contacts', title: 'Contacts', main }))
    })
    .post('/contacts', async (c) => {
      const form = await c.req.parseBody()
      try {
        const contact = await crm.createContact({ name: form.name, email: form.email, role: form.role, companyId: form.companyId })
        return c.redirect(shell.url('/contacts', { kind: 'ok', text: `${contact.name} was added.` }), 303)
      } catch (error) {
        if (!(isRefusal(error))) throw error
        return c.redirect(shell.url('/contacts', { kind: 'error', text: error.message }), 303)
      }
    })
    .post('/contacts/import', async (c) => {
      const form = await c.req.parseBody()
      try {
        const result = await crm.importContacts(typeof form.csv === 'string' ? form.csv : '')
        const text = `${result.added} contact${result.added === 1 ? '' : 's'} imported.${result.skipped.length === 0 ? '' : ` Skipped ${result.skipped.join('; ')}`}`
        return c.redirect(shell.url('/contacts', { kind: result.skipped.length === 0 ? 'ok' : 'warn', text }), 303)
      } catch (error) {
        if (!(isRefusal(error))) throw error
        return c.redirect(shell.url('/contacts', { kind: 'error', text: error.message }), 303)
      }
    })

  ctx.router.route(prefix === '' ? '/' : prefix, app)
  ctx.effect(() => shell.nav({ id: 'contacts', label: 'Contacts', icon: '♙', path: '/contacts', order: 20 }))
}
