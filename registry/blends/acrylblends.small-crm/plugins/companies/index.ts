/**
 * Companies: the list of accounts with their open pipeline, and each company's profile with its contacts, its deals and its recent activity.
 *
 * Routes (under the shell's prefix): GET /companies, POST /companies, GET /companies/:id, POST /companies/:id/contacts.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'

export const name = 'companies'
export const inject = ['crm', 'shell', 'router']

export function apply(ctx: Context): void {
  const { crm, shell } = ctx
  const { euro, isOpen, longDay, STAGE_LABEL, whenText, isRefusal } = crm.kit
  const e = shell.e
  const prefix = shell.prefix
  const profile = (id: string) => `/companies/${encodeURIComponent(id)}`

  const app = new Acryl()
    .get('/companies', (c) => {
      const rows = crm
        .companies()
        .map((co) => {
          const deals = crm.dealsOf(co.id)
          const open = deals.filter((d) => isOpen(d.stage))
          return `<tr><td><div class="who">${shell.mark(co)}<a href="${shell.href(profile(co.id))}"><b>${e(co.name)}</b></a></div></td><td>${e(co.industry)}</td><td>${crm.contactsOf(co.id).length}</td><td>${open.length}</td><td>${euro(open.reduce((s, d) => s + d.value, 0))}</td></tr>`
        })
        .join('')
      const main = `${shell.header({ eyebrow: 'Sales / Companies', title: 'Companies', lead: 'The accounts you sell to, with their people and open pipeline.' })}${shell.notice(c.req.url)}<table><thead><tr><th>Company</th><th>Industry</th><th>Contacts</th><th>Open deals</th><th>Open value</th></tr></thead><tbody>${rows}</tbody></table><section class="panel"><h2>Add a company</h2><form class="row" method="post" action="${shell.href('/companies')}"><label>Name<input name="name" required maxlength="120"></label><label>Website<input name="website" maxlength="120" placeholder="example.com"></label><label>Industry<input name="industry" maxlength="80"></label><button class="btn primary">Add company</button></form></section>`
      return c.html(shell.page({ active: 'companies', title: 'Companies', main }))
    })
    .post('/companies', async (c) => {
      const form = await c.req.parseBody()
      try {
        const company = await crm.createCompany({ name: form.name, website: form.website, industry: form.industry })
        return c.redirect(shell.url(profile(company.id), { kind: 'ok', text: `${company.name} was added.` }), 303)
      } catch (error) {
        if (!(isRefusal(error))) throw error
        return c.redirect(shell.url('/companies', { kind: 'error', text: error.message }), 303)
      }
    })
    .get('/companies/:id', (c) => {
      let company: ReturnType<typeof crm.company>
      try {
        company = crm.company(c.req.param('id'))
      } catch {
        return c.html(shell.page({ active: 'companies', title: 'Company not found', main: `${shell.header({ eyebrow: 'Sales / Companies', title: 'Company not found' })}<p class="empty">That company does not exist. <a href="${shell.href('/companies')}">All companies</a></p>` }), 404)
      }
      const contacts = crm.contactsOf(company.id)
      const deals = crm.dealsOf(company.id)
      const activity = deals.flatMap((d) => crm.activityOf(d.id).map((a) => ({ a, d }))).sort((x, y) => y.a.at.localeCompare(x.a.at)).slice(0, 8)
      const dealList =
        deals.length === 0
          ? '<p class="hint">No deals yet.</p>'
          : `<ul class="list">${deals.map((d) => `<li><span><a href="${shell.href(`/deals/${encodeURIComponent(d.id)}`)}"><b>${e(d.title)}</b></a><br><small>${e(STAGE_LABEL[d.stage])} · ${isOpen(d.stage) ? 'closes' : 'closed'} ${e(longDay(d.closeDate))}</small></span><span style="margin-left:auto">${euro(d.value)}</span></li>`).join('')}</ul>`
      const contactList =
        contacts.length === 0
          ? '<p class="hint">No contacts yet. Add the first person below.</p>'
          : `<ul class="list">${contacts.map((x) => `<li><span><b>${e(x.name)}</b><br><small>${e(x.role)}${x.email === '' ? '' : ` · ${e(x.email)}`}</small></span></li>`).join('')}</ul>`
      const main = `<p class="crumbs"><a href="${shell.href('/companies')}">Companies</a> / ${e(company.name)}</p><div class="dtitle">${shell.mark(company, true)}<span><b style="font-size:20px">${e(company.name)}</b><small>${e([company.industry, company.website].filter(Boolean).join(' · '))}</small></span></div>${shell.notice(c.req.url)}<div class="two"><section class="panel"><h2>Deals</h2>${dealList}<p><a class="btn" href="${shell.href('/pipeline?new=1')}#new-deal">＋ Add deal</a></p></section><section class="panel"><h2>Contacts</h2>${contactList}<form class="row" method="post" action="${shell.href(`${profile(company.id)}/contacts`)}"><label>Name<input name="name" required maxlength="120"></label><label>Email<input name="email" type="email" maxlength="160"></label><label>Role<input name="role" maxlength="80"></label><button class="btn">Add</button></form></section></div><section class="panel"><h2>Recent activity</h2>${activity.length === 0 ? '<p class="hint">Nothing logged yet.</p>' : `<ul class="list">${activity.map(({ a, d }) => `<li><span class="pill">${e(a.type)}</span><span>${e(a.body)}<br><small>${e(d.title)} · ${e(whenText(a.at, crm.today))}</small></span></li>`).join('')}</ul>`}</section>`
      return c.html(shell.page({ active: 'companies', title: company.name, main }))
    })
    .post('/companies/:id/contacts', async (c) => {
      const id = c.req.param('id')
      const form = await c.req.parseBody()
      try {
        const contact = await crm.createContact({ name: form.name, email: form.email, role: form.role, companyId: id })
        return c.redirect(shell.url(profile(id), { kind: 'ok', text: `${contact.name} was added.` }), 303)
      } catch (error) {
        if (!(isRefusal(error))) throw error
        return c.redirect(shell.url(error.code === 'not-found' ? '/companies' : profile(id), { kind: 'error', text: error.message }), 303)
      }
    })

  ctx.router.route(prefix === '' ? '/' : prefix, app)
  ctx.effect(() => shell.nav({ id: 'companies', label: 'Companies', icon: '▧', path: '/companies', order: 30 }))
}
